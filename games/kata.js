/*
 * KATA - a typing game for TYPEMAXX.
 *
 * You run the rooftops of a night city by typing the words written on them.
 * Every action is typing: finishing a line leaps you to the next roof, a
 * perfect word cuts down the ronin guarding it, the word that flashes up as a
 * shuriken flies in makes you slide under it, and gold words charge the kata
 * you cast by name.
 *
 * Contract (TYPEMAXX engine): export an object with enter(), exit() and
 * draw(ctx, W, H, seconds, now, input). input.pull() returns
 * { chars, keys, back, enter } for the frame. Everything is drawn in a
 * 320x240 logical space, scaled to whatever surface arrives.
 *
 * Art: assets/flow/atlas.png + manifest.json, loaded relative to this module.
 */

const BASE = new URL('../assets/flow/', import.meta.url).href;
const LW = 320, LH = 240;

// ---------------------------------------------------------------- tuning
const ADV = 7;              // monospaced cell on the roof boards
const PADX = 12;            // board inset from the roof's left edge
const GAP = 34;             // the jump between roofs
const LANES = [112, 140, 168];   // ridge y for high, mid, low
const VOID_Y = 190;
const MAXC = 20;            // characters per roof

const COL = {
  ink: '#E8F4EC', dim: '#4F7A62', hot: '#8DF0B4', gold: '#F4B93D', red: '#E0484E',
  lamp: '#F2A63C', pale: '#FFF3D0', mute: '#5E8270', shade: '#2E3F37', steel: '#A8AEC0',
  verm: '#C8342E', sky: '#9FB4D8',
};

const DIFFS = [
  { name: 'CALM', temper: 'forgiving', speed: 20, lead: 150, hearts: 5, window: 2.1, hz: ['duck', 'drop', 'block', 'guard'] },
  { name: 'STEADY', temper: 'even', speed: 30, lead: 122, hearts: 4, window: 1.6, hz: ['duck', 'slide', 'block', 'parry'] },
  { name: 'SHARP', temper: 'unforgiving', speed: 42, lead: 100, hearts: 3, window: 1.15, hz: ['slide', 'evade', 'parry', 'deflect'] },
];

const RANKS = [
  { name: 'GENIN', tile: 'hanko_genin' },
  { name: 'CHUNIN', tile: 'hanko_chunin' },
  { name: 'JONIN', tile: 'hanko_jonin' },
  { name: 'KAGE', tile: 'hanko_kage' },
];

const KATAS = [
  { name: 'TIGER', clip: 'kata_tiger', cost: 4, rank: 0, desc: 'cut down every foe in sight' },
  { name: 'STILL', clip: 'kata_still', cost: 2, rank: 0, desc: 'stop the city for four breaths' },
  { name: 'SHADOW', clip: 'kata_shadow', cost: 3, rank: 1, desc: 'no blade or arrow can touch you' },
  { name: 'CRANE', clip: 'kata_crane', cost: 3, rank: 2, desc: 'soar far ahead of the pursuit' },
];

const TIERS = [0, 40, 100, 180];
const TIER_NAMES = ['', 'SWIFT', 'FIERCE', 'FLOW'];

const PASSAGES = [
  "Rain moves across the tiles in long grey sheets. Below, the lanterns of the night market sway on their cords, and the smell of charcoal rises between the houses. A cat watches from a gutter. Somewhere a bell is struck once, and the sound travels all the way to the river before it fades.",
  "The old carpenter planes a cedar beam until the shavings curl like paper. He does not hurry. Each stroke is the same length as the last, and the wood grows smooth under his hands. His apprentice watches, counting the strokes, and slowly learns that patience is also a kind of speed.",
  "At the edge of the city the road climbs into pine forest. Travellers stop at the tea house to rest their feet and trade news of the passes. The mountains are already white. By the time the moon rises, the last porter has gone, and only the wind is left to walk the path.",
  "Snow settles on the temple roof without a sound. The monks sweep the courtyard at dawn, and by noon it is covered again. Nobody complains. They simply sweep it once more, because the work is not about the snow. It is about the sweeping, and the quiet mind it leaves behind.",
  "The river carries boats of rice and salt down to the harbour. Children run along the stone bank, racing the fastest barge until they are out of breath. The boatmen laugh and call out to them. At the bridge the water turns gold in the evening light, and the whole city seems to slow down.",
];

// fork roads: the two first letters always differ, so one keystroke chooses
const FORKS = [
  ['Over the temple roof', 'Under the bell tower'],
  ['High along the wall', 'Low past the stables'],
  ['Across the pagoda', 'Through the tea house'],
  ['Up the watchtower', 'Down the wet gutters'],
  ['Straight over lanes', 'Beneath the old bridge'],
];

const ROOF_TYPES = ['town', 'inn', 'temple', 'town', 'shrine', 'inn', 'tower'];

// ---------------------------------------------------------------- state
const S = {
  loading: false, ready: false, error: null,
  M: null, img: null, tint: {}, fontY0: 0,
  mode: 'title', t: 0, lastSec: null, dt: 0,
  sel: 0, diff: 1, rankBest: 0,
  R: null, modeT: 0,
  shake: 0, flash: null,
  ctx: null,
};

function loadRank() {
  try { S.rankBest = Math.max(0, Math.min(3, parseInt(localStorage.getItem('typemaxx.kata.rank') || '0', 10) || 0)); }
  catch (e) { S.rankBest = 0; }
}
function saveRank(r) {
  if (r <= S.rankBest) return false;
  S.rankBest = r;
  try { localStorage.setItem('typemaxx.kata.rank', String(r)); } catch (e) {}
  return true;
}

async function loadAssets() {
  if (S.loading || S.ready) return;
  S.loading = true;
  try {
    const M = await (await fetch(BASE + 'manifest.json')).json();
    const img = new Image();
    img.crossOrigin = 'anonymous';           // must precede src, or WebGL upload taints
    await new Promise((resolve, reject) => {
      // onload rather than decode(): decode() can stall in a background tab
      img.onload = resolve;
      img.onerror = () => reject(new Error('atlas.png failed to load'));
      img.src = BASE + 'atlas.png';
    });
    S.M = M; S.img = img;
    buildTints();
    S.ready = true;
  } catch (e) {
    S.error = String(e && e.message || e);
  }
  S.loading = false;
}

// Tint only the band of the atlas that holds the fonts, once per colour.
function buildTints() {
  let y0 = 1e9, y1 = 0;
  for (const face of Object.values(S.M.fonts)) {
    for (const g of Object.values(face.glyphs)) {
      y0 = Math.min(y0, g[1]); y1 = Math.max(y1, g[1] + g[3]);
    }
  }
  S.fontY0 = y0;
  const w = S.img.width, h = y1 - y0;
  for (const [name, css] of Object.entries(COL)) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(S.img, 0, y0, w, h, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = css;
    g.fillRect(0, 0, w, h);
    S.tint[name] = c;
  }
}

// ---------------------------------------------------------------- utils
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash(i, k) {
  let x = (i * 374761393 + k * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, u) => a + (b - a) * u;
function wrapX(x, p) { return ((x % p) + p) % p; }

function wrapText(text, maxc) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur.length) cur = w;
    else if (cur.length + 1 + w.length <= maxc) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur.length) lines.push(cur);
  // every line but the last ends with the space that joins it to the next,
  // so the player types the passage exactly as written
  return lines.map((l, i) => i < lines.length - 1 ? l + ' ' : l);
}

// ---------------------------------------------------------------- drawing
function ctx() { return S.ctx; }

function put(name, i, x, y, alpha) {
  const c = S.M.clips[name];
  if (!c || !c.frames.length) return;
  const n = c.frames.length;
  const f = c.frames[((Math.floor(i) % n) + n) % n];
  const g = ctx();
  if (alpha != null && alpha < 1) { g.globalAlpha = alpha; }
  g.drawImage(S.img, f[0], f[1], f[2], f[3],
    Math.round(x - c.anchor[0]), Math.round(y - c.anchor[1]), f[2], f[3]);
  if (alpha != null && alpha < 1) g.globalAlpha = 1;
}
function putScaled(name, i, cx, cy, s) {
  const c = S.M.clips[name];
  if (!c) return;
  const n = c.frames.length;
  const f = c.frames[clamp(Math.floor(i), 0, n - 1)];
  ctx().drawImage(S.img, f[0], f[1], f[2], f[3],
    Math.round(cx - f[2] * s / 2), Math.round(cy - f[3] * s / 2), f[2] * s, f[3] * s);
}
function frameOf(name, sec) {
  const c = S.M.clips[name];
  return c ? Math.floor(sec * 1000 / c.ms) : 0;
}
function tile(name) { return S.M.tiles[name]; }
function blit(name, x, y, w, h) {
  const t = tile(name); if (!t) return;
  const cw = w == null ? t[2] : w, ch = h == null ? t[3] : h;
  if (cw <= 0 || ch <= 0) return;
  ctx().drawImage(S.img, t[0], t[1], cw, ch, Math.round(x), Math.round(y), cw, ch);
}
function blitScaled(name, x, y, s) {
  const t = tile(name); if (!t) return;
  ctx().drawImage(S.img, t[0], t[1], t[2], t[3], Math.round(x), Math.round(y), t[2] * s, t[3] * s);
}
function blitFlip(name, x, y) {
  const t = tile(name); if (!t) return;
  const g = ctx();
  g.save();
  g.translate(Math.round(x) + t[2], Math.round(y));
  g.scale(-1, 1);
  g.drawImage(S.img, t[0], t[1], t[2], t[3], 0, 0, t[2], t[3]);
  g.restore();
}
function tileAcross(name, x, y, w) {
  const t = tile(name); if (!t) return;
  for (let cx = 0; cx < w; cx += t[2]) blit(name, x + cx, y, Math.min(t[2], w - cx), t[3]);
}
function rect(x, y, w, h, css) {
  const g = ctx();
  g.fillStyle = css;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function frame1(x, y, w, h, css) {
  rect(x, y, w, 1, css); rect(x, y + h - 1, w, 1, css);
  rect(x, y, 1, h, css); rect(x + w - 1, y, 1, h, css);
}

// ---- text, from the pre-tinted font band
function face(name) { return S.M.fonts[name]; }
function textW(fname, str, s) {
  s = s || 1;
  const G = face(fname).glyphs;
  let w = 0;
  for (let i = 0; i < str.length; i++) { const g = G[str[i]]; if (g) w += g[4] * s; }
  return w;
}
function text(fname, str, x, y, colour, s) {
  s = s || 1;
  const sheet = S.tint[colour] || S.tint.ink;
  const G = face(fname).glyphs;
  let pen = Math.round(x);
  const top = Math.round(y), g2 = ctx();
  for (let i = 0; i < str.length; i++) {
    const g = G[str[i]];
    if (!g) { pen += 3 * s; continue; }
    if (g[2] && g[3]) {
      g2.drawImage(sheet, g[0], g[1] - S.fontY0, g[2], g[3],
        pen + g[5] * s, top + g[6] * s, g[2] * s, g[3] * s);
    }
    pen += g[4] * s;
  }
  return pen;
}
function textC(fname, str, cx, y, colour, s) {
  return text(fname, str, Math.round(cx - textW(fname, str, s) / 2), y, colour, s);
}
function textR(fname, str, rx, y, colour, s) {
  return text(fname, str, Math.round(rx - textW(fname, str, s)), y, colour, s);
}
// one roof-board glyph centred in its monospaced cell
function cell(ch, x, y, colour) {
  const G = face('small').glyphs, g = G[ch];
  if (!g) return;
  text('small', ch, x + Math.floor((ADV - g[4]) / 2), y, colour);
}

// ---------------------------------------------------------------- world
function drawSky(scroll, tt) {
  blit('sky', 0, 0);
  rect(0, 120, LW, VOID_Y - 120, '#1C263E');
  const g = ctx();
  g.fillStyle = COL.dim;
  for (let i = 0; i < 36; i++) {
    const sx = (i * 97 + 13) % 320, sy = (i * 61 + 7) % 100;
    if (((tt * 1.1 + i) | 0) % 5) g.fillRect(sx, sy, 1, 1);
  }
  const ss = tt % 9;
  if (ss < 0.5) {
    const p = ss / 0.5, x0 = 50 + p * 150, y0 = 18 + p * 26;
    g.fillStyle = COL.ink;
    for (let k = 0; k < 6; k++) g.fillRect(Math.round(x0 - k * 2), Math.round(y0 - k * 0.5), 2, 1);
  }
  blit('moon', 244, 20);
  for (let i = 0; i < 4; i++) {
    blit('cloud_long', wrapX(i * 110 - scroll * 0.05 - tt * 4, 400) - 40, 18 + i * 19);
    blit('cloud_short', wrapX(i * 90 + 50 - scroll * 0.07 - tt * 6, 400) - 40, 30 + i * 17);
  }
  for (let i = 0; i < 3; i++) {
    const a = tt / 1.4 + i * 2.1;
    blit(((tt * 4.5 | 0) + i) % 2 ? 'crow_a' : 'crow_b', 256 + Math.cos(a) * 26, 34 + Math.sin(a) * 8);
  }
  const cx0 = 380 - (tt % 40) * 18;
  for (let i = 0; i < 5; i++) {
    const dx = Math.abs(i - 2) * 14, dy = Math.abs(i - 2) * 6;
    blit(((tt * 3.8 | 0) + i) % 2 ? 'crane_a' : 'crane_b', cx0 + dx, 44 + dy);
  }
  for (let i = 0; i < 5; i++) {
    const lx = wrapX(i * 67 + 20 - scroll * 0.15 + Math.sin(tt * 1.1 + i) * 6, 340) - 10;
    const ly = wrapX(i * 43 - tt * 12, 150) - 10;
    blit(i % 2 ? 'sky_lantern' : 'sky_lantern_dim', lx, ly);
  }
  strip('ridge_far', 90, scroll, 0.10);
  const midOff = -wrapX(scroll * 0.22, 320);
  for (let k = 0; k <= 1; k++) {
    blit('pagoda_b', midOff + k * 320 + 60, 97);
    blit('pagoda_a', midOff + k * 320 + 224, 119);
  }
  strip('ridge_mid', 106, scroll, 0.22);
  const nearOff = -wrapX(scroll * 0.36, 320);
  for (let k = 0; k <= 1; k++) blit('torii', nearOff + k * 320 + 150, 144);
  strip('ridge_near', 120, scroll, 0.36);
  rect(0, VOID_Y, LW, LH - VOID_Y, '#000');
}
function strip(name, y, scroll, factor) {
  const t = tile(name); if (!t) return;
  const off = -wrapX(scroll * factor, 320);
  for (let k = 0; k <= 1; k++) blit(name, off + k * 320, y);
}
function drawRain(scroll, tt, n) {
  for (let i = 0; i < n; i++) {
    blit('rain', wrapX(i * 53 - tt * 50 - scroll * 0.3, 340) - 10, wrapX(i * 37 + tt * 160, 190) - 10);
  }
}

// a roof with its building, drawn at screen x. Returns the kanban board rect.
function drawRoof(x, w, ry, type, seed, sink) {
  ry = ry + (sink || 0);
  const wallTop = ry + 17;
  if (type === 'bridge') {
    tileAcross('railing', x, ry - 8, w);
    tileAcross('planks', x, ry - 2, w);
    rect(x + 6, ry + 4, 3, LH - ry, '#2A1C12');
    rect(x + w - 9, ry + 4, 3, LH - ry, '#2A1C12');
    rect(x + 8, ry + 8, w - 16, 14, '#0A0D12');
    frame1(x + 8, ry + 8, w - 16, 14, COL.shade);
    return { x: x + 8, y: ry + 8, w: w - 16, h: 14, textY: ry + 11 };
  }
  rect(x + 2, wallTop, w - 4, LH - wallTop,
    type === 'temple' ? '#0A1418' : type === 'inn' ? '#16100E' : '#0D1220');
  for (let k = 0, wx = x + 14; wx < x + w - 22; wx += 30, k++) {
    blit(hash(seed, 10 + k) < 0.65 ? 'shoji_lit' : 'shoji_dark', wx, wallTop + 24);
  }
  // the kanban signboard: the passage is written here
  const kx = x + 6, kw = w - 12;
  tileAcross('kanban_mid', kx + 5, wallTop + 3, kw - 10);
  blit('kanban_end', kx, wallTop + 3);
  blitFlip('kanban_end', kx + kw - 5, wallTop + 3);
  tileAcross('eave_shadow', x, ry + 14, w);
  const facet = type === 'temple' ? 'face_copper' : type === 'inn' ? 'face_terracotta'
    : type === 'shrine' ? 'face_thatch' : 'face_kawara';
  tileAcross(facet, x, ry, w);
  if (type === 'temple') {
    tileAcross('ridge_ornate', x - 4, ry - 5, w + 8);
    blit('eave_curl', x - 10, ry + 8);
    blitFlip('eave_curl', x + w - 2, ry + 8);
    blit('shachihoko', x - 6, ry - 13);
    blitFlip('shachihoko', x + w - 2, ry - 13);
  } else {
    tileAcross('ridge_plain', x - 2, ry - 4, w + 4);
    blit('eave_straight', x - 5, ry + 11);
    blitFlip('eave_straight', x + w - 1, ry + 11);
  }
  if (type === 'tower') blit('yagura', x + w - 34, ry - 26);
  if (type === 'shrine') blit('shrine', x + w - 38, ry - 28);
  if (type === 'inn') blit('lantern', x + w - 12, wallTop + 20);
  return { x: kx, y: wallTop + 3, w: kw, h: 14, textY: wallTop + 6 };
}

// ---------------------------------------------------------------- run build
function makeOpt(textStr, x, lane, rnd, allowBridge) {
  const len = textStr.length;
  let type = ROOF_TYPES[Math.floor(rnd() * ROOF_TYPES.length)];
  if (allowBridge && lane === 2 && rnd() < 0.35) type = 'bridge';
  return {
    text: textStr, len, x, w: len * ADV + PADX * 2, lane, type,
    seed: Math.floor(rnd() * 1e6),
    marks: new Uint8Array(len),
    guard: null, hazard: null, power: null, lantern: null,
    crumble: null, archerDead: null, route: null,
  };
}

function wordsOf(str) {
  const out = [];
  const re = /[A-Za-z']+/g;
  let m;
  while ((m = re.exec(str))) out.push({ start: m.index, end: m.index + m[0].length, w: m[0] });
  return out;
}

function addGuard(opt) {
  let best = null;
  for (const wd of wordsOf(opt.text)) {
    if (wd.start < 6) continue;                 // never the first word: he needs runway
    if (wd.end > opt.len - 2) continue;         // and room behind him to stand
    if (wd.w.length < 4) continue;
    if (!best || wd.w.length > best.w.length) best = wd;
  }
  if (best) opt.guard = { start: best.start, end: best.end, state: 'waiting', corpseT: null };
  return !!best;
}

function addPower(opt) {
  for (const wd of wordsOf(opt.text)) {
    if (wd.w.length < 6) continue;
    if (opt.guard && wd.end > opt.guard.start - 1 && wd.start < opt.guard.end + 1) continue;
    if (opt.hazard && wd.start <= opt.hazard.at && wd.end >= opt.hazard.at) continue;
    opt.power = { start: wd.start, end: wd.end, state: 'pending' };
    return true;
  }
  return false;
}

function makeHazard(kind, opt, rnd, D) {
  const pool = kind === 'arrow' ? D.hz.slice(2) : D.hz.slice(0, 2);
  const word = pool[Math.floor(rnd() * pool.length)];
  return {
    kind, word, at: clamp(Math.floor(opt.len * 0.5), 5, opt.len - 4),
    state: 'pending', t: 0, T: D.window + word.length * 0.14, typed: '',
    result: null, doneT: 0, badT: -9,
  };
}

function newRun() {
  const D = DIFFS[S.diff];
  const rnd = mulberry32((Math.random() * 1e9) | 0);
  const passage = PASSAGES[Math.floor(rnd() * PASSAGES.length)];
  const lines = wrapText(passage, MAXC);
  const forkOrder = FORKS.slice().sort(() => rnd() - 0.5);
  const slots = [];
  let x = 0, lane = 1, forks = 0;

  for (let li = 0; li < lines.length; li++) {
    if (li > 0) {
      const r = rnd();
      if (r < 0.3) lane = Math.max(0, lane - 1);
      else if (r < 0.6) lane = Math.min(2, lane + 1);
    }
    const opt = makeOpt(lines[li], x, lane, rnd, true);
    if (li >= 2) {
      if (li % 3 === 2) addGuard(opt);
      else if (li % 3 === 1 && li >= 4) opt.hazard = makeHazard(li % 2 ? 'arrow' : 'shuriken', opt, rnd, D);
      if (!opt.guard) addPower(opt);
      else if (li % 2 === 0) addPower(opt);
    }
    if (opt.guard || opt.hazard) { if (opt.type === 'bridge') opt.type = 'town'; }
    slots.push({ kind: 'line', opts: [opt] });
    x = opt.x + opt.w + GAP;

    // a fork after every fourth line, never near the end
    if (li >= 2 && li % 4 === 2 && li < lines.length - 2) {
      const pair = forkOrder[forks++ % forkOrder.length];
      const hi = makeOpt(pair[0] + ' ', x, 0, rnd, false);
      const lo = makeOpt(pair[1] + ' ', x, 2, rnd, false);
      hi.route = 'high'; lo.route = 'low';
      if (hi.type === 'bridge') hi.type = 'temple';
      addGuard(hi);
      hi.lantern = { i: 3, taken: false };
      lo.hazard = makeHazard('shuriken', lo, rnd, D);
      lo.hazard.at = clamp(Math.floor(lo.len * 0.45), 5, lo.len - 4);
      slots.push({ kind: 'fork', opts: [hi, lo] });
      x = Math.max(hi.x + hi.w, lo.x + lo.w) + GAP;
      lane = 1;
    }
  }

  const o0 = slots[0].opts[0];
  const startX = o0.x + PADX + ADV / 2;
  S.R = {
    D, slots, si: 0, choice: 0, ci: 0, fromOpt: null, pending: false,
    drawX: startX, targetX: startX, cam: startX - D.lead, jump: null,
    hearts: D.hearts, maxHearts: D.hearts + 1,
    segs: 0, combo: 0, maxCombo: 0, tier: 0,
    score: 0, typed: 0, errors: 0, start: 0, end: 0,
    hazard: null, enc: null, anim: null, stillT: 0, shadowT: 0, hitstop: 0,
    menu: null, slam: null, fx: [], dead: null, won: null,
    kills: 0, parries: 0, dodges: 0, powers: 0, lanterns: 0,
    trail: [], lastLandT: -9,
  };
}

// ---------------------------------------------------------------- run helpers
function curOpt() {
  const R = S.R;
  if (R.pending) return null;
  const slot = R.slots[R.si];
  return slot ? slot.opts[R.choice] : null;
}
function charX(opt, i) { return opt.x + PADX + i * ADV; }
function footY(opt) { return LANES[opt.lane] - 2; }

function addFx(clip, x, y, opts) {
  S.R.fx.push(Object.assign({ clip, x, y, t0: S.t, scale: 1 }, opts || {}));
}
function embers(x, y, n, colour, up) {
  for (let i = 0; i < n; i++) {
    const a = hash(Math.floor(S.t * 1000) + i, 7) * Math.PI * 2;
    const sp = 12 + hash(i, Math.floor(S.t * 100)) * 34;
    S.R.fx.push({
      dot: true, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (up || 20),
      life: 0.5 + hash(i, 3) * 0.6, t0: S.t, col: colour,
    });
  }
}
function flash(css, dur) { S.flash = { css, t0: S.t, dur }; }
function shake(amount) { S.shake = Math.max(S.shake, amount); }

function setTier() {
  const R = S.R;
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (R.combo >= TIERS[i]) t = i;
  if (t > R.tier) { embers(R.drawX, footY(curOpt() || R.fromOpt) - 18, 14, COL.gold, 30); }
  R.tier = t;
}
function mistake() {
  const R = S.R;
  R.errors++;
  const drop = Math.max(0, R.tier - 1);
  R.combo = Math.min(R.combo, TIERS[drop]);
  setTier();
}

function die(cause) {
  const R = S.R;
  if (R.dead || R.won) return;
  R.dead = { cause, t0: S.t };
  R.end = S.t;
  R.anim = null;
  shake(3); flash('rgba(200,30,40,0.55)', 0.35);
  const o = curOpt() || R.fromOpt;
  addFx('blood_spray', R.drawX - R.cam + 2, footY(o) - 18, { screen: true });
}

function win() {
  const R = S.R;
  R.won = { t0: S.t };
  R.end = S.t;
  R.score += R.hearts * 300;
  embers(R.drawX, footY(R.fromOpt) - 20, 30, COL.gold, 40);
  flash('rgba(255,243,208,0.35)', 0.4);
}

function startJump(toOpt) {
  const R = S.R;
  const from = R.fromOpt;
  const x1 = charX(toOpt, 0) + ADV / 2;
  const up = LANES[from.lane] - LANES[toOpt.lane];
  R.jump = {
    t: 0, dur: 0.42 + Math.abs(up) * 0.002,
    x0: R.drawX, x1, y0: footY(from), y1: footY(toOpt), h: 24 + Math.max(0, up) * 0.6,
  };
}

function completeLine() {
  const R = S.R;
  const opt = curOpt();
  R.fromOpt = opt;
  R.si++;
  R.ci = 0;
  if (R.si >= R.slots.length) { R.si = R.slots.length - 1; R.pending = false; win(); return; }
  const next = R.slots[R.si];
  if (next.kind === 'fork') {
    R.pending = true;
    R.choice = -1;
    R.targetX = charX(opt, opt.len) - 2;
  } else {
    R.pending = false;
    R.choice = 0;
    startJump(next.opts[0]);
  }
}

function chooseFork(ch) {
  const R = S.R;
  const slot = R.slots[R.si];
  const c = ch.toLowerCase();
  const idx = slot.opts.findIndex(o => o.text[0].toLowerCase() === c);
  if (idx < 0) { mistake(); flash('rgba(224,72,78,0.18)', 0.12); return false; }
  R.pending = false;
  R.choice = idx;
  slot.opts[1 - idx].crumble = S.t;
  startJump(slot.opts[idx]);
  return true;
}

function typeChar(ch) {
  const R = S.R;
  if (R.pending) { if (chooseFork(ch)) typeChar(ch); return; }
  const opt = curOpt();
  if (!opt || R.ci >= opt.len) return;
  const i = R.ci;
  const want = opt.text[i];
  const ok = ch.toLowerCase() === want.toLowerCase();
  const g = opt.guard;
  const inGuard = g && g.state === 'waiting' && i >= g.start && i < g.end;

  R.typed++;
  if (ok) {
    opt.marks[i] = 1;
    R.combo++;
    R.maxCombo = Math.max(R.maxCombo, R.combo);
    R.score += 10 * (1 + R.tier);
    setTier();
  } else {
    opt.marks[i] = 2;
    mistake();
  }

  if (inGuard && !ok && R.shadowT <= 0) {
    R.ci++;
    startEncounter(opt, g, false);
    return;
  }

  R.ci++;

  if (g && g.state === 'waiting' && R.ci === g.end) {
    startEncounter(opt, g, true);
  }
  const p = opt.power;
  if (p && p.state === 'pending' && R.ci === p.end) {
    let clean = true;
    for (let k = p.start; k < p.end; k++) if (opt.marks[k] !== 1) clean = false;
    p.state = clean ? 'won' : 'lost';
    if (clean) {
      R.segs = Math.min(4, R.segs + 1);
      R.powers++;
      R.score += 100;
      embers(charX(opt, (p.start + p.end) / 2), footY(opt) + 22, 12, COL.gold, 26);
    }
  }
  const hz = opt.hazard;
  if (hz && hz.state === 'pending' && R.ci >= hz.at && !R.enc) startHazard(opt, hz);
  if (R.ci >= opt.len && !R.enc) completeLine();
}

function backspace() {
  const R = S.R;
  if (R.pending) return;
  const opt = curOpt();
  if (!opt || R.ci <= 0) return;
  const g = opt.guard;
  if (g && g.state === 'waiting' && R.ci - 1 < g.start && R.ci > g.start) return;
  R.ci--;
  opt.marks[R.ci] = 0;
}

// ---------------------------------------------------------------- encounters
function startEncounter(opt, g, win) {
  const R = S.R;
  g.state = 'fighting';
  R.enc = { opt, g, win, t0: S.t };
  R.hitstop = 0.12;
  if (win) {
    R.anim = { clip: 'ninja_strike', t0: S.t, dur: 0.32 };
  }
}

function updateEncounter() {
  const R = S.R;
  const e = R.enc;
  if (!e) return;
  const u = S.t - e.t0;
  const rx = charX(e.opt, e.g.end) + 16;
  const fy = footY(e.opt);
  if (e.win) {
    if (!e.slashed && u >= 0.1) {
      e.slashed = true;
      addFx('slash', rx - 8, fy - 20);
      addFx('blood_spray', rx + 2, fy - 18);
      shake(2);
    }
    if (u >= 0.55) {
      e.g.state = 'dead';
      e.g.corpseT = e.t0 + 0.12;
      R.kills++;
      R.score += 500 * (1 + R.tier * 0.5);
      R.enc = null;
      if (R.ci >= e.opt.len) completeLine();
      else {
        const hz = e.opt.hazard;
        if (hz && hz.state === 'pending' && R.ci >= hz.at) startHazard(e.opt, hz);
      }
    }
  } else {
    if (!e.cut && u >= 0.16) {
      e.cut = true;
      addFx('slash', R.drawX + 10, fy - 20);
      die('CUT DOWN');
      e.g.state = 'waiting';
    }
    if (u >= 0.6) R.enc = null;
  }
}

// ---------------------------------------------------------------- hazards
function startHazard(opt, hz) {
  const R = S.R;
  hz.state = 'active';
  hz.t = 0;
  hz.typed = '';
  hz.opt = opt;
  R.hazard = hz;
  const fy = footY(opt);
  if (hz.kind === 'arrow') {
    hz.sx = charX(opt, opt.len) + 20;
    hz.sy = fy - 22;
  } else {
    hz.sx = R.cam + LW + 16;
    hz.sy = fy - 20;
  }
}

function hazardChar(ch) {
  const R = S.R;
  const hz = R.hazard;
  const need = hz.word[hz.typed.length];
  if (ch.toLowerCase() === need) {
    hz.typed += need;
    R.combo++;
    setTier();
    if (hz.typed === hz.word) resolveHazard(true);
  } else {
    hz.typed = '';
    hz.badT = S.t;
    mistake();
  }
}

function resolveHazard(res) {
  const R = S.R;
  const hz = R.hazard;
  if (!hz) return;
  hz.state = 'done';
  hz.result = res;
  hz.doneT = S.t;
  hz.endU = clamp(hz.t / hz.T, 0, 1);
  R.hazard = null;
  const o = hz.opt;
  const nx = R.drawX, fy = footY(o);
  if (res === true) {
    if (hz.kind === 'shuriken') {
      R.anim = { clip: 'ninja_slide', t0: S.t, dur: 0.5 };
      addFx('dust', nx - R.cam, fy + 1, { screen: true });
    } else {
      R.anim = { clip: 'ninja_block', t0: S.t, dur: 0.34 };
      addFx('spark', nx + 10, fy - 22);
    }
    R.dodges++;
    R.score += 150;
  } else if (res === 'parry') {
    R.anim = { clip: 'ninja_block', t0: S.t, dur: 0.34 };
    addFx('spark', nx + 10, fy - 22);
    R.parries++;
    R.segs = Math.min(4, R.segs + 1);
    R.score += 400;
    flash('rgba(244,185,61,0.25)', 0.18);
  } else if (res === 'cancel') {
    if (hz.kind === 'arrow') o.archerDead = S.t;
  } else {
    if (R.shadowT > 0) { embers(nx, fy - 18, 8, COL.sky, 10); return; }
    R.hearts--;
    R.anim = { clip: 'ninja_stumble', t0: S.t, dur: 0.42 };
    shake(3);
    flash('rgba(224,40,50,0.35)', 0.22);
    addFx('blood_spray', nx + 2, fy - 18);
    if (R.hearts <= 0) die('STRUCK DOWN');
  }
}

function updateHazard(hdt) {
  const R = S.R;
  const hz = R.hazard;
  if (!hz) return;
  hz.t += hdt;
  if (hz.t >= hz.T) resolveHazard(false);
}

// ---------------------------------------------------------------- kata
function openMenu() {
  const R = S.R;
  if (R.dead || R.won || R.enc || R.slam) return;
  R.menu = { buf: '', t0: S.t, deniedT: -9 };
}
function menuChar(ch) {
  const R = S.R;
  const m = R.menu;
  const buf = (m.buf + ch).toUpperCase();
  const avail = KATAS.filter(k => k.rank <= S.rankBest);
  const hits = avail.filter(k => k.name.startsWith(buf));
  if (!hits.length) { m.buf = ''; m.deniedT = S.t; return; }
  m.buf = buf;
  const exact = hits.find(k => k.name === buf);
  if (exact) cast(exact);
}
function cast(k) {
  const R = S.R;
  if (R.segs < k.cost) { R.menu.buf = ''; R.menu.deniedT = S.t; return; }
  R.segs -= k.cost;
  R.menu = null;
  R.slam = { k, t0: S.t };
  R.hitstop = 0.3;
  shake(4);
  flash('rgba(255,243,208,0.8)', 0.12);
  if (k.name === 'TIGER') tiger();
  if (k.name === 'STILL') R.stillT = 4;
  if (k.name === 'SHADOW') R.shadowT = 6;
  if (k.name === 'CRANE') { R.cam -= 110; R.craneT = S.t; }
}
function tiger() {
  const R = S.R;
  const lo = R.cam - 20, hi = R.cam + LW + 40;
  for (const slot of R.slots) {
    for (const o of slot.opts) {
      if (o.x > hi || o.x + o.w < lo || o.crumble) continue;
      const g = o.guard;
      if (g && (g.state === 'waiting' || g.state === 'fighting')) {
        g.state = 'dead';
        g.corpseT = S.t + 0.3;
        const rx = charX(o, g.end) + 16;
        addFx('slash', rx - 8, footY(o) - 20, { delay: 0.3 });
        addFx('blood_spray', rx + 2, footY(o) - 18, { delay: 0.34 });
        R.kills++;
        R.score += 300;
      }
      if (o.hazard && o.hazard.kind === 'arrow' && !o.archerDead &&
          (o.hazard.state !== 'done' || o.hazard.result !== 'parry')) {
        o.archerDead = S.t + 0.3;
        if (o.hazard.state === 'pending') o.hazard.state = 'done', o.hazard.result = 'cancel';
        R.kills++;
      }
    }
  }
  if (R.hazard) resolveHazard('cancel');
  R.enc = null;
}

// ---------------------------------------------------------------- update
function updateRun(dt) {
  const R = S.R;
  const D = R.D;
  const slow = R.menu ? 0.12 : R.dead ? 0.35 : 1;
  R.hitstop = Math.max(0, R.hitstop - dt);
  const frozen = R.hitstop > 0;
  const wdt = frozen ? 0 : dt * slow;
  if (!R.menu) {
    R.stillT = Math.max(0, R.stillT - dt);
    R.shadowT = Math.max(0, R.shadowT - dt);
  }

  // camera: the pursuit
  if (!R.won && !R.dead && R.stillT <= 0) R.cam += D.speed * (1 + 0.08 * R.tier) * wdt;
  if (R.dead) R.cam += D.speed * 0.2 * wdt;

  // where the ninja wants to be
  const opt = curOpt();
  if (opt && !R.jump) {
    let tx = charX(opt, Math.min(R.ci, opt.len)) + ADV / 2;
    const g = opt.guard;
    if (g && g.state !== 'dead') tx = Math.min(tx, charX(opt, g.start) - 2);
    R.targetX = Math.min(tx, charX(opt, opt.len) - 2);
  }
  if (R.jump) {
    const j = R.jump;
    j.t += wdt;
    const u = clamp(j.t / j.dur, 0, 1);
    R.drawX = lerp(j.x0, j.x1, u);
    R.jumpY = lerp(j.y0, j.y1, u) - Math.sin(u * Math.PI) * j.h;
    if (u >= 1) {
      R.jump = null;
      R.drawX = j.x1;
      R.lastLandT = S.t;
      addFx('dust', j.x1, j.y1 + 1);
    }
  } else if (!R.won) {
    const k = 1 - Math.exp(-wdt * 16);
    R.drawX += (R.targetX - R.drawX) * k;
    if (Math.abs(R.targetX - R.drawX) < 0.4) R.drawX = R.targetX;
  }
  R.cam = Math.max(R.cam, R.drawX - 232);

  // afterimages for SHADOW and high flow
  if ((R.shadowT > 0 || R.tier >= 3) && !frozen) {
    R.trail.push({ x: R.drawX, t: S.t });
    while (R.trail.length && S.t - R.trail[0].t > 0.25) R.trail.shift();
  } else R.trail.length = 0;

  // the pursuit catches you
  const sx = R.drawX - R.cam;
  if (sx < 4 && !R.dead && !R.won) die('OVERRUN');

  // lanterns
  if (opt && opt.lantern && !opt.lantern.taken && !R.jump) {
    const lx = charX(opt, opt.lantern.i) + ADV / 2;
    if (R.drawX >= lx - 3) {
      opt.lantern.taken = true;
      R.hearts = Math.min(R.maxHearts, R.hearts + 1);
      R.lanterns++;
      R.score += 200;
      addFx('spark', lx, footY(opt) - 26);
      embers(lx, footY(opt) - 26, 16, COL.lamp, 20);
    }
  }

  updateEncounter();
  const hdt = R.menu ? 0 : (R.stillT > 0 ? 0 : wdt) * (R.tier >= 3 ? 0.7 : 1);
  updateHazard(hdt);

  // particles
  for (let i = R.fx.length - 1; i >= 0; i--) {
    const f = R.fx[i];
    if (f.dot) {
      const age = S.t - f.t0;
      if (age > f.life) { R.fx.splice(i, 1); continue; }
      f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 50 * dt;
    } else {
      const c = S.M.clips[f.clip];
      const dur = c ? c.frames.length * c.ms / 1000 : 0.3;
      if (S.t - f.t0 - (f.delay || 0) > dur + (f.hold || 0)) R.fx.splice(i, 1);
    }
  }

  if (R.slam && S.t - R.slam.t0 > 0.9) R.slam = null;

  // endings
  if (R.dead && S.t - R.dead.t0 > 1.7) goResults();
  if (R.won && S.t - R.won.t0 > 2.4) goResults();
}

function goResults() {
  const R = S.R;
  const mins = Math.max(0.05, (R.end - R.start) / 60);
  const correct = R.typed - R.errors;
  R.wpm = Math.round(Math.max(0, correct) / 5 / mins);
  R.acc = R.typed ? Math.round(100 * Math.max(0, correct) / R.typed) : 100;
  let rank = 0;
  if (R.won) {
    if (R.acc >= 97 && R.wpm >= 55) rank = 3;
    else if (R.acc >= 93 && R.wpm >= 38) rank = 2;
    else if (R.acc >= 85 && R.wpm >= 22) rank = 1;
  }
  R.rank = rank;
  R.prevBest = S.rankBest;
  R.newRank = R.won && saveRank(rank);
  setMode('results');
}

function setMode(m) { S.mode = m; S.modeT = S.t; }

// ---------------------------------------------------------------- input
function handleInput(k) {
  const keys = k.keys || [];
  const has = code => keys.indexOf(code) >= 0;
  const m = S.mode;

  if (m === 'title') {
    if (has('ArrowDown')) S.sel = (S.sel + 1) % 3;
    if (has('ArrowUp')) S.sel = (S.sel + 2) % 3;
    if (k.enter) {
      if (S.sel === 0) setMode('pace');
      else if (S.sel === 1) setMode('howto');
      else exitGame();
    }
    if (has('Escape')) exitGame();
    return;
  }
  if (m === 'pace') {
    if (has('ArrowLeft')) S.diff = Math.max(0, S.diff - 1);
    if (has('ArrowRight')) S.diff = Math.min(2, S.diff + 1);
    if (k.enter) { newRun(); setMode('count'); }
    if (has('Escape')) setMode('title');
    return;
  }
  if (m === 'howto') {
    if (k.enter || has('Escape')) setMode('title');
    return;
  }
  if (m === 'count') {
    if (has('Escape')) setMode('title');
    return;
  }
  if (m === 'results') {
    if (k.enter) { newRun(); setMode('count'); }
    if (has('Escape')) setMode('title');
    return;
  }
  if (m === 'play') {
    const R = S.R;
    if (has('Escape')) {
      if (R.menu) { R.menu = null; return; }
      setMode('title');
      return;
    }
    if (R.dead || R.won) return;
    if (R.menu) {
      if (k.enter) { R.menu = null; return; }
      for (const ch of k.chars || []) if (/[A-Za-z]/.test(ch)) menuChar(ch);
      return;
    }
    if (k.enter) { openMenu(); return; }
    if (R.enc || R.slam && S.t - R.slam.t0 < 0.3) return;
    if (R.hazard) {
      if (k.back && R.hazard.kind === 'arrow' && R.hazard.t / R.hazard.T >= 0.62) {
        resolveHazard('parry');
        return;
      }
      for (const ch of k.chars || []) { if (!R.hazard) break; hazardChar(ch); }
      return;
    }
    for (let b = 0; b < (k.back || 0); b++) backspace();
    for (const ch of k.chars || []) {
      if (R.dead || R.won || R.enc || R.hazard) break;
      typeChar(ch);
    }
  }
}

function exitGame() {
  if (typeof window !== 'undefined') {
    if (window.TYPEMAXX) window.TYPEMAXX.pixel = null;
    if (typeof window.TYPEMAXX_SETGAME === 'function') window.TYPEMAXX_SETGAME(null);
    else if (typeof window.TYPEMAXX_RESTORE_MENU === 'function') window.TYPEMAXX_RESTORE_MENU();
  }
}

// ---------------------------------------------------------------- screens
function drawTitle() {
  const tt = S.t;
  drawSky(tt * 14, tt);
  drawRain(tt * 14, tt, 18);
  // one long temple roof across the foreground for the duel
  drawRoof(-24, 368, 196, 'temple', 7);
  // the spar: face off, advance, strike and parry, leap back, reset
  const ft = tt % 2.9, NX = 104, EX = 196, FOOT = 191;
  let nClip, nF, nX = NX, nY = FOOT, eClip, eF;
  if (ft < 0.7) { nClip = 'ninja_idle'; nF = frameOf('ninja_idle', tt); eClip = 'enemy_idle'; eF = frameOf('enemy_idle', tt); }
  else if (ft < 1.15) { const p = (ft - 0.7) / 0.45; nClip = 'ninja_run'; nF = frameOf('ninja_run', tt); nX = lerp(NX, 162, p); eClip = 'enemy_idle'; eF = frameOf('enemy_idle', tt); }
  else if (ft < 1.6) { const s = (ft - 1.15) / 0.45; nClip = 'ninja_strike'; nF = Math.min(3, s * 5); nX = 162; eClip = 'enemy_wind'; eF = Math.min(1, s * 2); }
  else if (ft < 2.0) { const q = (ft - 1.6) / 0.4; nClip = 'ninja_jump'; nF = q * 6; nX = lerp(162, NX, q); nY = FOOT - Math.sin(q * Math.PI) * 18; eClip = 'enemy_strike'; eF = q * 2; }
  else { nClip = 'ninja_idle'; nF = frameOf('ninja_idle', tt); eClip = 'enemy_idle'; eF = frameOf('enemy_idle', tt); }
  put(eClip, eF, EX, FOOT);
  put(nClip, nF, nX, nY);
  if (ft >= 1.24 && ft < 1.52) put('slash', (ft - 1.24) / 0.28 * 3, 178, 172);

  const bob = Math.round(Math.sin(tt * 3.9) * 1.5);
  textC('large', 'KATA', 162, 16 + bob, 'verm', 3);
  textC('large', 'KATA', 160, 14 + bob, 'ink', 3);
  textC('small', 'Your eyes lead. Your hands follow.', 160, 66, 'mute');
  const items = ['START', 'HOW TO PLAY', 'BACK'];
  for (let i = 0; i < 3; i++) {
    const y = 90 + i * 18;
    const on = S.sel === i;
    text('large', items[i], 124, y, on ? 'gold' : 'dim');
    if (on && ((tt * 2.4) | 0) % 2 === 0) text('large', '>', 110, y, 'hot');
  }
}

function drawPace() {
  const tt = S.t;
  drawSky(tt * 10, tt);
  drawRoof(-24, 368, 206, 'town', 3);
  rect(0, 0, LW, LH, 'rgba(4,6,12,0.45)');
  textC('large', 'CHOOSE YOUR PACE', 160, 18, 'gold');
  for (let i = 0; i < 3; i++) {
    const D = DIFFS[i], on = S.diff === i;
    const x = 12 + i * 102, y = 50 - (on ? 3 + Math.round(Math.sin(tt * 3.9)) : 0), w = 92, h = 132;
    rect(x, y, w, h, on ? '#0C1220' : '#080B14');
    frame1(x, y, w, h, on ? COL.hot : COL.shade);
    textC('large', D.name, x + w / 2, y + 8, on ? 'ink' : 'dim');
    textC('small', D.temper, x + w / 2, y + 28, on ? 'hot' : 'shade');
    // the pace, shown not told: a light running along a track at this speed
    const tx = x + 10, tw = w - 20, ty = y + 46;
    frame1(tx, ty, tw, 5, COL.shade);
    const pos = wrapX(tt * D.speed * 1.4, tw - 4);
    rect(tx + 2 + pos, ty + 1, 2, 3, COL.gold);
    rect(tx + 1 + pos, ty, 4, 5, 'rgba(242,166,60,0.35)');
    // hearts
    const hw = D.hearts * 10 - 1;
    for (let k = 0; k < D.hearts; k++) blit(on ? 'kunai_full' : 'kunai_empty', x + w / 2 - hw / 2 + k * 10, y + 62);
    textC('small', 'window ' + D.window.toFixed(1) + 's', x + w / 2, y + 88, on ? 'mute' : 'shade');
    textC('small', 'pursuit ' + D.speed, x + w / 2, y + 100, on ? 'mute' : 'shade');
  }
  if (S.rankBest > 0) {
    blit(RANKS[S.rankBest].tile, 12, 200);
    text('small', 'best rank  ' + RANKS[S.rankBest].name, 48, 212, 'gold');
  }
}

function drawHowto() {
  const tt = S.t;
  drawSky(tt * 8, tt);
  drawRoof(-24, 368, 206, 'inn', 5);
  rect(0, 0, LW, LH, 'rgba(4,6,12,0.62)');
  textC('large', 'THE WAY OF KATA', 160, 10, 'gold');
  const L = [
    ['ink', 'Type the words on the rooftops to run.'],
    ['ink', 'Finish a line and you leap to the next roof.'],
    ['ink', 'The city pursues you. Fall behind and it ends.'],
    ['', ''],
    ['gold', 'A ronin guards one word. Type it perfectly.'],
    ['red', 'One wrong key inside his word and he cuts you.'],
    ['', ''],
    ['ink', 'Shuriken and arrows: type the word that appears.'],
    ['ink', 'Backspace just before an arrow lands to parry it.'],
    ['', ''],
    ['gold', 'Gold words charge your kata. Enter to cast one,'],
    ['gold', 'then type its name.'],
    ['ink', 'At a fork, type the first letter of your road.'],
  ];
  let y = 34;
  for (const [c, s] of L) { if (s) text('small', s, 14, y, c); y += c ? 11 : 5; }
  for (let i = 0; i < KATAS.length; i++) {
    const K = KATAS[i], locked = K.rank > S.rankBest;
    const x = 14 + i * 76;
    text('small', K.name, x, 198, locked ? 'shade' : 'gold');
    text('small', locked ? RANKS[K.rank].name : 'cost ' + K.cost, x, 208, locked ? 'shade' : 'mute');
  }
  // licence: the character art is CC-BY and must be credited where players see it
  textC('small', 'art after Clint Bellanger, CC-BY 3.0  -  type: Pixel Operator, Yuji Boku', 160, 226, 'shade');
}

function drawCount() {
  drawWorld(true);
  const u = S.t - S.modeT;
  const n = 3 - Math.floor(u / 0.7);
  if (n >= 1) {
    const p = (u % 0.7) / 0.7;
    textC('large', String(n), 160, 86 - Math.round(p * 4), p < 0.5 ? 'gold' : 'ink', 3);
  }
  if (u >= 2.1) {
    S.R.start = S.t;
    setMode('play');
  }
}

function drawResults() {
  drawWorld(true, true);
  const R = S.R, u = S.t - S.modeT;
  rect(0, 0, LW, LH, 'rgba(4,6,12,' + Math.min(0.78, u * 2).toFixed(2) + ')');
  if (u < 0.2) return;
  const head = R.won ? 'ROOFTOPS CLEARED' : R.dead ? R.dead.cause : 'RUN ENDED';
  textC('large', head, 160, 18, R.won ? 'hot' : 'red', 2);
  const rank = RANKS[R.rank];
  blitScaled(rank.tile, 24, 64, 2);
  textC('large', rank.name, 54, 130, 'gold');
  if (R.newRank) textC('small', 'new rank', 54, 148, 'hot');
  const rows = [
    ['WPM', String(R.wpm)], ['ACCURACY', R.acc + '%'], ['SCORE', String(Math.round(R.score))],
    ['BEST COMBO', String(R.maxCombo)], ['RONIN CUT', String(R.kills)],
    ['DODGED', String(R.dodges)], ['PARRIED', String(R.parries)], ['LANTERNS', String(R.lanterns)],
  ];
  for (let i = 0; i < rows.length; i++) {
    const y = 62 + i * 15;
    if (u < 0.3 + i * 0.07) break;
    text('small', rows[i][0], 116, y + 3, 'mute');
    textR('large', rows[i][1], 300, y, i < 3 ? 'ink' : 'dim');
  }
  if (R.won) {
    const unlocked = KATAS.filter(k => k.rank > R.prevBest && k.rank <= R.rank).map(k => k.name);
    const next = KATAS.find(k => k.rank > S.rankBest);
    if (R.newRank && unlocked.length) {
      textC('small', 'kata unlocked: ' + unlocked.join(', '), 160, 196, 'gold');
    } else if (next) {
      textC('small', 'reach ' + RANKS[next.rank].name + ' to learn ' + next.name, 160, 196, 'shade');
    }
  }
}

// ---------------------------------------------------------------- the run
function drawWorld(still, noHud) {
  const R = S.R;
  const tt = S.t;
  drawSky(R.cam, tt);
  drawRain(R.cam, tt, 22);

  const cam = R.cam;
  const cur = curOpt();

  // roofs, back branch first
  for (let si = 0; si < R.slots.length; si++) {
    const slot = R.slots[si];
    // the high road first: its building runs down behind the low road, which
    // must be drawn in front or the high wall covers it entirely
    for (let oi = 0; oi < slot.opts.length; oi++) {
      const o = slot.opts[oi];
      const x = Math.round(o.x - cam);
      if (x + o.w < -40 || x > LW + 40) continue;
      let sink = 0;
      if (o.crumble) {
        const u = tt - o.crumble;
        if (u > 1.4) continue;
        sink = u * u * 140;
      }
      const board = drawRoof(x, o.w, LANES[o.lane], o.type, o.seed, sink);
      drawBoardText(o, board, si, oi, cur, sink);
    }
  }

  // enemies, pickups, and fork signs
  for (let si = Math.max(0, R.si - 2); si < Math.min(R.slots.length, R.si + 4); si++) {
    const slot = R.slots[si];
    for (const o of slot.opts) {
      if (o.crumble) continue;
      const x0 = o.x - cam;
      if (x0 + o.w < -60 || x0 > LW + 60) continue;
      drawGuard(o);
      drawArcher(o);
      if (o.lantern && !o.lantern.taken) {
        const lx = charX(o, o.lantern.i) + ADV / 2 - cam;
        put('lantern_pick', frameOf('lantern_pick', tt), lx, footY(o) - 26 + Math.sin(tt * 3 + o.seed) * 2);
      }
    }
    if (slot.kind === 'fork' && si === R.si && R.pending) drawForkSigns(slot);
  }

  drawNinja();
  drawProjectile();

  // effects in world space
  for (const f of R.fx) {
    if (f.dot) {
      const age = tt - f.t0, a = 1 - age / f.life;
      rect(f.x - cam, f.y, 1, 1, a > 0.5 ? f.col : COL.shade);
      continue;
    }
    const age = tt - f.t0 - (f.delay || 0);
    if (age < 0) continue;
    const c = S.M.clips[f.clip];
    const i = Math.min(c.frames.length - 1, Math.floor(age * 1000 / c.ms));
    put(f.clip, i, f.screen ? f.x : f.x - cam, f.y);
  }

  // flow speed lines
  if (R.tier >= 1 && !R.dead && !R.won) {
    const nx = R.drawX - cam, o = cur || R.fromOpt;
    const fy = R.jump ? R.jumpY : footY(o);
    for (let i = 0; i < 4 + R.tier * 3; i++) {
      const lx = nx - 16 - wrapX(i * 23 + tt * 260, 90);
      const ly = fy - 6 - ((i * 7) % 26);
      rect(lx, ly, 6 + R.tier * 2, 1, R.tier >= 3 ? 'rgba(244,185,61,0.7)' : 'rgba(141,240,180,0.45)');
    }
  }
  if (R.stillT > 0) rect(0, 0, LW, LH, 'rgba(40,60,110,0.22)');

  if (!noHud) drawHud();
  if (!still) drawOverlays();
}

function drawBoardText(o, board, si, oi, cur, sink) {
  const R = S.R;
  const isCur = o === cur;
  const passed = si < R.si || (si === R.si && R.pending && !R.slots[si].opts.includes(o));
  const ty = board.textY;
  // the guard's recess and border, behind the letters
  const g = o.guard;
  if (isCur && g && g.state !== 'dead') {
    const px = charX(o, g.start) - R.cam - 2, pw = (g.end - g.start) * ADV + 4;
    rect(px, ty - 2, pw, 12, '#05070B');
    frame1(px, ty - 2, pw, 12, ((S.t * 4) | 0) % 2 ? COL.gold : COL.red);
  }
  for (let i = 0; i < o.len; i++) {
    const ch = o.text[i];
    if (ch === ' ') continue;
    const x = charX(o, i) - R.cam;
    if (x < -8 || x > LW + 8) continue;
    let c;
    const inGuard = g && g.state !== 'dead' && i >= g.start && i < g.end;
    const inPower = o.power && o.power.state === 'pending' && i >= o.power.start && i < o.power.end;
    if (isCur) {
      const m = o.marks[i];
      if (m === 1) c = inGuard ? 'pale' : inPower ? 'lamp' : 'dim';
      else if (m === 2) c = 'red';
      else c = inGuard ? 'gold' : inPower ? 'gold' : 'ink';
    } else if (passed || si < R.si) {
      c = 'shade';
    } else {
      c = inGuard ? 'lamp' : inPower ? 'lamp' : 'mute';
    }
    cell(ch, x, ty, c);
  }
  // the cursor
  if (isCur && R.ci < o.len && !R.won && !R.dead) {
    const cx = charX(o, R.ci) - R.cam;
    const on = ((S.t * 5) | 0) % 2 === 0 || S.t - R.lastLandT < 0.4;
    rect(cx, ty + 9, ADV - 1, 1, on ? COL.gold : COL.lamp);
  }
  // a power word that was typed cleanly glows for a moment
  if (o.power && o.power.state === 'won') {
    // nothing extra; the colour change carries it
  }
}

function drawForkSigns(slot) {
  const R = S.R;
  for (const o of slot.opts) {
    // the choice letter sits in the gap before the roof at its own ridge
    // height, so it never lands on the other road's signboard
    const x = Math.round(o.x - R.cam - 24), y = LANES[o.lane] - 14;
    const blink = ((S.t * 3) | 0) % 2;
    rect(x, y, 15, 15, '#05070B');
    frame1(x, y, 15, 15, blink ? COL.gold : COL.hot);
    textC('large', o.text[0].toUpperCase(), x + 8, y - 2, 'gold');
    // what waits on that road
    if (o.route === 'high') put('lantern_pick', frameOf('lantern_pick', S.t), x + 7, y - 9);
    else put('shuriken', frameOf('shuriken', S.t), x + 7, y - 8);
  }
}

function drawGuard(o) {
  const R = S.R;
  const g = o.guard;
  if (!g) return;
  const rx = charX(o, g.end) + 16 - R.cam;
  const fy = footY(o);
  if (g.state === 'dead') {
    const age = S.t - (g.corpseT || S.t);
    if (age < 0) { put('enemy_idle', 0, rx, fy); return; }
    const c = S.M.clips.enemy_die;
    const i = Math.min(c.frames.length - 1, Math.floor(age * 1000 / c.ms));
    if (i >= 3) put('blood_pool', Math.min(3, (age - 0.35) * 8), rx + 2, fy + 2);
    put('enemy_die', i, rx, fy);
    return;
  }
  const e = R.enc;
  if (e && e.g === g) {
    const u = S.t - e.t0;
    if (e.win) {
      const c = S.M.clips.enemy_die;
      put(u < 0.12 ? 'enemy_wind' : 'enemy_die', u < 0.12 ? 1 : Math.min(c.frames.length - 1, (u - 0.12) * 1000 / c.ms), rx, fy);
    } else {
      put(u < 0.12 ? 'enemy_wind' : 'enemy_strike', u < 0.12 ? u / 0.12 * 2 : Math.min(1, (u - 0.12) * 10), rx, fy);
    }
    return;
  }
  const isCur = o === curOpt();
  const near = isCur && R.ci >= g.start - 3;
  put(near ? 'enemy_wind' : 'enemy_idle', near ? 0 : frameOf('enemy_idle', S.t + o.seed), rx, fy);
  // the tether from his word to his feet
  if (isCur) {
    const wx = charX(o, g.start) - R.cam + ((g.end - g.start) * ADV) / 2;
    const top = fy + 2, bot = LANES[o.lane] + 20;
    for (let y = top; y < bot; y += 2) rect(wx, y, 1, 1, 'rgba(244,185,61,0.55)');
  }
}

function drawArcher(o) {
  const R = S.R;
  const hz = o.hazard;
  if (!hz || hz.kind !== 'arrow') return;
  const ax = charX(o, o.len) + 20 - R.cam;
  const fy = footY(o);
  if (o.archerDead) {
    const age = S.t - o.archerDead;
    if (age < 0) { put('archer_idle', 0, ax, fy); return; }
    const c = S.M.clips.archer_die;
    const i = Math.min(c.frames.length - 1, Math.floor(age * 1000 / c.ms));
    if (i >= 3) put('blood_pool', Math.min(3, (age - 0.35) * 8), ax, fy + 2);
    put('archer_die', i, ax, fy);
    return;
  }
  if (R.hazard === hz) {
    put('archer_draw', Math.min(2, (hz.t / hz.T) * 3.2), ax, fy);
  } else if (hz.state === 'done' && S.t - hz.doneT < 0.2) {
    put('archer_loose', 0, ax, fy);
  } else {
    put('archer_idle', frameOf('archer_idle', S.t + o.seed), ax, fy);
  }
}

function drawProjectile() {
  const R = S.R;
  const hz = R.hazard;
  const nx = R.drawX - R.cam;
  const opt = curOpt();
  // live
  if (hz && opt) {
    const u = clamp(hz.t / hz.T, 0, 1);
    const tx = nx + 4, ty = footY(hz.opt) - 20;
    if (hz.kind === 'shuriken') {
      const sx = hz.sx - R.cam;
      put('shuriken', frameOf('shuriken', S.t), lerp(sx, tx, u), lerp(hz.sy, ty, u) - Math.sin(u * Math.PI) * 6);
    } else {
      const sx = hz.sx - R.cam;
      blitFlip('arrow', lerp(sx - 14, tx, u), lerp(hz.sy, ty, u) - 1);
    }
  }
  // the moment after
  for (let si = Math.max(0, R.si - 1); si <= Math.min(R.slots.length - 1, R.si + 1); si++) {
    for (const o of R.slots[si].opts) {
      const h = o.hazard;
      if (!h || h.state !== 'done' || !h.result || h.result === 'cancel') continue;
      const age = S.t - h.doneT;
      if (age > 0.6) continue;
      const tx = nx + 4, ty = footY(o) - 20;
      if (h.kind === 'shuriken' && h.result === true) {
        put('shuriken', frameOf('shuriken', S.t), tx - age * 420, ty - 6);
      } else if (h.kind === 'arrow' && h.result === true) {
        blit('arrow', tx + 6 - age * 30, ty + age * age * 220);
      } else if (h.kind === 'arrow' && h.result === 'parry') {
        const ax = charX(o, o.len) + 20 - R.cam;
        const u = clamp(age / 0.22, 0, 1);
        if (u < 1) blit('arrow', lerp(tx, ax - 6, u), ty - 1);
        else if (!o.archerDead) { o.archerDead = S.t; R.kills++; addFx('blood_spray', ax + R.cam, footY(o) - 20); }
      }
    }
  }
}

function drawNinja() {
  const R = S.R;
  const o = curOpt() || R.fromOpt;
  let x = R.drawX - R.cam;
  let fy = R.jump ? R.jumpY : footY(o);
  let clip, fi;
  if (R.dead) {
    const age = S.t - R.dead.t0;
    const c = S.M.clips.ninja_die;
    clip = 'ninja_die';
    fi = Math.min(c.frames.length - 1, Math.floor(age * 1000 / c.ms));
    if (fi >= 3) put('blood_pool', Math.min(3, (age - 0.4) * 8), x, footY(o) + 2);
    if (R.dead.cause === 'OVERRUN') fy = footY(o) + age * age * 120;
  } else if (R.won) {
    clip = 'ninja_victory'; fi = frameOf('ninja_victory', S.t);
  } else if (R.enc && R.enc.win) {
    clip = 'ninja_strike'; fi = Math.min(3, (S.t - R.enc.t0) / 0.3 * 4);
  } else if (R.anim && S.t - R.anim.t0 < R.anim.dur) {
    const c = S.M.clips[R.anim.clip];
    clip = R.anim.clip;
    fi = Math.min(c.frames.length - 1, (S.t - R.anim.t0) / R.anim.dur * c.frames.length);
  } else if (R.slam && S.t - R.slam.t0 < 0.4) {
    clip = 'ninja_strike'; fi = 3;
  } else if (R.jump) {
    clip = 'ninja_jump'; fi = Math.min(5, R.jump.t / R.jump.dur * 6);
  } else if (R.pending || Math.abs(R.targetX - R.drawX) < 0.6 && S.t - R.lastLandT > 0.35 && R.hitstop <= 0) {
    // standing at an edge or held at a gate: idle, not running on the spot
    clip = 'ninja_idle'; fi = frameOf('ninja_idle', S.t);
  } else {
    clip = 'ninja_run'; fi = frameOf('ninja_run', S.t);
  }
  for (let i = 0; i < R.trail.length; i += 2) {
    const tr = R.trail[i];
    put(clip, fi, tr.x - R.cam, fy, 0.18 + i * 0.03);
  }
  const alpha = R.shadowT > 0 ? (((S.t * 10) | 0) % 2 ? 0.45 : 0.7) : 1;
  put(clip, fi, x, fy, alpha);
}

function drawHud() {
  const R = S.R;
  const tt = S.t;
  // hearts
  const show = Math.max(R.hearts, R.D.hearts);
  for (let i = 0; i < show; i++) blit(i < R.hearts ? 'kunai_full' : 'kunai_empty', 5 + i * 10, 4);
  if (R.hearts === 1 && ((tt * 4) | 0) % 2 === 0) frame1(0, 0, LW, LH, 'rgba(224,72,78,0.6)');
  // kata meter
  const full = R.segs >= 2;
  for (let i = 0; i < 4; i++) {
    const on = i < R.segs;
    const lift = on && R.segs === 4 ? Math.round(Math.sin(tt * 6 + i) * 1) : 0;
    blit(on ? 'kata_seg_full' : 'kata_seg_empty', 112 + i * 23, 12 + lift);
  }
  text('small', 'KATA', 112, 2, full ? (((tt * 3) | 0) % 2 ? 'gold' : 'lamp') : 'shade');
  // stats
  const mins = Math.max(1 / 60, ((R.dead || R.won ? R.end : tt) - (R.start || tt)) / 60);
  const wpm = S.mode === 'play' ? Math.round(Math.max(0, R.typed - R.errors) / 5 / mins) : 0;
  const acc = R.typed ? Math.round(100 * Math.max(0, R.typed - R.errors) / R.typed) : 100;
  textR('small', 'WPM ' + wpm, 314, 2, 'mute');
  textR('small', 'ACC ' + acc + '%', 314, 12, 'mute');
  textR('small', String(Math.round(R.score)), 314, 22, 'ink');
  // flow
  if (R.tier > 0) {
    const col = R.tier >= 3 ? 'gold' : R.tier === 2 ? 'lamp' : 'hot';
    text('small', TIER_NAMES[R.tier] + '  ' + R.combo, 112, 20, col);
    if (R.tier >= 3) frame1(1, 1, LW - 2, LH - 2, ((tt * 6) | 0) % 2 ? 'rgba(244,185,61,0.5)' : 'rgba(244,185,61,0.25)');
  }
  if (R.stillT > 0) { text('small', 'STILL', 210, 2, 'sky'); rect(210, 11, R.stillT / 4 * 40, 1, COL.sky); }
  if (R.shadowT > 0) { text('small', 'SHADOW', 210, 14, 'steel'); rect(210, 23, R.shadowT / 6 * 40, 1, COL.steel); }
  // the pursuit: a red edge that thickens as the city closes in
  const sx = R.drawX - R.cam;
  if (sx < 70 && !R.dead && !R.won) {
    const k = 1 - sx / 70;
    rect(0, 0, Math.round(2 + k * 6), LH, 'rgba(224,40,50,' + (0.25 + k * 0.5).toFixed(2) + ')');
  }
}

function drawOverlays() {
  const R = S.R;
  const tt = S.t;
  // the hazard word
  const hz = R.hazard;
  if (hz) {
    const u = clamp(hz.t / hz.T, 0, 1);
    const w = 140, x = 90, y = 36;
    const parryWin = hz.kind === 'arrow' && u >= 0.62;
    rect(x, y, w, 36, '#05070B');
    frame1(x, y, w, 36, tt - hz.badT < 0.2 ? COL.red : parryWin ? (((tt * 10) | 0) % 2 ? COL.hot : COL.gold) : COL.gold);
    if (hz.kind === 'shuriken') put('shuriken', frameOf('shuriken', tt), x + 14, y + 16);
    else blitFlip('arrow', x + 7, y + 15);
    const word = hz.word.toUpperCase();
    const ww = textW('large', word, 2);
    let pen = x + 28 + Math.round((w - 34 - ww) / 2);
    for (let i = 0; i < word.length; i++) {
      pen = text('large', word[i], pen, y + 2, i < hz.typed.length ? 'hot' : 'ink', 2);
    }
    rect(x + 4, y + 31, Math.round((w - 8) * (1 - u)), 2, u > 0.65 ? COL.red : COL.gold);
  }
  // the kata menu
  if (R.menu) {
    const m = R.menu;
    rect(0, 0, LW, LH, 'rgba(3,5,10,0.74)');
    textC('large', 'KATA', 160, 30, 'gold', 2);
    for (let i = 0; i < KATAS.length; i++) {
      const K = KATAS[i];
      const locked = K.rank > S.rankBest;
      const can = !locked && R.segs >= K.cost;
      const y = 70 + i * 34;
      const match = !locked && m.buf && K.name.startsWith(m.buf);
      let pen = 70;
      for (let c = 0; c < K.name.length; c++) {
        const typed = match && c < m.buf.length;
        pen = text('large', K.name[c], pen, y, locked ? 'shade' : typed ? 'hot' : can ? 'ink' : 'dim');
      }
      for (let s = 0; s < K.cost; s++) blit(s < R.segs && !locked ? 'kata_seg_full' : 'kata_seg_empty', 170 + s * 22, y + 5);
      text('small', locked ? 'reach ' + RANKS[K.rank].name : K.desc, 70, y + 17, locked ? 'shade' : 'mute');
    }
    if (tt - m.deniedT < 0.3) frame1(60, 64, 200, 140, COL.red);
  }
  // the slam
  if (R.slam) {
    const u = tt - R.slam.t0;
    const c = S.M.clips[R.slam.k.clip];
    const i = Math.min(c.frames.length - 1, u / 0.6 * c.frames.length);
    putScaled(R.slam.k.clip, i, 160, 104, 2);   // the brushed kanji is the name; no caption over the boards
  }
  if (R.won && S.t - R.won.t0 > 0.5) textC('large', 'ROOFTOPS CLEARED', 160, 60, 'hot', 2);
}

function drawLoading() {
  const g = ctx();
  g.fillStyle = '#05070E';
  g.fillRect(0, 0, LW, LH);
  g.fillStyle = S.error ? '#E0484E' : '#4F7A62';
  g.font = '10px monospace';
  g.textAlign = 'center';
  g.fillText(S.error ? 'KATA failed to load: ' + S.error : 'KATA', 160, 120);
  g.textAlign = 'left';
}

// ---------------------------------------------------------------- export
const KATA = {
  name: 'kata',
  title: 'KATA',
  // read-only handle for tooling; the game never reads it
  get state() { return S; },

  enter() {
    loadRank();
    loadAssets();
    S.mode = 'title';
    S.modeT = S.t;
    S.sel = 0;
    S.lastSec = null;
    S.flash = null;
    S.shake = 0;
  },

  exit() {
    if (typeof window !== 'undefined' && window.TYPEMAXX) window.TYPEMAXX.pixel = null;
  },

  draw(g, W, H, seconds, now, input) {
    if (typeof window !== 'undefined' && window.TYPEMAXX) {
      const p = window.TYPEMAXX.pixel;
      if (!p || p.width !== LW || p.height !== LH) window.TYPEMAXX.pixel = { width: LW, height: LH };
    }
    const k = input && typeof input.pull === 'function' ? input.pull() : { chars: [], keys: [], back: 0, enter: 0 };

    const sec = typeof seconds === 'number' ? seconds : performance.now() / 1000;
    S.dt = S.lastSec == null ? 0 : clamp(sec - S.lastSec, 0, 0.05);
    S.lastSec = sec;
    S.t += S.dt;

    S.ctx = g;
    g.save();
    g.imageSmoothingEnabled = false;
    g.scale(W / LW, H / LH);

    if (!S.ready) {
      if (!S.loading && !S.error) loadAssets();
      drawLoading();
      g.restore();
      return;
    }

    handleInput(k);
    if (S.mode === 'play') updateRun(S.dt);

    // shake is a translate over everything, decaying
    if (S.shake > 0) {
      const a = S.shake;
      g.translate(Math.round((hash((S.t * 60) | 0, 1) - 0.5) * a * 2), Math.round((hash((S.t * 60) | 0, 2) - 0.5) * a * 2));
      S.shake = Math.max(0, S.shake - S.dt * 14);
    }

    switch (S.mode) {
      case 'title': drawTitle(); break;
      case 'pace': drawPace(); break;
      case 'howto': drawHowto(); break;
      case 'count': drawCount(); break;
      case 'play': drawWorld(false); break;
      case 'results': drawResults(); break;
    }

    if (S.flash) {
      const u = (S.t - S.flash.t0) / S.flash.dur;
      if (u >= 1) S.flash = null;
      else {
        g.globalAlpha = 1 - u;
        g.fillStyle = S.flash.css;
        g.fillRect(-4, -4, LW + 8, LH + 8);
        g.globalAlpha = 1;
      }
    }
    g.restore();
  },
};

export default KATA;
export { KATA };
