/* scenes.example.js — complete NARRATED example: "La regla del 72" (≈40 s, vertical).
 * Pipeline: guion.example.json → python3 tts.py guion.json → audio/vo.json + vo.wav → this file → ./build.sh
 * With narration every time is REAL seconds taken from the voice:
 *   seg('id')            → { start, end } of that narration line
 *   cue('id', 'palabra') → the second that word starts (cue(id, word, { n: 2 }) = 2nd occurrence, { end: true } = when it ends)
 * Rule of thumb: an element appears on the word that names it; a scene ends at seg(id).end and its
 * transition fills the silent gap before the next line (tts.py "gap", default 0.75 s).
 */
bootVideo(async (V) => {
  const { P, PAL, ink, write, draw, erase, wobble, mover, mascot, drawMascot, popMascot, face, emote, wave, hop, wiggle,
          newScene, show, TR, finale, cue, seg, T, pop } = V;
  let t;

  /* HOOK · whiteboard + marker: question in the first second, mascot reacts */
  const s1 = newScene('whiteboard'); show(s1, 0);
  { const g = s1.g;
    write(ink(g, 540, 400, '¿Cuánto tarda\ntu dinero en\nduplicarse?', { size: 118, bold: true }), 0.15, 2.4);
    const m = mover(g, 330, 830, 2.0), c = mascot(m.g, 0, 0, 1);
    drawMascot(c, cue('hook', 'duplicarse') - 0.2, 1.0);
    face(c, cue('hook', 'truco'), 'wide', { mouth: 'o', emote: '?' });
    write(ink(g, 540, 1330, 'el truco de los banqueros', { size: 64, color: PAL.blue }), cue('hook', 'truco'), 1.5);
    face(c, cue('hook', 'banqueros', { end: true }), 'happy', { mouth: 'grin', emote: 'bulb' });
  }

  /* REGLA · greenboard + chalk: the name of the idea, big, then circled */
  const s2 = newScene('greenboard');
  t = TR.boardSlide(s1, s2, seg('hook').end + 0.05);
  { const g = s2.g;
    write(ink(g, 540, 640, 'La regla', { size: 120, font: 'EMSAllure' }), cue('regla', 'regla') - 0.15, 0.9);
    write(ink(g, 540, 1000, '72', { size: 380, color: PAL.chalkO, w: 26 }), cue('regla', 'setenta'), 0.9);
    draw(P(g, wobble(540, 880, 300, 230, 1.12, 3), { w: 9, rough: 3 }), seg('regla').end - 0.35, 0.55);
  }

  /* FORMULA · blackboard: written exactly as it is said */
  const s3 = newScene('blackboard');
  t = TR.eraser(s2, s3, seg('regla').end + 0.05);
  { const g = s3.g;
    write(ink(g, 540, 600, '72', { size: 170 }), cue('formula', 'setenta'), 0.5);
    write(ink(g, 540, 760, '÷', { size: 150, color: PAL.chalkB }), cue('formula', 'entre'), 0.35);
    write(ink(g, 540, 930, 'tasa anual', { size: 120, color: PAL.chalkO }), cue('formula', 'tasa'), 0.9);
    draw(P(g, 'M210,1010 L870,1010', { w: 9, rough: 2 }), cue('formula', 'anual', { end: true }), 0.4);
    write(ink(g, 540, 1180, '= años', { size: 150 }), cue('formula', 'años'), 0.7);
  }

  /* EJEMPLOS · whiteboard: two narration lines share one board; the eraser swaps the numbers */
  const s4 = newScene('whiteboard');
  t = TR.flip(s3, s4, seg('formula').end + 0.05);
  { const g = s4.g;
    write(ink(g, 540, 420, 'Ejemplos', { size: 110, bold: true, color: PAL.green }), seg('ej8').start - 0.2, 0.8);
    const a = ink(g, 540, 760, '72 ÷ 8% = 9 años', { size: 110 });
    write(a, cue('ej8', 'ocho'), 1.7);
    draw(P(g, wobble(800, 760, 190, 85, 1.1, 5), { color: PAL.red, w: 8, rough: 2, double: true }), cue('ej8', 'nueve'), 0.55);
    erase(s4, seg('ej12').start - 0.25, 0.6, { y: 620, h: 260 });
    write(ink(g, 540, 760, '72 ÷ 12% = 6 años', { size: 110, color: PAL.blue }), cue('ej12', 'doce'), 1.4);
    write(ink(g, 540, 960, '¡más rápido!', { size: 90, color: PAL.orange }), cue('ej12', 'seis'), 0.7);
  }

  /* GIRO · notebook paper + pencil: the twist (inflation), mascot worried */
  const s5 = newScene('notebook', { tool: 'pencil' });
  t = TR.slideUp(s4, s5, seg('ej12').end + 0.05);
  { const g = s5.g;
    write(ink(g, 540, 420, 'Pero ojo...', { size: 120, bold: true, color: PAL.red }), cue('giro', 'ojo') - 0.3, 0.7);
    write(ink(g, 540, 640, 'la inflación', { size: 100 }), cue('giro', 'inflación'), 0.8);
    write(ink(g, 540, 800, 'también la usa', { size: 80, color: PAL.gray }), cue('giro', 'también'), 0.9);
    write(ink(g, 540, 1000, '72 ÷ 6% = 12 años', { size: 96, color: PAL.red }), cue('giro', 'seis'), 1.2);
    write(ink(g, 540, 1160, 'y tus ahorros valen la mitad', { size: 62 }), cue('giro', 'ahorros'), 1.3);
    const m = mover(g, 400, 1250, 1.3), c = mascot(m.g, 0, 0, 1, { theme: 'purple' });
    popMascot(c, cue('giro', 'inflación'));
    face(c, cue('giro', 'mitad'), 'sad', { mouth: 'frown', emote: 'sweat' });
  }

  /* CTA · storyboard finale while the last line plays */
  t = finale(seg('cta').start - 0.4, {
    cta: (layer, at) => {
      const m = mover(layer, 460, 1460, 0.6), c = mascot(m.g, 0, 0, 1, { ground: null });
      popMascot(c, at + 1.4); face(c, at + 2.0, 'happy', { mouth: 'grin' }); hop(c, at + 2.3, 4, false);
      pop(T(layer, 540, 1760, 'Guárdalo', { size: 112, color: '#FBF3E6' }), cue('cta', 'guarda'), { sound: 'ding' });
      pop(T(layer, 540, 1850, '¿qué tasa te pagan? 👇', { size: 56, color: '#F5A57B', cls: 'kalam' }), cue('cta', 'tasa'), { rot: 4, sound: 'blip' });
    },
  });
  return Math.max(t, seg('cta').end + 0.8);
}, {
  // hand: { skin: '#C99472', sleeve: '#2E2E2E' },   // hand colours (or hand: false for floating tools)
  // captions: { style: 'simple' } | false,           // karaoke (default) · simple · off
  // strokeFont: 'EMSReadability',                    // default handwriting font (see fonts/)
});
