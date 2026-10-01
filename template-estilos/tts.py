"""Narración por escena → audio/vo.wav + audio/vo.json (tiempos por palabra) para que el video siga a la voz.

Uso:
  python3 tts.py guion.json                     genera la voz (motor automático)
  python3 tts.py guion.json --engine kokoro     fuerza un motor
  python3 tts.py --sample "Hola, ¿qué tal?"     prueba todas las voces locales → audio/muestras/
  python3 tts.py --voices                       lista las voces de cada motor

guion.json:
{
  "engine": "auto",                 # auto | elevenlabs | openai | edge | kokoro | piper | espeak
  "voices": {"kokoro": "em_alex", "piper": "es_MX-claude-high", "edge": "es-PE-AlexNeural",
             "openai": "onyx", "elevenlabs": "<voice_id>"},   # opcional: voz preferida por motor
  "speed": 1.0,                     # 0.85–1.2 (edge usa "rate": "+6%")
  "lead": 0.3,                      # silencio antes de la primera frase (s)
  "gap": 0.75,                      # silencio entre escenas (s): ahí caen las transiciones
  "scenes": [
    {"id": "s1", "say": "¿Sabías que tu dinero puede trabajar por ti?"},
    {"id": "s2", "say": "Se llama interés compuesto.", "gap": 0.4, "min": 4.5},
    {"id": "s3", "silence": 2.0}
  ]
}

Motores en modo auto, del mejor al de respaldo (se usa el primero que funcione):
  1. elevenlabs  la más natural, clona voces. Necesita ELEVENLABS_API_KEY e internet hacia api.elevenlabs.io.
  2. openai      gpt-4o-mini-tts, muy clara. Necesita OPENAI_API_KEY e internet hacia api.openai.com.
  3. edge        voces neuronales de Microsoft, gratis. Necesita internet hacia speech.platform.bing.com.
  4. kokoro      LOCAL, gratis, natural. Descarga el modelo de GitHub la primera vez (~350 MB, queda en caché).
  5. piper       LOCAL, gratis, muy clara (México / Argentina / España). ~65 MB por voz desde GitHub.
  6. espeak      robótica: solo para maquetar tiempos. Nunca para entregar.
Claves en el entorno o en ~/.config/video-pizarra/keys.env (ELEVENLABS_API_KEY=..., OPENAI_API_KEY=...).
Toda voz pasa por una cadena de claridad (filtro de graves, presencia, compresión suave, −16 LUFS).
Requisitos locales: pip install kokoro-onnx soundfile sherpa-onnx   (edge: pip install edge-tts)
"""
import asyncio, base64, json, os, re, shutil, subprocess, sys, tarfile, tempfile, urllib.request, wave
import numpy as np

SR = 44100
CACHE = os.path.expanduser(os.environ.get('VP_TTS_CACHE', '~/.cache/video-pizarra-pro/tts'))
KOKORO_URL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
PIPER_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-{}.tar.bz2'
DEFAULT_VOICE = {'kokoro': 'em_alex', 'piper': 'es_MX-claude-high', 'edge': 'es-PE-AlexNeural', 'openai': 'onyx',
                 'elevenlabs': os.environ.get('ELEVENLABS_VOICE_ID', 'pNInz6obpgDQGcFmaJgB'), 'espeak': 'es-419'}
VOICES = {
    'kokoro': {'em_alex': 'hombre, cálido (recomendada)', 'ef_dora': 'mujer, clara', 'em_santa': 'hombre, grave'},
    'piper': {'es_MX-claude-high': 'México, hombre, muy clara', 'es_MX-ald-medium': 'México, hombre',
              'es_AR-daniela-high': 'Argentina, mujer', 'es_ES-davefx-medium': 'España, hombre', 'es_ES-sharvard-medium': 'España'},
    'edge': {'es-PE-AlexNeural': 'Perú, hombre', 'es-PE-CamilaNeural': 'Perú, mujer', 'es-MX-JorgeNeural': 'México, hombre',
             'es-MX-DaliaNeural': 'México, mujer', 'es-CO-GonzaloNeural': 'Colombia, hombre', 'es-AR-TomasNeural': 'Argentina, hombre'},
    'openai': {'onyx': 'hombre, grave', 'ash': 'hombre', 'coral': 'mujer', 'nova': 'mujer', 'alloy': 'neutra'},
    'elevenlabs': {'<voice_id>': 'cualquier voz de tu cuenta (o tu voz clonada); eleven_multilingual_v2'},
}
CLARITY = ('highpass=f=75,lowpass=f=12000,equalizer=f=220:t=q:w=1.2:g=-2,equalizer=f=3400:t=q:w=1.4:g=2.5,'
           'acompressor=threshold=-20dB:ratio=2.6:attack=8:release=140:makeup=1.5,loudnorm=I=-16:TP=-1.5:LRA=9')


# ---------- helpers ----------
def keys():
    k = dict(os.environ)
    f = os.path.expanduser('~/.config/video-pizarra/keys.env')
    if os.path.exists(f):
        for ln in open(f):
            if '=' in ln and not ln.startswith('#'): a, b = ln.strip().split('=', 1); k.setdefault(a, b)
    return k


def write_wav(path, x, sr=SR):
    x = np.asarray(x, dtype=np.float64); p = np.max(np.abs(x)) if len(x) else 1
    if p > 1: x = x / p
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((x * 32767).astype(np.int16).tobytes())


def to_f32(src, sr_in=None):
    """Audio file path, or a float array at sr_in → mono float64 at SR."""
    if isinstance(src, np.ndarray):
        tmp = tempfile.mktemp(suffix='.wav'); write_wav(tmp, src, sr_in); src = tmp
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def trim(x, thr=0.006):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx): return x, 0.0
    a, b = max(0, idx[0] - int(0.02 * SR)), min(len(x), idx[-1] + int(0.06 * SR))
    return x[a:b], a / SR


def syllables(w):
    w = re.sub(r'[^a-záéíóúüñ0-9]', '', w.lower())
    if re.fullmatch(r'\d+', w): return len(w) * 2
    return max(1, len(re.findall(r'[aeiouáéíóúü]+', w)))


def spread(words, t0, t1):
    """Word times inside a span measured exactly: proportional to syllables."""
    wt = [syllables(w) + 0.35 for w in words]; tot = sum(wt) or 1; t, out = t0, []
    for w, k in zip(words, wt):
        d = (t1 - t0) * k / tot; out.append({'w': w, 's': round(t, 3), 'e': round(t + d * 0.92, 3)}); t += d
    return out


def chunks(text):
    """Split at punctuation so each chunk's start/end is measured exactly (word times stay within ~0.2 s)."""
    parts = [p.strip() for p in re.split(r'(?<=[,;:.!?…])\s+', text.strip()) if p.strip()]
    out = []
    for p in parts:
        ws = p.split()
        while len(ws) > 14: out.append(' '.join(ws[:8])); ws = ws[8:]
        out.append(' '.join(ws))
    return out


def pause_after(chunk):
    return 0.32 if re.search(r'[.!?…]$', chunk) else 0.16 if re.search(r'[,;:]$', chunk) else 0.06


def download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest): return dest
    print(f'  descargando {os.path.basename(dest)} (solo la primera vez)…', flush=True)
    tmp = dest + '.part'; urllib.request.urlretrieve(url, tmp); os.replace(tmp, dest)
    return dest


# ---------- engines: say(text) → (audio float array at SR, words | None) ----------
class Engine:
    words_native = False
    def __init__(self, voice, spec): self.voice, self.spec = voice, spec


class Kokoro(Engine):
    def __init__(self, voice, spec):
        super().__init__(voice, spec)
        from kokoro_onnx import Kokoro as K
        m = download(KOKORO_URL + 'kokoro-v1.0.onnx', f'{CACHE}/kokoro/kokoro-v1.0.onnx')
        v = download(KOKORO_URL + 'voices-v1.0.bin', f'{CACHE}/kokoro/voices-v1.0.bin')
        self.k = K(m, v); self.lang = spec.get('lang', 'es-419')        # es-419: Latin American pronunciation (seseo)
    def say(self, text):
        s, sr = self.k.create(text, voice=self.voice, speed=float(self.spec.get('speed', 1.0)), lang=self.lang)
        return to_f32(np.asarray(s), sr), None


class Piper(Engine):
    def __init__(self, voice, spec):
        super().__init__(voice, spec)
        import sherpa_onnx
        d = f'{CACHE}/piper/vits-piper-{voice}'
        if not os.path.isdir(d):
            tb = download(PIPER_URL.format(voice), f'{CACHE}/piper/{voice}.tar.bz2')
            with tarfile.open(tb) as t: t.extractall(f'{CACHE}/piper')
            os.remove(tb)
        cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model=f'{d}/{voice}.onnx', tokens=f'{d}/tokens.txt', data_dir=f'{d}/espeak-ng-data'), num_threads=4))
        self.t = sherpa_onnx.OfflineTts(cfg)
    def say(self, text):
        a = self.t.generate(text, sid=0, speed=float(self.spec.get('speed', 1.0)))
        return to_f32(np.asarray(a.samples), a.sample_rate), None


class Edge(Engine):
    words_native = True
    def say(self, text):
        import edge_tts
        async def run():
            kw = dict(rate=self.spec.get('rate', '+0%'), pitch=self.spec.get('pitch', '+0Hz'))
            try: com = edge_tts.Communicate(text, self.voice, boundary='WordBoundary', **kw)
            except TypeError: com = edge_tts.Communicate(text, self.voice, **kw)
            buf, words = bytearray(), []
            async for ch in com.stream():
                if ch['type'] == 'audio': buf += ch['data']
                elif ch['type'] == 'WordBoundary':
                    s = ch['offset'] / 1e7; words.append({'w': ch['text'], 's': s, 'e': s + ch['duration'] / 1e7})
            return bytes(buf), words
        data, words = asyncio.run(asyncio.wait_for(run(), 60))
        if not data: raise RuntimeError('edge-tts no devolvió audio')
        f = tempfile.mktemp(suffix='.mp3'); open(f, 'wb').write(data)
        return to_f32(f), words


class OpenAI(Engine):
    def __init__(self, voice, spec):
        super().__init__(voice, spec)
        self.key = keys().get('OPENAI_API_KEY')
        if not self.key: raise RuntimeError('falta OPENAI_API_KEY')
    def say(self, text):
        body = {'model': self.spec.get('openai_model', 'gpt-4o-mini-tts'), 'voice': self.voice, 'input': text, 'response_format': 'wav',
                'instructions': self.spec.get('style', 'Habla en español latinoamericano neutro, claro, cálido y con energía, como un buen profesor.')}
        r = urllib.request.Request('https://api.openai.com/v1/audio/speech', data=json.dumps(body).encode(),
                                   headers={'Authorization': f'Bearer {self.key}', 'Content-Type': 'application/json'})
        f = tempfile.mktemp(suffix='.wav'); open(f, 'wb').write(urllib.request.urlopen(r, timeout=90).read())
        return to_f32(f), None


class ElevenLabs(Engine):
    words_native = True
    def __init__(self, voice, spec):
        super().__init__(voice, spec)
        self.key = keys().get('ELEVENLABS_API_KEY')
        if not self.key: raise RuntimeError('falta ELEVENLABS_API_KEY')
    def say(self, text):
        body = {'text': text, 'model_id': self.spec.get('eleven_model', 'eleven_multilingual_v2'),
                'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8, 'style': 0.2, 'use_speaker_boost': True}}
        r = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{self.voice}/with-timestamps?output_format=mp3_44100_128',
                                   data=json.dumps(body).encode(), headers={'xi-api-key': self.key, 'Content-Type': 'application/json'})
        j = json.load(urllib.request.urlopen(r, timeout=120))
        f = tempfile.mktemp(suffix='.mp3'); open(f, 'wb').write(base64.b64decode(j['audio_base64']))
        al = j.get('alignment') or {}
        words, cur = [], None
        for c, s, e in zip(al.get('characters', []), al.get('character_start_times_seconds', []), al.get('character_end_times_seconds', [])):
            if c.isspace():
                if cur: words.append(cur); cur = None
            elif cur is None: cur = {'w': c, 's': s, 'e': e}
            else: cur['w'] += c; cur['e'] = e
        if cur: words.append(cur)
        return to_f32(f), words or None


class Espeak(Engine):
    def say(self, text):
        exe = shutil.which('espeak-ng') or shutil.which('espeak')
        if not exe: raise RuntimeError('espeak-ng no instalado')
        f = tempfile.mktemp(suffix='.wav')
        subprocess.run([exe, '-v', self.voice, '-s', str(int(165 * float(self.spec.get('speed', 1.0)))), '-w', f, text], check=True, capture_output=True)
        return to_f32(f), None


ENGINES = {'elevenlabs': ElevenLabs, 'openai': OpenAI, 'edge': Edge, 'kokoro': Kokoro, 'piper': Piper, 'espeak': Espeak}
AUTO = ['elevenlabs', 'openai', 'edge', 'kokoro', 'piper', 'espeak']


def voice_for(name, spec):
    if spec.get('voices', {}).get(name): return spec['voices'][name]
    v = spec.get('voice')
    if v and (v in VOICES.get(name, {}) or (name == 'edge' and str(v).endswith('Neural')) or spec.get('engine') == name): return v
    return DEFAULT_VOICE[name]


def pick_engine(spec, forced=None):
    want = forced or spec.get('engine', 'auto')
    order = AUTO if want == 'auto' else [want] + [e for e in ['kokoro', 'piper', 'espeak'] if e != want]
    k = keys()
    for name in order:
        if name == 'elevenlabs' and not k.get('ELEVENLABS_API_KEY'): continue
        if name == 'openai' and not k.get('OPENAI_API_KEY'): continue
        try:
            eng = ENGINES[name](voice_for(name, spec), spec)
            x, _ = eng.say('Hola.')                                    # cheap probe: network, model and voice all work
            if len(x) < SR * 0.15: raise RuntimeError('audio vacío')
            return name, eng
        except Exception as e:
            print(f'  · {name} no disponible ({type(e).__name__}: {str(e)[:90]})')
    raise SystemExit('ningún motor de voz funcionó')


def synth_line(eng, text):
    """One narration line → (audio, words relative to the line start)."""
    if eng.words_native:
        x, words = eng.say(text)
        x, cut = trim(x)
        if not words: return x, spread(text.split(), 0, len(x) / SR)
        toks, j = text.split(), 0
        for w in words:                                         # shift by the trimmed silence; restore punctuation
            w['s'] = max(0, w['s'] - cut); w['e'] = max(w['s'], w['e'] - cut)
            key = re.sub(r'\W', '', w['w']).lower()
            while j < len(toks) and not re.sub(r'\W', '', toks[j]).lower(): j += 1
            if j < len(toks) and re.sub(r'\W', '', toks[j]).lower().startswith(key[:3]): w['w'] = toks[j]; j += 1
        return x, words
    pieces, words, t = [], [], 0.0
    cs = chunks(text)
    for i, c in enumerate(cs):
        x, _ = eng.say(c); x, _ = trim(x)
        d = len(x) / SR; words += spread(c.split(), t, t + d); pieces.append(x); t += d
        if i < len(cs) - 1: p = pause_after(c); pieces.append(np.zeros(int(p * SR))); t += p
    return np.concatenate(pieces), words


def clarity(path):
    out = path + '.clean.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-af', CLARITY, '-ar', str(SR), '-ac', '1', out], check=True)
    os.replace(out, path)


def sample(text):
    os.makedirs('audio/muestras', exist_ok=True)
    for name in ['kokoro', 'piper']:
        for v in VOICES[name]:
            try:
                x, _ = synth_line(ENGINES[name](v, {'speed': 1.0}), text)
                f = f'audio/muestras/{name}-{v}.wav'; write_wav(f, x); clarity(f); print('  ', f)
            except Exception as e: print(f'  · {name}/{v}: {str(e)[:100]}')


def main():
    a = sys.argv[1:]
    if not a or '--help' in a: print(__doc__); return
    if '--voices' in a:
        for name, vs in VOICES.items():
            print(name)
            for v, d in vs.items(): print(f'   {v:24s} {d}')
        return
    if '--sample' in a:
        i = a.index('--sample'); return sample(a[i + 1] if len(a) > i + 1 else '¿Cuánto tarda tu dinero en duplicarse?')
    spec = json.load(open(a[0]))
    name, eng = pick_engine(spec, a[a.index('--engine') + 1] if '--engine' in a else None)
    lead, gap = float(spec.get('lead', 0.3)), float(spec.get('gap', 0.75))
    out, clips, cursor = {'engine': name, 'voice': eng.voice, 'scenes': {}, 'order': []}, [], lead
    for sc in spec['scenes']:
        if not sc.get('say'):
            d = float(sc.get('silence', 2.5))
            out['scenes'][sc['id']] = {'start': round(cursor, 3), 'end': round(cursor + d, 3), 'text': '', 'words': []}
            out['order'].append(sc['id']); cursor += d + float(sc.get('gap', gap)); continue
        text = sc['say'].strip()
        line_eng = eng if not sc.get('voice') else ENGINES[name](sc['voice'], {**spec, **sc})   # a second character's voice
        x, words = synth_line(line_eng, text)
        d, start = len(x) / SR, cursor
        out['scenes'][sc['id']] = {'start': round(start, 3), 'end': round(start + d, 3), 'text': text,
                                   'words': [{'w': w['w'], 's': round(start + w['s'], 3), 'e': round(start + min(w['e'], d), 3)} for w in words]}
        out['order'].append(sc['id']); clips.append((start, x))
        cursor = start + max(d + float(sc.get('gap', gap)), float(sc.get('min', 0)))   # min: the line never gets shorter
    total = cursor + 0.5
    mix = np.zeros(int(total * SR))
    for s, x in clips: i = int(s * SR); mix[i:i + len(x)] += x[:len(mix) - i]
    os.makedirs('audio', exist_ok=True)
    write_wav('audio/vo.wav', mix / (np.max(np.abs(mix)) or 1) * 0.9); clarity('audio/vo.wav')
    out['duration'] = round(total, 3)
    json.dump(out, open('audio/vo.json', 'w'), ensure_ascii=False, indent=1)
    print(f"voz: {name} · {eng.voice} → audio/vo.wav + audio/vo.json · {total:.1f}s")
    if name == 'espeak': print('⚠️  VOZ ROBÓTICA (respaldo espeak): sirve para maquetar, NO para entregar. Instala: pip install kokoro-onnx soundfile sherpa-onnx')
    for sid in out['order']:
        g = out['scenes'][sid]; print(f"  {sid:8s} {g['start']:6.2f} → {g['end']:6.2f}  ({g['end'] - g['start']:.1f}s)  {g['text'][:60]}")


if __name__ == '__main__':
    main()
