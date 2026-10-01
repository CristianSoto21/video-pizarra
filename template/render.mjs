// Deterministic frame-by-frame renderer: seeks the GSAP timeline, screenshots the SVG, pipes JPEGs to ffmpeg.
//   node render.mjs out.mp4 [--fps 30] [--mode A] [--workers N]   full video (no audio); N parallel browser pages
//                                                       (default: CPU cores − 1, max 6; each renders a slice, then they're joined)
//   node render.mjs --every 1.5                         QA stills every 1.5 s → stills/
//   node render.mjs --stills 3.2,10,24.5                QA stills at given seconds → stills/
// Also writes sfx.json (sound events) and hits.json (transition hits) for the audio mix.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { cpus } from 'node:os';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = args[0] && !args[0].startsWith('--') ? args[0] : null;
const fps = Number(opt('--fps', 30)), mode = opt('--mode', 'A');   // narration (audio/vo.json) always disables beat snapping
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try { const p = join(root, decodeURIComponent(req.url.split('?')[0])); const data = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
// CHROME_PATH, else Playwright's own Chromium, else any Chromium already downloaded (survives version mismatches)
async function launch() {
  if (process.env.CHROME_PATH) return chromium.launch({ executablePath: process.env.CHROME_PATH });
  try { return await chromium.launch(); } catch (e) {
    const { readdirSync, existsSync } = await import('node:fs');
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || join(process.env.HOME || '', process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
    for (const d of (existsSync(base) ? readdirSync(base) : []).sort().reverse())
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe', 'chrome-headless-shell-linux64/chrome-headless-shell'])
        if (existsSync(join(base, d, sub))) return chromium.launch({ executablePath: join(base, d, sub) });
    throw e;
  }
}
const browser = await launch();
async function openPage(log) {
  const pg = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  pg.on('pageerror', e => console.error('PAGE ERROR', e.message));
  // engine warnings matter (e.g. "cue: … not found" = an element timed to a word the voice never says)
  if (log) pg.on('console', m => { if (['warning', 'error'].includes(m.type()) && !/Failed to load resource|favicon/.test(m.text())) console.warn('⚠️ ', m.text()); });
  await pg.goto(`http://localhost:${server.address().port}/index.html?render=1&mode=${mode}`);
  await pg.waitForFunction(() => window.READY === true, null, { timeout: 90000 });
  const [vw, vh] = await pg.evaluate(() => [window.VW, window.VH]);
  await pg.setViewportSize({ width: vw, height: vh });
  return { pg, svg: await pg.$('#stage') };
}
const { pg: page, svg } = await openPage(true);
const duration = await page.evaluate(() => window.DURATION);
await writeFile('sfx.json', JSON.stringify(await page.evaluate(() => window.SFX || [])));
await writeFile('hits.json', JSON.stringify(await page.evaluate(() => window.HITS || [])));

let stills = opt('--stills') ? opt('--stills').split(',').map(Number) : null;
if (opt('--every')) { stills = []; for (let x = 0.3; x < duration; x += Number(opt('--every'))) stills.push(+x.toFixed(2)); }
if (stills) {
  await mkdir('stills', { recursive: true });
  for (const t of stills) {
    await page.evaluate(t => window.renderAt(t), t);
    await writeFile(`stills/s_${t.toFixed(2).padStart(6, '0')}.jpg`, await svg.screenshot({ type: 'jpeg', quality: 85 }));
  }
  console.log(`stills done (${stills.length}), duration ${duration.toFixed(2)}s`);
} else {
  const file = out || 'video.mp4';
  const frames = Math.ceil(duration * fps);
  const N = Math.max(1, Math.min(Number(opt('--workers', Math.min(6, Math.max(1, cpus().length - 1)))), Math.ceil(frames / 60)));
  const t0 = Date.now(); let doneFrames = 0, lastLog = 0;
  async function slice(k, pg, sv) {
    const a = Math.floor(frames * k / N), b = Math.floor(frames * (k + 1) / N), part = N > 1 ? `_part${k}_${file}` : file;
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', part], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = a; f < b; f++) {
      await pg.evaluate(t => window.renderAt(t), f / fps);
      const buf = await sv.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (++doneFrames - lastLog >= 300) { lastLog = doneFrames; console.log(`frame ${doneFrames}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s, ${N} workers)`); }
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    return part;
  }
  const pages = [{ pg: page, svg }];
  for (let k = 1; k < N; k++) pages.push(await openPage(false));
  const parts = await Promise.all(pages.map((p, k) => slice(k, p.pg, p.svg)));
  if (N > 1) {   // join the slices without re-encoding
    await writeFile('_parts.txt', parts.map(p => `file '${p}'`).join('\n'));
    await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', '_parts.txt', '-c', 'copy', '-movflags', '+faststart', file], { stdio: 'inherit' })
      .on('close', c => c ? rej(new Error('concat failed')) : res()));
    for (const p of [...parts, '_parts.txt']) await unlink(p).catch(() => {});
  }
  console.log('done', file, duration.toFixed(2) + 's', `(${((Date.now() - t0) / 1000).toFixed(0)}s render)`);
}
await browser.close(); server.close();
