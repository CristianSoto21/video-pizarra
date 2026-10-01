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
  "voice": "es-PE-AlexNeural",
  "rate": "+6%",
  "pitch": "+0Hz",
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
- `voice` / `rate` / `pitch` también se pueden fijar por línea (por ejemplo, un segundo personaje con otra voz).

## 3 · Voces (edge-tts, gratis, sin clave)
| Voz | Acento | Nota |
|---|---|---|
| `es-PE-AlexNeural` | Perú, hombre | default |
| `es-PE-CamilaNeural` | Perú, mujer | |
| `es-MX-JorgeNeural` / `es-MX-DaliaNeural` | México | neutro para toda Latinoamérica |
| `es-CO-GonzaloNeural` / `es-CO-SalomeNeural` | Colombia | |
| `es-AR-TomasNeural` / `es-AR-ElenaNeural` | Argentina | |
| `es-ES-AlvaroNeural` / `es-ES-ElviraNeural` | España | |
| `en-US-AndrewNeural` / `en-US-AvaNeural` | inglés | |

Lista completa: `python3 tts.py --voices es`. Pregunta a la persona su país o público y elige un acento cercano. Si no lo sabes, usa el default.

## 4 · Generar y revisar
```bash
pip install edge-tts            # una vez (en el venv del proyecto si lo hay)
python3 tts.py guion.json       # → audio/vo.wav + audio/vo.json y una tabla con la duración de cada línea
```
- Revisa la tabla: si una línea dura más de lo que su escena necesita (o menos de lo que la animación pide), reescribe la frase o usa `min`.
- Escucha `audio/vo.wav` (o pásalo a la persona) **antes** de animar. Cambiar una palabra después obliga a recolocar los `cue()`.
- Si edge-tts falla (sin internet o bloqueado), `tts.py` cae a **espeak-ng**: voz robótica con tiempos estimados. Sirve para maquetar y probar tiempos, nunca para entregar. Avísale a la persona y vuelve a generar la voz con edge-tts antes del render final.

## 5 · Problemas comunes
| Síntoma | Causa | Solución |
|---|---|---|
| `cue: "x" not found` en consola y el elemento sale al inicio de la línea | la palabra no está escrita igual en `say` (o la voz la partió) | usa un prefijo (`'dupli'`), otra palabra cercana, o el índice `cue(id, 3)` |
| La voz se monta sobre la transición | `gap` muy corto en un cambio de escena | sube `gap` de esa línea a 0.7–0.9 |
| El video se siente lento | líneas largas o con relleno | recorta palabras y quita frases de contexto: el texto en pizarra ya lo explica |
| Los subtítulos tapan el dibujo | contenido por debajo de `SAFE.bottom` | sube el contenido, o `captions: { y: … }` |
| Voz robótica en el render final | el render se hizo con el respaldo espeak | vuelve a correr `tts.py` con internet y luego `./build.sh` |
