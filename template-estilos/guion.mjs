// Saca la narración (`say`) de cada escena de video.js → guion.json para tts.py.
// Uso: node guion.mjs [video.js]   → luego: python3 tts.py guion.json
// Las escenas sin `say` quedan como silencio de su `dur`; con `say`, `dur` es la duración mínima (la voz la alarga si hace falta). Voz/velocidad: spec.voice / spec.rate en video.js.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const spec = (await import(pathToFileURL(resolve(process.argv[2] || 'video.js')).href)).default;
const g = {
  voice: spec.voice || 'es-PE-AlexNeural', rate: spec.rate || '+5%', lead: 0.35, gap: spec.voGap ?? 0.6,
  scenes: spec.scenes.map((d, i) => d.say ? { id: d.id || `s${i + 1}`, say: d.say, min: d.dur || 0 } : { id: d.id || `s${i + 1}`, silence: d.dur || 3 }),
};
writeFileSync('guion.json', JSON.stringify(g, null, 1));
console.log(`guion.json: ${g.scenes.length} escenas, ${g.scenes.filter(s => s.say).length} con voz (${g.voice})`);
