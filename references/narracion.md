# Narración (voz en off con edge-tts)

La voz manda el ritmo del video: cada escena dura lo que dura su frase, y cada trazo cae en la palabra que lo nombra.

## Contenido
1. Escribir el guion para el oído
2. guion.json
3. Voces
4. Generar y revisar
5. Problemas comunes

## 1 · Escribir el guion para el oído
- **Una idea por línea**, y una línea por cada momento del storyboard. Las líneas son los `id` que usarás en `seg()` y `cue()`.
- **Ritmo:** unas 2.5 palabras por segundo con `rate: "+6%"`. Un video de 60 s tiene ~130–150 palabras; uno de 35 s, ~80.
- **Hook:** la primera frase tiene menos de 10 palabras y es una pregunta o una afirmación sorprendente. Nada de "Hola, en este video…".
- **Frases cortas.** Las comas y los puntos son pausas reales en la voz; úsalos para respirar.
- **Escribe para la pizarra y para el oído a la vez:** lo que se dice es la versión larga y lo que se escribe es la palabra clave. Voz: "Al ocho por ciento anual se duplica en nueve años". Pizarra: `72 ÷ 8% = 9 años`.
- **Cifras:** en la voz, escríbelas en palabras cuando puedan leerse de dos formas ("dos mil veintiséis", "doce por ciento"). Así `cue()` encuentra la palabra exacta y los subtítulos se leen bien.
- **Siglas:** escríbelas como se pronuncian si la voz las deletrea mal ("Sunat" en vez de "SUNAT", "a ve ese" si quieres "AWS" deletreado).
- **CTA:** una sola acción ("guárdalo", "comenta tu tasa"), nunca tres.

## 2 · guion.json
```json
{
  "engine": "auto",
  "voices": {"kokoro": "em_alex", "piper": "es_MX-claude-high", "edge": "es-PE-AlexNeural"},
  "speed": 1.0,
  "lead": 0.3,
  "gap": 0.75,
  "scenes": [
    {"id": "hook",  "say": "¿Cuánto tarda tu dinero en duplicarse?"},
    {"id": "ej8",   "say": "Al ocho por ciento, en nueve años.", "gap": 0.35},
    {"id": "pausa", "silence": 2.0},
    {"id": "cta",   "say": "Guarda este video.", "min": 6.5}
  ]
}
```
- `gap`: silencio después de esa línea. Usa 0.6–0.9 s cuando cambia la escena (ahí cae la transición) y 0.3–0.4 s cuando la siguiente línea sigue en la misma pizarra.
- `min`: la línea ocupa al menos esos segundos. Úsalo en el CTA, porque el final tipo storyboard dura unos 6 s.
- `silence`: una escena sin voz (un gag visual o un respiro musical).
- `voice` por línea: otro personaje con otra voz del mismo motor.
- `speed`: 0.9–1.1 suena natural. Para un video más corto, mejor recorta texto.

## 3 · Motores de voz (el modo `auto` usa el primero que funcione)
| # | Motor | Calidad | Requisitos | Tiempos por palabra |
|---|---|---|---|---|
| 1 | **ElevenLabs** | la mejor; puede clonar la voz de la persona | `ELEVENLABS_API_KEY` (de pago) + internet hacia api.elevenlabs.io; voz con `voices.elevenlabs` (id) | exactos |
| 2 | **OpenAI** `gpt-4o-mini-tts` | muy clara, se puede dirigir el tono (`"style"`) | `OPENAI_API_KEY` + internet hacia api.openai.com | por frase |
| 3 | **edge-tts** | neural de Microsoft, gratis, acentos de cada país | internet hacia speech.platform.bing.com | exactos |
| 4 | **Kokoro** (local) | natural, gratis, sin internet al usarla | `pip install kokoro-onnx soundfile`; descarga ~350 MB de GitHub la primera vez | por frase |
| 5 | **Piper** (local) | muy clara, acento de México, Argentina o España | `pip install sherpa-onnx`; ~65 MB por voz desde GitHub | por frase |
| 6 | espeak-ng | robótica | — | estimados |

Importante: **en los entornos de Claude con red restringida, solo funcionan los motores locales** (Kokoro y Piper), porque ElevenLabs, OpenAI y edge-tts quedan bloqueados. Por eso la voz por defecto es Kokoro `em_alex` con pronunciación latinoamericana (`lang: es-419`). En la computadora de la persona, o si ella habilita esos dominios en la configuración de red, el modo `auto` sube solo a la mejor opción disponible. "Por frase" significa que cada tramo entre signos de puntuación se mide exacto y las palabras dentro de él se reparten por sílabas, con unos 0.2 s de error.

Voces (`python3 tts.py --voices` para ver todas):
| Motor | Voz | Descripción |
|---|---|---|
| kokoro | `em_alex` | hombre, cálido (**default**) |
| kokoro | `ef_dora` | mujer, clara |
| kokoro | `em_santa` | hombre, grave |
| piper | `es_MX-claude-high` | México, hombre, muy clara |
| piper | `es_MX-ald-medium` | México, hombre |
| piper | `es_AR-daniela-high` | Argentina, mujer |
| edge | `es-PE-AlexNeural` / `es-PE-CamilaNeural` | Perú |
| edge | `es-MX-JorgeNeural` / `es-MX-DaliaNeural` | México |
| openai | `onyx`, `ash` / `coral`, `nova` | hombre / mujer |

`python3 tts.py --sample "una frase del guion"` genera la misma frase con todas las voces locales en `audio/muestras/` para que la persona elija de oído.

## 4 · Generar y revisar
```bash
pip install kokoro-onnx soundfile sherpa-onnx edge-tts   # una vez
python3 tts.py guion.json       # → audio/vo.wav + audio/vo.json, el motor usado y la duración de cada línea
```
- Revisa la tabla: si una línea dura más de lo que su escena necesita (o menos de lo que la animación pide), reescribe la frase o usa `min`.
- Escucha `audio/vo.wav` (o pásalo a la persona) **antes** de animar. Cambiar una palabra después obliga a recolocar los `cue()`.
- Revisa qué motor usó (primera línea de la salida). Si dice **espeak**, la voz es robótica: instala Kokoro (`pip install kokoro-onnx soundfile`) y vuelve a generarla. Nunca entregues un video con espeak.
- Toda voz pasa por una cadena de claridad (filtro de graves, presencia en 3.4 kHz, compresión suave y −16 LUFS), y `build.sh` baja la música mientras se habla.

## 5 · Problemas comunes
| Síntoma | Causa | Solución |
|---|---|---|
| `cue: "x" not found` en consola y el elemento sale al inicio de la línea | la palabra no está escrita igual en `say` (o la voz la partió) | usa un prefijo (`'dupli'`), otra palabra cercana, o el índice `cue(id, 3)` |
| La voz se monta sobre la transición | `gap` muy corto en un cambio de escena | sube `gap` de esa línea a 0.7–0.9 |
| El video se siente lento | líneas largas o con relleno | recorta palabras y quita frases de contexto: el texto en pizarra ya lo explica |
| Los subtítulos tapan el dibujo | contenido por debajo de `SAFE.bottom` | sube el contenido, o `captions: { y: … }` |
| Voz robótica en el render final | no estaban instalados Kokoro ni Piper y cayó a espeak | `pip install kokoro-onnx soundfile sherpa-onnx`, vuelve a correr `tts.py` y luego `./build.sh` |
| Pronuncia la "z" y la "c" como en España | Kokoro con `lang: es` | deja el default `es-419`, o usa Piper México |
