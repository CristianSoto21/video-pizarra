# Lecciones aprendidas (léelo cuando algo se vea raro)

## Lo que el público/cliente rechazó
- **Historia sin texto que explique** → "no se entiende". El texto explica cada punto; los gags acompañan.
- **Hook lento** (el personaje despierta, contexto primero) → "se tarda mucho". Primera frase en ~0.2 s.
- **Todas las transiciones iguales** (paneo de cámara repetido) → aburrido. Cada una distinta y motivada.
- **Transiciones largas** (>1 s) o esperas antes de ellas → se siente lento. 0.4–0.8 s.
- **El mismo lápiz/plumón en todas las escenas** → monótono. Alterna herramientas y escenas sin herramienta.
- **Mismo fondo en todo** → plano. Cada escena su fondo.
- **Logo de marca en el personaje** sin que lo pidan → quitarlo. Ropa lisa por defecto.
- **Cifras deducidas** (p. ej. "precio anterior $5/$25" calculado desde un −20%) → no inventar; solo datos de la fuente.

## Bugs técnicos y su solución
| Síntoma | Causa | Solución |
|---|---|---|
| Todas las escenas en negro/invisibles | `tl.fromTo` aplicó sus valores FROM (opacity 0, fuera de cuadro) al construir | `immediateRender: false` en ese tween |
| Elemento corrido de lugar tras escalar/rotar | GSAP `svgOrigin`/`transformOrigin` dentro de grupos rotados o con transforms previos | usar `mover()` o un proxy + `onFrame` que escriba el `transform` directo; para sellos `stamp()` |
| Escena que queda aplastada/delgada al saltar a un tiempo posterior | un updater solo escribe durante la transición y deja el último valor | escribir el estado final también después (`else if (T >= end) …`) |
| Paneles faltantes o corridos en el mosaico final | restos de transiciones (escala 60, y −1920, clip) | el finale ya resetea `inner`; agrega `resets` para props sueltos |
| Texto cortado al revelarse | el clip del texto se mide antes de cargar la fuente | el motor espera a `document.fonts`; si agregas fuentes, añádelas a `fontLoads` |
| Personaje tapa el texto | tamaños: la mascota mide ~171×escala de alto (+ sombra) | calcula `y` de pies y deja 60–80 px al texto |
| Archivo de 150–200 MB | la línea "viva" y el grano cambian cada cuadro | usa la copia `-movil.mp4` (2 pasadas a 2.6 Mbps) para compartir |
| Audio bajo en redes | mezcla sin normalizar | `build.sh` ya aplica `loudnorm` a −14 LUFS |

| Letras de un titular faltan o salen rotas | (versión anterior con opentype.js) los glifos con tilde corrompían otras letras | `ink()` usa fuentes de un solo trazo; no reintroduzcas fuentes de contorno para escribir |
| Texto cortado por los bordes | línea demasiado larga para 1080 px | `ink()` ya encoge a `maxWidth`; con `T()` mide (Kalam 60 ≈ 28 px por carácter) |
| Subtítulos encima del dibujo o del personaje | contenido por debajo de `SAFE.bottom` (~1475 px en vertical con subtítulos) | sube el contenido; la franja de abajo es de los subtítulos |
| Un trazo aparece antes de que la voz lo diga | `cue()` no encontró la palabra y devolvió el inicio de la línea | revisa la consola (`cue: … not found`) y usa otro término o un prefijo |
| La mano tapa lo que se está diciendo | texto escrito justo a la derecha de algo importante | escribe de izquierda a derecha y de arriba abajo; la mano entra desde abajo a la derecha |
| Video negro o con Comic Sans al renderizar | las fuentes venían de Google Fonts | ya vienen en el proyecto (`npm install` las trae); no vuelvas a enlazar Google Fonts |

## QA que sí atrapa errores
- Hoja de contacto cada 1.2 s de todo el video.
- Capturas cada 0.2 s alrededor de cada transición (usa `hits.json` para saber dónde caen).
- Revisa el primer cuadro (¿aparece algo en <0.5 s?) y el último (¿se lee el CTA?).
- Con narración: escoge 3–4 palabras clave de `audio/vo.json` y saca stills justo en su `s`; lo que esa palabra nombra debe estar dibujándose en ese cuadro.
- Revisa que ningún texto quede debajo de la mano al terminar de escribir (la mano sale en ~0.3 s; si el texto es corto, igual se lee).
