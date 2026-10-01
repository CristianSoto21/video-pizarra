# Guion: tipos de escena y cómo escribirlo

## Tipos de escena (campos)
Todos aceptan `dur` (segundos) y `say` (lo que se narra → subtítulos). En títulos, `*palabra*` = énfasis (cada estilo lo pinta a su manera: color, subrayado, marcatextos…). `\n` fuerza salto de línea.

| type | campos | para qué |
|---|---|---|
| `hook` | `title`, `kicker`, `prompt`, `person` (false para ocultar) | Apertura: promesa + persona + (opcional) una "caja de prompt" que se teclea |
| `statement` | `title`, `sub`, `kicker`, `mascot` | Una idea fuerte en grande |
| `chapter` | `kicker` ("01"), `title` | Separador de sección |
| `list` | `title`, `items[]` (2–5, ≤ 6 palabras c/u), `stagger` | Enumerar |
| `stat` | `value`, `from`, `prefix`, `suffix`, `decimals`, `label`, `kicker`, `countDur`, `mascot` | Cifra que cuenta hacia arriba |
| `compare` | `title`, `left:{title,items}`, `right:{title,items}` | Antes/después, mito/realidad, A vs B (izquierda = lo malo) |
| `quote` | `text`, `by`, `person` (true para mostrarla) | Testimonio o frase |
| `media` | `src`, `frame` (`phone`/`browser`/`plain`), `title`, `caption` | Captura real, prueba social, producto |
| `steps` | `title`, `items[]` (2–4) | Proceso/método |
| `cta` | `title`, `sub`, `button` | Cierre con llamada a la acción |

Énfasis con puntuación: la puntuación va dentro de los asteriscos (`¿Cuál empiezas *hoy?*`); `*hoy*?` deja un espacio raro.

Nivel del video: `style`, `format` ('16:9' | '9:16'), `fps` (30), `person` ({photo, look} o false), `mascot`, `captions` (true/false), `words` (ruta a words.json o arreglo), `beats` (ruta a beats.json), `palette` (sobrescribe colores del estilo, p.ej. `{accent:'#00B3A4', bg:'#FFFFFF'}` para la marca), `font` (`{display:'Bebas Neue', body:'Poppins'}`, cualquier fuente de Google Fonts), `mascotColor` ('#hex'), `mascot` también acepta `{image:'assets/logo.png'}` (su logo o personaje como mascota).

## Escribir un guion que retenga
1. **Gancho en 3 s**: la escena 1 es un `hook` con la promesa o la sorpresa ("Nadie dibujó esto."). Nada de "hola, bienvenidos".
2. **Tensión → solución → prueba → acción**: problema (statement/compare), cómo se resuelve (list/steps), prueba real (stat/media/quote), CTA.
3. **Una idea por escena**. Si una frase tiene dos ideas, son dos escenas.
4. **El título en pantalla no repite la narración palabra por palabra**: la resume en ≤ 7 palabras con 1–2 palabras enfatizadas.
5. **Ritmo**: 2.5–3.5 s para frases cortas, 4–6 s para listas/pasos/capturas. Varía el tipo de escena cada vez.
6. **Cifras concretas** (con fuente del usuario) valen más que adjetivos.
7. **Duración de escena con voz en off**: la escena dura lo que tarda su frase + ~0.3 s.
8. Vertical (9:16): títulos aún más cortos; máximo 4 items en listas.

## Ejemplo de estructura (45 s)
hook 4.5 · statement 3 · compare 5 · list 5 · stat 4 · media 4.5 · quote 4 · steps 5 · chapter 3 · cta 4.5

## Narración con voz generada (edge-tts)
1. Escribe `say` en cada escena (las que no tengan `say` quedan como silencio de su `dur`). Voz a nivel del video: `ttsEngine` ('auto'), `voices: { kokoro: 'em_alex', piper: 'es_MX-claude-high' }`, `speed`, `pron`, `voGap: 0.6` (ver `references/narracion.md` para acentos).
2. `node guion.mjs && python3 tts.py guion.json` → `audio/vo.wav` + `audio/vo.json`.
3. Al cargar, `main.js` ajusta cada `dur` a su frase (el `dur` que escribiste queda como mínimo), saca los subtítulos de los tiempos reales de cada palabra y apaga el corte al beat. `./build.sh` mezcla la voz y baja la música mientras se habla.
4. Para que una lista o un contador vaya con la voz, mira los tiempos de las palabras en `audio/vo.json` y ajusta `stagger` / `countDur` de esa escena.
5. Si cambias un `say`, vuelve a correr el paso 2. `narration: false` en video.js ignora la voz. QA: `node render.mjs --every 1 && python3 contact.py stills contact.jpg 6`. Las fuentes de los estilos vienen en `node_modules/@fontsource` (npm install); una fuente de marca (`font:`) sí necesita Google Fonts.
Guía para escribir lo que se dice: `references/narracion.md`.
