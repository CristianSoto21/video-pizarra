"""Narración por escena → audio/vo.wav + audio/vo.json (tiempos por palabra) para que el video siga a la voz.

Uso:
  python3 tts.py guion.json                 genera la voz
  python3 tts.py --voices es                lista voces de edge-tts (filtra por idioma)
  python3 tts.py guion.json --engine espeak fuerza la voz offline (robótica, solo para pruebas)

guion.json:
{
  "voice": "es-PE-AlexNeural",      # voz de edge-tts (gratis, sin clave). Ver --voices
  "rate": "+8%", "pitch": "+0Hz",   # velocidad y tono
  "lead": 0.3,                      # silencio antes de la primera frase (s)
  "gap": 0.7,                       # silencio entre escenas (s): ahí caen las transiciones
  "scenes": [
    {"id": "s1", "say": "¿Sabías que tu dinero puede trabajar por ti?"},
    {"id": "s2", "say": "Se llama interés compuesto.", "gap": 0.4, "min": 4.5},   # min: la escena dura al menos 4.5 s
    {"id": "s3", "silence": 2.0}       # escena sin voz (solo música): mantiene 2 s
  ]
}

Motores, en orden: edge-tts (natural, necesita internet) → espeak-ng (offline, robótico; tiempos de palabra estimados).
El engine lee audio/vo.json: seg('s1') da {start, end} y cue('s1', 'dinero') el segundo exacto de esa palabra.
"""
import asyncio, json, os, re, shutil, subprocess, sys, tempfile, wave
import numpy as np

SR = 44100


def ffmpeg_to_f32(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def trim(x, thr=0.008):
    """Drop leading/trailing silence; returns (audio, seconds trimmed at the start)."""
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx): return x, 0.0
    a, b = max(0, idx[0] - int(0.03 * SR)), min(len(x), idx[-1] + int(0.08 * SR))
    return x[a:b], a / SR


def estimate_words(text, dur):
    """No word timings from the engine: spread words over the clip by length, with pauses after punctuation."""
    ws = text.split()
    wt = [len(re.sub(r'\W', '', w)) + 2 + (4 if re.search(r'[.,;:!?]$', w) else 0) for w in ws]
    tot, t, out = sum(wt) or 1, 0.0, []
    for w, k in zip(ws, wt):
        d = dur * k / tot
        out.append({'w': w, 's': round(t, 3), 'e': round(t + d * (0.8 if re.search(r'[.,;:!?]$', w) else 0.95), 3)})
        t += d
    return out


async def edge_scene(text, voice, rate, pitch, out_mp3):
    import edge_tts
    kw = dict(rate=rate, pitch=pitch)
    try: com = edge_tts.Communicate(text, voice, boundary='WordBoundary', **kw)
    except TypeError: com = edge_tts.Communicate(text, voice, **kw)          # older edge-tts: word boundaries by default
    words = []
    with open(out_mp3, 'wb') as f:
        async for ch in com.stream():
            if ch['type'] == 'audio': f.write(ch['data'])
            elif ch['type'] == 'WordBoundary':
                s = ch['offset'] / 1e7; words.append({'w': ch['text'], 's': round(s, 3), 'e': round(s + ch['duration'] / 1e7, 3)})
    return words


def attach_punct(words, text):
    """edge-tts drops punctuation from boundaries; put it back so captions read naturally."""
    toks, j = text.split(), 0
    for w in words:
        while j < len(toks) and re.sub(r'\W', '', toks[j]).lower() == '' : j += 1
        if j < len(toks) and re.sub(r'\W', '', toks[j]).lower().startswith(re.sub(r'\W', '', w['w']).lower()[:3]):
            w['w'] = toks[j]; j += 1
    return words


def espeak_scene(text, voice_lang, rate_pct, out_wav):
    exe = shutil.which('espeak-ng') or shutil.which('espeak')
    if not exe: raise RuntimeError('ni edge-tts ni espeak-ng disponibles')
    subprocess.run([exe, '-v', voice_lang, '-s', str(int(165 * (1 + rate_pct / 100))), '-w', out_wav, text], check=True, capture_output=True)


def main():
    if '--voices' in sys.argv:
        lang = sys.argv[sys.argv.index('--voices') + 1] if len(sys.argv) > sys.argv.index('--voices') + 1 else 'es'
        import edge_tts
        for v in asyncio.run(edge_tts.list_voices()):
            if v['Locale'].lower().startswith(lang.lower()): print(f"{v['ShortName']:28s} {v['Gender']:7s} {v['Locale']}")
        return
    spec = json.load(open(sys.argv[1]))
    engine = sys.argv[sys.argv.index('--engine') + 1] if '--engine' in sys.argv else spec.get('engine', 'edge')
    voice, rate, pitch = spec.get('voice', 'es-PE-AlexNeural'), spec.get('rate', '+0%'), spec.get('pitch', '+0Hz')
    rate_pct = float(re.sub(r'[^\d.\-+]', '', rate) or 0)
    lead, gap = float(spec.get('lead', 0.3)), float(spec.get('gap', 0.7))
    os.makedirs('audio', exist_ok=True)
    tmp = tempfile.mkdtemp()
    clips, cursor, out = [], lead, {'voice': voice, 'engine': engine, 'scenes': {}, 'order': []}
    for i, sc in enumerate(spec['scenes']):
        if not sc.get('say'):                                     # silent scene: just hold the time
            dur = float(sc.get('silence', 2.5)); start = cursor
            out['scenes'][sc['id']] = {'start': round(start, 3), 'end': round(start + dur, 3), 'text': '', 'words': []}
            out['order'].append(sc['id']); cursor = start + dur + float(sc.get('gap', gap)); continue
        text = sc['say'].strip()
        words = None
        if engine == 'edge':
            try:
                mp3 = os.path.join(tmp, f'{i}.mp3')
                words = asyncio.run(edge_scene(text, sc.get('voice', voice), sc.get('rate', rate), sc.get('pitch', pitch), mp3))
                x = ffmpeg_to_f32(mp3)
            except Exception as e:
                print(f'⚠️  edge-tts falló ({type(e).__name__}: {str(e)[:120]}). Uso espeak-ng (voz robótica, solo sirve para probar tiempos).')
                engine = out['engine'] = 'espeak'
        if engine == 'espeak':
            wav = os.path.join(tmp, f'{i}.wav')
            espeak_scene(text, spec.get('espeak_voice', 'es-419'), rate_pct, wav)
            x = ffmpeg_to_f32(wav)
        x, cut = trim(x)
        dur = len(x) / SR
        if words: words = attach_punct([{**w, 's': max(0, w['s'] - cut), 'e': max(0, w['e'] - cut)} for w in words], text)
        else: words = estimate_words(text, dur)
        start = cursor
        out['scenes'][sc['id']] = {'start': round(start, 3), 'end': round(start + dur, 3), 'text': text,
                                   'words': [{'w': w['w'], 's': round(start + w['s'], 3), 'e': round(start + min(w['e'], dur), 3)} for w in words]}
        out['order'].append(sc['id'])
        clips.append((start, x))
        cursor = start + max(dur + float(sc.get('gap', gap)), float(sc.get('min', 0)))   # min: the scene never gets shorter than this
    total = cursor + 0.5
    mix = np.zeros(int(total * SR))
    for s, x in clips: a = int(s * SR); mix[a:a + len(x)] += x
    peak = np.max(np.abs(mix)) or 1
    mix = mix / peak * 0.89
    with wave.open('audio/vo.wav', 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
    out['duration'] = round(total, 3)
    json.dump(out, open('audio/vo.json', 'w'), ensure_ascii=False, indent=1)
    print(f"voz ({out['engine']}, {voice}) → audio/vo.wav + audio/vo.json · {total:.1f}s")
    for sid in out['order']:
        g = out['scenes'][sid]; print(f"  {sid:6s} {g['start']:6.2f} → {g['end']:6.2f}  ({g['end'] - g['start']:.1f}s)  {g['text'][:60]}")


if __name__ == '__main__':
    main()
