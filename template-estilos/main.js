// Loads the video spec + its style and boots the engine.  ?style=<id> and ?spec=<file> override (used by the catalog).
import { boot } from './engine/core.js';
const q = new URLSearchParams(location.search);
const spec = (await import('./' + (q.get('spec') || 'video.js'))).default;
if (q.get('style')) spec.style = q.get('style');
if (q.get('format')) spec.format = q.get('format');
const ids = [...new Set([spec.style, ...spec.scenes.map(s => s.style).filter(Boolean)])];
const mods = {}; for (const id of ids) mods[id] = (await import(`./styles/${id}.js`)).default;
// Narración generada con tts.py (audio/vo.json): cada escena dura lo que dura su frase y los subtítulos salen
// de los tiempos reales de cada palabra. spec.narration = false para ignorarla.
try {
  const vo = spec.narration === false ? null : await fetch('audio/vo.json').then(r => r.ok ? r.json() : null);
  if (vo) {
    const ids = spec.scenes.map((d, i) => d.id || `s${i + 1}`);
    const pre = Math.min(0.45, (spec.voGap ?? 0.6) * 0.6);          // the voice enters just after the transition
    const st = ids.map((id, i) => vo.scenes[id] ? (i ? vo.scenes[id].start - pre : 0) : null);
    if (st.every(x => x !== null)) {
      spec.scenes.forEach((d, i) => { d.dur = (i < st.length - 1 ? st[i + 1] : vo.scenes[ids[i]].end + 1.4) - st[i]; });
      if (!spec.words) spec.words = ids.flatMap(id => vo.scenes[id].words);
      spec.beats = null;                                         // snapping cuts to the music would pull them off the voice
    } else console.warn('audio/vo.json no coincide con las escenas de video.js: corre node guion.mjs && python3 tts.py guion.json');
  }
} catch (e) { console.warn('narración', e); }
await boot(spec, mods);
