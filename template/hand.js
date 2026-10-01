/* video-pizarra · hand.js
 * Realistic drawing hand (right hand) holding a tool. The tool tip sits at (0,0); the arm leaves frame
 * towards the lower right. Returns an SVG string for a <g>. Used by engine.js (placeTools).
 *   HAND_SVG({ tool: 'marker'|'chalk'|'pencil'|'brush'|'eraser'|'quill', skin, sleeve, cuff, ink })
 */
(function () {
  const shade = (hex, k) => {           // k < 0 darker, k > 0 lighter
    const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return '#' + c.map(v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k).toString(16).padStart(2, '0')).join('');
  };

  // tools drawn in the hand's local frame: tip at (0,0), axis pointing +Y (towards the hand)
  const TOOLS = {
    marker: ink => `
      <path class="tip" d="M-5,2 L5,2 L11,26 L-11,26 Z" fill="${ink}"/>
      <rect x="-13" y="24" width="26" height="22" rx="3" fill="#3b3b3b"/>
      <rect x="-17" y="44" width="34" height="210" rx="8" fill="#F7F6F2" stroke="#2a2a2a" stroke-width="2.5"/>
      <rect x="-17" y="44" width="9" height="210" rx="4" fill="#ffffff" opacity=".9"/>
      <rect x="9" y="44" width="8" height="210" fill="#000" opacity=".08"/>
      <rect class="tip" x="-17" y="120" width="34" height="40" fill="${ink}" opacity=".9"/>`,
    chalk: () => `
      <path d="M-11,6 Q0,-4 11,6 L13,150 L-13,150 Z" fill="#F7F4EC" stroke="#CFC8B8" stroke-width="2"/>
      <path d="M-11,6 Q0,-4 11,6 L11,14 Q0,6 -11,14 Z" fill="#E6E0D2"/>
      <rect x="5" y="10" width="7" height="140" fill="#000" opacity=".06"/>`,
    pencil: () => `
      <path d="M0,0 L-4,12 L4,12 Z" fill="#333"/><path d="M-4,12 L-14,44 L14,44 L4,12 Z" fill="#EBCB9B"/>
      <rect x="-14" y="44" width="28" height="260" fill="#F4C430"/><rect x="-14" y="44" width="9" height="260" fill="#FFDA5E"/>
      <rect x="6" y="44" width="8" height="260" fill="#D9A514"/>`,
    brush: () => `
      <path d="M0,0 C-10,14 -12,36 -10,56 L10,56 C12,36 10,14 0,0 Z" fill="#1c1c1c"/>
      <rect x="-12" y="54" width="24" height="40" rx="3" fill="#C9CDD2" stroke="#8d9299" stroke-width="2"/>
      <path d="M-12,92 L-8,330 Q0,340 8,330 L12,92 Z" fill="#B5462E"/>`,
    quill: () => `
      <path d="M0,0 L-5,28 L5,28 Z" fill="#2b2118"/><path d="M0,28 L0,320" stroke="#CDBB98" stroke-width="5" stroke-linecap="round"/>`,
    eraser: () => `
      <g transform="rotate(90) translate(0,-6)">
        <rect x="-95" y="-6" width="190" height="34" rx="6" fill="#EDE8DE" stroke="#BDB5A6" stroke-width="2"/>
        <rect x="-95" y="26" width="190" height="66" rx="12" fill="#7C5A3C"/><rect x="-95" y="26" width="190" height="18" rx="8" fill="#9A7350"/>
      </g>`,
  };

  window.HAND_SVG = function ({ tool = 'marker', skin = '#EFC4A0', sleeve = '#3E5C8A', cuff = null, ink = '#2A1F1C' } = {}) {
    const sk = skin, skD = shade(skin, -0.16), skL = shade(skin, 0.28), line = shade(skin, -0.42), nail = shade(skin, 0.45);
    const slD = shade(sleeve, -0.25), cf = cuff || shade(sleeve, 0.12);
    const toolSvg = (TOOLS[tool] || TOOLS.marker)(ink);
    const er = tool === 'eraser';
    // the eraser is held flat in a loose fist; everything else in a writing grip
    const grip = er ? `
      <path d="M-58,40 C-70,70 -64,128 -40,160 L70,170 C92,140 96,70 78,40 C60,18 -30,14 -58,40 Z" fill="${sk}" stroke="${line}" stroke-width="2.5"/>
      <path d="M-50,52 C-20,40 30,40 70,52" fill="none" stroke="${line}" stroke-width="2" opacity=".6"/>
      <path d="M-46,86 C-16,74 30,76 74,88" fill="none" stroke="${line}" stroke-width="2" opacity=".5"/>
      <path d="M-56,96 C-80,110 -84,150 -60,166 C-40,178 -20,170 -18,156" fill="${skL}" stroke="${line}" stroke-width="2.5"/>`
      : `
      <!-- curled ring + pinky fingers tucked under the palm -->
      <path d="M30,150 C58,136 80,150 82,176 C84,198 64,210 44,204 Z" fill="${skD}" stroke="${line}" stroke-width="2.5"/>
      <path d="M40,186 C64,176 84,192 82,214 C80,232 60,238 44,230 Z" fill="${skD}" stroke="${line}" stroke-width="2.5"/>
      <!-- middle finger supports the tool from below -->
      <path d="M14,96 C34,92 52,104 54,124 L58,160 C46,170 26,168 18,156 L8,120 Z" fill="${sk}" stroke="${line}" stroke-width="2.5"/>
      <path d="M16,104 C24,100 32,102 36,108" fill="none" stroke="${line}" stroke-width="2" opacity=".55"/>`;
    const thumbIndex = er ? '' : `
      <!-- thumb on the near side of the tool -->
      <path d="M-74,206 C-80,170 -64,128 -40,104 C-30,94 -18,88 -12,92 C-2,98 -4,112 -12,122 C-26,140 -34,168 -30,198 Z" fill="${skL}" stroke="${line}" stroke-width="2.5"/>
      <path d="M-14,94 C-6,96 -4,106 -9,114 L-20,110 C-20,102 -18,96 -14,94 Z" fill="${nail}" stroke="${line}" stroke-width="1.6"/>
      <path d="M-50,150 C-44,146 -38,146 -34,150" fill="none" stroke="${line}" stroke-width="1.8" opacity=".55"/>
      <!-- index finger on top of the tool, bending at two knuckles -->
      <path d="M-6,62 C4,54 18,56 22,66 L30,104 C40,120 58,138 72,150 C80,160 72,176 58,174 C38,170 18,150 8,128 L-4,82 C-8,74 -10,68 -6,62 Z" fill="${sk}" stroke="${line}" stroke-width="2.5"/>
      <path d="M-4,64 C2,58 12,58 16,64 L14,78 C8,80 0,78 -3,74 Z" fill="${nail}" stroke="${line}" stroke-width="1.6"/>
      <path d="M8,104 C14,100 22,100 28,104" fill="none" stroke="${line}" stroke-width="1.8" opacity=".55"/>
      <path d="M34,134 C40,130 48,132 52,138" fill="none" stroke="${line}" stroke-width="1.8" opacity=".5"/>`;
    return `
    <defs>
      <linearGradient id="hg-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${skL}"/><stop offset=".55" stop-color="${sk}"/><stop offset="1" stop-color="${skD}"/></linearGradient>
      <linearGradient id="hg-sleeve" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(sleeve, 0.15)}"/><stop offset=".6" stop-color="${sleeve}"/><stop offset="1" stop-color="${slD}"/></linearGradient>
    </defs>
    <g class="hand-body">
      <!-- forearm + sleeve run off-frame -->
      <path d="M-70,240 C-80,420 -90,700 -110,1400 L190,1400 C170,760 150,430 120,230 Z" fill="url(#hg-skin)" stroke="${line}" stroke-width="2.5"/>
      <path d="M-96,470 C-104,800 -120,1100 -140,1500 L220,1500 C200,1100 180,800 160,460 C110,430 -40,436 -96,470 Z" fill="url(#hg-sleeve)"/>
      <path d="M-98,462 C-40,430 110,426 162,452 L166,500 C110,476 -40,480 -100,512 Z" fill="${cf}"/>
      <path d="M-20,620 C-24,800 -30,1000 -40,1400" stroke="${slD}" stroke-width="4" fill="none" opacity=".5"/>
      ${er ? '' : toolSvg}
      ${grip}
      <!-- back of the hand -->
      <path d="M-72,190 C-82,150 -60,112 -24,108 C10,104 40,120 66,148 C92,176 104,214 100,258 C96,292 60,316 10,318 C-40,320 -70,290 -72,250 Z" fill="url(#hg-skin)" stroke="${line}" stroke-width="2.5"/>
      <path d="M56,170 C66,186 70,204 66,222" fill="none" stroke="${line}" stroke-width="2" opacity=".45"/>
      <path d="M-30,250 C-6,262 26,262 54,250" fill="none" stroke="${skD}" stroke-width="6" opacity=".5"/>
      ${er ? toolSvg : ''}
      ${thumbIndex}
    </g>`;
  };
})();
