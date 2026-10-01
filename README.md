# video-pizarra-pro 🎬✏️

Fork mejorado de [santmun/video-pizarra](https://github.com/santmun/video-pizarra): skill para **Claude** que crea videos animados
estilo pizarra sobre cualquier tema y los renderiza a MP4 (Reels, TikTok, Shorts o YouTube).

## Qué cambia respecto al original
- **Escritura real**: cada letra se traza en orden con fuentes de un solo trazo (Hershey/EMS, MIT), con tildes, ñ, ¿ y ¡.
- **Mano realista** que sostiene el plumón, la tiza, el lápiz o el mota; entra a cuadro, levanta la mano entre trazos y proyecta sombra.
- **Pizarra blanca, verde y negra**, cada una con su herramienta y tinta, y transición `boardSlide` entre ellas.
- **Borrado real** de una zona de la pizarra, con residuo de tiza.
- **Trazos imperfectos** (`rough`, `double`).
- **Voz en off gratis con edge-tts**: el video sigue a la voz palabra por palabra (`cue()`), con subtítulos karaoke y la música bajando cuando se habla.
- **La voz también en los estilos** acuarela, cuaderno y minimal (cada escena dura lo que dura su frase).
- **Fuentes incluidas en el proyecto**: el render ya no depende de Google Fonts.

## Instalación
1. Guarda `SKILL.md` como skill en Claude, o copia esta carpeta a `~/.claude/skills/video-pizarra-pro/`.
   La skill descarga este repo sola si no encuentra `template/` junto a ella.
2. Requisitos: **Node.js 18+**, **ffmpeg**, **Python 3** con `pip install numpy pillow edge-tts`.
3. Pide algo como: *"Hazme un video pizarra de 45 segundos con voz explicando la regla del 72"*.

## Probar el ejemplo
```bash
cp -R template mi-video && cd mi-video && npm install && npx playwright install chromium
cp scenes.example.js scenes.js && cp guion.example.json guion.json
python3 tts.py guion.json && ./build.sh regla-72
```

## Créditos
Motor original, mascota y estilos: [Horizontes IA / santmun](https://github.com/santmun/video-pizarra).
Fuentes de un solo trazo: [hersheytext](https://github.com/techninja/hersheytext) (MIT, ver `template/fonts/LICENSE-hershey.txt`).
