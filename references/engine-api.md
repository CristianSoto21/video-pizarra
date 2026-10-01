# Engine API (template/engine.js)

`scenes.js` calls `bootVideo(async (V) => { ...; return endTime; }, config)`. Everything lives on `V`.

## Contents
0. What's new in this fork (read first)
1. Time model
2. Config
3. Canvas & coordinates
4. Scenes & boards
5. Text (real handwriting with `ink()`)
6. Shapes, rough strokes & erasing
7. Characters (mascot, person)
8. Acting (faces, arms, emotes, moves)
9. Props & helpers
10. Transitions
11. Finale + CTA
12. Sounds
13. Rules that keep renders correct

---

## 0 · What's new in this fork (read first)
- **`ink()` writes for real**: single-stroke fonts traced pen-stroke by pen-stroke, in writing order, with the hand lifting between strokes. Prefer it over `T()` + `write()` (that one only unmasks text left→right).
- **A realistic hand** holds the active tool (marker, chalk, pencil, brush, quill, felt eraser), enters from the lower right, travels between strokes, leaves when idle. `hand: false` brings back the floating tools.
- **Boards**: `newScene('whiteboard' | 'greenboard' | 'blackboard')` pick the tool and ink colour by themselves (marker + dark ink / chalk + white chalk texture).
- **`erase()`** wipes part of a board with a felt eraser (leaves chalk dust on chalkboards); **`TR.boardSlide`** slides the next board in.
- **`rough` / `double`** on `P()` for imperfect, hand-made strokes.
- **Narration**: `tts.py` → `audio/vo.json`; then `seg(id)` / `cue(id, 'word')` give real seconds, karaoke captions draw themselves, and `build.sh` ducks the music under the voice.
- **Fonts ship with the project** (`node_modules/@fontsource`, `fonts/*.svg`): renders never fall back to Comic Sans when Google Fonts is unreachable.

## 1 · Time model
- Every helper takes **script seconds** (`at`, `dur`). The engine multiplies them by `config.speed` (default 0.8, i.e. 20% faster) with `S(x)`.
- Keep a cursor `let t = 0`. Each scene block uses `const a = t;` and places events at `a + offset`, then sets `t = a + sceneLength`.
- Transitions take `t` and **return the new `t`**: `t = TR.eraser(s2, s3, t)`.
- Only if you call raw GSAP yourself (`tl.to(...)`) must you pass `S(at)` and `S(duration)`.
- **With narration** (`audio/vo.json` exists) `speed` is forced to 1 and beat snapping is off, so script seconds = real seconds = voice seconds. Place events with `cue()` instead of hand-counted offsets (§14).
- `BEAT` = seconds per beat of the music (after speed, already real time) — use it for bounces that follow the tempo.

## 2 · Config (second argument of bootVideo)
| key | default | use |
|---|---|---|
| `speed` | 0.8 | global tempo multiplier |
| `width`, `height` | 1080, 1920 | 1920×1080 for horizontal |
| `palette` | theme | override colors: `ink, blue, red, green, orange, purple, gray, yellow, pink, teal` (inks for light boards), `chalk, chalkO, chalkB, chalkY, chalkG, chalkP` (pastel chalks for dark boards), `wb, gb, bb` (board colours), `sleeve`, `hi` (caption highlight), `sepia, graphite, cream, paper` |
| `hatches` | — | extra hatch fills `{ brand: ['#base', '#lines'] }` → use `H('brand')` |
| `mascotTheme` | 'orange' | default hatch fill of the mascot |
| `mascotShape` | blocky critter | custom silhouette (see §7) |
| `beatsUrl` | audio/beats.json | beat grid |
| `mode` | 'A' | 'A' = transitions snap to strong beats; anything else = no snapping (always off with narration) |
| `hand` | realistic hand | `{ skin, sleeve, cuff, scale, angle }` or `false` (floating tools) |
| `theme` | 'suave' | colour theme: `suave` (muted modern inks, pastel chalks, charcoal sleeve) or `clasico` (original saturated colours). `palette` overrides single colours on top |
| `strokeFont` | 'clara' | default `ink()` font (see the font table in §5) |
| `boldFont` | 'plumon' | font used by `ink(…, { bold: true })` |
| `rough` | 0 | default roughness for every `P()` (1–3 = hand-made wobble) |
| `captions` | 'karaoke' | with narration: karaoke captions; `{ style: 'simple' }`, `{ y, size, color, hi, maxChars, font }` or `false` |
| `voUrl` | audio/vo.json | narration timing file from `tts.py` |

## 3 · Canvas & coordinates
Vertical canvas 1080×1920, origin top-left. Safe area for phones: keep text between y≈250 and y≈1650 and x 60–1020 (Reels/TikTok UI covers the edges). Headline usually at y 300–450, supporting line ~90–110 px below it.

## 4 · Scenes & boards
```js
const s1 = newScene('whiteboard');          // marker + dark ink, aluminium frame, faint ghosts of old marker
const s2 = newScene('greenboard');          // chalk + white chalk texture, wooden frame, wiped-chalk clouds
const s3 = newScene('blackboard');          // same, charcoal board
const s4 = newScene('notebook', { tool: 'pencil', ink: '#2F62C8' });   // any background; tool/ink override the board defaults
const s3 = newScene('sepia');               // or BG.paper / 'chalk' / 'graph' / 'notebook' / 'blue' / 'kraft' / 'blueprint'
const s5 = newScene(BG.sunburst('#E8874F', '#F29A62'));
const s7 = newScene(BG.solid('#1E1E2E'));
const s2 = newScene('chalk', { filter: 'url(#chalk)' });   // chalk texture on the content
show(s1, 0);                                 // only the FIRST scene needs show(); transitions show/hide the rest
const g = s3.g;                              // draw everything into scene.g
```
Each scene automatically gets: slow push-in camera, small shake on strong beats, "boiling" hand-drawn line wobble.
Custom camera (e.g. start zoomed on the title, then pull back): `s10.camFn = () => ({ z, fx, fy })` with a proxy object you tween (`tl.to(pb, { z: 1.03, fy: 960, duration: S(1.1) }, S(at))`).

## 5 · Text
### Real handwriting (preferred)
```js
const h = ink(g, 540, 420, '¿Cuánto tarda\ntu dinero?', { size: 118, bold: true });   // '\n' = new line
write(h, at, dur?)        // every pen stroke drawn in order; the hand follows and lifts between strokes
ink(g, x, y, text, { size, color, font, w, anchor: 'middle'|'start'|'end', rot, lineH: 1.3, jitter: 1, bold, maxWidth })
```
- `size` ≈ CSS font size; `w` = stroke width (default 7.5% of size, 13% with `bold`). Colour defaults to the board's ink.
- Lines wider than `maxWidth` (default canvas width − 140) shrink to fit automatically.
- Accents, ñ, ¿ ¡ are supported. `jitter` 0 = tidy, 2 = messy. Default duration ≈ 0.3 s + 0.075 s per character.
- Returns `{ paths, outer, width, height, size }`: `outer` is the group to move/scale; `width` helps place things next to it.
- Colour tips: on white boards use `PAL.ink` for most text and ONE accent per scene (`blue`, `red`, `green`, `purple`, `orange`); on chalkboards use `PAL.chalk` plus one pastel (`chalkO`, `chalkB`, `chalkY`, `chalkG`, `chalkP`). Never yellow or pastels on white.

Fonts (`font:` name; all have accents, ñ, ¿ ¡ — see `catalogo-estilos/fuentes.jpg`):
| name | look | good for |
|---|---|---|
| `clara` (default) | neat print handwriting | supporting lines, explanations |
| `plumon` (default bold) | chunky marker | headlines, numbers |
| `moderna` | clean geometric sans (Relief SingleLine) | tech, business, modern brands |
| `casual` | loose quick handwriting | friendly asides, notes |
| `elegante` / `cursiva` / `cursivaFina` | connected script | quotes, titles with flair, "historia" |
| `maquina` / `maquinaItalica` | typewriter | dates, code-ish labels, documents |
| `infantil` | playful, round | kids, school, fun facts |
| `futurista` | squared techno | tech, sci-fi, data |
| `tecnica` / `tecnicaMedia` | engineering lettering | diagrams, labels, blueprint |
| `libro` / `libroItalica` / `libroNegrita` | serif | serious, history, quotes |
| `gotica` | blackletter | medieval, dramatic titles (use sparingly) |
| `claraItalica` | slanted print | emphasis |
Use 2 fonts per video (one for headlines, one for text), maybe a third for a special moment.

### SVG text (legacy, still works)
const t1 = T(g, x, y, 'Texto', { size: 100, color: PAL.orange, anchor: 'middle'|'start', cls: 'hand'|'kalam'|'code', rot: -4, stroke: INK });
write(t1, at, dur?)          // revealed left→right, the active tool follows the writing
pop(t1, at, { rot: -10, sound: 'pop' })  // bounces in (no tool)
type(t1, at, dur?, caretColor?)          // typewriter, stepped, with caret + key clicks
comic(g, x, y, '¡ZAS!', at, { color, size, rot, life, sound })  // comic sound-word: pops, wobbles, fades
```
Fonts: `hand` = Caveat (headlines), `kalam` = Kalam (supporting lines), `code` = JetBrains Mono. Measure long lines: at size 60 Kalam ≈ 28 px per character.

## 6 · Shapes, rough strokes & erasing
```js
setTool('marker' | 'chalk' | 'quill' | 'pencil' | 'brush' | null)   // override the board's tool from here on (null = no tool)
const p = P(g, 'M100,200 L500,200', { color, w: 7, fill: H('yellow'), opacity, rough: 2, double: true });
// rough: sideways wobble in px (hand-made line) · double: a second, thinner pass slightly off (marker going over twice)
erase(scene, at, dur, { x, y, w, h })      // felt eraser wipes that box, back and forth
erase(scene, at, dur, { targets: [inkText, path] })   // …or the box around those elements (+ pad)
// erases what was drawn into the scene BEFORE the call; anything you draw after it is safe. Chalkboards keep a dust smudge.
draw(p, at, dur, { ease, tool, sound })   // stroke draws on; fill fades in after
done(p)                                   // show instantly (no animation)
wobble(cx, cy, rx, ry)                    // hand-drawn circle path (scribble around a word)
el('rect', { ... }, g)                    // raw SVG element
```
Hatch fills (`H(name)`): orange, purple, gray, yellow, blue, bag, cream, sepia, kraftTag, teal, skin, hard, white, green, red, pink, shadow, shadowW.

## 7 · Characters
### Mascot
```js
const m = mover(g, x, y, scale);     // proxy transform you can tween: tl.to(m, { x, y, s, r, duration: S(..) }, S(at))
const c = mascot(m.g, 0, 0, 1, { theme: 'orange'|null, ink, ground: '#B9B2A6'|null, shadow: 'shadow'|'shadowW', hat: 'hard'|'crown'|'party'|null });
drawMascot(c, at, dur)   // drawn stroke by stroke with the active tool
popMascot(c, at)         // bounces in fully drawn
```
Default blocky critter: ~220 wide × 171 tall at scale 1 (plus 10·scale x offset). Point on it in scene coords = mover position + scale × (offsetX + local point). E.g. its right eye centre is local (133.5, 62).
Outline-only (chalk, blueprint): `theme: null, ink: '#fff'`.
**Custom mascot** — pass `mascotShape` in config (all paths in the character's local coords, feet on y = height):
```js
mascotShape: { body: 'M…Z', armL: 'M…Z', armR: 'M…Z', legs: ['M…Z', …], eyes: [[x,y],[x,y]], mouth: [x,y],
               pivotL: [x,y], pivotR: [x,y], handL: [x,y], handR: [x,y], width, height, offsetX, emoteAt: [x,y] }
```
Trace the reference image with simple closed paths; arms must be separate shapes with a shoulder pivot so they can wave.

### Person (the viewer's stand-in)
```js
const pm = mover(g, x, y, 1.1);                // y = feet; ~262 tall at scale 1
const d = person(pm.g, 0, 0, 1, { shirt: 'teal'|hexColor, hair, glasses: true, outline: false, ink, hairD: 'custom hair path', brows: false, chain: false });
drawPerson(d, at, dur) / popPerson(d, at)
```
Plain clothes, no logos unless the user asks for one.

## 8 · Acting
```js
face(c, at, 'happy', { mouth: 'grin', emote: 'sparkle', take: true })
// eyes: normal lookR lookU happy closed star heart swirl wide determined sad
// mouth: smile o O grin flat frown | null
// emote: sweat heart ! ? sparkle bulb zzz swirl anger music
emote(c, at, '!')
arms(c, at, { L: 60, R: -60, dur: 0.2 })   // degrees; L positive = raise, R negative = raise
wave(c, 'R', at, 3, { from: 110, to: 70 })
blink(c, at); wink(c, at); take(c, at, 0.12); hop(c, at, n); wiggle(c, at, n)
jump(mover, at, { x, y, s }, { dur: 0.5, height: 120 })   // arc jump, can change scale
c.hand.R / c.hand.L   // groups at the hands: append props (flag, magnifier, coin, marker…) and they move with the arm
```
Faces never snap: `face()` blinks-squashes-pops. Give each character 2–4 face changes per scene; that is what makes it feel alive.

## 9 · Props & helpers
```js
bubble(g, x0, y0, x1, y1, tailX, tailY)   // speech bubble (tail below), returns a group to fill with text
popIn(group, at, { origin: '50% 100%' })
stamp(g, x, y, '−20%', at, { color, rot, size })   // rubber stamp slams down (+ sound)
image(g, href, x, y, w, h)                 // external PNG/SVG (put files next to index.html)
specks(g, seed, n, color)                  // pencil specks
onFrame(t => {...})                        // per-frame hook (deterministic custom effects)
```

## 10 · Transitions (each returns new t; hit lands on a strong beat in mode A)
| call | what happens | motivate it with |
|---|---|---|
| `TR.zoomInto(a, b, t, { x, y })` | camera dives into a point (the mascot's eye) | ending on the character |
| `TR.eraser(a, b, t)` | felt eraser wipes the board | chalkboard → anything |
| `TR.whipDown(a, b, t, { drop })` | `drop` group falls, camera whips down with motion blur | something heavy (bag, anvil, coin) |
| `TR.expand(a, b, t, { x, y, w, h, color })` | a shape swells into the next background (next bg should start with that color) | bar of a chart, button, card |
| `TR.slideUp(a, b, t)` | shake + a sheet of paper slides up over it | "and now the list…" |
| `TR.iris(a, b, t, { x, y })` | ink circle bursts from a point | an impact point (fist, click) |
| `TR.burstDrop(a, b, t, { burst })` | `burst` balloons and pops, next scene drops with a bounce | speech bubble, balloon |
| `TR.flip(a, b, t)` | the frame flips like a card | price tag, card, "the other side" |
| `TR.flash(a, b, t)` | warm white flash | a revelation, a glow |
| `TR.boardSlide(a, b, t, { dir: 1 })` | next board slides in on its rail and pushes the old one out | "next board / next topic", whiteboard ↔ chalkboard |
Never use the same transition twice in a row.

## 11 · Finale + CTA
```js
t = finale(t, {
  resets: [[droppedBag, { y: 0, rotation: 0 }], [poppedBubble, { scale: 1, opacity: 1 }]],  // undo transition leftovers
  cta: (layer, at) => { /* mascot + 'Sígueme para más' etc. into `layer`, timed from `at` */ },
});
return t;   // bootVideo needs the end time
```
All scenes fly into a storyboard mosaic (the last scene shrinks into its slot).

## 12 · Sounds (automatic + manual)
Automatic: every draw/write with a tool plays that tool's scribble, pop/stamp/type/emotes/transitions have their own sound.
Manual: `sfx(name, at, { gain, dur })` with: pop blip boing hop whoosh whoosh_in whoosh_down sparkle erase coin rise stamp swell rev boom paper tick splash type burst thud flip ding riser shimmer card spit kick clap clink grunt cash firework slap skate(dur) steps(dur).

## 13 · Rules that keep renders correct
- Frames are rendered by seeking; everything must be a pure function of time. Use `mover()` / proxies + `onFrame` for custom transforms, never `setTimeout`/random.
- `tl.fromTo` renders its FROM values immediately at build time. Add `immediateRender: false` when the target was already visible earlier (or you'll blank it).
- Don't use GSAP `transformOrigin`/`svgOrigin` scaling on elements inside rotated groups (they drift); use `stamp()`/`stampFx()` or a proxy.
- Any state a transition leaves behind (element dropped off-screen, bubble scaled to 0) must be reset in `finale({ resets })` so the mosaic shows finished scenes.

## 14 · Narration (tts.py → seg / cue → captions)
1. Write `guion.json` (one line of narration per beat of the story; ids are yours) and run `python3 tts.py guion.json`.
   → `audio/vo.wav` + `audio/vo.json` with the start/end of every line and every word. Silence between lines = `gap` (default 0.75 s), which is where transitions go.
2. In `scenes.js`:
```js
seg('hook')                 // { start, end, words } of that line
cue('hook', 'dinero')       // second when "dinero" starts (accents/case ignored; prefix match: 'dupli' finds 'duplicarse')
cue('hook', 'tu dinero')    // multi-word match
cue('hook', 'diez', { n: 2 })   // 2nd occurrence ·  { end: true } → when it ends
cue('hook', 3)              // by word index
SAFE                        // { top, bottom, left, right }: keep content inside; with captions the band below SAFE.bottom is theirs
```
Patterns:
- An element appears **on the word that names it**: `write(ink(...), cue('s2', 'interés'), 1.2)`.
- A visual scene ends at `seg(id).end`; its transition starts there: `t = TR.eraser(s2, s3, seg('s2').end + 0.05)`.
- One board can hold several narration lines (e.g. two examples, erase between them).
- The finale starts ~0.4 s before the CTA line: `finale(seg('cta').start - 0.4, …)`; return `Math.max(t, seg('cta').end + 0.8)`.
- If `cue()` can't find a word it logs a warning and returns the line's start — check the console when something lands early.
