---
name: video-pizarra-pro
description: Crea videos animados estilo pizarra (whiteboard animation) sobre cualquier tema, con una mano realista que escribe cada letra trazo a trazo, mezcla de pizarra blanca, verde y negra, borrado real, mascota que actúa, voz en off generada (edge-tts, gratis) sincronizada palabra por palabra, subtítulos karaoke, música y efectos; renderizados a MP4 vertical u horizontal. Incluye también los estilos acuarela, cuaderno/bullet journal y minimal. Úsala siempre que alguien pida "un video animado", "video tipo pizarra/pizarrón", "whiteboard animation", "video explicativo con dibujos", "video con mano que dibuja", "estilo VideoScribe", "reel/TikTok/Short animado sobre X", "video con voz en off explicando X", o quiera explicar un tema, noticia, producto o clase en video corto sin grabarse, aunque no diga "pizarra".
---

# video-pizarra-pro

Convierte un tema en un video de 30–90 s que se siente dibujado a mano frente a cámara: una mano que escribe y borra en la pizarra, una voz que explica, y cada trazo cayendo en la palabra que lo nombra.

El motor ya está hecho. Tu trabajo es **entender el video que la persona quiere, escribir un buen guion y montarlo con el API del motor**. No reescribas el motor; si algo falta, agrégalo en el `scenes.js` del proyecto.

## 0 · Preparar (una vez por máquina, rápido después)

Los archivos de la skill viven en un repositorio. Si junto a este SKILL.md no hay una carpeta `template/`, descárgalo:

```bash
SK=~/.cache/video-pizarra-pro
[ -d "$SK/.git" ] && git -C "$SK" pull -q || git clone -q --depth 1 https://github.com/CristianSoto21/video-pizarra "$SK"
```
(Si la carpeta `template/` está junto a este archivo, usa esa ruta como `$SK`.)

Necesita **Node 18+, ffmpeg y Python 3** (`pip install numpy pillow edge-tts`). Revisa con `which node ffmpeg python3` y avisa a la persona si falta algo; no intentes instalar Node o ffmpeg sin preguntarle.

| Carpeta | Para qué |
|---|---|
| `$SK/template/` | motor pizarra (SVG + GSAP): mano realista, `ink()`, pizarras, borrado, voz |
| `$SK/template-estilos/` | motor de estilos (canvas): acuarela, acuarela viva, cuaderno, minimal |
| `$SK/catalogo-estilos/` | capturas para que la persona elija estilo |
| `$SK/references/` | guías: `engine-api.md`, `narracion.md`, `storytelling.md`, `lessons.md`, `guion-estilos.md`, `historia.md`, `errores.md` |

## Flujo

1. Entrevista corta
2. Investigar y verificar datos
3. Guion + storyboard → aprobación
4. Generar la voz
5. Construir las escenas
6. QA visual
7. Música y render
8. Entregar

Crea una lista de tareas con estos pasos: el render tarda minutos y la persona quiere ver el avance.

---

## 1 · Entrevista (adaptada a lo que ya te dieron)

Si el pedido ya trae tema, formato y tono, no hagas la entrevista completa: decide lo que falte con los defaults, muestra un resumen de 5 líneas y arranca. Si dice "hazlo directo", no preguntes nada. Si no, usa la herramienta de preguntas (máximo 4 por tanda, la opción recomendada primero, en el idioma de la persona):

- **Tema y la UNA idea** que el espectador debe llevarse. Pide links, notas o datos: los datos correctos importan más que la animación.
- **Estilo**: pizarra con mano (recomendado; mezcla blanca/verde/negra), acuarela, cuaderno o minimal. Muestra `catalogo-estilos/` si duda.
- **Formato y duración**: 9:16 para Reels/TikTok/Shorts (default) o 16:9 para YouTube; 30–45 s, 45–60 s (default) o 60–90 s.
- **Voz**: voz generada (default `es-PE-AlexNeural`; pregunta el país o el público para elegir acento, ver `references/narracion.md`), sin voz (solo música y texto, el modo clásico) o su propia grabación.
- Solo si importa: **personaje** (la mascota por defecto, su logo o personaje, o ninguno), **colores de marca**, **música** (Suno con `SUNO_API_KEY`, su mp3 en `audio/music.mp3`, o solo efectos) y **CTA** (default: seguir + comentar).

Cierra con un resumen en dos grupos: lo que respondió y lo que decidiste por defecto.

## 2 · Investigar y verificar

- Si hay cifras, noticias o afirmaciones del mundo actual, busca fuentes y anota cada dato con su fuente.
- En pantalla y en la voz van solo datos que aparecen en las fuentes. **No inventes cifras derivadas.** Las cuentas propias (por ejemplo, 100 × 1.1¹⁰) se hacen con código, no de memoria.
- Guarda las fuentes para el caption.

## 3 · Guion + storyboard → aprobación

Lee `references/storytelling.md` y, si hay voz, `references/narracion.md`. Escribe en la carpeta del proyecto:

- `guion.json`: una línea de voz por momento de la historia (hook → idea → explicación → ejemplo → giro → CTA), con `id` cortos (`hook`, `regla`, `ej8`…).
- `STORYBOARD.md`: una tabla por escena con **pizarra/fondo · qué se escribe · qué dice la voz · qué hace el personaje · transición**.

Muéstrale a la persona un resumen de una línea por escena, con el texto de la voz, y **espera su aprobación**, salvo que haya pedido hacerlo directo. Cambiar el guion cuesta minutos; cambiarlo después de animar cuesta horas.

Reglas que vienen de lo que funcionó:
- **Hook en el primer segundo.** La primera frase de voz tiene menos de 10 palabras y la primera palabra escrita aparece a los ~0.2 s.
- **La voz explica y la pizarra muestra la palabra clave.** No escribas la frase completa que se está diciendo. Sin voz, el texto en pantalla lo explica todo (titular + una línea de apoyo).
- **Una idea por escena**, y alterna las pizarras: blanca con plumón ↔ verde o negra con tiza, más algún fondo de papel (cuaderno, kraft, sepia) para variar.
- **Al menos un borrado** con sentido (un número que cambia, antes → después) y alguna escena sin mano (la mascota con `popMascot`, `stamp`, `pop`) para que no todo sea escritura.
- **Transiciones motivadas y distintas**, de 0.4 a 0.8 s: `boardSlide` entre pizarras, `eraser`, `flip`, `zoomInto` hacia el ojo de la mascota, `iris`, `slideUp`… Nunca repitas la misma dos veces seguidas.

## 4 · Generar la voz (si hay voz)

```bash
PROJ=~/Documents/videos/<slug>      # o la carpeta que pida la persona
mkdir -p "$PROJ" && cp -R "$SK/template/." "$PROJ/" && cd "$PROJ" && npm install
npx playwright install chromium      # solo la primera vez (el navegador que renderiza)
python3 tts.py guion.json            # → audio/vo.wav + audio/vo.json y una tabla de duraciones
```
- Revisa la tabla: la duración total debe acercarse a la pedida. Si se pasa, recorta frases; no subas la velocidad más de `+12%`.
- Si `tts.py` avisa que **cayó a espeak-ng**, la voz es robótica y solo sirve para maquetar. Díselo a la persona y vuelve a generar la voz con edge-tts antes del render final (necesita internet; `pip install edge-tts`).
- Para estilos (acuarela/cuaderno/minimal) el flujo es `node guion.mjs && python3 tts.py guion.json` dentro de un proyecto copiado de `template-estilos/` (ver `references/guion-estilos.md`).

## 5 · Construir las escenas (pizarra)

Antes de escribir código lee **`references/engine-api.md`** completo, y revisa `scenes.example.js` (video narrado terminado: "La regla del 72") y `scenes.example-musica.js` (video sin voz, sincronizado a la música).

```bash
cp scenes.example.js scenes.js        # punto de partida; reescríbelo según el storyboard
```

Lo esencial:
- **Todo texto escrito a mano va con `ink()` + `write()`**: la mano traza cada letra en orden y levanta el plumón entre trazos. `bold: true` para titulares. `T()` + `write()` solo destapa el texto, así que úsalo para tipografía de diseño (sellos, globos, CTA), no para "escribir".
- **Pizarras**: `newScene('whiteboard' | 'greenboard' | 'blackboard')` ya eligen la herramienta (plumón o tiza) y el color de tinta.
- **Tiempos con voz**: `cue('id', 'palabra')` da el segundo exacto de esa palabra y `seg('id')` el inicio y fin de la línea. Cada escena termina en `seg(id).end` y la transición llena el silencio. Nunca cuentes segundos a mano si hay voz.
- **Espacio seguro**: el contenido va dentro de `SAFE` (con subtítulos, la franja de abajo es de ellos). La mascota mide ~171 × escala px de alto.
- **Trazos humanos**: `P(g, d, { rough: 2, double: true })` para círculos y subrayados.
- **Formato horizontal**: `bootVideo(build, { width: 1920, height: 1080 })` y recalcula posiciones.
- **Marca**: `palette`, `hatches`, `hand: { skin, sleeve }`, `mascotShape` o `image()` con su logo (ver engine-api §2 y §7).

Previsualiza con `npx serve .` y abre `index.html` si quieres verlo en vivo.

Para **estilos** sigue `references/guion-estilos.md` (y `references/historia.md` para el modo historia) en `video.js`.

## 6 · QA visual (obligatorio antes del render final)

```bash
node render.mjs --every 1 && python3 contact.py 10     # hoja de contacto → contact.jpg
```
Abre `contact.jpg` y revisa: texto cortado o encimado, subtítulos tapando el dibujo, la mano tapando algo que se está diciendo, escenas vacías, elementos fuera de cuadro y legibilidad en un teléfono. Después:
- `node render.mjs --stills 12.1,12.3,12.5` alrededor de cada transición.
- Con voz, escoge 3–4 palabras clave de `audio/vo.json` y saca stills en su segundo: lo que esa palabra nombra debe estar dibujándose ahí.
- Si algo se ve raro, mira `references/lessons.md` (pizarra) o `references/errores.md` (estilos). Corrige y vuelve a revisar.

## 7 · Música y render

- **Suno** (si hay key): `python3 suno_music.py "<estilo>" "<título>" audio/music.mp3`, instrumental de 95–115 BPM, tranquila si hay voz.
- **Beats** (solo sin voz): `python3 -m venv .venv && .venv/bin/pip install librosa numpy && .venv/bin/python beats.py audio/music.mp3`.
- **Render**: `./build.sh <nombre>` → `<nombre>.mp4` (master) y `<nombre>-movil.mp4` (<30 MB). Mezcla efectos sintetizados, música y voz; baja la música cuando se habla y normaliza a −14 LUFS. Tarda ~3–5 min por minuto de video: córrelo en segundo plano y avisa.
- Si Playwright no encuentra Chromium: `npx playwright install chromium`, o `CHROME_PATH=/ruta/a/chrome ./build.sh <nombre>`.

## 8 · Entregar

- Envía la versión móvil e indica dónde quedó el master.
- Resume en 3–5 líneas qué tiene el video. Si la voz salió del respaldo robótico, dilo claramente.
- Ofrece un **caption** con información extra (contexto, detalle, fuente de cada dato), una pregunta que invite a comentar y hashtags.
- Para cambios: edita `guion.json` y vuelve a correr `tts.py` si cambia lo que se dice (los `cue()` se reacomodan solos), o edita `scenes.js`; luego repite QA → build. Guarda copias `scenes_vN.js` por versión.

## Todo se puede personalizar
Si la persona pide algo que no viene de fábrica (otra voz por personaje, su logo como mascota, otra pizarra, otra tipografía), adáptalo con el API del motor o con una escena propia en `scenes.js`. Lo único que no se negocia es la calidad: texto legible, datos reales y QA antes de entregar.
