/* video-pizarra · engine.js
 * Hand-drawn "whiteboard" video engine: SVG + GSAP, rendered frame by frame (deterministic).
 * The project's scenes.js calls:  bootVideo(async (V) => { ...build scenes with V.* ... }, config)
 * Everything here is a pure function of time: renderAt(t) seeks the paused timeline and re-applies
 * proxy transforms, so frames can be rendered in any order.
 * Full API reference: references/engine-api.md
 */
(function () {
const NS = 'http://www.w3.org/2000/svg';

window.bootVideo = async function bootVideo(build, cfg = {}) {
  await document.fonts.ready;
  const fonts = cfg.fontLoads || ['700 100px Caveat', '400 60px Kalam', '700 60px Kalam', '500 40px "JetBrains Mono"'];
  await Promise.all(fonts.map(f => document.fonts.load(f)));

  // single-stroke handwriting fonts (Hershey/EMS, MIT) → text traced pen-stroke by pen-stroke
  const SFONTS = {};
  async function loadStrokeFont(name) {
    const doc = new DOMParser().parseFromString(await (await fetch(`fonts/${name}.svg`)).text(), 'image/svg+xml');
    const ff = doc.querySelector('font-face'), fo = doc.querySelector('font');
    const F = { glyphs: {}, adv: +fo.getAttribute('horiz-adv-x') || 400, capH: +ff.getAttribute('cap-height') || 500 };
    doc.querySelectorAll('glyph').forEach(g => { const u = g.getAttribute('unicode'); if (u != null) F.glyphs[u] = { d: g.getAttribute('d') || '', adv: +(g.getAttribute('horiz-adv-x') || F.adv) }; });
    SFONTS[name] = F;
  }
  // friendly names (Spanish) → font files in fonts/. Any file name works too.
  const FONT_ALIAS = {
    clara: 'EMSReadability', plumon: 'EMSTech', moderna: 'ReliefSingleLine', casual: 'EMSFelix', elegante: 'EMSAllure',
    cursiva: 'HersheyScriptMed', cursivaFina: 'HersheyScript1', maquina: 'EMSNixish', maquinaItalica: 'EMSNixishItalic',
    infantil: 'EMSElfin', futurista: 'EMSOsmotron', tecnica: 'HersheySans1', tecnicaMedia: 'HersheySansMed',
    libro: 'HersheySerifMed', libroItalica: 'HersheySerifMedItalic', libroNegrita: 'HersheySerifBold', gotica: 'HersheyGothEnglish',
    claraItalica: 'EMSReadabilityItalic',
  };
  const fontFile = n => FONT_ALIAS[n] || n;
  const STROKE_FONT = fontFile(cfg.strokeFont || 'clara');
  const BOLD_FONT = fontFile(cfg.boldFont || 'plumon');
  await Promise.all([...new Set([STROKE_FONT, BOLD_FONT, ...(cfg.strokeFonts || Object.values(FONT_ALIAS))].map(fontFile))]
    .map(n => loadStrokeFont(n).catch(e => console.warn('stroke font', n, e.message))));
  // narration timing written by tts.py (optional). With narration the clock is real time and transitions don't snap to beats.
  let VO = null;
  try { const r = await fetch(cfg.voUrl || 'audio/vo.json'); if (r.ok) VO = await r.json(); } catch (e) {}

  const params = new URLSearchParams(location.search);
  const MODE = VO ? 'N' : (params.get('mode') || cfg.mode || 'A').toUpperCase();   // A = transitions land on beats (never with narration)
  const SPEED = VO ? 1 : (cfg.speed ?? 0.8);                                         // global tempo (0.8 = 20% faster)
  if (VO && cfg.speed && cfg.speed !== 1) console.warn('narration present: speed forced to 1 so the picture stays on the voice');
  const W = cfg.width || 1080, Hh = cfg.height || 1920;
  const CX = W / 2, CY = Hh / 2;
  const S = t => t * SPEED;
  const tl = gsap.timeline({ paused: true });
  const strokes = [], updaters = [], SFX = [], HITS = [];
  const sfx = (name, at, o = {}) => SFX.push({ name, t: S(at), dur: o.dur != null ? S(o.dur) : null, gain: o.gain ?? 1, n: o.n });

  /* ---------- palette (overridable) ---------- */
  // colour themes: 'suave' (default: muted modern inks, pastel chalks), 'clasico' (original saturated school colours)
  const THEMES = {
    suave: { ink: '#25303F', blue: '#2F5D9E', red: '#D9594C', green: '#2A8C74', orange: '#D47A2E', purple: '#6E5BB0', gray: '#8B919B',
             yellow: '#D9A93A', pink: '#D46A8C', teal: '#3E9C9A',
             chalk: '#F2EFE6', chalkO: '#FFC7A3', chalkB: '#B5DAF5', chalkY: '#F2DA8E', chalkG: '#A9DCC2', chalkP: '#F0B3C6',
             sepia: '#3B2A1A', graphite: '#4A4744', cream: '#FFF6EA', paper: '#EEEBE4',
             wb: '#F7F6F2', gb: '#33554A', bb: '#272C30', sleeve: '#3B4252', hi: '#FFCF5A' },
    clasico: { ink: '#2A1F1C', orange: '#D9703F', blue: '#2F62C8', green: '#23885A', red: '#CF3E36', purple: '#6452C4', gray: '#8C857B',
               yellow: '#E8B820', pink: '#D04F86', teal: '#5DB8B2',
               chalk: '#F3F0E6', chalkO: '#F5A57B', chalkB: '#A9CBF5', chalkY: '#F6E08A', chalkG: '#9FE0B5', chalkP: '#F5A8C4',
               sepia: '#3B2A1A', graphite: '#4A4744', cream: '#FFF6EA', paper: '#ECE9E2',
               wb: '#F6F6F2', gb: '#2D4B3B', bb: '#24292B', sleeve: '#3E5C8A', hi: '#FFD23F' },
  };
  const PAL = Object.assign({}, THEMES[cfg.theme] || THEMES.suave, cfg.palette || {});
  const INK = PAL.ink;

  /* ---------- stage ---------- */
  const svg = document.getElementById('stage');
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  svg.style.width = W + 'px'; svg.style.height = Hh + 'px';
  svg.innerHTML = `
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="7"/>
      <feColorMatrix values="0 0 0 0 .35  0 0 0 0 .3  0 0 0 0 .25  0 0 0 -1.1 .62"/></filter>
    <filter id="rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence id="roughN" type="fractalNoise" baseFrequency=".022" numOctaves="2" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="chalk" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence id="chalkN" type="fractalNoise" baseFrequency=".022" numOctaves="2" seed="9" result="w"/>
      <feDisplacementMap in="SourceGraphic" in2="w" scale="6" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="2" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.75" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>
    <filter id="fibers" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006 .18" numOctaves="3" seed="3"/>
      <feColorMatrix values="0 0 0 0 .35  0 0 0 0 .22  0 0 0 0 .1  0 0 0 -1.3 .75"/></filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
    <filter id="vblur" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur id="vblurS" stdDeviation="0 0"/></filter>
    <radialGradient id="sepiaVig" cx="50%" cy="48%" r="70%"><stop offset="55%" stop-color="#6b4a22" stop-opacity="0"/><stop offset="100%" stop-color="#5a3a14" stop-opacity=".55"/></radialGradient>
    <radialGradient id="flashG" cx="50%" cy="42%" r="70%"><stop offset="0%" stop-color="#fff"/><stop offset="60%" stop-color="#FFF8E6"/><stop offset="100%" stop-color="#FFE9C2"/></radialGradient>
    <pattern id="graphMinor" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40,0 L0,0 0,40" fill="none" stroke="#D5E1F4" stroke-width="1.5"/></pattern>
    <pattern id="graphMajor" width="200" height="200" patternUnits="userSpaceOnUse"><path d="M200,0 L0,0 0,200" fill="none" stroke="#AFC4E8" stroke-width="2.5"/></pattern>
    <pattern id="bpMinor" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40,0 L0,0 0,40" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="1.5"/></pattern>
    <pattern id="bpMajor" width="200" height="200" patternUnits="userSpaceOnUse"><path d="M200,0 L0,0 0,200" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="2.5"/></pattern>
    <pattern id="halftone" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="18" cy="18" r="3" fill="#fff" fill-opacity=".12"/></pattern>
    <filter id="handShadow" x="-60%" y="-60%" width="220%" height="220%"><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .3 0"/><feGaussianBlur stdDeviation="10"/><feOffset dx="26" dy="30"/></filter>
    <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1"><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".62" stop-color="#fff" stop-opacity=".3"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="smudge" filterUnits="userSpaceOnUse" x="-300" y="-300" width="${W + 600}" height="${Hh + 600}"><feGaussianBlur stdDeviation="14"/></filter>
    <clipPath id="screenClip" clipPathUnits="userSpaceOnUse"><rect id="screenClipR" x="0" y="0" width="${W}" height="${Hh}" rx="0"/></clipPath>
  </defs>
  <rect width="${W}" height="${Hh}" fill="#231C18"/>
  <g id="finaleBg" opacity="0"><rect width="${W}" height="${Hh}" fill="#231C18"/></g>
  <g id="scenes"></g><g id="screen"></g>
  <rect id="flash" width="${W}" height="${Hh}" fill="url(#flashG)" opacity="0"/>
  <rect width="${W}" height="${Hh}" filter="url(#grain)" opacity=".22"/>
  <g id="tools"></g>
  <g id="captions"></g>`;
  const defs = svg.querySelector('defs');
  const scenesL = document.getElementById('scenes'), screenL = document.getElementById('screen');

  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  }

  /* ---------- beat grid (audio/beats.json, optional) ---------- */
  let BEATS = [], STR = [], DOWN = new Set(), BEAT = 0.5, STRONG = [];
  try {
    const bj = await (await fetch(cfg.beatsUrl || 'audio/beats.json')).json();
    BEATS = bj.beats; STR = bj.strength; BEAT = 60 / bj.tempo;
    let best = 0, bestSum = -1;
    for (let ph = 0; ph < 4; ph++) { let sum = 0; for (let i = ph; i < STR.length; i += 4) sum += STR[i]; if (sum > bestSum) { bestSum = sum; best = ph; } }
    for (let i = best; i < BEATS.length; i += 4) DOWN.add(i);
    const thr = [...STR].sort((a, b) => b - a)[Math.floor(STR.length * 0.28)];
    STRONG = BEATS.filter((b, i) => STR[i] >= thr);
  } catch (e) { if (!VO) console.log('no beats.json: transitions will not snap to the music'); }
  // nudge a transition so its "hit" lands on the nearest strong beat (small window keeps pacing tight)
  function align(t, H) {
    const hit = S(t + H);
    HITS.push({ orig: hit, t: hit });
    if (MODE !== 'A' || !BEATS.length) return t;
    let bestI = -1, bestScore = -1e9;
    BEATS.forEach((b, i) => {
      const d = b - hit;
      if (d < -0.25 || d > 0.7) return;
      const score = STR[i] * (DOWN.has(i) ? 1.4 : 1) - 1.6 * Math.abs(d);
      if (score > bestScore) { bestScore = score; bestI = i; }
    });
    if (bestI < 0) return t;
    HITS[HITS.length - 1].t = BEATS[bestI];
    return t + (BEATS[bestI] - hit) / SPEED;
  }

  /* ---------- hatch fills ---------- */
  const HATCH = Object.assign({
    orange: ['#E8874F', '#B24F22'], purple: ['#A99BEA', '#5A48B8'], gray: ['#D3CDC2', '#8C857B'],
    yellow: ['#F6DE8A', '#C79A2A'], blue: ['#C9DAFB', '#4D78D0'], bag: ['#E3D3AE', '#9C7F45'],
    cream: ['#FBF3E6', '#B98E5B'], shadow: ['none', '#6F675D'], shadowW: ['none', '#ffffff'],
    sepia: ['#D9BF8E', '#7A5A2E'], kraftTag: ['#F4E7C8', '#9C7F45'], teal: ['#5DB8B2', '#23706B'],
    skin: ['#F4CFAE', '#C98E63'], hard: ['#F6C744', '#B8860B'], white: ['#FFFFFF', '#C9C3B8'],
    green: ['#9FD8B0', '#23885A'], red: ['#F2A29B', '#B8322A'], pink: ['#F6B8C8', '#C2507A'],
    black: ['#3A3A40', '#111116'], tan: ['#E3B48C', '#A5764C'],
  }, cfg.hatches || {});
  const addHatch = (k, base, line) => defs.insertAdjacentHTML('beforeend', `
    <pattern id="h-${k}" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(38)">
      ${base !== 'none' ? `<rect width="7" height="7" fill="${base}"/>` : ''}
      <line x1="1" y1="0" x2="1" y2="7" stroke="${line}" stroke-width="1.3" opacity=".42"/>
      <line x1="0" y1="4" x2="7" y2="4" stroke="${line}" stroke-width="0.9" opacity=".2"/></pattern>`);
  for (const [k, [b, l]] of Object.entries(HATCH)) addHatch(k, b, l);
  const H = k => `url(#h-${k})`;

  /* ---------- drawing tools that follow the stroke ---------- */
  const toolsL = document.getElementById('tools');
  const MARKER_SVG = c => `<g transform="rotate(32) scale(1.25)"><ellipse cx="18" cy="-120" rx="20" ry="110" fill="#000" opacity=".08" transform="translate(14,10)"/>
      <path class="tip" d="M0,0 L-8,-22 L8,-22 Z" fill="${c}"/><rect x="-11" y="-40" width="22" height="19" rx="3" fill="#3a3a3a"/>
      <rect x="-15" y="-230" width="30" height="192" rx="7" fill="#F5F3EE" stroke="#222" stroke-width="3"/>
      <rect class="tip" x="-15" y="-120" width="30" height="34" fill="${c}"/><rect x="-15" y="-236" width="30" height="40" rx="7" fill="#2b2b2b"/></g>`;
  const TOOLS = {
    marker: MARKER_SVG(INK),
    chalk: `<g transform="rotate(24)"><circle r="7" fill="#fff" opacity=".35"/><rect x="-12" y="-150" width="24" height="152" rx="8" fill="#F4F1E8" stroke="#C9C3B4" stroke-width="2"/></g>`,
    quill: `<g transform="rotate(28)"><path d="M0,0 L-5,-28 L5,-28 Z" fill="#2b2118"/><path d="M0,-28 L0,-330" stroke="#CDBB98" stroke-width="5" stroke-linecap="round"/>
      <path d="M0,-70 C-48,-130 -56,-250 -14,-340 C0,-290 20,-170 0,-70 Z" fill="#FBF6EC" stroke="#A8987A" stroke-width="2.5"/>
      <path d="M0,-100 C30,-150 40,-250 12,-330 C4,-280 -4,-170 0,-100 Z" fill="#F1E8D6" stroke="#A8987A" stroke-width="2"/></g>`,
    pencil: `<g transform="rotate(30) scale(1.15)"><ellipse cx="16" cy="-150" rx="18" ry="140" fill="#000" opacity=".08" transform="translate(14,10)"/>
      <path d="M0,0 L-4,-13 L4,-13 Z" fill="#3a3a3a"/><path d="M-4,-13 L-14,-44 L14,-44 L4,-13 Z" fill="#EBCB9B"/>
      <rect x="-14" y="-260" width="28" height="216" fill="#F4C430"/><rect x="-14" y="-260" width="9" height="216" fill="#E0AE1A"/>
      <rect x="-14" y="-284" width="28" height="24" fill="#BDBDBD" stroke="#999" stroke-width="1.5"/><rect x="-14" y="-314" width="28" height="30" rx="6" fill="#EE8FA3"/></g>`,
    brush: `<g transform="rotate(30) scale(1.2)"><path d="M0,0 C-11,-14 -13,-36 -11,-54 L11,-54 C13,-36 11,-14 0,0 Z" fill="#1c1c1c"/>
      <rect x="-12" y="-88" width="24" height="36" rx="3" fill="#C9CDD2" stroke="#8d9299" stroke-width="2"/><path d="M-12,-88 L-8,-290 Q0,-300 8,-290 L12,-88 Z" fill="#B5462E"/></g>`,
  };
  // cfg.hand: false → floating tools (classic look). Otherwise a realistic right hand holds the tool.
  const HAND = cfg.hand === false ? null : Object.assign({ skin: '#EFC4A0', sleeve: PAL.sleeve, scale: W < Hh ? 0.82 : 0.9, angle: -34 }, cfg.hand || {});
  const toolEls = {};
  for (const k of [...Object.keys(TOOLS), 'eraser']) {
    const g = el('g', { visibility: 'hidden' }, toolsL);
    if (HAND && window.HAND_SVG) { const body = HAND_SVG({ tool: k, skin: HAND.skin, sleeve: HAND.sleeve, cuff: HAND.cuff }); g.innerHTML = `<g class="hrot"><g filter="url(#handShadow)">${body}</g>${body}</g>`; }
    else g.innerHTML = TOOLS[k] || TOOLS.marker;
    toolEls[k] = g;
  }
  const state = { tool: undefined };              // undefined → each scene's board decides (marker on white, chalk on chalkboards)
  const sceneOf = node => { for (let n = node; n; n = n.parentNode) if (n._sc) return n._sc; return null; };
  const toolFor = (node, tool) => tool !== undefined ? tool : state.tool !== undefined ? state.tool : (sceneOf(node)?.tool ?? null);
  const inkFor = node => (sceneOf(node)?.ink) || INK;
  const hsh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  /* ---------- primitives ---------- */
  const toRoot = (node, x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(node.getCTM()); };
  // hand-made imperfection: resample a path and nudge it sideways with smooth seeded noise
  let roughSeed = 1;
  function roughen(d, amp = 2, seed = roughSeed++) {
    const subs = d.split(/(?=[Mm])/).filter(x => x.trim());
    if (subs.length > 1 && !/m/.test(d)) return subs.map((sd, i) => roughen(sd, amp, seed * 31 + i)).join(' ');
    const tmp = el('path', { d }, defs), L = tmp.getTotalLength(), n = Math.max(8, Math.ceil(L / 9));
    const ph = [hsh(seed) * 6.3, hsh(seed + 1) * 6.3, hsh(seed + 2) * 6.3];
    let out = '', prev = tmp.getPointAtLength(0);
    for (let i = 0; i <= n; i++) {
      const q = tmp.getPointAtLength(L * i / n), nx = tmp.getPointAtLength(Math.min(L, L * i / n + 1));
      const dx = nx.x - q.x, dy = nx.y - q.y, m = Math.hypot(dx, dy) || 1;
      const u = i / n, k = amp * (Math.sin(u * 7.1 + ph[0]) * .55 + Math.sin(u * 17.3 + ph[1]) * .3 + Math.sin(u * 31.7 + ph[2]) * .15);
      out += (i ? 'L' : 'M') + (q.x - dy / m * k).toFixed(1) + ',' + (q.y + dx / m * k).toFixed(1);
      prev = q;
    }
    tmp.remove();
    return out;
  }
  function P(parent, d, { color, w = 7, fill = 'none', fo = 1, cap = 'round', opacity = 1, rough = cfg.rough ?? 0, double = false } = {}) {
    color = color ?? inkFor(parent);
    if (rough) d = roughen(d, rough);
    const p = el('path', { d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': cap, 'stroke-linejoin': 'round', opacity }, parent);
    if (double) { const tw = el('path', { d: roughen(d, Math.max(1.5, rough || 2)), fill: 'none', stroke: color, 'stroke-width': w * 0.55, 'stroke-linecap': cap, opacity: opacity * 0.55 }, parent); const l2 = tw.getTotalLength(); tw.setAttribute('stroke-dasharray', l2 + ' ' + l2); tw.setAttribute('stroke-dashoffset', l2); tw._len = l2; p._twin = tw; }
    p._color = color;
    if (fill !== 'none') { const f = el('path', { d, fill, stroke: 'none', 'fill-opacity': 0 }, parent); parent.insertBefore(f, p); p._fill = f; p._fo = fo; }
    const len = p.getTotalLength();
    p.setAttribute('stroke-dasharray', len + ' ' + len); p.setAttribute('stroke-dashoffset', len); p._len = len;
    return p;
  }
  function done(p) {
    if (p._ink) { p.paths.forEach(q => { q.setAttribute('visibility', 'visible'); q.setAttribute('stroke-dashoffset', 0); }); return; }
    p.setAttribute('stroke-dashoffset', 0); if (p._twin) p._twin.setAttribute('stroke-dashoffset', 0); if (p._fill) p._fill.setAttribute('fill-opacity', p._fo); }
  function draw(p, at, dur, { ease = 'power1.inOut', tool, sound = true } = {}) {
    tool = toolFor(p, tool);
    const a = S(at), d = S(dur);
    tl.fromTo(p, { attr: { 'stroke-dashoffset': p._len } }, { attr: { 'stroke-dashoffset': 0 }, duration: d, ease }, a);
    if (p._twin) tl.fromTo(p._twin, { attr: { 'stroke-dashoffset': p._twin._len } }, { attr: { 'stroke-dashoffset': 0 }, duration: d, ease }, a + d * 0.06);
    const pe = gsap.parseEase(ease);
    strokes.push({ kind: 'path', node: p, start: a, dur: d, color: p._color, tool,
      point: tt => { const q = p.getPointAtLength(p._len * pe(Math.min(1, Math.max(0, (tt - a) / d)))); return toRoot(p, q.x, q.y); } });
    if (p._fill) tl.fromTo(p._fill, { attr: { 'fill-opacity': 0 } }, { attr: { 'fill-opacity': p._fo }, duration: S(0.35), ease: 'power1.out' }, a + d);
    if (sound && tool && dur > 0.12) sfx('scr_' + tool, at, { dur, gain: 0.8 });
    else if (sound && !tool && dur > 0.25) sfx('draw_soft', at, { dur, gain: 0.5 });
  }
  let clipId = 0;
  function T(parent, x, y, text, { size = 80, color, anchor = 'middle', cls = 'hand', rot = 0, stroke = null } = {}) {
    color = color ?? inkFor(parent);
    const outer = el('g', { transform: `translate(${x},${y}) rotate(${rot})` }, parent);
    const g = el('g', {}, outer);
    const attrs = { x: 0, y: 0, 'font-size': size, fill: color, 'text-anchor': anchor, class: cls };
    if (stroke) Object.assign(attrs, { stroke, 'stroke-width': size * 0.09, 'paint-order': 'stroke', 'stroke-linejoin': 'round' });
    const t = el('text', attrs, g);
    t.textContent = text;
    const b = t.getBBox();
    const id = 'c' + (clipId++);
    const cp = el('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, g);
    const r = el('rect', { x: b.x - 16, y: b.y - 24, width: 0, height: b.height + 48 }, cp);
    t.setAttribute('clip-path', `url(#${id})`);
    Object.assign(t, { _b: b, _r: r, _color: color, _g: g, _outer: outer });
    return t;
  }
  const show_ = t => t._r.setAttribute('width', t._b.width + 32);
  function write(t, at, dur, { tool, sound = true } = {}) {
    if (t._ink) return writeInk(t, at, dur, { tool, sound });
    tool = toolFor(t, tool);
    dur = dur ?? Math.min(1.6, 0.25 + t.textContent.length * 0.045);
    const a = S(at), d = S(dur);
    tl.fromTo(t._r, { attr: { width: 0 } }, { attr: { width: t._b.width + 32 }, duration: d, ease: 'none' }, a);
    strokes.push({ kind: 'text', node: t, start: a, dur: d, color: t._color, tool,
      point: tt => { const b = t._b, p = (tt - a) / d; return toRoot(t, b.x + b.width * p, b.y + b.height * (0.62 + 0.14 * Math.sin(tt * 38))); } });
    if (tool && sound) sfx('scr_' + tool, at, { dur, gain: 0.8 });
  }

  /* ---------- real handwriting: every pen stroke traced in writing order ---------- */
  // ink(g, x, y, 'Texto', opts) → single-stroke font traced in writing order; { bold: true } = fat marker for headlines.
  // size ≈ CSS font-size. '\n' breaks lines. jitter 0..2 = how hand-made the letters wobble.
  let inkSeed = 1;
  function inkWidth(text, size, font, bold) {
    font = font ? fontFile(font) : (bold ? BOLD_FONT : STROKE_FONT);
    const lines = String(text).split('\n');
    const F = SFONTS[font] || SFONTS[STROKE_FONT] || Object.values(SFONTS)[0], k = size * 0.62 / F.capH;
    return Math.max(...lines.map(l => [...l].reduce((s, ch) => s + (F.glyphs[ch]?.adv ?? F.adv) * k, 0)));
  }
  function ink(parent, x, y, text, { size = 80, color, font, w, anchor = 'middle', rot = 0, lineH = 1.3, jitter = 1, bold = false, maxWidth = W - 140 } = {}) {
    color = color ?? inkFor(parent);
    font = font ? fontFile(font) : (bold ? BOLD_FONT : STROKE_FONT);
    // never let a line run off the board: shrink to fit (maxWidth: false to disable)
    if (maxWidth) { const mw = inkWidth(text, size, font, bold); if (mw > maxWidth) { const f = maxWidth / mw; size *= f; if (w) w *= Math.max(0.6, f); } }
    const outer = el('g', { transform: `translate(${x},${y}) rotate(${rot})` }, parent);
    const lines = String(text).split('\n'), paths = [], fills = [];
    const addStroke = (sub, g, sw) => {
      const p = el('path', { d: sub, fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
      const len = p.getTotalLength() || 0.01;
      p.setAttribute('stroke-dasharray', `${len} ${len}`); p.setAttribute('stroke-dashoffset', len); p._len = len;
      p.setAttribute('visibility', 'hidden');            // tiny strokes (dots, accents) would show as round caps before their turn
      return p;
    };
    let widths;
    {
      const F = SFONTS[font] || SFONTS[STROKE_FONT] || Object.values(SFONTS)[0];
      const k = size * 0.62 / F.capH;
      w = w ?? Math.max(3, size * (bold ? 0.13 : 0.075));   // bold = a fat chisel marker
      widths = lines.map(l => [...l].reduce((s, ch) => s + (F.glyphs[ch]?.adv ?? F.adv) * k, 0));
      lines.forEach((line, li) => {
        let cx = anchor === 'middle' ? -widths[li] / 2 : anchor === 'end' ? -widths[li] : 0;
        [...line].forEach(ch => {
          const gl = F.glyphs[ch], adv = (gl?.adv ?? F.adv) * k;
          if (gl && gl.d.trim()) {
            const sd = inkSeed++, sc = 1 + (hsh(sd) - .5) * 0.08 * jitter, r = (hsh(sd + 7) - .5) * 4 * jitter, dy = (hsh(sd + 3) - .5) * size * 0.05 * jitter;
            const gg = el('g', { transform: `translate(${(cx + adv / 2).toFixed(1)},${(li * size * lineH + dy).toFixed(1)}) rotate(${r.toFixed(2)}) translate(${(-adv / 2).toFixed(1)},0) scale(${(k * sc).toFixed(4)},${(-k * sc).toFixed(4)})` }, outer);
            gl.d.split(/(?=M)/).forEach(sub => { if (sub.trim()) paths.push(addStroke(sub, gg, (w / (k * sc)).toFixed(2))); });
          }
          cx += adv;
        });
      });
    }
    return { _ink: true, paths, fills, outer, _g: outer, _color: color, size, chars: String(text).replace(/\s/g, '').length, width: Math.max(...widths), height: size * (0.75 + (lines.length - 1) * lineH) };
  }
  function writeInk(t, at, dur, { tool, sound = true } = {}) {
    tool = toolFor(t.outer, tool);
    dur = dur ?? Math.min(4, Math.max(0.5, 0.3 + t.chars * 0.075));
    if (!t.paths.length) return;
    // screen-space length of each stroke + the pen-lift hops between them set each stroke's share of the time
    const ends = t.paths.map(p => [localTo(p, t.outer, p.getPointAtLength(0)), localTo(p, t.outer, p.getPointAtLength(p._len))]);
    const sl = t.paths.map((p, i) => Math.max(4, Math.hypot(ends[i][1].x - ends[i][0].x, ends[i][1].y - ends[i][0].y) * 0.4 + p._len * localScale(p, t.outer) * 0.6));
    const hop = t.paths.map((p, i) => i ? Math.max(t.size * 0.12, Math.hypot(ends[i][0].x - ends[i - 1][1].x, ends[i][0].y - ends[i - 1][1].y) * 0.35) : 0);
    const total = sl.reduce((a, b) => a + b, 0) + hop.reduce((a, b) => a + b, 0);
    const a0 = S(at), D = S(dur), items = [];
    let cur = 0;
    t.paths.forEach((p, i) => {
      cur += hop[i];
      const s0 = a0 + cur / total * D, d0 = sl[i] / total * D;
      tl.set(p, { attr: { visibility: 'visible' } }, s0);
      tl.fromTo(p, { attr: { 'stroke-dashoffset': p._len } }, { attr: { 'stroke-dashoffset': 0 }, duration: d0, ease: 'sine.inOut' }, s0);
      items.push({ node: p, start: s0, dur: d0 });
      cur += sl[i];
      const last = i === t.paths.length - 1 || t.paths[i + 1]._fill !== p._fill;
      if (p._fill && last) tl.fromTo(p._fill, { attr: { 'fill-opacity': 0 } }, { attr: { 'fill-opacity': 1 }, duration: Math.min(0.25, D * 0.15), ease: 'power1.out' }, s0 + d0 * 0.6);
    });
    const se = gsap.parseEase('sine.inOut');
    const ptAt = (it, u) => { const q = it.node.getPointAtLength(it.node._len * se(u)); return toRoot(it.node, q.x, q.y); };
    strokes.push({ kind: 'seq', items, start: a0, dur: D, color: t._color, tool,
      point(tt) {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (tt < it.start) {                       // pen lifted, hopping to the next stroke
            const pr = items[i - 1]; if (!pr) return ptAt(it, 0);
            const u = (tt - pr.start - pr.dur) / Math.max(1e-4, it.start - pr.start - pr.dur), A = ptAt(pr, 1), B = ptAt(it, 0);
            return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u, lift: Math.sin(Math.PI * Math.min(1, Math.max(0, u))) };
          }
          if (tt < it.start + it.dur) return ptAt(it, (tt - it.start) / it.dur);
        }
        return ptAt(items[items.length - 1], 1);
      } });
    if (tool && sound) sfx('scr_' + tool, at, { dur, gain: 0.8 });
  }
  // geometry without getCTM (works while a scene is still display:none at build time)
  function chain(node, anc) { let m = svg.createSVGMatrix(); for (let n = node.parentNode; n && n !== anc; n = n.parentNode) { const c = n.transform?.baseVal?.consolidate(); if (c) m = c.matrix.multiply(m); } return m; }
  const localTo = (node, anc, q) => { const p = svg.createSVGPoint(); p.x = q.x; p.y = q.y; return p.matrixTransform(chain(node, anc)); };
  const localScale = (node, anc) => { const m = chain(node, anc); return Math.hypot(m.a, m.b); };
  function pop(t, at, { rot = -10, sound = 'pop' } = {}) {
    show_(t);
    gsap.set(t._g, { scale: 0, transformOrigin: '50% 60%' });
    tl.fromTo(t._g, { scale: 0, rotation: rot }, { scale: 1, rotation: 0, duration: S(0.5), ease: 'back.out(2.6)', immediateRender: false }, S(at));
    if (sound) sfx(sound, at);
  }
  function popIn(g, at, { sound = 'pop', origin = '50% 50%', rot = 0 } = {}) {
    gsap.set(g, { scale: 0, transformOrigin: origin });
    tl.fromTo(g, { scale: 0, rotation: rot }, { scale: 1, rotation: 0, duration: S(0.5), ease: 'back.out(2.2)', immediateRender: false }, S(at));
    if (sound) sfx(sound, at);
  }
  function type(t, at, dur, caretColor) {
    const n = t.textContent.length; dur = dur ?? n * 0.055;
    tl.fromTo(t._r, { attr: { width: 0 } }, { attr: { width: t._b.width + 32 }, duration: S(dur), ease: `steps(${n})` }, S(at));
    if (caretColor) {
      const c = el('rect', { x: t._b.x, y: t._b.y + 6, width: 5, height: t._b.height - 8, fill: caretColor, opacity: 0 }, t._g);
      tl.set(c, { opacity: 1 }, S(at));
      tl.fromTo(c, { attr: { x: t._b.x } }, { attr: { x: t._b.x + t._b.width + 4 }, duration: S(dur), ease: `steps(${n})` }, S(at));
      tl.to(c, { opacity: 0, duration: S(0.1), repeat: 5, yoyo: true }, S(at + dur));
    }
    sfx('type', at, { dur, n });
  }
  function comic(parent, x, y, txt, at, { color = '#FFD23F', size = 120, rot = -8, life = 1.1, sound = null } = {}) {
    const t = T(parent, x, y, txt, { size, color, rot, stroke: INK });
    pop(t, at, { rot: rot * 2, sound });
    tl.to(t._g, { scale: 1.08, duration: S(0.12), yoyo: true, repeat: 3, ease: 'sine.inOut' }, S(at + 0.5));
    tl.to(t._g, { opacity: 0, scale: 1.25, duration: S(0.3) }, S(at + life));
    return t;
  }
  // scale about the element's own local origin, driven by a proxy (GSAP's origin math breaks inside rotated groups)
  function stampFx(inner, at, peak = 0.9) {
    const k = { s: 2.6, o: 0 };
    inner.setAttribute('opacity', 0);
    tl.to(k, { s: 1, o: peak, duration: S(0.22), ease: 'power4.in' }, S(at));
    updaters.push(() => { inner.setAttribute('transform', `scale(${k.s.toFixed(4)})`); inner.setAttribute('opacity', k.o.toFixed(3)); });
  }
  function stamp(parent, x, y, txt, at, { color = PAL.green, rot = -10, size = 88 } = {}) {
    const sg = el('g', { transform: `translate(${x},${y}) rotate(${rot})` }, parent);
    const inner = el('g', {}, sg);
    const tt = el('text', { 'font-size': size, 'text-anchor': 'middle', fill: color, class: 'hand' }, inner);
    tt.textContent = txt;
    const b = tt.getBBox();
    el('rect', { x: b.x - 24, y: b.y - 6, width: b.width + 48, height: b.height + 12, rx: 16, fill: 'none', stroke: color, 'stroke-width': 7 }, inner);
    stampFx(inner, at);
    sfx('stamp', at + 0.18);
    return sg;
  }
  function wobble(cx, cy, rx, ry, turns = 1.18, seed = 1) {
    let d = ''; const n = 90;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI * 0.6 + (i / n) * Math.PI * 2 * turns, k = 1 + 0.04 * Math.sin(i * 0.37 * seed) + 0.03 * Math.cos(i * 0.23);
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rx * k).toFixed(1) + ',' + (cy + Math.sin(a) * ry * k).toFixed(1);
    }
    return d;
  }
  function specks(g, seed = 11, n = 120, color = '#3a2e27') {
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) el('circle', { cx: (rnd() * W).toFixed(1), cy: (rnd() * Hh).toFixed(1), r: (0.6 + rnd() * 1.4).toFixed(2), fill: color, opacity: (0.2 + rnd() * 0.45).toFixed(2) }, g);
  }
  function mover(parent, x = 0, y = 0, s = 1, r = 0) {
    const g = el('g', {}, parent);
    const m = { x, y, s, r, g };
    const apply = () => g.setAttribute('transform', `translate(${m.x.toFixed(2)} ${m.y.toFixed(2)}) rotate(${m.r.toFixed(2)}) scale(${m.s.toFixed(4)})`);
    apply(); updaters.push(apply);
    return m;
  }
  function jump(m, at, to, { dur = 0.5, height = 120, sound = 'hop' } = {}) {
    const fx = m._lx ?? m.x, fy = m._ly ?? m.y, fs = m._ls ?? m.s, ts = to.s ?? fs;
    tl.to(m, { keyframes: [
      { x: fx + (to.x - fx) / 2, y: Math.min(fy, to.y) - height, s: (fs + ts) / 2, duration: S(dur / 2), ease: 'power2.out' },
      { x: to.x, y: to.y, s: ts, duration: S(dur / 2), ease: 'power2.in' }] }, S(at));
    m._lx = to.x; m._ly = to.y; m._ls = ts;
    if (sound) sfx(sound, at, { gain: 0.6 });
  }
  function bubble(parent, x0, y0, x1, y1, tx, ty, { fill = '#fff', ink = INK, w = 7 } = {}) {
    const r = 34, bx = Math.max(x0 + r + 20, Math.min(x1 - r - 80, tx - 40));
    const tail = ty > y1 ? `L${bx + 70},${y1} L${tx},${ty} L${bx},${y1}` : '';
    const d = `M${x0 + r},${y0} L${x1 - r},${y0} Q${x1},${y0} ${x1},${y0 + r} L${x1},${y1 - r} Q${x1},${y1} ${x1 - r},${y1} ${tail} L${x0 + r},${y1} Q${x0},${y1} ${x0},${y1 - r} L${x0},${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`;
    const g = el('g', {}, parent);
    el('path', { d, fill, stroke: ink, 'stroke-width': w, 'stroke-linejoin': 'round' }, g);
    return g;
  }

  /* ---------- faces, eyes, emotes ---------- */
  const STAR = r => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; d += (i ? 'L' : 'M') + (Math.cos(a) * rr).toFixed(1) + ',' + (Math.sin(a) * rr).toFixed(1); } return d + 'Z'; };
  const HEART = k => `M0,${14 * k} C${-24 * k},${-2 * k} ${-20 * k},${-22 * k} ${-7 * k},${-20 * k} C${-2 * k},${-19 * k} 0,${-15 * k} 0,${-11 * k} C0,${-15 * k} ${2 * k},${-19 * k} ${7 * k},${-20 * k} C${20 * k},${-22 * k} ${24 * k},${-2 * k} 0,${14 * k} Z`;
  function EYE(st, ink, side, big) {
    const hl = [INK, PAL.sepia, PAL.graphite].includes(ink) ? '#fff' : 'none';
    switch (st) {
      case 'normal': return big ? `<rect x="-7.5" y="-14" width="15" height="28" rx="7" fill="${ink}"/><circle cx="-2.5" cy="-7" r="2.8" fill="${hl}"/>` : `<circle r="4.5" fill="${ink}"/>`;
      case 'lookR': return big ? `<rect x="-3.5" y="-14" width="15" height="28" rx="7" fill="${ink}"/>` : `<circle cx="3" r="4.5" fill="${ink}"/>`;
      case 'lookU': return big ? `<rect x="-7.5" y="-20" width="15" height="28" rx="7" fill="${ink}"/>` : `<circle cy="-3" r="4.5" fill="${ink}"/>`;
      case 'happy': return `<path d="M-11,6 Q0,-12 11,6" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
      case 'closed': return `<path d="M-10,2 L10,2" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
      case 'star': return `<path d="${STAR(big ? 17 : 11)}" fill="#F6C744" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`;
      case 'heart': return `<path d="${HEART(big ? .95 : .6)}" fill="#E8577E" stroke="${ink}" stroke-width="3"/>`;
      case 'swirl': return `<path d="M0,0 m-2,0 a2,2 0 1,1 4,0 a5,5 0 1,1 -10,0 a8,8 0 1,1 16,0 a11,11 0 1,1 -22,0" fill="none" stroke="${ink}" stroke-width="3"/>`;
      case 'wide': return big ? `<circle r="13" fill="#fff" stroke="${ink}" stroke-width="3"/><circle r="5.5" fill="${ink}"/>` : `<circle r="8" fill="#fff" stroke="${ink}" stroke-width="2.5"/><circle r="3.5" fill="${ink}"/>`;
      case 'determined': return `<rect x="-7.5" y="-8" width="15" height="20" rx="6" fill="${ink}"/><path d="M${-13 * side},-24 L${11 * side},-15" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
      case 'sad': return `<path d="M-10,-2 Q0,8 10,-2" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/><path d="M${-12 * side},-18 L${8 * side},-24" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`;
    }
    return '';
  }
  const EYE_STATES = ['normal', 'lookR', 'lookU', 'happy', 'closed', 'star', 'heart', 'swirl', 'wide', 'determined', 'sad'];
  const MOUTHS = {
    smile: i => `<path d="M-14,-4 Q0,10 14,-4" fill="none" stroke="${i}" stroke-width="5" stroke-linecap="round"/>`,
    o: i => `<ellipse rx="8" ry="10" fill="#5A2230" stroke="${i}" stroke-width="3"/>`,
    O: i => `<ellipse rx="13" ry="16" fill="#5A2230" stroke="${i}" stroke-width="3"/>`,
    grin: i => `<path d="M-18,-6 L18,-6 Q16,16 0,16 Q-16,16 -18,-6 Z" fill="#5A2230" stroke="${i}" stroke-width="3"/><path d="M-15,-6 L15,-6 L14,0 L-14,0 Z" fill="#fff"/>`,
    flat: i => `<path d="M-10,0 L10,0" stroke="${i}" stroke-width="5" stroke-linecap="round"/>`,
    frown: i => `<path d="M-14,6 Q0,-8 14,6" fill="none" stroke="${i}" stroke-width="5" stroke-linecap="round"/>`,
  };
  function buildFace(c, parent, eyePts, mouthPt, ink, big) {
    c.eyesWrap = el('g', {}, parent); c.eyeSets = {};
    EYE_STATES.forEach(st => {
      const g = el('g', { opacity: st === 'normal' ? 1 : 0 }, c.eyesWrap);
      eyePts.forEach(([x, y], i) => { const e = el('g', { transform: `translate(${x},${y})` }, g); e.innerHTML = EYE(st, ink, i ? -1 : 1, big); });
      c.eyeSets[st] = g;
    });
    c.mouthSets = {};
    Object.entries(MOUTHS).forEach(([k, fn]) => { const g = el('g', { transform: `translate(${mouthPt[0]},${mouthPt[1]})`, opacity: 0 }, parent); g.innerHTML = fn(ink); c.mouthSets[k] = g; });
    c.state = 'normal'; c.mouth = null;
  }
  // never snap faces: eyes squash shut, body does a take, emote pops, new eyes open
  function face(c, at, st, { mouth, emote: em, take = true } = {}) {
    tl.to(c.eyesWrap, { scaleY: 0.1, duration: S(0.07), transformOrigin: '50% 50%' }, S(at));
    if (st && st !== c.state) { tl.set(c.eyeSets[c.state], { opacity: 0 }, S(at + 0.07)); tl.set(c.eyeSets[st], { opacity: 1 }, S(at + 0.07)); c.state = st; }
    if (mouth !== undefined && mouth !== c.mouth) {
      if (c.mouth) tl.set(c.mouthSets[c.mouth], { opacity: 0 }, S(at + 0.07));
      if (mouth) tl.set(c.mouthSets[mouth], { opacity: 1 }, S(at + 0.07));
      c.mouth = mouth;
    }
    tl.to(c.eyesWrap, { scaleY: 1, duration: S(0.16), ease: 'back.out(3)' }, S(at + 0.07));
    if (take) tl.to(c.sq, { scaleY: 0.9, scaleX: 1.07, duration: S(0.08), yoyo: true, repeat: 1, transformOrigin: '50% 100%' }, S(at));
    if (em) emote(c, at + 0.1, em);
  }
  const EMOTE = {
    sweat: `<path d="M0,-24 C11,-6 17,4 17,11 A17,17 0 0 1 -17,11 C-17,4 -11,-6 0,-24 Z" fill="#8FD3F4" stroke="${INK}" stroke-width="4"/>`,
    heart: `<path d="${HEART(1.3)}" fill="#E8577E" stroke="${INK}" stroke-width="4"/>`,
    '!': `<text y="28" font-size="96" text-anchor="middle" class="hand" fill="${PAL.red}" stroke="${INK}" stroke-width="7" paint-order="stroke">!</text>`,
    '?': `<text y="28" font-size="96" text-anchor="middle" class="hand" fill="#FFD23F" stroke="${INK}" stroke-width="7" paint-order="stroke">?</text>`,
    sparkle: `<path d="M0,-28 L7,-7 L28,0 L7,7 L0,28 L-7,7 L-28,0 L-7,-7 Z" fill="#F6C744" stroke="${INK}" stroke-width="3.5"/>`,
    bulb: `<g><path d="M-26,-40 L-36,-52 M0,-50 L0,-66 M26,-40 L36,-52 M-36,-12 L-50,-12 M36,-12 L50,-12" stroke="#F6C744" stroke-width="6" stroke-linecap="round"/>
      <circle cy="-12" r="24" fill="#FFE27A" stroke="${INK}" stroke-width="4"/><rect x="-11" y="10" width="22" height="16" rx="3" fill="#B9B2A6" stroke="${INK}" stroke-width="3"/></g>`,
    zzz: `<text y="10" font-size="56" class="kalam" fill="${PAL.blue}">z<tspan dy="-18" font-size="42">z</tspan><tspan dy="-14" font-size="30">z</tspan></text>`,
    swirl: `<path d="M0,0 m-3,0 a3,3 0 1,1 6,0 a8,8 0 1,1 -16,0 a13,13 0 1,1 26,0" fill="none" stroke="${PAL.purple}" stroke-width="5"/>`,
    anger: `<path d="M-18,-6 L-6,-6 L-6,-18 M6,-18 L6,-6 L18,-6 M18,6 L6,6 L6,18 M-6,18 L-6,6 L-18,6" fill="none" stroke="${PAL.red}" stroke-width="6" stroke-linecap="round"/>`,
    music: `<path d="M-8,14 a8,6 0 1,1 0.1,0 M0,14 L0,-22 L18,-16" fill="none" stroke="${INK}" stroke-width="5"/>`,
  };
  function emote(c, at, kind) {
    const g = el('g', { transform: `translate(${c.emoteAt[0]},${c.emoteAt[1]})` }, c.sq);
    const inner = el('g', { opacity: 0 }, g); inner.innerHTML = EMOTE[kind];
    const k = 1 / (c.k || 1);
    tl.fromTo(inner, { scale: 0, opacity: 1 }, { scale: k, duration: S(0.35), ease: 'back.out(3)', transformOrigin: '50% 50%', immediateRender: false }, S(at));
    tl.to(inner, { y: -20 * k, duration: S(1.0), ease: 'sine.out' }, S(at));
    tl.to(inner, { opacity: 0, duration: S(0.3) }, S(at + 1.1));
    sfx(kind === 'heart' || kind === 'sparkle' ? 'sparkle' : kind === 'bulb' ? 'ding' : 'blip', at, { gain: 0.5 });
  }
  function arms(c, at, { L, R, dur = 0.2, ease = 'back.out(2)' } = {}) {
    const v = {}; if (L != null) v.L = L; if (R != null) v.R = R;
    tl.to(c.armP, { ...v, duration: S(dur), ease }, S(at));
  }
  function wave(c, side, at, n = 3, { from = 60, to = 30, speed = 0.14 } = {}) {
    tl.to(c.armP, { [side]: side === 'L' ? from : -from, duration: S(0.15) }, S(at));
    tl.to(c.armP, { [side]: side === 'L' ? to : -to, duration: S(speed), yoyo: true, repeat: n * 2 - 1, ease: 'sine.inOut' }, S(at + 0.15));
  }

  /* ---------- mascot rig (default shape = a blocky critter; pass `shape` for your own) ---------- */
  const BLOCKY = {
    body: 'M9,5 Q100,-1 188,3 Q197,4 197,12 L199,127 Q199,136 190,136 L13,139 Q4,139 4,130 L2,13 Q2,6 9,5 Z',
    armL: 'M5,64 L-20,64 Q-26,64 -26,70 L-26,88 Q-26,94 -20,94 L5,94 Z',
    armR: 'M196,56 L220,56 Q226,56 226,62 L226,80 Q226,86 220,86 L196,86 Z',
    legs: [30, 60, 124, 154].map(x => `M${x},134 L${x},165 Q${x},171 ${x + 6},171 L${x + 11},171 Q${x + 17},171 ${x + 17},165 L${x + 17},134 Z`),
    eyes: [[65.5, 64], [133.5, 62]], mouth: [100, 104],
    pivotL: [5, 79], pivotR: [196, 71], handL: [-26, 79], handR: [226, 71],
    width: 220, height: 171, offsetX: 10, emoteAt: [205, -40],
  };
  const SHAPE = Object.assign({}, BLOCKY, cfg.mascotShape || {});
  function mascot(parent, x, y, s, { theme = cfg.mascotTheme || 'orange', ink = INK, ground = '#B9B2A6', shadow = 'shadow', hat = null, shape = SHAPE } = {}) {
    const outer = el('g', { transform: `translate(${x + shape.offsetX * s},${y}) scale(${s})` }, parent);
    const w = 7.5 / s, cxm = shape.width / 2 - shape.offsetX;
    const sh = el('ellipse', { cx: cxm, cy: shape.height + 5, rx: shape.width * 0.58, ry: 11, fill: H(shadow), opacity: 0 }, outer);
    const gr = ground ? P(outer, `M${cxm - 290},${shape.height + 6} L${cxm + 290},${shape.height + 6}`, { color: ground, w: 2.2 / s }) : null;
    const g = el('g', {}, outer), sq = el('g', {}, g);
    const fill = theme ? H(theme) : 'none';
    const c = { g, sq, outer, shadow: sh, ground: gr, k: s, emoteAt: shape.emoteAt };
    c.legs = shape.legs.map(d => P(sq, d, { color: ink, w, fill }));
    c.armG = { L: el('g', {}, sq), R: el('g', {}, sq) };
    c.arms = [P(c.armG.L, shape.armL, { color: ink, w, fill }), P(c.armG.R, shape.armR, { color: ink, w, fill })];
    c.hand = { L: el('g', { transform: `translate(${shape.handL})` }, c.armG.L), R: el('g', { transform: `translate(${shape.handR})` }, c.armG.R) };
    c.body = P(sq, shape.body, { color: ink, w, fill });
    c.armP = { L: 0, R: 0 };
    updaters.push(() => {
      c.armG.L.setAttribute('transform', `rotate(${c.armP.L.toFixed(2)} ${shape.pivotL})`);
      c.armG.R.setAttribute('transform', `rotate(${c.armP.R.toFixed(2)} ${shape.pivotR})`);
    });
    buildFace(c, el('g', {}, sq), shape.eyes, shape.mouth, ink, true);
    gsap.set(c.eyesWrap, { scaleY: 0, transformOrigin: '50% 50%' });
    if (hat === 'hard' || hat === 'crown' || hat === 'party') {
      c.hat = el('g', { opacity: 0 }, sq);
      const hx = cxm;
      c.hat.innerHTML = hat === 'hard'
        ? `<path d="M${hx - 70},4 Q${hx - 70},-58 ${hx},-58 Q${hx + 70},-58 ${hx + 70},4 Z" fill="${H('hard')}" stroke="${INK}" stroke-width="${w}"/><path d="M${hx - 86},4 L${hx + 86},4" stroke="${INK}" stroke-width="${w * 1.6}" stroke-linecap="round"/>`
        : hat === 'crown'
        ? `<path d="M${hx - 58},4 L${hx - 58},-50 L${hx - 29},-22 L${hx},-64 L${hx + 29},-22 L${hx + 58},-50 L${hx + 58},4 Z" fill="${H('yellow')}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`
        : `<path d="M${hx - 34},4 L${hx},-80 L${hx + 34},4 Z" fill="${H('pink')}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/><circle cx="${hx}" cy="-84" r="10" fill="#FFD23F" stroke="${INK}" stroke-width="${w * .6}"/>`;
    }
    return c;
  }
  function drawMascot(c, at, dur = 1.1, opts = {}) {
    if (c.ground) draw(c.ground, at, dur * 0.5, { sound: false, ...opts });
    draw(c.body, at, dur * 0.7, opts);
    c.arms.forEach((a, i) => draw(a, at + dur * 0.7 + i * 0.1, dur * 0.18, { ...opts, sound: false }));
    c.legs.forEach((l, i) => draw(l, at + dur * 0.85 + i * 0.07, dur * 0.14, { ...opts, sound: false }));
    tl.to(c.shadow, { attr: { opacity: 0.7 }, duration: S(0.4) }, S(at + dur));
    tl.to(c.eyesWrap, { scaleY: 1, duration: S(0.25), ease: 'back.out(3)' }, S(at + dur + 0.3));
    if (c.hat) tl.to(c.hat, { opacity: 1, duration: S(0.2) }, S(at + dur));
    sfx('blip', at + dur + 0.3, { gain: 0.6 });
  }
  function popMascot(c, at, { sound = 'boing' } = {}) {
    [c.body, ...c.arms, ...c.legs].forEach(done);
    if (c.ground) done(c.ground);
    if (c.hat) c.hat.setAttribute('opacity', 1);
    gsap.set(c.g, { scale: 0, transformOrigin: '50% 100%' });
    tl.fromTo(c.g, { scale: 0 }, { scale: 1, duration: S(0.55), ease: 'back.out(2.4)', immediateRender: false }, S(at));
    tl.to(c.shadow, { attr: { opacity: 0.7 }, duration: S(0.3) }, S(at));
    tl.to(c.eyesWrap, { scaleY: 1, duration: S(0.2), ease: 'back.out(3)' }, S(at + 0.35));
    if (sound) sfx(sound, at, { gain: 0.8 });
  }
  const blink = (c, at) => tl.to(c.eyesWrap, { scaleY: 0.1, duration: S(0.08), yoyo: true, repeat: 1, transformOrigin: '50% 50%' }, S(at));
  function wink(c, at) {
    const set = c.eyeSets[c.state].children[0];
    tl.to(set, { scaleY: 0.1, duration: S(0.1), yoyo: true, repeat: 1, repeatDelay: S(0.25), transformOrigin: '50% 50%' }, S(at));
    sfx('blip', at + 0.1, { gain: 0.5 });
  }
  function hop(c, at, n = 2, sound = true, h = 40) {
    tl.to(c.g, { y: -h, duration: BEAT / 4, ease: 'power2.out', yoyo: true, repeat: n * 2 - 1 }, S(at));
    if (c.shadow) tl.to(c.shadow, { attr: { rx: 95 }, duration: BEAT / 4, ease: 'power2.out', yoyo: true, repeat: n * 2 - 1 }, S(at));
    if (sound) for (let i = 0; i < n; i++) sfx('hop', at + i * (BEAT / 2) / SPEED, { gain: 0.55 });
  }
  function wiggle(c, at, n = 3) {
    c.legs.forEach((l, i) => tl.to([l, l._fill].filter(Boolean), { y: -7, duration: BEAT / 4, yoyo: true, repeat: n * 2 - 1, ease: 'sine.inOut' }, S(at) + (i % 2) * BEAT / 4));
  }
  const take = (c, at, k = 0.12) => tl.to(c.sq, { scaleY: 1 - k, scaleX: 1 + k * 0.7, duration: S(0.08), yoyo: true, repeat: 1, transformOrigin: '50% 100%' }, S(at));

  /* ---------- human character (the viewer's stand-in) ---------- */
  function person(parent, x, y, s, { ink = INK, outline = false, shirt = 'teal', hair = '#3A2A22', skin = 'skin', glasses = true, hairD = null, brows = false, chain = false } = {}) {
    const outer = el('g', { transform: `translate(${x},${y}) scale(${s})` }, parent);
    const w = 6.5 / s, f = k => outline ? 'none' : H(k);
    const g = el('g', {}, outer), sq = el('g', {}, g);
    const c = { g, sq, outer, k: s, emoteAt: [62, -300], parts: [] };
    const add = (d, o) => { const p = P(sq, d, { color: ink, w, ...o }); c.parts.push(p); return p; };
    add('M-18,-72 L-21,-8', { w: w * 1.6 }); add('M18,-72 L21,-8', { w: w * 1.6 });
    add('M-38,-2 Q-24,-18 -8,-4 Z', { fill: outline ? 'none' : ink }); add('M38,-2 Q24,-18 8,-4 Z', { fill: outline ? 'none' : ink });
    c.armG = { L: el('g', {}, sq), R: el('g', {}, sq) };
    const shirtCol = HATCH[shirt] ? HATCH[shirt][0] : shirt;
    const arm = (G, sx) => {
      c.parts.push(P(G, `M${48 * sx},-146 L${73 * sx},-90`, { color: ink, w: w * 3.2 }));
      if (!outline) c.parts.push(P(G, `M${48 * sx},-146 L${73 * sx},-90`, { color: shirtCol, w: w * 1.7 }));
      c.parts.push(P(G, `M${73 * sx - 10},-86 a10,10 0 1,0 20,0 a10,10 0 1,0 -20,0`, { color: ink, w: w * 0.8, fill: f(skin) }));
    };
    arm(c.armG.L, -1); arm(c.armG.R, 1);
    c.hand = { L: el('g', { transform: 'translate(-74,-86)' }, c.armG.L), R: el('g', { transform: 'translate(74,-86)' }, c.armG.R) };
    add('M-50,-158 Q0,-178 50,-158 L58,-62 Q0,-48 -58,-62 Z', { fill: HATCH[shirt] ? f(shirt) : (outline ? 'none' : shirt) });
    add('M-44,-214 a44,44 0 1,0 88,0 a44,44 0 1,0 -88,0', { fill: f(skin) });
    add(hairD || 'M-46,-222 Q-44,-270 0,-264 Q46,-270 47,-220 Q32,-242 16,-232 Q0,-252 -14,-234 Q-30,-248 -46,-222 Z', { fill: outline ? 'none' : hair });
    if (brows) { add('M-30,-229 Q-18,-236 -6,-231', { w: w * 1.1 }); add('M6,-231 Q18,-236 30,-229', { w: w * 1.1 }); }
    if (chain) add('M-18,-160 Q0,-128 18,-160', { color: '#C9CDD2', w: w * 0.6 });
    if (glasses) { add('M-31,-212 a14,14 0 1,0 28,0 a14,14 0 1,0 -28,0'); add('M3,-212 a14,14 0 1,0 28,0 a14,14 0 1,0 -28,0'); add('M-3,-214 L3,-214', { w: w * 0.7 }); }
    c.armP = { L: 0, R: 0 };
    updaters.push(() => {
      c.armG.L.setAttribute('transform', `rotate(${c.armP.L.toFixed(2)} -48 -146)`);
      c.armG.R.setAttribute('transform', `rotate(${c.armP.R.toFixed(2)} 48 -146)`);
    });
    buildFace(c, el('g', {}, sq), [[-17, -211], [17, -211]], [0, -184], ink, false);
    gsap.set(c.eyesWrap, { scaleY: 0, transformOrigin: '50% 50%' });
    return c;
  }
  function drawPerson(c, at, dur = 1.2) {
    const n = c.parts.length;
    c.parts.forEach((p, i) => draw(p, at + (i / n) * dur * 0.85, dur * 0.2, { sound: i === 0 }));
    tl.to(c.eyesWrap, { scaleY: 1, duration: S(0.25), ease: 'back.out(3)' }, S(at + dur + 0.1));
  }
  function popPerson(c, at, { sound = 'boing' } = {}) {
    c.parts.forEach(done);
    gsap.set(c.g, { scale: 0, transformOrigin: '50% 100%' });
    tl.fromTo(c.g, { scale: 0 }, { scale: 1, duration: S(0.55), ease: 'back.out(2.4)', immediateRender: false }, S(at));
    tl.to(c.eyesWrap, { scaleY: 1, duration: S(0.2), ease: 'back.out(3)' }, S(at + 0.35));
    if (sound) sfx(sound, at, { gain: 0.7 });
  }
  // external art (e.g. a vectorised reference character): an <image> or inline SVG that pops/moves like any group
  function image(parent, href, x, y, w, h) { return el('image', { href, x, y, width: w, height: h }, parent); }

  /* ---------- scenes: outer (finale) > inner (transitions) > cam (drift/shake) > bg + content ---------- */
  const SC = [];
  // boards decide the default tool and ink colour of a scene: whiteboard → marker/dark ink, chalkboards → chalk/white
  const BOARD = { whiteboard: ['marker', null, 'url(#rough)'], greenboard: ['chalk', 'chalk', 'url(#chalk)'], blackboard: ['chalk', 'chalk', 'url(#chalk)'], chalk: ['chalk', 'chalk', 'url(#chalk)'], blueprint: ['chalk', 'chalk', 'url(#rough)'] };
  function newScene(bgFn, { filter, tool, ink: inkColor } = {}) {
    const outer = el('g', { 'clip-path': 'url(#screenClip)' }, scenesL);
    const inner = el('g', {}, outer), cam = el('g', {}, inner), bg = el('g', {}, cam);
    (typeof bgFn === 'string' ? BG[bgFn] : bgFn)(bg);
    const bd = typeof bgFn === 'string' ? BOARD[bgFn] : null;
    const content = el('g', { filter: filter || bd?.[2] || 'url(#rough)' }, cam);
    const border = el('rect', { width: W, height: Hh, rx: 70, fill: 'none', stroke: '#F7F1E6', 'stroke-width': 26, opacity: 0 }, outer);
    gsap.set(outer, { display: 'none' });
    const sc = { outer, inner, cam, bg, content, g: content, border, i: SC.length, t0: null, t1: null, camFn: null,
      board: bd ? (bd[1] ? 'chalk' : 'white') : null, tool: tool !== undefined ? tool : (bd ? bd[0] : null),
      ink: inkColor || (bd?.[1] ? PAL[bd[1]] : null) };
    content._sc = sc; outer._sc = sc;
    SC.push(sc);
    return sc;
  }
  const show = (sc, at) => { if (sc.t0 == null) sc.t0 = S(at); tl.set(sc.outer, { display: 'inline' }, S(at)); };
  const hide = (sc, at) => { if (sc.t1 == null) sc.t1 = S(at); tl.set(sc.outer, { display: 'none' }, S(at)); };
  const camZ = (sc, t) => 1.025 + 0.05 * Math.min(1, Math.max(0, (t - sc.t0) / ((sc.t1 ?? sc.t0 + 8) - sc.t0)));
  const FIN = { on: 0 };
  updaters.push(T => {
    const seed = 1 + (Math.floor(T * 12) % 7);                   // living line: wobble re-seeds 12x/s
    document.getElementById('roughN').setAttribute('seed', seed);
    document.getElementById('chalkN').setAttribute('seed', seed + 3);
    for (const sc of SC) {
      if (FIN.on || sc.t0 == null) { sc.cam.setAttribute('transform', ''); continue; }
      let z, fx = CX, fy = CY;
      if (sc.camFn) ({ z, fx, fy } = sc.camFn(T)); else z = camZ(sc, T);
      let dx = 0, dy = 0;
      for (const b of STRONG) { const d = T - b; if (d >= 0 && d < 0.35) { const k = Math.exp(-d / 0.07) * 7; dx += (hsh(b * 13) - .5) * 2 * k; dy += (hsh(b * 7 + 3) - .5) * 2 * k; } }
      sc.cam.setAttribute('transform', `translate(${CX} ${CY}) scale(${z.toFixed(4)}) translate(${(-fx + dx).toFixed(2)} ${(-fy + dy).toFixed(2)})`);
    }
  });

  const R = (g, a) => el('rect', Object.assign({ x: -60, y: -60, width: W + 120, height: Hh + 120 }, a), g);
  // leftovers of earlier lessons: short wiped strokes in a few loose clusters (deterministic per scene)
  function ghosts(g, color, op, sw, seed, soft = false) {
    const gg = el('g', { opacity: op, filter: soft ? 'url(#smudge)' : 'none' }, g);
    for (let c = 0; c < 4; c++) {
      const cx = (0.15 + hsh(seed + c * 3) * 0.7) * W, cy = (0.1 + hsh(seed + c * 5 + 1) * 0.8) * Hh, n = soft ? 2 : 3 + Math.floor(hsh(seed + c) * 3);
      for (let i = 0; i < n; i++) {
        const x0 = cx - (0.12 + hsh(seed + c + i * 7) * 0.18) * W, x1 = cx + (0.08 + hsh(seed + c * 2 + i) * 0.2) * W, y0 = cy + i * (soft ? 110 : 46);
        el('path', { d: roughen(`M${x0.toFixed(0)},${y0.toFixed(0)} L${x1.toFixed(0)},${(y0 + (hsh(i + c) - .5) * 20).toFixed(0)}`, soft ? 14 : 5, seed + c * 10 + i), fill: 'none', stroke: color, 'stroke-width': sw * (0.6 + hsh(seed + i * c) * 0.8), 'stroke-linecap': 'round' }, gg);
      }
    }
  }
  function chalkboard(g, base, dust) {
    R(g, { fill: base });
    ghosts(g, dust, 0.06, 90, 9, true);                 // wiped chalk clouds
    R(g, { filter: 'url(#grain)', opacity: .38 }); specks(g, 5, 110, dust);
    el('rect', { x: 0, y: 0, width: W, height: Hh, fill: 'none', stroke: '#6B4A2E', 'stroke-width': 34 }, g);
    el('rect', { x: 17, y: 17, width: W - 34, height: Hh - 34, fill: 'none', stroke: '#3E2A19', 'stroke-width': 3 }, g);
  }
  const BG = {
    paper(g) { R(g, { fill: PAL.paper }); R(g, { filter: 'url(#grain)', opacity: .5 }); specks(g, 11); },
    chalk(g) {
      R(g, { fill: '#1F2823' });
      [[.23, .22, 380, 160], [.7, .6, 460, 200], [.39, .83, 420, 170], [.81, .16, 260, 120]].forEach(([x, y, rx, ry]) => el('ellipse', { cx: x * W, cy: y * Hh, rx, ry, fill: '#DDE6DF', opacity: .07, filter: 'url(#soft)' }, g));
      R(g, { filter: 'url(#grain)', opacity: .35 }); specks(g, 5, 90, '#E8EDE6');
    },
    sepia(g) {
      R(g, { fill: '#E7D3A9' }); R(g, { filter: 'url(#grain)', opacity: .7 });
      [[.17, .86, 90], [.83, .14, 60], [.89, .78, 40]].forEach(([x, y, r]) => el('circle', { cx: x * W, cy: y * Hh, r, fill: 'none', stroke: '#9C7440', 'stroke-width': 6, opacity: .18 }, g));
      R(g, { fill: 'url(#sepiaVig)' }); specks(g, 23, 90, '#5a3a14');
    },
    graph(g) { R(g, { fill: '#F8FAFD' }); R(g, { fill: 'url(#graphMinor)' }); R(g, { fill: 'url(#graphMajor)' }); },
    notebook(g) {
      R(g, { fill: '#FBFAF4' });
      for (let y = 250; y < Hh + 60; y += 70) el('line', { x1: -60, x2: W + 60, y1: y, y2: y, stroke: '#BCD0EC', 'stroke-width': 2.5 }, g);
      el('line', { x1: 96, x2: 96, y1: -60, y2: Hh + 60, stroke: '#E9A3A3', 'stroke-width': 3 }, g);
      R(g, { filter: 'url(#grain)', opacity: .3 });
    },
    blue(g) { R(g, { fill: '#2F5FC4' }); R(g, { fill: 'url(#halftone)' }); },
    kraft(g) { R(g, { fill: '#C49E6C' }); R(g, { filter: 'url(#fibers)', opacity: .8 }); R(g, { filter: 'url(#grain)', opacity: .6 }); },
    blueprint(g) { R(g, { fill: '#15335B' }); R(g, { fill: 'url(#bpMinor)' }); R(g, { fill: 'url(#bpMajor)' });
      el('rect', { x: 40, y: 40, width: W - 80, height: Hh - 80, fill: 'none', stroke: '#fff', 'stroke-opacity': .35, 'stroke-width': 3 }, g); },
    whiteboard(g) {
      R(g, { fill: PAL.wb });
      ghosts(g, '#8a8f96', 0.05, 16, 3);                 // faint ghosts of old, badly erased marker
      el('rect', { x: -60, y: -60, width: W + 120, height: Hh + 120, fill: 'url(#glare)' }, g);
      R(g, { filter: 'url(#grain)', opacity: .18 });
      el('rect', { x: 10, y: 10, width: W - 20, height: Hh - 20, rx: 10, fill: 'none', stroke: '#C4C9CE', 'stroke-width': 20 }, g);
      el('rect', { x: 20, y: 20, width: W - 40, height: Hh - 40, rx: 6, fill: 'none', stroke: '#9AA0A6', 'stroke-width': 2.5 }, g);
    },
    greenboard(g) { chalkboard(g, PAL.gb, '#DDE9DF'); },
    blackboard(g) { chalkboard(g, PAL.bb, '#E3E6E3'); },
    solid: color => g => R(g, { fill: color }),
    sunburst(color = '#E8874F', rayColor = '#F29A62') { return g => { R(g, { fill: color }); const rg = el('g', {}, g);
      for (let k = 0; k < 18; k++) { const a1 = k / 18 * Math.PI * 2, a2 = a1 + Math.PI / 36, L = Math.max(W, Hh) * 1.4;
        rg.insertAdjacentHTML('beforeend', `<path d="M${CX},${CY} L${CX + Math.cos(a1) * L},${CY + Math.sin(a1) * L} L${CX + Math.cos(a2) * L},${CY + Math.sin(a2) * L} Z" fill="${rayColor}"/>`); }
      g._rays = rg; }; },
  };

  /* ---------- real erasing: a felt eraser wipes part of the board, leaving chalk dust ---------- */
  // erase(scene, at, dur, { x, y, w, h } | { targets: [inkText, path, group…] }) erases everything drawn into the
  // scene BEFORE this call inside that box (new things drawn after the call are untouched).
  let eraseN = 0;
  function erase(sc, at, dur = 0.9, { x, y, w, h, targets, pad = 30, residue = sc.board === 'chalk', sound = true } = {}) {
    if (targets) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      targets.forEach(tg => { const n = tg.outer || tg._outer || tg; const b = n.getBBox(), m = chain({ parentNode: n }, sc.content);
        [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].forEach(([px, py]) => {
          const q = localTo({ parentNode: n }, sc.content, { x: px, y: py }); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }); });
      x = x0 - pad; y = y0 - pad; w = x1 - x0 + 2 * pad; h = y1 - y0 + 2 * pad;
    }
    x = x ?? 0; y = y ?? 0; w = w ?? W; h = h ?? Hh;
    const id = 'er' + (eraseN++), pass = Math.min(150, Math.max(70, h / 2.2));
    const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: -400, y: -400, width: W + 800, height: Hh + 800 }, defs);
    el('rect', { x: -400, y: -400, width: W + 800, height: Hh + 800, fill: '#fff' }, mask);
    const rows = Math.max(1, Math.ceil(h / (pass * 0.85)));
    let d = '';
    for (let r = 0; r < rows; r++) { const yy = y + pass * 0.45 + r * (h - pass * 0.9) / Math.max(1, rows - 1); d += (r ? 'L' : 'M') + (r % 2 ? x + w - pass * .3 : x + pass * .3).toFixed(1) + ',' + yy.toFixed(1) + 'L' + (r % 2 ? x + pass * .3 : x + w - pass * .3).toFixed(1) + ',' + yy.toFixed(1); }
    if (rows === 1) d = `M${x + pass * .3},${y + h / 2}L${x + w - pass * .3},${y + h / 2}L${x + pass * .3},${y + h / 2 + 4}`;
    const mp = el('path', { d, fill: 'none', stroke: '#000', 'stroke-width': pass * 1.25, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, mask);
    const len = mp.getTotalLength(); mp.setAttribute('stroke-dasharray', `${len} ${len}`); mp.setAttribute('stroke-dashoffset', len);
    const old = el('g', { mask: `url(#${id})` }, sc.content);       // everything drawn so far goes under this eraser's mask
    [...sc.content.childNodes].forEach(n => { if (n !== old) old.appendChild(n); });
    const a = S(at), D = S(dur);
    tl.fromTo(mp, { attr: { 'stroke-dashoffset': len } }, { attr: { 'stroke-dashoffset': 0 }, duration: D, ease: 'none' }, a);
    if (residue) {
      const rs = el('path', { d: roughen(d, pass * 0.12), fill: 'none', stroke: '#E8EDE6', 'stroke-width': pass * 0.7, 'stroke-linecap': 'round', opacity: 0, filter: 'url(#smudge)' }, sc.bg);
      tl.to(rs, { attr: { opacity: 0.055 }, duration: D }, a);
    }
    strokes.push({ kind: 'path', node: mp, start: a, dur: D, color: null, tool: 'eraser',
      point: tt => { const q = mp.getPointAtLength(len * Math.min(1, Math.max(0, (tt - a) / D))); return toRoot(sc.content, q.x, q.y); } });
    if (sound) sfx('erase', at, { dur });
    return old;
  }

  /* ---------- motivated transitions: each returns the new time cursor ---------- */
  const TR = {
    // camera flies into a point (e.g. the mascot's eye); the dark pupil becomes the next scene
    zoomInto(from, to, t, { x, y }) {
      t = align(t, 0.55); const at = t;
      hide(from, at + 0.75);
      const z = camZ(from, S(at + 0.05)), px = CX + (x - CX) * z, py = CY + (y - CY) * z;
      tl.to(from.inner, { scale: 60, svgOrigin: `${px} ${py}`, duration: S(0.6), ease: 'power4.in' }, S(at + 0.05));
      sfx('whoosh_in', at - 0.3, { gain: 0.9 });
      show(to, at + 0.55);
      tl.fromTo(to.inner, { opacity: 0 }, { opacity: 1, duration: S(0.2), immediateRender: false }, S(at + 0.55));
      return at + 0.75;
    },
    // a felt eraser wipes left→right, revealing the next scene underneath
    eraser(from, to, t) {
      t = align(t, 0.0); const at = t, Wd = 0.7;
      const cp = el('clipPath', { id: 'wipe' + to.i, clipPathUnits: 'userSpaceOnUse' }, defs);
      const r = el('rect', { x: 0, y: 0, width: 0, height: Hh }, cp);
      to.inner.setAttribute('clip-path', `url(#wipe${to.i})`);
      const er = el('g', { opacity: 0 }, screenL);
      er.innerHTML = `<g transform="rotate(-8)"><rect x="-70" y="-190" width="140" height="380" rx="18" fill="#7C5A3C"/><rect x="-70" y="-190" width="140" height="70" rx="18" fill="#9A7350"/><rect x="-78" y="110" width="156" height="90" rx="10" fill="#EDE8DE"/></g>`;
      show(to, at); tl.set(er, { opacity: 1 }, S(at));
      tl.fromTo(r, { attr: { width: 0 } }, { attr: { width: W }, duration: S(Wd), ease: 'power2.inOut' }, S(at));
      tl.fromTo(er, { x: -80, y: CY }, { x: W + 80, duration: S(Wd), ease: 'power2.inOut' }, S(at));
      tl.to(er, { y: CY - 260, duration: S(Wd / 4), yoyo: true, repeat: 3, ease: 'sine.inOut' }, S(at));
      tl.set(er, { opacity: 0 }, S(at + Wd)); tl.set(to.inner, { attr: { 'clip-path': 'none' } }, S(at + Wd));
      sfx('erase', at, { dur: Wd }); hide(from, at + Wd);
      return at + Wd;
    },
    // an object falls out of frame and the camera whips down after it (vertical motion blur)
    whipDown(from, to, t, { drop = null } = {}) {
      t = align(t, 0.3); const at = t;
      if (drop) { tl.to(drop, { y: -50, rotation: -12, duration: S(0.12), ease: 'power2.out' }, S(at)); tl.to(drop, { y: 700, rotation: 25, duration: S(0.35), ease: 'power2.in' }, S(at + 0.12)); }
      show(to, at + 0.3);
      tl.set([from.outer, to.outer], { attr: { filter: 'url(#vblur)' } }, S(at + 0.3));
      tl.fromTo('#vblurS', { attr: { stdDeviation: '0 0' } }, { attr: { stdDeviation: '0 50' }, duration: S(0.2), ease: 'power2.in', yoyo: true, repeat: 1, immediateRender: false }, S(at + 0.3));
      tl.fromTo(from.inner, { y: 0 }, { y: -Hh, duration: S(0.4), ease: 'power3.inOut', immediateRender: false }, S(at + 0.3));
      tl.fromTo(to.inner, { y: Hh }, { y: 0, duration: S(0.4), ease: 'power3.inOut' }, S(at + 0.3));
      tl.set([from.outer, to.outer], { attr: { filter: 'none' } }, S(at + 0.7));
      sfx('whoosh_down', at + 0.25); hide(from, at + 0.7);
      return at + 0.7;
    },
    // a shape from the current scene (bar, card, button) swells to become the next background
    expand(from, to, t, { x, y, w, h, color }) {
      t = align(t, 0.45); const at = t;
      const rect = el('rect', { x, y, width: w, height: h, fill: color }, to.bg);
      to.bg.insertBefore(rect, to.bg.firstChild);
      show(to, at);
      const kids = [...to.bg.children].filter(n => n !== rect);
      gsap.set(kids, { opacity: 0 });
      tl.fromTo(rect, { attr: { x, y, width: w, height: h } }, { attr: { x: -60, y: -60, width: W + 120, height: Hh + 120 }, duration: S(0.45), ease: 'expo.inOut' }, S(at));
      tl.to(kids, { opacity: 1, duration: S(0.3) }, S(at + 0.4));
      if (to.bg._rays) tl.fromTo(to.bg._rays, { rotation: 0 }, { rotation: 40, svgOrigin: `${CX} ${CY}`, duration: S(8), ease: 'none', immediateRender: false }, S(at + 0.4));
      sfx('swell', at - 0.2); hide(from, at + 0.45);
      return at + 0.45;
    },
    // screen shakes, then a sheet of paper slides up over it
    slideUp(from, to, t) {
      t = align(t, 0.2); const at = t;
      tl.to(from.inner, { x: 14, duration: S(0.03), yoyo: true, repeat: 5, ease: 'none' }, S(at + 0.18));
      sfx('boom', at + 0.18);
      show(to, at + 0.3);
      const sl = { y: Hh + 180, r: 9 }, t0 = S(at + 0.3), t1 = S(at + 0.8);
      tl.to(sl, { y: 0, r: 0, duration: S(0.5), ease: 'power3.out' }, t0);
      updaters.push(T => { if (T < t0) return; to.inner.setAttribute('transform', T >= t1 ? '' : `rotate(${sl.r.toFixed(3)} ${CX} ${Hh}) translate(0 ${sl.y.toFixed(2)})`); });
      sfx('paper', at + 0.3); hide(from, at + 0.8);
      return at + 0.8;
    },
    // an ink circle bursts out of a point
    iris(from, to, t, { x, y }) {
      t = align(t, 0.55); const at = t;
      const cp = el('clipPath', { id: 'iris' + to.i, clipPathUnits: 'userSpaceOnUse' }, defs);
      const c = el('circle', { cx: x, cy: y, r: 0 }, cp);
      to.inner.setAttribute('clip-path', `url(#iris${to.i})`);
      show(to, at);
      tl.fromTo(c, { attr: { r: 0 } }, { attr: { r: Math.hypot(W, Hh) }, duration: S(0.55), ease: 'power3.in' }, S(at));
      tl.set(to.inner, { attr: { 'clip-path': 'none' } }, S(at + 0.55));
      sfx('splash', at); hide(from, at + 0.55);
      return at + 0.55;
    },
    // something (a speech bubble) balloons and bursts; the next scene drops in with a bounce
    burstDrop(from, to, t, { burst = null } = {}) {
      t = align(t, 0.25); const at = t;
      if (burst) { tl.to(burst, { scale: 1.2, duration: S(0.2), ease: 'power2.out', transformOrigin: '50% 50%' }, S(at)); tl.to(burst, { scale: 0, opacity: 0, duration: S(0.1), ease: 'power2.in' }, S(at + 0.2)); }
      sfx('burst', at + 0.22);
      show(to, at + 0.25);
      tl.fromTo(to.inner, { y: -Hh - 30 }, { y: 0, duration: S(0.6), ease: 'bounce.out' }, S(at + 0.25));
      sfx('thud', at + 0.5); sfx('thud', at + 0.7, { gain: 0.45 });
      hide(from, at + 0.85);
      return at + 0.85;
    },
    // the whole frame flips like a card; the next scene is on the back
    flip(from, to, t) {
      t = align(t, 0.22); const at = t;
      const f = { a: 1, b: 0, on: 0 }, end = S(at + 0.5);
      const M = k => `translate(${CX} ${CY}) scale(${Math.max(k, 0.0001)} ${0.94 + 0.06 * k}) translate(${-CX} ${-CY})`;
      updaters.push(T => { if (f.on) { from.inner.setAttribute('transform', M(f.a)); to.inner.setAttribute('transform', M(f.b)); } else if (T >= end) to.inner.setAttribute('transform', ''); });
      tl.set(f, { on: 1 }, S(at));
      tl.to(f, { a: 0, duration: S(0.22), ease: 'power2.in' }, S(at));
      sfx('flip', at);
      hide(from, at + 0.22); show(to, at + 0.22);
      tl.to(f, { b: 1, duration: S(0.28), ease: 'power2.out' }, S(at + 0.22));
      tl.set(f, { on: 0 }, S(at + 0.5));
      return at + 0.5;
    },
    // classroom sliding boards: the next board slides in from the side on its rail, pushing the old one out
    boardSlide(from, to, t, { dir = 1 } = {}) {
      t = align(t, 0.55); const at = t, D = 0.7, t0 = S(at), t1 = S(at + D);
      const k = { u: 0 };
      tl.to(k, { u: 1, duration: S(D), ease: 'power3.inOut' }, t0);
      show(to, at);
      updaters.push(T => {
        if (T < t0 || T > t1 + 0.05) { if (T > t1) { from.inner.removeAttribute('transform'); to.inner.removeAttribute('transform'); } return; }
        const off = k.u * W * dir;
        from.inner.setAttribute('transform', `translate(${(-off).toFixed(1)} 0)`);
        to.inner.setAttribute('transform', `translate(${(W * dir - off).toFixed(1)} 0)`);
      });
      sfx('whoosh', at); sfx('thud', at + D - 0.05, { gain: 0.5 }); hide(from, at + D);
      return at + D;
    },
    // warm white flash
    flash(from, to, t) {
      t = align(t, 0.25); const at = t, fl = document.getElementById('flash');
      tl.to(fl, { opacity: 1, duration: S(0.25), ease: 'power2.in' }, S(at));
      sfx('riser', at - 0.5, { dur: 0.75 });
      hide(from, at + 0.25); show(to, at + 0.25);
      tl.to(fl, { opacity: 0, duration: S(0.4), ease: 'power2.out' }, S(at + 0.28));
      sfx('shimmer', at + 0.22);
      return at + 0.4;
    },
  };

  /* ---------- finale: every scene flies into one storyboard mosaic ---------- */
  function finale(t, { resets = [], cta = null } = {}) {
    t = align(t, 0.0); const at = t;
    const n = SC.length, cols = n > 9 ? 4 : n > 4 ? 3 : 2, rows = Math.ceil(n / cols);
    const s = Math.min((W - (cols + 1) * 14) / cols / W, (Hh * 0.74 - (rows + 1) * 16) / rows / Hh);
    const cw = W * s, ch = Hh * s, gx = (W - cols * cw) / (cols + 1), top = 90;
    const slot = i => { const r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), x0 = (W - (inRow * cw + (inRow - 1) * gx)) / 2;
      return { x: x0 + (i % cols) * (cw + gx), y: top + r * (ch + 16) }; };
    tl.to('#finaleBg', { opacity: 1, duration: S(0.2) }, S(at));
    tl.set('#screenClipR', { attr: { rx: 70 } }, S(at));
    const last = n - 1;
    const px = SC.map((sc, i) => { const p = slot(i);
      return i === last ? { x: 0, y: 0, s: 1, r: 0, o: 1, tx: p.x, ty: p.y } : { x: p.x + (i % 2 ? 320 : -320), y: p.y + 1000, s, r: (i % 2 ? 14 : -14), o: 0, tx: p.x, ty: p.y }; });
    updaters.push(() => SC.forEach((sc, i) => {
      if (!FIN.on) { sc.outer.removeAttribute('transform'); sc.outer.removeAttribute('opacity'); return; }
      const q = px[i];
      sc.outer.setAttribute('transform', `translate(${q.x} ${q.y}) rotate(${q.r} ${CX * q.s} ${CY * q.s}) scale(${q.s})`);
      sc.outer.setAttribute('opacity', q.o);
      sc.inner.setAttribute('transform', ''); sc.inner.setAttribute('opacity', 1); sc.inner.setAttribute('clip-path', 'none');
      sc.outer.removeAttribute('filter');
    }));
    tl.set(FIN, { on: 1 }, S(at));
    SC.forEach((sc, i) => {
      const q = px[i];
      if (i === last) tl.to(q, { x: q.tx, y: q.ty, s, duration: S(1.1), ease: 'power3.inOut' }, S(at));
      else { show(sc, at); tl.to(q, { x: q.tx, y: q.ty, r: 0, o: 1, duration: S(0.8), ease: 'back.out(1.4)' }, S(at + 0.5 + i * 0.09)); }
      tl.to(sc.border, { opacity: 1, duration: S(0.3) }, S(at + 0.4));
    });
    resets.forEach(([target, vars]) => tl.set(target, vars, S(at)));   // undo transition leftovers (dropped props, popped bubbles)
    sfx('whoosh', at); for (let i = 0; i < n - 1; i++) sfx('card', at + 0.5 + i * 0.09, { gain: 0.5 });
    const layer = el('g', {}, screenL);
    if (cta) cta(layer, at);
    return at + 6.2;
  }

  /* ---------- the hand (or tool) follows whichever stroke is being drawn ---------- */
  // between strokes it lifts and travels; with nothing to draw soon it leaves frame to the lower right
  const TRAVEL = 0.8, ENTER = 0.3;
  const offFrame = q => ({ x: q.x + Hh * 0.33, y: q.y + Hh * 0.55 });
  const ease2 = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  function toolState(tt) {
    let cur = null;
    for (const st of strokes) if (st.tool && tt >= st.start && tt < st.start + st.dur) cur = st;
    if (cur) { const p = cur.point(tt); return { st: cur, x: p.x, y: p.y, lift: p.lift || 0 }; }
    let prev = null, next = null;
    for (const st of strokes) {
      if (!st.tool) continue;
      const e = st.start + st.dur;
      if (e <= tt && (!prev || e > prev.start + prev.dur)) prev = st;
      if (st.start > tt && (!next || st.start < next.start)) next = st;
    }
    const pe = prev && prev.start + prev.dur;
    if (prev && next && next.tool === prev.tool && next.start - pe < TRAVEL) {
      const u = (tt - pe) / (next.start - pe), A = prev.point(pe - 1e-4), B = next.point(next.start), e = ease2(u);
      return { st: next, x: A.x + (B.x - A.x) * e, y: A.y + (B.y - A.y) * e, lift: Math.sin(Math.PI * u) };
    }
    if (prev && tt - pe < ENTER) { const A = prev.point(pe - 1e-4), O = offFrame(A), e = ease2((tt - pe) / ENTER); return { st: prev, x: A.x + (O.x - A.x) * e, y: A.y + (O.y - A.y) * e, lift: 1 }; }
    if (next && next.start - tt < ENTER) { const B = next.point(next.start), O = offFrame(B), e = ease2(1 - (next.start - tt) / ENTER); return { st: next, x: O.x + (B.x - O.x) * e, y: O.y + (B.y - O.y) * e, lift: 1 }; }
    return null;
  }
  function placeTools(tt) {
    for (const k in toolEls) toolEls[k].setAttribute('visibility', 'hidden');
    const s = toolState(tt);
    if (!s) return;
    const te = toolEls[s.st.tool] || toolEls.marker;
    if (s.st.tool === 'marker' && s.st.color) te.querySelectorAll('.tip').forEach(n => n.setAttribute('fill', s.st.color));
    if (HAND) {
      // the wrist pivots a little as the hand moves across the board; lifting raises it off the surface
      const rot = HAND.angle + (s.x / W - 0.5) * -10 + Math.sin(tt * 9) * 0.8 * (1 - s.lift);
      const sc = HAND.scale * (1 + 0.035 * s.lift);
      te.setAttribute('transform', `translate(${(s.x + s.lift * 8).toFixed(1)},${(s.y - s.lift * 14).toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${sc.toFixed(4)})`);
    } else te.setAttribute('transform', `translate(${s.x.toFixed(1)},${s.y.toFixed(1)})`);
    te.setAttribute('visibility', 'visible');
  }

  /* ---------- narration: word cues + karaoke captions ---------- */
  const norm = w => String(w).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ%$]/g, '');
  const seg = id => { const g = VO?.scenes?.[id]; if (!g) { console.warn('no narration for scene', id); return { start: 0, end: 0, words: [] }; } return g; };
  // cue('s3', 'interés') → second when that word starts (n = which occurrence; end: true → when it ends). Also cue('s3', 4) by index.
  function cue(id, word, { n = 1, end = false } = {}) {
    const g = seg(id), ws = g.words || [];
    let hit = null;
    if (typeof word === 'number') hit = ws[Math.max(0, Math.min(ws.length - 1, word))];
    else {
      const q = String(word).split(/\s+/).map(norm).filter(Boolean); let c = 0;
      for (let i = 0; i <= ws.length - q.length && !hit; i++) if (q.every((qq, j) => norm(ws[i + j].w).startsWith(qq)) && ++c === n) hit = end ? ws[i + q.length - 1] : ws[i];
    }
    if (!hit) { console.warn(`cue: "${word}" not found in ${id}`); return g.start; }
    return end ? hit.e : hit.s;
  }
  function captions() {
    const C = cfg.captions === undefined ? 'karaoke' : cfg.captions;
    if (!VO || !C) return;
    const o = Object.assign({ y: W < Hh ? Hh * 0.82 : Hh * 0.87, size: W < Hh ? 64 : 52, color: '#FFFFFF', hi: PAL.hi, stroke: '#1B1512', maxChars: W < Hh ? 22 : 38, font: 'Kalam' }, typeof C === 'object' ? C : {});
    const layer = document.getElementById('captions'), chunks = [];
    for (const id of VO.order || Object.keys(VO.scenes)) {
      let cur = [];
      const flush = () => { if (cur.length) chunks.push(cur); cur = []; };
      for (const w of VO.scenes[id].words || []) {
        const len = cur.reduce((s, x) => s + x.w.length + 1, 0);
        if (cur.length && (len + w.w.length > o.maxChars || w.s - cur[cur.length - 1].e > 0.4)) flush();
        cur.push(w);
        if (/[.!?;:,]$/.test(w.w) && len > o.maxChars * 0.45) flush();
      }
      flush();
    }
    let prevE = -1;
    const els = chunks.map((ch, i) => {
      const t = el('text', { x: CX, y: o.y, 'text-anchor': 'middle', 'font-size': o.size, 'font-family': o.font, 'font-weight': 700, fill: o.color, stroke: o.stroke, 'stroke-width': o.size * 0.16, 'paint-order': 'stroke', 'stroke-linejoin': 'round', visibility: 'hidden' }, layer);
      const spans = ch.map((w, j) => { const sp = el('tspan', {}, t); sp.textContent = (j ? ' ' : '') + w.w; return sp; });
      const nextS = chunks[i + 1] ? chunks[i + 1][0].s : Infinity;
      const c = { t, spans, ch, s: Math.max(ch[0].s - 0.05, prevE), e: Math.min(ch[ch.length - 1].e + 0.5, nextS - 0.06) };
      prevE = c.e;
      return c;
    });
    if (o.style === 'simple') o.hi = o.color;
    updaters.push(T => els.forEach(c => {
      const on = T >= c.s && T < c.e;
      c.t.setAttribute('visibility', on ? 'visible' : 'hidden');
      if (on) c.spans.forEach((sp, j) => sp.setAttribute('fill', T >= c.ch[j].s && T < (c.ch[j + 1]?.s ?? c.ch[j].e + 0.3) ? o.hi : o.color));
    }));
  }

  const V = {
    W, Hh, CX, CY, PAL, INK, H, S, tl, BEAT, MODE, defs, screen: screenL,
    el, P, done, draw, T, write, ink, erase, roughen, VO, cue, seg,
    inkWidth: (text, { size = 80, font, bold = false } = {}) => inkWidth(text, size, font, bold),   // width in px before placing
    // keep content inside SAFE (phone UI covers the edges; karaoke captions own the band below SAFE.bottom)
    SAFE: { top: W < Hh ? 250 : Math.round(Hh * 0.09), bottom: VO && cfg.captions !== false ? Math.round((W < Hh ? Hh * 0.82 : Hh * 0.87) - (W < Hh ? 90 : 70)) : Hh - 270, left: 60, right: W - 60 }, pop, popIn, type, comic, stamp, stampFx, wobble, specks, mover, jump, bubble, image, sfx, align,
    face, emote, arms, wave, blink, wink, hop, wiggle, take,
    mascot, drawMascot, popMascot, person, drawPerson, popPerson,
    newScene, show, hide, camZ, BG, TR, finale, addHatch,
    setTool: name => { state.tool = name; },
    onFrame: fn => updaters.push(fn),
  };
  const end = await build(V);
  captions();
  tl.to({}, { duration: 0.01 }, S(end ?? 0));

  function renderAt(tt) { tl.seek(tt, true); updaters.forEach(f => f(tt)); placeTools(tt); }
  window.VW = W; window.VH = Hh;
  window.DURATION = tl.duration();
  window.SFX = SFX; window.HITS = HITS;
  window.renderAt = renderAt;
  window.READY = true;
  if (!params.has('render')) {
    document.body.classList.add('preview');
    const fitK = () => document.documentElement.style.setProperty('--k', Math.min(innerWidth / W, innerHeight / Hh) * 0.96);
    fitK(); addEventListener('resize', fitK);
    const t0 = performance.now();
    gsap.ticker.add(() => renderAt(((performance.now() - t0) / 1000) % window.DURATION));
  } else renderAt(0);
};
})();
