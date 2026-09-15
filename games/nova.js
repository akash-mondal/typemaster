/*
 * NOVA - a typing shooter for TYPEMAXX.
 *
 * Ships fall toward you through four sectors of deep space, each carrying a
 * word. Type a word's first letter to lock on; every letter after that fires a
 * bolt. Finish the word and the ship breaks apart.
 *
 *   - drones home in; raptors fire missiles; wardens throw fans of plasma orbs;
 *     geminis split in two when they die; every enemy shot is a word too
 *   - three hull points; a hit takes one, and a moment of shield after it
 *   - ENTER fires a NOVA: a ring that erases everything near the ship. Charges
 *     come from long streaks and from capsules
 *   - capsules drift through with gold, green or violet words: nova charge,
 *     hull repair, or stasis that slows the sky
 *   - every tenth wave a mothership: shoot out its turrets, then its core
 *   - every fifth wave you warp to the next sector
 *   - endless: it gets harder with every wave, up to a ceiling, then holds
 *
 * Contract (TYPEMAXX engine): export an object with enter(), exit() and
 * draw(ctx, W, H, seconds, now, input). input.pull() returns
 * { chars, keys, back, enter } for the frame. Everything is drawn in a
 * 320x240 logical space, scaled to whatever surface arrives.
 *
 * Art: assets/nova/atlas.png + manifest.json (tools/novaart/build.py).
 * Sound: ./nova-audio.js. Nothing sounds on a keystroke itself: the keyboard
 * already clicks.
 */

import NovaAudio from './nova-audio.js';
import { WORDS } from './nova-words.js';

const BASE = new URL('../assets/nova/', import.meta.url).href;
const SND = (name, o) => NovaAudio.sfx(name, o);
const MUS = NovaAudio.music;
const AFTER_KEY = 0.05;
const LW = 320, LH = 240;
const TAU = Math.PI * 2;

const COL = {
  ink: '#EAF2FF', hot: '#FFB43C', dim: '#6A7AA0', red: '#FF4A5A', cyan: '#6CF0FF', gold: '#F4C94D',
  green: '#7CF0A0', violet: '#B48CFF', white: '#FFFFFF', shade: '#2A3450', pale: '#C8D4F0',
};

// ---------------------------------------------------------------- tuning
const PLAYER_X = 160, PLAYER_Y = 214;
const HULL_MAX = 3, NOVA_MAX = 3;
const BOLT_SPEED = 420;
const NOVA_RADIUS = 150, NOVA_TIME = 0.7;
const TIERS = [[0, 1], [20, 2], [50, 3], [100, 4]];     // streak -> multiplier
const NOVA_STREAK = 120;                                 // letters in a row that earn a nova
const CAP_WAVE = 30;                                     // difficulty stops rising here
const SECTOR_WAVES = 5;

const SECTORS = [
  // each sector is held by one fleet; at the Stormgate all three come at once
  { key: 'drift', name: 'THE DRIFT', song: 'drift', star: '#C8B8FF', planet: 'planet_a', px: 238, fac: 'klaed' },
  { key: 'ember', name: 'EMBER REACH', song: 'ember', star: '#FFD2A8', planet: 'planet_c', px: 70, fac: 'nairan' },
  { key: 'tide', name: 'TIDEWATER', song: 'tide', star: '#B8FFF0', planet: 'planet_b', px: 250, fac: 'nautolan' },
  { key: 'storm', name: 'STORMGATE', song: 'storm', star: '#FFC8E8', planet: 'planet_a', px: 60, fac: null },
];

// what each enemy is: its sprite, how big it is to hit, its word lengths, speed
// fleet: the clip is '<kind>_<faction>' and its break-up is '<kind>_<faction>_die'
const KIND = {
  drone:   { fleet: true, r: 10, speed: 11, len: n => [3, Math.min(7, 4 + (n / 4 | 0))], dmg: 1, kill: 's' },
  mite:    { clip: 'mite',  r: 6,  speed: 15, len: () => [2, 3], dmg: 1, kill: 's' },
  raptor:  { fleet: true, r: 12, speed: 8,  len: n => [5, Math.min(10, 7 + (n / 6 | 0))], dmg: 1, kill: 'm' },
  warden:  { fleet: true, r: 18, speed: 5,  len: n => [8, Math.min(12, 9 + (n / 6 | 0))], dmg: 2, kill: 'l' },
  gemini:  { fleet: true, r: 13, speed: 8,  len: n => [4, Math.min(8, 5 + (n / 5 | 0))], dmg: 1, kill: 'm' },
  missile: { fleet: true, r: 4,  speed: 17, len: n => [2, Math.min(5, 3 + (n / 8 | 0))], dmg: 1, kill: 's', rot: true },
  orb:     { fleet: true, r: 3,  speed: 20, len: () => [1, 1], dmg: 1, kill: 's' },
  cap:     { clip: 'cap_nova', r: 10, speed: 9, len: () => [4, 6], dmg: 0, kill: 's' },
  turret:  { clip: 'turret', r: 6, speed: 0,  len: n => [5, Math.min(9, 6 + (n / 10 | 0))], dmg: 0, kill: 'm' },
  core:    { clip: null,     r: 9, speed: 0,  len: () => [11, 12], dmg: 0, kill: 'l' },
};
const FACTIONS = ['klaed', 'nairan', 'nautolan'];
function clipFor(e) {
  if (e.clip) return e.clip;
  const K = KIND[e.kind];
  if (!K.fleet) return K.clip;
  if (e.kind === 'orb' && e.fac === 'klaed') return 'orb';
  return e.kind + '_' + e.fac;
}

// ---------------------------------------------------------------- state
const S = {
  loading: false, ready: false, error: null,
  M: null, img: null, tint: {}, fontY0: 0,
  mode: 'title', modeT: 0, t: 0, lastSec: null, dt: 0, ctx: null,
  sel: 0, active: false, flash: null, shake: 0,
  R: null,
  best: { score: 0, wave: 0 },           // this visit only; nothing is stored
  bg: { sector: 0, from: 0, mix: 1, scroll: 0, warp: 0 },
};

// ---------------------------------------------------------------- utils
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, u) => a + (b - a) * u;
const easeIO = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
const easeOut = u => 1 - Math.pow(1 - u, 3);
function hash(i, k) {
  let x = (i * 374761393 + k * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ---------------------------------------------------------------- assets
async function loadAssets() {
  if (S.loading || S.ready) return;
  S.loading = true;
  try {
    const M = await (await fetch(BASE + 'manifest.json')).json();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('nova atlas failed to load')); img.src = BASE + 'atlas.png'; });
    if (img.decode) await Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
    if (M.sky) {
      const sky = new Image();
      sky.crossOrigin = 'anonymous';
      await new Promise(res => { sky.onload = res; sky.onerror = res; sky.src = BASE + M.sky.file; });
      S.sky = sky;
    }
    S.M = M; S.img = img;
    await buildTints();
    S.ready = true;
  } catch (e) { S.error = String(e && e.message || e); }
  S.loading = false;
}
const idleTick = () => new Promise(r => typeof requestIdleCallback === 'function' ? requestIdleCallback(r, { timeout: 100 }) : setTimeout(r, 16));
async function buildTints() {
  let y0 = 1e9, y1 = 0;
  for (const f of Object.values(S.M.fonts)) for (const g of Object.values(f.glyphs)) { y0 = Math.min(y0, g[1]); y1 = Math.max(y1, g[1] + g[3]); }
  S.fontY0 = y0;
  const w = S.img.width, h = y1 - y0;
  for (const [name, css] of Object.entries(COL)) {
    await idleTick();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(S.img, 0, y0, w, h, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = css;
    g.fillRect(0, 0, w, h);
    S.tint[name] = c;
  }
}

// ---------------------------------------------------------------- drawing
function ctx() { return S.ctx; }
function put(name, i, x, y, alpha) {
  const c = S.M.clips[name];
  if (!c) return;
  const n = c.frames.length;
  const f = c.frames[((Math.floor(i) % n) + n) % n];
  const g = ctx();
  if (alpha != null && alpha < 1) g.globalAlpha = Math.max(0, alpha);
  g.drawImage(S.img, f[0], f[1], f[2], f[3], Math.round(x - c.anchor[0]), Math.round(y - c.anchor[1]), f[2], f[3]);
  if (alpha != null && alpha < 1) g.globalAlpha = 1;
}
function putScaled(name, i, cx, cy, s, alpha) {
  const c = S.M.clips[name];
  if (!c) return;
  const n = c.frames.length;
  const f = c.frames[((Math.floor(i) % n) + n) % n];
  const g = ctx();
  if (alpha != null) g.globalAlpha = clamp(alpha, 0, 1);
  g.drawImage(S.img, f[0], f[1], f[2], f[3], Math.round(cx - f[2] * s / 2), Math.round(cy - f[3] * s / 2), Math.round(f[2] * s), Math.round(f[3] * s));
  g.globalAlpha = 1;
}
// the frame of a rotating clip that faces angle a (0 = up, clockwise)
function rotFrame(name, a) {
  const n = S.M.clips[name].frames.length;
  return ((Math.round(a / TAU * n) % n) + n) % n;
}
const frameOf = (name, sec) => { const c = S.M.clips[name]; return c ? Math.floor(sec * 1000 / c.ms) : 0; };
function tile(name) { return S.M.tiles[name]; }
function blit(name, x, y, alpha, s) {
  const t = tile(name); if (!t) return;
  s = s || 1;
  const g = ctx();
  if (alpha != null) g.globalAlpha = clamp(alpha, 0, 1);
  g.drawImage(S.img, t[0], t[1], t[2], t[3], Math.round(x), Math.round(y), Math.round(t[2] * s), Math.round(t[3] * s));
  g.globalAlpha = 1;
}
function rect(x, y, w, h, css) { const g = ctx(); g.fillStyle = css; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function frame1(x, y, w, h, css) { rect(x, y, w, 1, css); rect(x, y + h - 1, w, 1, css); rect(x, y, 1, h, css); rect(x + w - 1, y, 1, h, css); }
function face(n) { return S.M.fonts[n]; }
function textW(fname, str, s) { s = s || 1; const G = face(fname).glyphs; let w = 0; for (const ch of str) { const g = G[ch]; w += g ? g[4] * s : 3 * s; } return w; }
function text(fname, str, x, y, colour, s, alpha) {
  s = s || 1;
  const sheet = S.tint[colour] || S.tint.ink;
  const G = face(fname).glyphs;
  const g2 = ctx();
  if (alpha != null) g2.globalAlpha = clamp(alpha, 0, 1);
  let pen = Math.round(x);
  const top = Math.round(y);
  for (const ch of str) {
    const g = G[ch];
    if (!g) { pen += 3 * s; continue; }
    if (g[2] && g[3]) g2.drawImage(sheet, g[0], g[1] - S.fontY0, g[2], g[3], pen + g[5] * s, top + g[6] * s, g[2] * s, g[3] * s);
    pen += g[4] * s;
  }
  g2.globalAlpha = 1;
  return pen;
}
const textC = (f, s, cx, y, c, sc, a) => text(f, s, Math.round(cx - textW(f, s, sc) / 2), y, c, sc, a);
const textR = (f, s, rx, y, c, sc, a) => text(f, s, Math.round(rx - textW(f, s, sc)), y, c, sc, a);
const pad = (n, w) => String(Math.max(0, Math.floor(n))).padStart(w, '0');

// ---------------------------------------------------------------- the sky
// nebula tiles mirror at every seam, so the scroll never shows an edge
function drawNebula(key, scroll, alpha) {
  const t = tile('neb_' + key); if (!t) return;
  const g = ctx();
  const period = LH * 2;
  const off = ((scroll % period) + period) % period;
  g.globalAlpha = alpha;
  for (let k = -1; k <= 1; k++) {
    const y = off - period + k * period;
    g.drawImage(S.img, t[0], t[1], t[2], t[3], 0, Math.round(y), LW, LH);
    g.save();
    g.translate(0, Math.round(y + LH * 2));
    g.scale(1, -1);
    g.drawImage(S.img, t[0], t[1], t[2], t[3], 0, 0, LW, LH);
    g.restore();
  }
  g.globalAlpha = 1;
}
const STAR_LAYERS = [{ n: 30, v: 5, c: 0.35, s: 1 }, { n: 20, v: 13, c: 0.6, s: 1 }, { n: 12, v: 28, c: 0.9, s: 1 }];
function drawStars(scroll, warp, tint) {
  const g = ctx();
  for (let L = 0; L < STAR_LAYERS.length; L++) {
    const ly = STAR_LAYERS[L];
    for (let i = 0; i < ly.n; i++) {
      const x = Math.floor(hash(i, 11 + L) * LW);
      const y0 = hash(i, 31 + L) * (LH + 20);
      const y = ((y0 + scroll * ly.v) % (LH + 20)) - 10;
      const tw = 0.6 + 0.4 * Math.sin(S.t * (1 + hash(i, 7) * 3) + i);
      g.globalAlpha = ly.c * tw;
      g.fillStyle = hash(i, 5 + L) > 0.7 ? tint : '#FFFFFF';
      if (warp > 0.02) {
        const len = Math.min(60, warp * ly.v * 1.6);
        g.fillRect(x, Math.round(y - len), 1, Math.round(len) + 1);
      } else g.fillRect(x, Math.round(y), ly.s, ly.s);
    }
  }
  g.globalAlpha = 1;
}
function drawSky(dt, warpSpeed) {
  const B = S.bg;
  B.warp += ((warpSpeed || 0) - B.warp) * Math.min(1, dt * 3);
  B.scroll += dt * (1 + B.warp * 18);
  if (B.mix < 1) B.mix = Math.min(1, B.mix + dt / 1.6);
  rect(0, 0, LW, LH, '#03030A');
  const cur = SECTORS[B.sector], old = SECTORS[B.from];
  if (B.mix < 1) drawNebula(old.key, B.scroll * 3, 1);
  drawNebula(cur.key, B.scroll * 3, B.mix < 1 ? easeIO(B.mix) : 1);
  // one planet per sector, drifting past very slowly
  const pt = tile(cur.planet);
  if (pt) {
    const py = ((B.scroll * 1.2 + 60) % (LH + pt[3] + 40)) - pt[3] - 20;
    blit(cur.planet, cur.px, py, B.mix < 1 ? B.mix : 1);
  }
  drawSkyLayers(B.scroll, B.warp);
  drawStars(B.scroll, B.warp, cur.star);
}
// the painted star layers: two depths, mirrored at every seam
function drawSkyLayers(scroll, warp) {
  if (!S.sky || !S.M.sky) return;
  const g = ctx();
  S.M.sky.layers.forEach((L, i) => {
    const speed = i === 0 ? 4 : 10;
    const H = L[3], period = H * 2;
    const off = ((scroll * speed) % period + period) % period;
    g.globalAlpha = warp > 0.5 ? 0.4 : 0.85;
    for (let k = -1; k <= 0; k++) {
      const y = off + k * period;
      if (y + H > 0 && y < LH) g.drawImage(S.sky, L[0], L[1], L[2], L[3], 0, Math.round(y), L[2], H);
      const y2 = y + H;
      if (y2 + H > 0 && y2 < LH) { g.save(); g.translate(0, Math.round(y2 + H)); g.scale(1, -1); g.drawImage(S.sky, L[0], L[1], L[2], L[3], 0, 0, L[2], H); g.restore(); }
    }
  });
  g.globalAlpha = 1;
}
function setSector(i, instant) {
  const B = S.bg;
  i = ((i % SECTORS.length) + SECTORS.length) % SECTORS.length;
  if (i === B.sector && B.mix >= 1) return;
  B.from = instant ? i : B.sector;
  B.sector = i;
  B.mix = instant ? 1 : 0;
}

// ---------------------------------------------------------------- a run
function newRun(opts) {
  opts = opts || {};
  const seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
  const R = {
    rnd: mulberry32(seed), seed,
    wave: 0, score: 0, mult: 1, streak: 0, maxStreak: 0, hits: 0, misses: 0, waveMisses: 0,
    time: 0, typeTime: 0, hull: HULL_MAX, novas: 1, stasisT: 0, invulnT: 0,
    enemies: [], bolts: [], parts: [], fx: [], rings: [],
    target: null, queue: [], spawnT: 0,
    phase: 'intro', phaseT: 0, banner: null, nova: null, dead: null, boss: null,
    ship: { x: PLAYER_X, y: PLAYER_Y, a: 0, want: 0, recoil: 0 },
    demo: !!opts.demo, kills: 0,
  };
  S.R = R;
  setSector(0, true);
  startWave(opts.wave || 1);
  return R;
}
const rnd = () => S.R.rnd();
const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function diff(n) { return Math.min(n, CAP_WAVE); }
function waveSpec(n) {
  const d = diff(n);
  return {
    drone: Math.min(13, 2 + d),
    raptor: Math.min(5, Math.floor(d / 3)),
    warden: Math.min(3, Math.floor(d / 6)),
    gemini: d >= 4 ? Math.min(4, Math.floor((d - 1) / 4)) : 0,
    wait: Math.max(0.5, 1.7 * Math.pow(0.955, d - 1)),
    speed: 1 + 0.045 * (d - 1),
    boss: n % 10 === 0,
  };
}
function startWave(n) {
  const R = S.R;
  R.wave = n;
  R.waveMisses = 0;
  const W = waveSpec(n);
  R.spec = W;
  const q = [];
  if (W.boss) {
    q.push('boss');
    for (let i = 0; i < 4 + Math.floor(diff(n) / 10); i++) q.push('drone');
  } else {
    for (let i = 0; i < W.drone; i++) q.push('drone');
    for (let i = 0; i < W.raptor; i++) q.push('raptor');
    for (let i = 0; i < W.warden; i++) q.push('warden');
    for (let i = 0; i < W.gemini; i++) q.push('gemini');
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    // the big ones never open a wave
    const firstSmall = q.findIndex(k => k === 'drone');
    if (firstSmall > 0) [q[0], q[firstSmall]] = [q[firstSmall], q[0]];
    // a capsule rides along most waves; when the hull is hurt, a repair is likelier
    if (n >= 2 && (rnd() < 0.55 || R.hull < HULL_MAX)) {
      const kind = R.hull < HULL_MAX && rnd() < 0.6 ? 'repair' : rnd() < 0.55 ? 'nova' : 'stasis';
      q.splice(Math.floor(q.length * (0.3 + rnd() * 0.4)), 0, 'cap_' + kind);
    }
  }
  R.queue = q;
  R.spawnT = 1.2;
  R.phase = n === 1 && !R.demo ? 'intro' : 'wave';
  R.phaseT = 0;
  R.banner = { text: W.boss ? 'WARNING' : 'WAVE ' + n, sub: W.boss ? 'MOTHERSHIP APPROACHING' : n % SECTOR_WAVES === 1 ? SECTORS[sectorOf(n)].name : '', t0: S.t, boss: W.boss };
  if (!R.demo) {
    if (W.boss) { NovaAudio.sting('warning'); MUS.setTag('boss', true); }
    else if (n > 1) NovaAudio.sting('wave');
  }
}
const sectorOf = n => Math.floor((n - 1) / SECTOR_WAVES) % SECTORS.length;

// ---- words
function takenLetters() {
  const set = new Set();
  for (const e of S.R.enemies) if (!e.dead && !e.locked && e.typed < e.word.length) set.add(e.word[e.typed]);
  return set;
}
function pickWord(minL, maxL) {
  const taken = takenLetters();
  let w = 'a';
  for (let tries = 0; tries < 24; tries++) {
    // lengths in the middle of the range come up a little more often
    const len = clamp(Math.round(lerp(minL, maxL, (rnd() + rnd()) / 2)), minL, maxL);
    if (len === 1) { w = String.fromCharCode(97 + Math.floor(rnd() * 26)); if (!taken.has(w)) return w; continue; }
    const list = WORDS[clamp(len, 2, 12)];
    w = list[Math.floor(rnd() * list.length)];
    if (!taken.has(w[0]) && !S.R.enemies.some(e => !e.dead && e.word === w)) return w;
  }
  return w;
}

// ---- enemies
function spawn(kind, x, y, extra) {
  const R = S.R;
  const K = KIND[kind];
  const [a, b] = K.len(diff(R.wave));
  const e = Object.assign({
    kind, x, y, vx: 0, vy: 0, a: Math.PI, t: 0, hitT: 0, fireT: 0,
    word: '', typed: 0, pending: 0, hp: 0, locked: false, dead: false, doomed: false,
    speed: K.speed * R.spec.speed * (0.9 + rnd() * 0.2), r: K.r, seed: rnd() * 100,
    fac: SECTORS[sectorOf(R.wave)].fac || FACTIONS[Math.floor(rnd() * 3)],
  }, extra || {});
  if (!e.word) e.word = pickWord(a, b);
  e.hp = e.word.length;
  R.enemies.push(e);
  return e;
}
function spawnFromQueue(k) {
  const R = S.R;
  const x = 24 + rnd() * (LW - 48);
  if (k === 'boss') return spawnBoss();
  if (k.startsWith('cap_')) {
    const kind = k.slice(4);
    return spawn('cap', x, -10, { cap: kind, clip: 'cap_' + kind, a: 0 });
  }
  const e = spawn(k, x, -12);
  if (k === 'raptor') { e.a = Math.PI + (rnd() - 0.5) * 0.7 + (x > LW / 2 ? 0.25 : -0.25); e.fireT = 2 + rnd() * 2; }
  if (k === 'warden') { e.a = Math.PI; e.fireT = 3 + rnd() * 2; e.y = -20; }
  return e;
}
function spawnBoss() {
  const R = S.R;
  const fac = SECTORS[sectorOf(R.wave)].fac || FACTIONS[Math.floor(rnd() * 3)];
  const boss = { kind: 'boss', fac, x: LW / 2, y: -60, t: 0, dead: false, word: '', typed: 0, turrets: [], core: null, dying: null };
  const offs = [[-24, -24], [24, -24], [-20, 12], [20, 12]];
  for (let i = 0; i < offs.length; i++) {
    const tu = spawn('turret', boss.x + offs[i][0], boss.y + offs[i][1], { boss, off: offs[i], a: Math.PI, fireT: 2.5 + i * 1.1, fac });
    boss.turrets.push(tu);
  }
  boss.core = spawn('core', boss.x, boss.y + 34, { boss, off: [0, 34], sealed: true, fac });
  R.boss = boss;
  return boss;
}

// ---- the typing
function typeChar(ch) {
  const R = S.R;
  if (!R || R.dead || R.phase === 'intro' && R.phaseT < 0.4) return;
  ch = ch.toLowerCase();
  if (!/^[a-z]$/.test(ch)) return;
  let e = R.target;
  if (e && (e.dead || e.typed >= e.word.length)) { R.target = null; e = null; }
  if (!e) {
    let best = null, bestD = 1e9;
    for (const c of R.enemies) {
      if (c.dead || c.locked || c.sealed || c.typed >= c.word.length) continue;
      if (c.y < -6 || c.word[c.typed] !== ch) continue;
      const d = Math.hypot(c.x - R.ship.x, c.y - R.ship.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return miss();
    e = best;
    lock(e);
  }
  if (e.word[e.typed] !== ch) return miss();
  e.typed++;
  e.pending++;
  R.hits++;
  R.streak++;
  R.maxStreak = Math.max(R.maxStreak, R.streak);
  const prevMult = R.mult;
  for (const [n, m] of TIERS) if (R.streak >= n) R.mult = m;
  if (R.mult > prevMult && !R.demo) { SND('mult_up', { delay: AFTER_KEY, pitch: 0.9 + R.mult * 0.1 }); R.multFlash = S.t; }
  if (R.streak > 0 && R.streak % NOVA_STREAK === 0 && R.novas < NOVA_MAX) {
    R.novas++;
    R.novaFlash = S.t;
    if (!R.demo) SND('nova_ready', { delay: AFTER_KEY });
  }
  R.score += R.mult;
  fireBolt(e);
  if (e.typed >= e.word.length) {
    e.doomed = true;
    if (R.target === e) R.target = null;
  }
}
function lock(e) {
  const R = S.R;
  e.locked = true;
  e.lockT = S.t;
  R.target = e;
  if (!R.demo) SND('lock', { delay: AFTER_KEY, x: e.x });
}
function miss() {
  const R = S.R;
  R.misses++;
  R.waveMisses++;
  R.streak = 0;
  R.mult = 1;
  R.missT = S.t;
  if (!R.demo) SND('miss', { delay: AFTER_KEY });
}
function release() {
  const R = S.R;
  const e = R.target;
  if (!e) return;
  e.locked = false;
  R.target = null;
  if (!R.demo) SND('release');
}
function fireBolt(e) {
  const R = S.R;
  const sh = R.ship;
  sh.want = Math.atan2(e.x - sh.x, -(e.y - sh.y));
  sh.recoil = 1;
  const nose = 8;
  R.bolts.push({ x: sh.x + Math.sin(sh.a) * nose, y: sh.y - Math.cos(sh.a) * nose, e, px: sh.x, py: sh.y, t: 0 });
  if (!R.demo) SND('shot', { delay: AFTER_KEY, x: sh.x, vary: 0.08 });
}

// ---- nova
function fireNova() {
  const R = S.R;
  if (R.nova || R.novas <= 0 || R.dead) { if (!R.demo && !R.nova) SND('denied'); return; }
  R.novas--;
  R.nova = { t0: S.t, x: R.ship.x, y: R.ship.y, hit: new Set() };
  R.target = null;
  for (const e of R.enemies) e.locked = false;
  shake(6);
  flash('rgba(160,240,255,0.5)', 0.35);
  if (!R.demo) { SND('nova'); NovaAudio.duck(0.6, 1.2); }
}

// ---------------------------------------------------------------- update
function update(dt) {
  const R = S.R;
  R.time += dt;
  R.phaseT += dt;
  if (R.invulnT > 0) R.invulnT -= dt;
  if (R.stasisT > 0) R.stasisT -= dt;
  const slow = R.stasisT > 0 ? 0.4 : 1;

  // ship: turn toward the last shot, settle back up when idle
  const sh = R.ship;
  if (!R.target && R.bolts.length === 0 && S.t - (R.lastShotT || 0) > 1.2) sh.want = 0;
  sh.a += angDiff(sh.a, sh.want) * Math.min(1, dt * 14);
  sh.recoil = Math.max(0, sh.recoil - dt * 8);

  // spawning
  if (R.phase === 'intro' && R.phaseT > 1.6) { R.phase = 'wave'; R.phaseT = 0; }
  if (R.phase === 'wave') {
    R.spawnT -= dt * slow;
    const busyBoss = R.boss && !R.boss.dead && R.queue[0] === 'drone' && R.enemies.filter(e => !e.dead && e.kind === 'drone').length > 1;
    if (R.spawnT <= 0 && R.queue.length && !busyBoss) {
      const k = R.queue.shift();
      spawnFromQueue(k);
      R.spawnT = R.spec.wait * (k === 'warden' ? 1.8 : k === 'boss' ? 4 : 1);
    }
    const alive = R.enemies.some(e => !e.dead && e.kind !== 'cap') || (R.boss && !R.boss.dead);
    if (!R.queue.length && !alive && R.bolts.length === 0) {
      R.phase = 'clear';
      R.phaseT = 0;
      const perfect = R.waveMisses === 0;
      R.clearInfo = { perfect, bonus: perfect ? R.wave * 25 : 0 };
      R.score += R.clearInfo.bonus;
      if (!R.demo) { NovaAudio.sting(perfect ? 'perfect' : 'clear'); MUS.setTag('boss', false); }
      // the leftover capsules drift on
    }
  } else if (R.phase === 'clear') {
    const warpNext = R.wave % SECTOR_WAVES === 0;
    if (R.phaseT > 2.2) {
      if (warpNext) { R.phase = 'warp'; R.phaseT = 0; if (!R.demo) { SND('warp'); MUS.play(SECTORS[sectorOf(R.wave + 1)].song, { fade: 1.6, sting: 'sector' }); } }
      else startWave(R.wave + 1);
    }
  } else if (R.phase === 'warp') {
    if (R.phaseT > 0.9 && S.bg.sector !== sectorOf(R.wave + 1)) setSector(sectorOf(R.wave + 1));
    if (R.phaseT > 2.6) startWave(R.wave + 1);
  }

  // enemies
  for (const e of R.enemies) if (!e.dead) updateEnemy(e, dt * slow, dt);
  if (R.boss && !R.boss.dead) updateBoss(R.boss, dt * slow);

  // bolts: fast, homing; the damage lands when they arrive
  for (const b of R.bolts) {
    const e = b.e;
    b.t += dt;
    if (e.dead) { b.gone = true; sparks(b.x, b.y, 3, '#6CF0FF', 30); continue; }
    const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy);
    const step = BOLT_SPEED * dt;
    b.px = b.x; b.py = b.y;
    if (d <= step + e.r * 0.6) { b.gone = true; hitEnemy(e, b); continue; }
    b.x += dx / d * step; b.y += dy / d * step;
  }
  R.bolts = R.bolts.filter(b => !b.gone);
  if (R.bolts.length) R.lastShotT = S.t;

  // nova ring
  if (R.nova) {
    const u = (S.t - R.nova.t0) / NOVA_TIME;
    const rad = easeOut(clamp(u, 0, 1)) * NOVA_RADIUS;
    for (const e of R.enemies) {
      if (e.dead || e.kind === 'cap' || e.kind === 'core' || R.nova.hit.has(e)) continue;
      if (Math.hypot(e.x - R.nova.x, e.y - R.nova.y) <= rad + e.r) { R.nova.hit.add(e); killEnemy(e, true); }
    }
    if (u >= 1.3) R.nova = null;
  }

  // particles and effects
  for (const p of R.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * (p.drag || 2); p.vy *= 1 - dt * (p.drag || 2); p.life -= dt; }
  R.parts = R.parts.filter(p => p.life > 0);
  R.fx = R.fx.filter(f => (S.t - f.t0) * 1000 / S.M.clips[f.clip].ms < S.M.clips[f.clip].frames.length);
  R.enemies = R.enemies.filter(e => !e.dead || e.pending > 0 && !e.gone);
  R.enemies = R.enemies.filter(e => !e.dead);

  // death
  if (R.dead) {
    if (S.t - R.dead.t0 > 2.4 && !R.demo && S.mode === 'play') goResults();
  }
  MUS.setTag('danger', !R.demo && R.hull === 1 && !R.dead);
  if (!R.demo) updateIntensity(dt);
}

function updateEnemy(e, dt, rawDt) {
  const R = S.R, sh = R.ship;
  e.t += dt;
  const K = KIND[e.kind];
  if (e.kind === 'turret' || e.kind === 'core') return;       // the mothership moves them
  if (e.hitT > 0) {
    e.hitT -= rawDt;
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.vx *= 1 - rawDt * 6; e.vy *= 1 - rawDt * 6;
    return;
  }
  const toShip = Math.atan2(sh.x - e.x, -(sh.y - e.y));
  const dist = Math.hypot(sh.x - e.x, sh.y - e.y);
  switch (e.kind) {
    case 'drone': case 'mite':
      e.a = toShip; break;
    case 'gemini':
      e.a = toShip + Math.sin(e.t * 1.8 + e.seed) * 0.5; break;
    case 'raptor':
      e.fireT -= dt;
      if (e.fireT <= 0 && e.y > 8 && e.y < 150 && dist > 60) {
        e.fireT = 5;
        const m = spawn('missile', e.x, e.y + 10, { a: e.a, t: 0, fac: e.fac });
        m.homeFrom = 0.7; m.homeTo = 1.6;
        if (!R.demo) SND('missile', { x: e.x });
      }
      break;
    case 'warden':
      e.fireT -= dt;
      if (e.fireT <= 0 && e.y > 10 && e.y < 140 && dist > 70) {
        e.fireT = 7;
        const n = 5;
        for (let k = 0; k < n; k++) {
          const a = Math.PI + (k - (n - 1) / 2) * 0.32;
          spawn('orb', e.x + Math.sin(a) * 16, e.y + 12, { a, fac: e.fac });
        }
        if (!R.demo) SND('orb_fan', { x: e.x });
      }
      break;
    case 'missile':
      if (e.t > (e.homeFrom || 0) && e.t < (e.homeTo || 0)) e.a += clamp(angDiff(e.a, toShip), -2 * dt, 2 * dt);
      break;
    case 'cap':
      e.a = Math.PI + Math.sin(e.t * 1.3 + e.seed) * 0.35; break;
  }
  e.vx = Math.sin(e.a) * e.speed;
  e.vy = -Math.cos(e.a) * e.speed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  // leaving the screen: gone, no penalty
  if (e.y > LH + 24 || e.x < -40 || e.x > LW + 40) { e.dead = true; if (R.target === e) R.target = null; return; }
  // reaching the ship
  if (!R.dead && K.dmg > 0 && dist < e.r + 6) {
    killEnemy(e, true, true);
    hurt(K.dmg, e);
  }
}

function updateBoss(B, dt) {
  const R = S.R;
  B.t += dt;
  if (B.dying) {
    const u = S.t - B.dying;
    if (Math.floor(u * 8) !== Math.floor((u - dt) * 8) && u < 1.6) {
      boom('m', B.x + (rnd() - 0.5) * 60, B.y + (rnd() - 0.5) * 80);
      if (!R.demo) SND('explode_m', { x: B.x, vary: 0.2 });
      shake(3);
    }
    if (u >= 1.6) {
      B.dead = true;
      R.fx.push({ clip: 'boss_' + B.fac + '_die', x: B.x, y: B.y, t0: S.t });
      boom('l', B.x, B.y + 20);
      shake(10); flash('rgba(255,240,200,0.7)', 0.5);
      if (!R.demo) { SND('boss_die'); NovaAudio.duck(0.7, 1.6); }
      R.score += R.wave * 20 * R.mult;
      spawn('cap', B.x, B.y, { cap: 'nova', clip: 'cap_nova', a: Math.PI });
      R.boss = null;
    }
    return;
  }
  // arrive, then sway, and sink slowly toward the ship
  const arrive = clamp(B.t / 3.5, 0, 1);
  const baseY = lerp(-60, 58, easeOut(arrive)) + Math.max(0, B.t - 3.5) * 1.2;
  B.y = baseY;
  B.x = LW / 2 + Math.sin(B.t * 0.45) * 70 * arrive;
  for (const tu of B.turrets) {
    if (tu.dead) continue;
    tu.x = B.x + tu.off[0]; tu.y = B.y + tu.off[1];
    tu.t += dt;
    tu.a = Math.atan2(R.ship.x - tu.x, -(R.ship.y - tu.y));
    tu.fireT -= dt;
    if (arrive >= 1 && tu.fireT <= 0) {
      tu.fireT = 4.5 + rnd() * 2;
      if (rnd() < 0.5) { spawn('orb', tu.x, tu.y + 6, { a: tu.a, fac: B.fac }); if (!R.demo) SND('orb_fan', { x: tu.x, vol: 0.4 }); }
      else { const m = spawn('missile', tu.x, tu.y + 6, { a: tu.a, fac: B.fac }); m.homeFrom = 0.4; m.homeTo = 1.4; if (!R.demo) SND('missile', { x: tu.x }); }
    }
  }
  const c = B.core;
  c.x = B.x + c.off[0]; c.y = B.y + c.off[1];
  if (c.sealed && B.turrets.every(t => t.dead)) { c.sealed = false; if (!R.demo) SND('core_open'); shake(4); }
  // too close: it rams the ship and backs off
  if (B.y > 140 && !R.dead) { hurt(2, null); B.t -= 30; }
}

function hitEnemy(e, b) {
  const R = S.R;
  e.pending = Math.max(0, e.pending - 1);
  e.hp--;
  e.hitT = 0.12;
  const kb = 26;
  const a = Math.atan2(e.x - R.ship.x, -(e.y - R.ship.y));
  if (e.kind !== 'turret' && e.kind !== 'core') { e.vx = Math.sin(a) * kb; e.vy = -Math.cos(a) * kb; }
  e.flashT = S.t;
  sparks(b.x, b.y, 4, '#9CF4FF', 70);
  if (!R.demo) SND('hit', { x: e.x, vary: 0.12 });
  if (e.hp <= 0 && e.typed >= e.word.length) killEnemy(e, false);
}

function killEnemy(e, byNova, silentScore) {
  const R = S.R;
  if (e.dead) return;
  e.dead = true;
  if (R.target === e) R.target = null;
  const K = KIND[e.kind];
  R.kills++;
  if (e.kind === 'cap') {
    if (!byNova) collect(e);
    else sparks(e.x, e.y, 6, '#FFFFFF', 50);
    return;
  }
  const dieClip = K.fleet && e.kind !== 'missile' && e.kind !== 'orb' ? e.kind + '_' + e.fac + '_die' : null;
  if (dieClip && S.M.clips[dieClip]) R.fx.push({ clip: dieClip, x: e.x, y: e.y, t0: S.t });
  else if (K.kill === 's') R.fx.push({ clip: 'pop', x: e.x, y: e.y, t0: S.t });
  else boom(K.kill, e.x, e.y);
  sparks(e.x, e.y, K.kill === 'l' ? 26 : K.kill === 'm' ? 14 : 7, '#FFD060', K.kill === 'l' ? 120 : 80);
  shake(K.kill === 'l' ? 5 : K.kill === 'm' ? 2.5 : 1);
  if (!R.demo) SND(K.kill === 'l' ? 'explode_l' : K.kill === 'm' ? 'explode_m' : 'explode_s', { x: e.x, vary: 0.12 });
  if (!byNova && !silentScore) R.score += 5 * R.mult;
  if (e.kind === 'gemini') {
    for (const s of [-1, 1]) spawn('mite', e.x + s * 10, e.y, { a: e.a + s * 0.6, speed: KIND.mite.speed * R.spec.speed });
    if (!R.demo) SND('split', { x: e.x });
  }
  if (e.kind === 'core' && e.boss) {
    e.boss.dying = S.t;
    for (const t of e.boss.turrets) t.dead = true;
  }
  if (e.kind === 'turret' && !R.demo) SND('turret_die', { x: e.x });
}

function collect(e) {
  const R = S.R;
  const kind = e.cap;
  if (kind === 'nova') { R.novas = Math.min(NOVA_MAX, R.novas + 1); R.novaFlash = S.t; }
  if (kind === 'repair') { R.hull = Math.min(HULL_MAX, R.hull + 1); R.repairFlash = S.t; }
  if (kind === 'stasis') { R.stasisT = 6; }
  R.rings.push({ x: e.x, y: e.y, t0: S.t, col: kind === 'nova' ? '#6CF0FF' : kind === 'repair' ? '#7CF0A0' : '#B48CFF' });
  R.pickup = { kind, t0: S.t };
  if (!R.demo) SND('pickup_' + kind);
}

function hurt(n, from) {
  const R = S.R;
  if (R.dead || R.invulnT > 0) return;
  R.hull -= n;
  R.invulnT = 1.1;
  R.streak = 0; R.mult = 1;
  shake(7);
  flash('rgba(255,60,80,0.45)', 0.3);
  sparks(R.ship.x, R.ship.y, 14, '#FF8A8A', 110);
  if (!R.demo) { SND('hurt'); NovaAudio.duck(0.5, 0.5); }
  if (R.hull <= 0) die();
}
function die() {
  const R = S.R;
  R.dead = { t0: S.t };
  R.target = null;
  boom('l', R.ship.x, R.ship.y);
  sparks(R.ship.x, R.ship.y, 40, '#9CF4FF', 160);
  shake(12);
  flash('rgba(255,255,255,0.8)', 0.6);
  if (!R.demo) { SND('player_die'); NovaAudio.sting('gameover'); MUS.setMuffle(0.85); }
}

function boom(size, x, y) { S.R.fx.push({ clip: size === 'l' ? 'boom_l' : size === 'm' ? 'boom_m' : 'boom_s', x, y, t0: S.t }); }
function sparks(x, y, n, col, speed) {
  const R = S.R;
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, v = speed * (0.3 + rnd() * 0.7);
    R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + rnd() * 0.35, max: 0.6, col });
  }
}
function shake(a) { S.shake = Math.max(S.shake, a); }
function flash(css, dur) { S.flash = { css, t0: S.t, dur }; }

// the score leans in with the danger on screen
function updateIntensity(dt) {
  const R = S.R;
  let n = 0;
  const alive = R.enemies.filter(e => !e.dead && e.kind !== 'cap');
  if (alive.length >= 3 || R.wave >= 4) n = 1;
  if (alive.length >= 6 || alive.some(e => e.y > 150) || R.mult >= 2) n = 2;
  if ((R.boss && !R.boss.dead) || alive.some(e => e.kind === 'warden') || R.mult >= 3) n = 3;
  if (R.phase !== 'wave') n = Math.min(n, 1);
  if (n >= MUS.intensity) { R.calm = 0; MUS.setIntensity(n); }
  else { R.calm = (R.calm || 0) + dt; if (R.calm > 3) { R.calm = 0; MUS.setIntensity(MUS.intensity - 1); } }
}

// ---------------------------------------------------------------- draw a run
function drawRun() {
  const R = S.R;
  const warpSpeed = R.phase === 'warp' ? Math.sin(clamp(R.phaseT / 2.6, 0, 1) * Math.PI) * 6 : 0;
  drawSky(S.dt, warpSpeed);
  if (R.stasisT > 0) rect(0, 0, LW, LH, 'rgba(120,90,220,' + (0.12 + Math.sin(S.t * 3) * 0.03).toFixed(3) + ')');

  // mothership hull under its turrets
  const B = R.boss;
  if (B && !B.dead) {
    const shakeX = B.dying ? (hash((S.t * 40) | 0, 3) - 0.5) * 4 : 0;
    put('boss_' + B.fac, frameOf('boss_' + B.fac, S.t), B.x + shakeX, B.y);
    const c = B.core;
    if (c && !c.dead) {
      const glow = c.sealed ? 0.3 : 0.6 + Math.sin(S.t * 8) * 0.3;
      const g = ctx();
      const rr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, 12);
      rr.addColorStop(0, 'rgba(255,90,110,' + glow.toFixed(2) + ')'); rr.addColorStop(1, 'rgba(255,90,110,0)');
      g.fillStyle = rr; g.fillRect(c.x - 12, c.y - 12, 24, 24);
    }
  }

  // enemies
  for (const e of R.enemies) {
    if (e.dead) continue;
    const K = KIND[e.kind];
    const hitFlash = e.flashT && S.t - e.flashT < 0.06;
    if (e.kind === 'core') continue;
    let clip = clipFor(e), fi;
    if (K.rot || e.kind === 'turret') fi = rotFrame(clip, e.a);
    else fi = frameOf(clip, S.t + e.seed);
    put(clip, fi, e.x, e.y);
    if (hitFlash) {
      const g = ctx();
      g.globalCompositeOperation = 'lighter';
      put(clip, fi, e.x, e.y, 0.7);
      g.globalCompositeOperation = 'source-over';
    }
  }
  // capsule glow
  for (const e of R.enemies) if (!e.dead && e.kind === 'cap') {
    const c = e.cap === 'nova' ? '108,240,255' : e.cap === 'repair' ? '124,240,160' : '180,140,255';
    const g = ctx(), rr = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, 14);
    rr.addColorStop(0, 'rgba(' + c + ',0.28)'); rr.addColorStop(1, 'rgba(' + c + ',0)');
    g.fillStyle = rr; g.fillRect(e.x - 14, e.y - 14, 28, 28);
  }

  // bolts
  for (const b of R.bolts) {
    ctx().globalAlpha = 0.5;
    drawLine(b.px, b.py, b.x, b.y, '#3AB8E8');
    ctx().globalAlpha = 1;
    put('bolt', frameOf('bolt', S.t + b.t), b.x, b.y);
  }

  // explosions, rings, particles
  for (const f of R.fx) put(f.clip, (S.t - f.t0) * 1000 / S.M.clips[f.clip].ms, f.x, f.y);
  for (const p of R.parts) { ctx().globalAlpha = clamp(p.life / 0.35, 0, 1); rect(p.x, p.y, 1, 1, p.col); }
  ctx().globalAlpha = 1;
  R.rings = R.rings.filter(r => S.t - r.t0 < 0.5);
  for (const r of R.rings) ring(r.x, r.y, easeOut((S.t - r.t0) / 0.5) * 26, r.col, 1 - (S.t - r.t0) / 0.5);

  // nova
  if (R.nova) {
    const u = (S.t - R.nova.t0) / NOVA_TIME;
    const rad = easeOut(clamp(u, 0, 1)) * NOVA_RADIUS;
    const a = clamp(1.3 - u, 0, 1);
    const g = ctx();
    const gr = g.createRadialGradient(R.nova.x, R.nova.y, rad * 0.6, R.nova.x, R.nova.y, rad + 4);
    gr.addColorStop(0, 'rgba(108,240,255,0)'); gr.addColorStop(0.85, 'rgba(108,240,255,' + (0.25 * a).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(R.nova.x - rad - 6, R.nova.y - rad - 6, rad * 2 + 12, rad * 2 + 12);
    ring(R.nova.x, R.nova.y, rad, '#E8FFFF', a);
    ring(R.nova.x, R.nova.y, rad * 0.8, '#6CF0FF', a * 0.6);
  }

  // the ship
  drawShip();

  // words over everything
  // labels never sit on top of one another: later ones step down out of the way
  const placed = [];
  const order = R.enemies.filter(e => !e.dead).sort((a, b) => (R.target === b) - (R.target === a) || a.y - b.y);
  for (const e of order) drawLabel(e, placed);
  const T = R.target;
  if (T && !T.dead) {
    const u = clamp((S.t - T.lockT) / 0.18, 0, 1);
    put('reticle', Math.min(3, u * 3.99), T.x, T.y);
  }

  if (HUD_ON.on) { drawHud(); drawBanners(); }
}

function ring(cx, cy, r, css, alpha) {
  if (r <= 0 || alpha <= 0) return;
  const g = ctx();
  g.globalAlpha = clamp(alpha, 0, 1);
  g.fillStyle = css;
  const n = Math.max(12, Math.floor(r * 2.2));
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
  g.globalAlpha = 1;
}
function drawLine(x0, y0, x1, y1, css) {
  const g = ctx();
  g.fillStyle = css;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) { const u = i / n; g.fillRect(Math.round(lerp(x0, x1, u)), Math.round(lerp(y0, y1, u)), 1, 1); }
}

// 32 headings, each with three engine frames
function shipFrame(a) {
  const k = ((Math.round(a / TAU * 32) % 32) + 32) % 32;
  return k * 3 + (((S.t * 12) | 0) % 3);
}
function drawShip() {
  const R = S.R, sh = R.ship;
  if (R.dead) return;
  const blink = R.invulnT > 0 && ((S.t * 16) | 0) % 2;
  const bx = sh.x - Math.sin(sh.a) * sh.recoil * 1.5, by = sh.y + Math.cos(sh.a) * sh.recoil * 1.5;
  put('player', shipFrame(sh.a), bx, by, blink ? 0.35 : 1);
  if (R.invulnT > 0) put('shield', frameOf('shield', S.t), bx, by, clamp(R.invulnT / 1.1, 0, 1) * 0.9);
}

function drawLabel(e, placed) {
  const R = S.R;
  if (e.doomed || e.typed >= e.word.length || e.y < -4) return;
  if (e.kind === 'core' && e.sealed) return;
  const rem = e.word.slice(e.typed);
  const w = textW('small', rem);
  const locked = R.target === e;
  let x = Math.round(e.x - w / 2), y = Math.round(e.y + e.r + 3);
  if (e.kind === 'core' || e.kind === 'turret') y = Math.round(e.y + e.r + 2);
  x = clamp(x, 3, LW - w - 3); y = clamp(y, 15, LH - 22);
  if (placed) {
    for (let guard = 0; guard < 6; guard++) {
      const hit = placed.find(p => x < p.x + p.w + 4 && x + w + 4 > p.x && y < p.y + 11 && y + 11 > p.y);
      if (!hit) break;
      y = hit.y + 11;
    }
    y = Math.min(y, LH - 22);
    placed.push({ x, y, w });
  }
  rect(x - 2, y - 1, w + 4, 10, locked ? 'rgba(40,20,4,0.85)' : 'rgba(4,6,16,0.72)');
  if (locked) frame1(x - 3, y - 2, w + 6, 12, '#FFB43C');
  let colour = locked ? 'hot' : 'ink';
  if (e.kind === 'cap') colour = e.cap === 'nova' ? 'cyan' : e.cap === 'repair' ? 'green' : 'violet';
  if (e.kind === 'core') colour = locked ? 'hot' : 'red';
  if (e.typed > 0 && !locked) colour = 'pale';
  text('small', rem, x, y, colour);
}

function drawHud() {
  const R = S.R;
  rect(0, 0, LW, 11, 'rgba(3,4,12,0.55)');
  const sx = text('small', pad(R.score, 6), 4, 2, 'ink');
  if (R.mult > 1) {
    const pop = R.multFlash && S.t - R.multFlash < 0.3 ? 1 : 0;
    text('small', 'x' + R.mult, sx + 4, 2 - pop, R.mult >= 4 ? 'red' : R.mult >= 3 ? 'hot' : 'gold');
  }
  textC('small', R.boss ? 'MOTHERSHIP' : 'WAVE ' + R.wave, LW / 2, 2, R.boss ? 'red' : 'dim');
  // hull pips and nova charges
  for (let i = 0; i < HULL_MAX; i++) {
    const on = i < R.hull;
    const fl = R.repairFlash && S.t - R.repairFlash < 0.5 && i === R.hull - 1;
    rect(LW - 60 + i * 7, 3, 5, 5, on ? (fl ? '#FFFFFF' : R.hull === 1 ? (((S.t * 4) | 0) % 2 ? '#FF4A5A' : '#8A1A26') : '#7CF0A0') : '#2A3450');
  }
  for (let i = 0; i < NOVA_MAX; i++) {
    const on = i < R.novas;
    const cx = LW - 32 + i * 9, cy = 5;
    const col = on ? (R.novaFlash && S.t - R.novaFlash < 0.5 ? '#FFFFFF' : '#6CF0FF') : '#2A3450';
    rect(cx, cy - 2, 1, 5, col); rect(cx - 2, cy, 5, 1, col);
  }
  // streak toward the next nova charge
  const u = (R.streak % NOVA_STREAK) / NOVA_STREAK;
  rect(0, LH - 2, LW, 2, 'rgba(20,30,60,0.6)');
  rect(0, LH - 2, Math.round(LW * u), 2, R.mult >= 3 ? '#FFB43C' : '#3AB8E8');
  if (R.missT && S.t - R.missT < 0.25) rect(0, LH - 2, LW, 2, '#FF4A5A');
  if (R.stasisT > 0) textC('small', 'STASIS ' + Math.ceil(R.stasisT), LW / 2, LH - 13, 'violet');
  if (R.hull === 1 && !R.dead) {
    const a = 0.25 + Math.sin(S.t * 6) * 0.15;
    rect(0, 11, 2, LH - 13, 'rgba(255,60,80,' + a.toFixed(2) + ')');
    rect(LW - 2, 11, 2, LH - 13, 'rgba(255,60,80,' + a.toFixed(2) + ')');
  }
}

function drawBanners() {
  const R = S.R;
  const b = R.banner;
  if (b) {
    const u = S.t - b.t0;
    if (u > 2.4) R.banner = null;
    else {
      const a = u < 0.25 ? u / 0.25 : u > 1.9 ? (2.4 - u) / 0.5 : 1;
      if (b.boss) {
        const on = ((u * 5) | 0) % 2 === 0;
        rect(0, 82, LW, 30, 'rgba(60,4,12,' + (0.7 * a).toFixed(2) + ')');
        for (let x = -20; x < LW + 20; x += 16) {
          const xx = x + ((S.t * 40) % 16);
          rect(xx, 82, 8, 3, 'rgba(255,74,90,' + (a * 0.8).toFixed(2) + ')');
          rect(xx - 8, 109, 8, 3, 'rgba(255,74,90,' + (a * 0.8).toFixed(2) + ')');
        }
        if (on) textC('large', b.text, LW / 2, 86, 'red', 1, a);
        textC('small', b.sub, LW / 2, 100, 'ink', 1, a);
      } else {
        textC('large', b.text, LW / 2, 90, 'ink', 1, a);
        if (b.sub) textC('small', b.sub, LW / 2, 108, 'cyan', 1, a);
      }
    }
  }
  if (R.phase === 'clear' && R.clearInfo) {
    const u = R.phaseT;
    const a = clamp(u / 0.3, 0, 1) * clamp((2.2 - u) / 0.3, 0, 1);
    textC('large', 'WAVE ' + R.wave + ' CLEAR', LW / 2, 86, 'cyan', 1, a);
    if (R.clearInfo.perfect) textC('small', 'PERFECT  +' + R.clearInfo.bonus, LW / 2, 106, 'gold', 1, a);
    textC('small', 'SCORE ' + pad(R.score, 6), LW / 2, 118, 'dim', 1, a);
  }
  if (R.phase === 'warp') {
    const u = R.phaseT;
    const a = clamp((u - 0.8) / 0.4, 0, 1) * clamp((2.6 - u) / 0.4, 0, 1);
    const sec = SECTORS[sectorOf(R.wave + 1)];
    textC('small', 'WARPING TO', LW / 2, 92, 'dim', 1, a);
    textC('large', sec.name, LW / 2, 102, 'ink', 1, a);
  }
  if (R.pickup && S.t - R.pickup.t0 < 1.2) {
    const u = S.t - R.pickup.t0;
    const label = R.pickup.kind === 'nova' ? '+ NOVA' : R.pickup.kind === 'repair' ? '+ HULL' : 'STASIS';
    const col = R.pickup.kind === 'nova' ? 'cyan' : R.pickup.kind === 'repair' ? 'green' : 'violet';
    textC('small', label, R.ship.x, R.ship.y - 22 - u * 10, col, 1, 1 - u / 1.2);
  }
  if (R.novaFlash && S.t - R.novaFlash < 1 && (!R.pickup || S.t - R.pickup.t0 > 1.2)) {
    const u = S.t - R.novaFlash;
    textC('small', 'NOVA READY', R.ship.x, R.ship.y - 22 - u * 8, 'cyan', 1, 1 - u);
  }
  if (R.phase === 'intro') {
    const a = clamp(R.phaseT / 0.3, 0, 1);
    textC('small', 'TYPE A WORD TO LOCK ON', LW / 2, 124, 'dim', 1, a * (1 - clamp((R.phaseT - 1.3) / 0.3, 0, 1)));
  }
}

// ---------------------------------------------------------------- screens
const MENU = ['START', 'HOW TO PLAY', 'BACK'];
const PAUSE = ['RESUME', 'QUIT RUN'];
const OVER = ['RETRY', 'MENU'];

function setMode(m) {
  const prev = S.mode;
  S.mode = m;
  S.modeT = S.t;
  S.sel = 0;
  if (m === 'title' && prev !== 'title' && prev !== 'howto') {
    MUS.setMuffle(0); MUS.setTag('danger', false); MUS.setTag('boss', false);
    MUS.play('menu', { now: prev === 'results', fade: 1 });
  }
}

function startGame() {
  newRun();
  setMode('play');
  MUS.setMuffle(0);
  MUS.setIntensity(0);
  MUS.play(SECTORS[0].song, { now: true, fade: 0.4 });
  SND('launch');
}

function goResults() {
  const R = S.R;
  const mins = Math.max(1 / 60, R.time / 60);
  R.wpm = Math.round(R.hits / 5 / mins);
  R.acc = R.hits + R.misses ? Math.round(1000 * R.hits / (R.hits + R.misses)) / 10 : 100;
  R.newBest = R.score > S.best.score;
  if (R.newBest) S.best.score = R.score;
  S.best.wave = Math.max(S.best.wave, R.wave);
  setMode('results');
  MUS.setMuffle(0);
  MUS.setTag('danger', false); MUS.setTag('boss', false);
  MUS.play('results', { now: true, fade: 1.2 });
  if (R.newBest) NovaAudio.sting('best');
}

function menuNav(k, items, onPick, onBack) {
  const keys = k.keys || [];
  const has = c => keys.includes(c);
  if (has('ArrowDown')) { S.sel = (S.sel + 1) % items.length; SND('ui_move'); }
  if (has('ArrowUp')) { S.sel = (S.sel + items.length - 1) % items.length; SND('ui_move'); }
  if (k.enter) { SND('ui_select'); onPick(items[S.sel]); return; }
  if (has('Escape') && onBack) { SND('ui_back'); onBack(); }
}

function exitGame() {
  if (typeof window === 'undefined') return;
  if (window.TYPEMAXX) window.TYPEMAXX.pixel = null;
  if (typeof window.TYPEMAXX_SETGAME === 'function') window.TYPEMAXX_SETGAME(null);
  else if (typeof window.TYPEMAXX_RESTORE_MENU === 'function') window.TYPEMAXX_RESTORE_MENU();
}

function handleInput(k) {
  const keys = k.keys || [];
  const has = c => keys.includes(c);
  switch (S.mode) {
    case 'title':
      menuNav(k, MENU, it => {
        if (it === 'START') startGame();
        else if (it === 'HOW TO PLAY') setMode('howto');
        else exitGame();
      }, exitGame);
      break;
    case 'howto':
      if (k.enter || has('Escape') || has('Backspace')) { SND('ui_back'); setMode('title'); }
      break;
    case 'play': {
      const R = S.R;
      if (has('Escape')) { S.mode = 'pause'; S.sel = 0; SND('ui_back'); MUS.setMuffle(0.6); NovaAudio.pause(true); return; }
      if (R.dead) return;
      if (k.back) release();
      for (const ch of k.chars || []) typeChar(ch);
      if (k.enter) fireNova();
      break;
    }
    case 'pause':
      menuNav(k, PAUSE, it => {
        NovaAudio.pause(false);
        if (it === 'RESUME') { S.mode = 'play'; MUS.setMuffle(0); }
        else { S.R = null; setMode('title'); }
      }, () => { NovaAudio.pause(false); S.mode = 'play'; MUS.setMuffle(0); });
      break;
    case 'results':
      if (S.t - S.modeT < 0.8) return;
      menuNav(k, OVER, it => { if (it === 'RETRY') startGame(); else setMode('title'); }, () => setMode('title'));
      break;
  }
}

function drawMenuList(items, y, gap) {
  items.forEach((it, i) => {
    const on = i === S.sel;
    const w = textW('large', it);
    if (on) {
      const pulse = Math.sin(S.t * 6) * 1.5;
      rect(LW / 2 - w / 2 - 14 - pulse, y + i * gap + 7, 5, 1, '#FFB43C');
      rect(LW / 2 + w / 2 + 9 + pulse, y + i * gap + 7, 5, 1, '#FFB43C');
    }
    textC('large', it, LW / 2, y + i * gap, on ? 'hot' : 'dim');
  });
}

function drawTitle() {
  drawSky(S.dt, 0);
  const u = S.t - S.modeT;
  // a ship idles on patrol, firing at nothing in particular
  const sx = LW / 2 + Math.sin(S.t * 0.7) * 20, sy = 150 + Math.sin(S.t * 1.3) * 3;
  const a = Math.sin(S.t * 0.7 + 1.2) * 0.25;
  put('player', shipFrame(a), sx, sy);
  const lt = tile('logo_nova');
  const s = 2;
  const e = easeOut(clamp(u / 0.6, 0, 1));
  blit('logo_nova', LW / 2 - lt[2] * s / 2, 22 - (1 - e) * 20, e, s);
  textC('small', 'A TYPING SHOOTER', LW / 2, 106, 'cyan', 1, e);
  drawMenuList(MENU, 170, 18);
  if (S.best.score > 0) textC('small', 'BEST ' + pad(S.best.score, 6) + '   WAVE ' + S.best.wave, LW / 2, 228, 'dim');
  else textC('small', 'ARROWS + ENTER', LW / 2, 228, 'shade');
}

function drawHowto() {
  drawSky(S.dt, 0);
  rect(16, 14, LW - 32, LH - 28, 'rgba(3,4,12,0.8)');
  frame1(16, 14, LW - 32, LH - 28, '#2A3450');
  textC('large', 'HOW TO PLAY', LW / 2, 20, 'ink');
  const rows = [
    ['drone_klaed', 'TYPE A WORD TO SHOOT ITS SHIP', 'ink'],
    ['reticle', 'THE FIRST LETTER LOCKS ON. BACKSPACE LETS GO', 'ink'],
    ['raptor_nairan', 'MISSILES AND ORBS CARRY WORDS TOO', 'ink'],
    ['gemini_nautolan', 'BOMBERS SPLIT IN TWO', 'ink'],
    ['cap_nova', 'ENTER FIRES A NOVA. STREAKS EARN MORE', 'cyan'],
    ['cap_repair', 'CAPSULES: NOVA, HULL, STASIS', 'green'],
    ['boss_klaed', 'EVERY TENTH WAVE: THE MOTHERSHIP', 'red'],
  ];
  rows.forEach((r, i) => {
    const y = 48 + i * 24;
    const sc = r[0].startsWith('boss') ? 0.2 : r[0] === 'reticle' ? 1 : 0.6;
    putScaled(r[0], frameOf(r[0], S.t), 38, y + 4, sc);
    text('small', r[1], 62, y, r[2]);
  });
  textC('small', 'ENTER TO GO BACK', LW / 2, LH - 24, 'dim');
}

function drawPause() {
  drawRun();
  rect(0, 0, LW, LH, 'rgba(3,4,12,0.72)');
  textC('large', 'PAUSED', LW / 2, 80, 'ink');
  drawMenuList(PAUSE, 118, 18);
}

function drawResults() {
  const R = S.R;
  drawSky(S.dt, 0);
  rect(40, 26, LW - 80, LH - 52, 'rgba(3,4,12,0.82)');
  frame1(40, 26, LW - 80, LH - 52, '#2A3450');
  const u = S.t - S.modeT;
  textC('large', 'SIGNAL LOST', LW / 2, 34, 'red');
  const rows = [['SCORE', pad(R.score, 6)], ['WAVE', String(R.wave)], ['ACCURACY', R.acc.toFixed(1) + '%'], ['SPEED', R.wpm + ' WPM'], ['BEST STREAK', String(R.maxStreak)], ['KILLS', String(R.kills)]];
  rows.forEach((r, i) => {
    const a = clamp((u - 0.2 - i * 0.12) / 0.2, 0, 1);
    text('small', r[0], 64, 62 + i * 14, 'dim', 1, a);
    textR('small', r[1], LW - 64, 62 + i * 14, i === 0 ? 'ink' : 'pale', 1, a);
  });
  if (R.newBest && u > 1) textC('small', 'NEW BEST THIS VISIT', LW / 2, 148, 'gold', 1, ((S.t * 3) | 0) % 2 ? 1 : 0.5);
  drawMenuList(OVER, 166, 18);
}

function drawLoading() {
  const g = ctx();
  g.fillStyle = '#03030A';
  g.fillRect(0, 0, LW, LH);
  g.fillStyle = '#6CF0FF';
  for (let i = 0; i < 3; i++) if (((S.t * 3) | 0) % 3 === i) g.fillRect(150 + i * 8, 118, 4, 4);
}

// ---------------------------------------------------------------- showcase
// The select screen: an intro (a star collapses into the mark) and a 10 s
// trailer that cuts between three sectors of real play, driven by an
// autopilot typing flawlessly. It loops on an exact 10 s.
const SHOW_INTRO = 1.5, SHOW_LOOP = 10;
const SHOTS = [
  { t: 0, d: 3.5, sector: 0, wave: 6, seed: 7, pre: [['drone', 90, 60], ['drone', 200, 30], ['raptor', 150, 10], ['gemini', 250, 70], ['drone', 60, 110]] },
  { t: 3.5, d: 3.0, sector: 1, wave: 13, seed: 21, pre: [['warden', 160, 30], ['drone', 70, 80], ['drone', 250, 90], ['raptor', 110, 20], ['missile', 220, 120], ['drone', 170, 130]] },
  { t: 6.5, d: 3.5, sector: 3, wave: 20, seed: 5, boss: true, pre: [['drone', 60, 120], ['drone', 260, 110], ['orb', 150, 140]] },
];
const SHOW = { shot: -1, run: null, simT: 0, ready: false };

function showcaseShot(t) {
  const lt = ((t % SHOW_LOOP) + SHOW_LOOP) % SHOW_LOOP;
  let i = SHOTS.length - 1;
  for (let k = 0; k < SHOTS.length; k++) if (lt >= SHOTS[k].t && lt < SHOTS[k].t + SHOTS[k].d) i = k;
  return { i, local: lt - SHOTS[i].t, lt };
}
function buildShot(i) {
  const sR = S.R;
  const shot = SHOTS[i];
  const R = newRun({ demo: true, seed: shot.seed, wave: shot.wave });
  R.phase = 'wave';
  R.queue = [];
  R.banner = null;
  R.novas = 1;
  setSector(shot.sector, true);
  for (const [k, x, y] of shot.pre) { const e = spawn(k, x, y); if (k === 'raptor') e.a = Math.PI + 0.2; if (k === 'warden') e.a = Math.PI; }
  if (shot.boss) { const B = spawnBoss(); B.t = 4.2; B.y = 44; }
  R.auto = { acc: 0, novaAt: shot.boss ? 2.0 : i === 1 ? 2.25 : -1 };      // on the intro track's beats (8.5 s, 5.75 s)
  SHOW.run = R;
  SHOW.bg = { sector: shot.sector, from: shot.sector, mix: 1, scroll: 40 + i * 90, warp: 0 };
  S.R = sR;
}
// the autopilot: types the nearest word flawlessly at a brisk 11 letters a second
function autopilot(R, dt, local) {
  const A = R.auto;
  A.acc += dt * 11;
  while (A.acc >= 1) {
    A.acc -= 1;
    let e = R.target;
    if (!e || e.dead || e.typed >= e.word.length) {
      e = null;
      let best = 1e9;
      for (const c of R.enemies) {
        if (c.dead || c.sealed || c.locked || c.typed >= c.word.length || c.y < 4) continue;
        const d = Math.hypot(c.x - R.ship.x, c.y - R.ship.y) - (c.kind === 'missile' || c.kind === 'orb' ? 60 : 0);
        if (d < best) { best = d; e = c; }
      }
    }
    if (!e) break;
    typeChar(e.word[e.typed]);
  }
  if (A.novaAt > 0 && local >= A.novaAt && !A.novaDone) { A.novaDone = true; fireNova(); }
}
function stepShowcase(t) {
  const { i, local } = showcaseShot(t);
  if (i !== SHOW.shot || local < SHOW.simT - 0.25 || !SHOW.run) { SHOW.shot = i; buildShot(i); SHOW.simT = 0; }
  const sR = S.R, sBg = S.bg, sT = S.t, sShake = S.shake, sFlash = S.flash;
  S.R = SHOW.run; S.bg = SHOW.bg;
  // advance the shot's own clock in fixed steps up to `local`
  let guard = 0;
  while (SHOW.simT < local && guard++ < 240) {
    const dt = Math.min(1 / 60, local - SHOW.simT);
    SHOW.simT += dt;
    S.t = 1000 + i * 100 + SHOW.simT;
    S.dt = dt;
    autopilot(SHOW.run, dt, SHOW.simT);
    // keep the sky busy: refill to a few enemies
    const alive = SHOW.run.enemies.filter(e => !e.dead).length;
    if (alive < 4 && !SHOW.run.boss) { S.R = SHOW.run; spawnFromQueue(['drone', 'drone', 'raptor', 'gemini'][Math.floor(SHOW.run.rnd() * 4)]); }
    update(dt);
  }
  SHOW.shake = S.shake; SHOW.flash = S.flash; SHOW.t = S.t;
  S.R = sR; S.bg = sBg; S.t = sT; S.shake = sShake; S.flash = sFlash;
}
function showcaseScene(g, W, H, fn) {
  const sC = S.ctx;
  S.ctx = g;
  g.save();
  g.imageSmoothingEnabled = false;
  g.scale(W / LW, H / LH);
  try { fn(); } catch (e) { if (!showcaseScene.warned) { showcaseScene.warned = true; console.error('NOVA showcase:', e); } }
  finally { g.restore(); S.ctx = sC; }
}
let showLast = 0, showWatch = null, showLap = null, showPrev = 0;
function showcaseAudio(t) {
  showLast = performance.now();
  if (S.active) return;
  const lap = Math.floor(t / SHOW_LOOP);
  const fresh = showLap == null || performance.now() - showPrev > 400;
  const wrapped = !fresh && lap !== showLap;
  showLap = lap; showPrev = performance.now();
  if (!NovaAudio.ready) return;
  if (MUS.current !== 'intro') {
    if (wrapped || (fresh && t % SHOW_LOOP < 0.5)) MUS.play('intro', { now: true, restart: true, fade: 0.05 });
  } else if (wrapped) {
    const p = MUS.position, bar = 60 / p.bpm * 4;
    const phase = ((p.step / 16) * bar) % SHOW_LOOP;
    if (Math.min(phase, SHOW_LOOP - phase) > 0.3) MUS.play('intro', { now: true, restart: true, fade: 0.05 });
  }
  if (!showWatch) showWatch = setInterval(() => {
    if (performance.now() - showLast > 400) { if (MUS.current === 'intro') MUS.stop(0.6); clearInterval(showWatch); showWatch = null; }
  }, 200);
}

const NOVA_SHOWCASE = {
  INTRO: SHOW_INTRO,
  LOOP: SHOW_LOOP,
  get ready() { return S.ready; },
  preload() { if (!S.ready && !S.loading) loadAssets(); return new Promise(res => { const w = () => S.ready || S.error ? res(S.ready) : setTimeout(w, 50); w(); }); },

  background(g, W, H, t, dim) {
    if (!S.ready) { if (!S.loading && !S.error) loadAssets(); g.fillStyle = '#03030A'; g.fillRect(0, 0, W, H); return; }
    showcaseAudio(t);
    const wasActive = S.active;
    if (wasActive) return;          // never steal state from a live game
    stepShowcase(t);
    showcaseScene(g, W, H, () => {
      const sR = S.R, sBg = S.bg, sT = S.t;
      S.R = SHOW.run; S.bg = SHOW.bg; S.t = SHOW.t;
      const k = S.shake; S.shake = 0;
      const sh = SHOW.shake || 0;
      if (sh > 0) ctx().translate(Math.round((hash((S.t * 60) | 0, 1) - 0.5) * sh * 2), Math.round((hash((S.t * 60) | 0, 2) - 0.5) * sh * 2));
      const sDt = S.dt; S.dt = 0;
      drawRunShowcase();
      S.dt = sDt;
      S.shake = k;
      if (SHOW.flash) {
        const u = (S.t - SHOW.flash.t0) / SHOW.flash.dur;
        if (u < 1) { ctx().globalAlpha = 1 - u; rect(-4, -4, LW + 8, LH + 8, SHOW.flash.css); ctx().globalAlpha = 1; }
      }
      S.R = sR; S.bg = sBg; S.t = sT;
      // cuts: a white warp streak across every shot change
      const { local, lt } = showcaseShot(t);
      const shot = SHOTS[showcaseShot(t).i];
      const toEnd = shot.d - local;
      if (local < 0.12) { ctx().globalAlpha = 1 - local / 0.12; rect(0, 0, LW, LH, '#FFFFFF'); ctx().globalAlpha = 1; }
      if (toEnd < 0.18) {
        const u = 1 - toEnd / 0.18;
        for (let i = 0; i < 40; i++) {
          const x = hash(i, 91) * LW, len = 20 + u * 120;
          ctx().globalAlpha = u * 0.8;
          rect(x, hash(i, 92) * LH - len / 2, 1, len, i % 3 ? '#FFFFFF' : '#9CEBFF');
        }
        ctx().globalAlpha = 1;
      }
      void lt;
      // the menu reads over a darker top and bottom
      const d = dim == null ? 0.5 : dim;
      const gr = ctx().createLinearGradient(0, 0, 0, LH);
      gr.addColorStop(0, 'rgba(2,2,8,' + (d * 0.9).toFixed(2) + ')');
      gr.addColorStop(0.35, 'rgba(2,2,8,' + (d * 0.25).toFixed(2) + ')');
      gr.addColorStop(0.6, 'rgba(2,2,8,' + (d * 0.3).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(2,2,8,' + d.toFixed(2) + ')');
      ctx().fillStyle = gr;
      ctx().fillRect(0, 0, LW, LH);
      // the intro: the dark, a single star, it collapses and bursts open
      if (t < SHOW_INTRO) {
        const u = t / SHOW_INTRO;
        const open = easeIO(clamp((t - 0.7) / 0.6, 0, 1));
        const g2 = ctx();
        g2.save();
        g2.fillStyle = '#02020A';
        g2.beginPath();
        g2.rect(-10, -10, LW + 20, LH + 20);
        const rr = open * 260;
        if (rr > 0) g2.arc(LW / 2, LH / 2, rr, 0, TAU, true);
        g2.fill('evenodd');
        g2.restore();
        if (t < 1.0) {
          const pulse = t < 0.55 ? easeOut(t / 0.55) * 3 : (1 - clamp((t - 0.55) / 0.15, 0, 1)) * 3;
          rect(LW / 2 - pulse, LH / 2, pulse * 2 + 1, 1, '#FFFFFF');
          rect(LW / 2, LH / 2 - pulse * 3, 1, pulse * 6 + 1, '#FFFFFF');
          if (t > 0.55 && t < 0.9) ring(LW / 2, LH / 2, (t - 0.55) * 300, '#9CEBFF', 1 - (t - 0.55) / 0.35);
        }
        if (t > 0.62 && t < 0.78) { ctx().globalAlpha = 0.5; rect(0, 0, LW, LH, '#E8FFFF'); ctx().globalAlpha = 1; }
        void u;
      }
    });
  },

  logo(g, cx, cy, width, t) {
    if (!S.ready) return;
    const tl = tile('logo_nova');
    const e = easeOut(clamp((t - 0.8) / 0.4, 0, 1));
    if (e <= 0) return;
    const sc = width / tl[2];
    const w = tl[2] * sc, h = tl[3] * sc;
    g.save();
    g.imageSmoothingEnabled = false;
    g.globalAlpha = e;
    const zoom = 1 + (1 - e) * 0.25;
    g.drawImage(S.img, tl[0], tl[1], tl[2], tl[3], Math.round(cx - w * zoom / 2), Math.round(cy - h * zoom / 2), Math.round(w * zoom), Math.round(h * zoom));
    // the star in the O flares every few seconds
    const fu = ((t - 1.2) % 4) / 0.5;
    if (t > 1.2 && fu <= 1) {
      const sx = cx - w / 2 + 50 * sc, sy = cy - h / 2 + 19 * sc;
      const a = Math.sin(fu * Math.PI);
      const rr = g.createRadialGradient(sx, sy, 0, sx, sy, 16 * sc);
      rr.addColorStop(0, 'rgba(230,255,255,' + (0.9 * a).toFixed(2) + ')'); rr.addColorStop(1, 'rgba(120,220,255,0)');
      g.fillStyle = rr;
      g.fillRect(sx - 16 * sc, sy - 16 * sc, 32 * sc, 32 * sc);
      g.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      g.fillRect(Math.round(sx - 26 * sc * a), Math.round(sy), Math.round(52 * sc * a), Math.max(1, Math.round(sc)));
    }
    g.restore();
  },

  icon(g, x, y, size, t, focused) {
    if (!S.ready) return;
    const tl = tile('icon_nova');
    const pop = t < 1.1 ? 0 : t < 1.35 ? 1 - Math.pow(1 - (t - 1.1) / 0.25, 3) : 1;
    if (pop <= 0) return;
    const bounce = t < 1.5 ? 1 + Math.sin(clamp((t - 1.1) / 0.4, 0, 1) * Math.PI) * 0.08 : 1;
    const lift = focused ? Math.round(Math.sin(t * 3) * size * 0.02) - size * 0.03 : 0;
    const s = size * bounce;
    const ix = Math.round(x + (size - s) / 2), iy = Math.round(y + (size - s) / 2 + lift);
    g.save();
    g.imageSmoothingEnabled = false;
    g.globalAlpha = focused ? pop : pop * 0.72;
    g.drawImage(S.img, tl[0], tl[1], tl[2], tl[3], ix, iy, Math.round(s), Math.round(s));
    // the nova ring pulses outward from the ship
    const pu = (t % 2.4) / 1.2;
    if (pu <= 1) {
      g.globalAlpha = (focused ? 0.8 : 0.5) * (1 - pu) * pop;
      g.strokeStyle = '#9CEBFF';
      g.lineWidth = Math.max(1, size / 40);
      g.beginPath();
      g.arc(ix + s / 2, iy + s * 0.47, s * (0.25 + pu * 0.22), 0, TAU);
      g.stroke();
    }
    if (focused) {
      g.globalAlpha = 0.6 + Math.sin(t * 4) * 0.25;
      g.strokeStyle = '#6CF0FF';
      g.lineWidth = Math.max(1, size / 32);
      const r = s * 0.16;
      g.beginPath();
      g.moveTo(ix + r, iy - 1); g.lineTo(ix + s - r, iy - 1); g.quadraticCurveTo(ix + s + 1, iy - 1, ix + s + 1, iy + r);
      g.lineTo(ix + s + 1, iy + s - r); g.quadraticCurveTo(ix + s + 1, iy + s + 1, ix + s - r, iy + s + 1);
      g.lineTo(ix + r, iy + s + 1); g.quadraticCurveTo(ix - 1, iy + s + 1, ix - 1, iy + s - r);
      g.lineTo(ix - 1, iy + r); g.quadraticCurveTo(ix - 1, iy - 1, ix + r, iy - 1);
      g.stroke();
    }
    g.restore();
  },
};
// the trailer draws a run without the HUD or banners
const HUD_ON = { on: true };
function drawRunShowcase() {
  HUD_ON.on = false;
  try { drawRun(); } finally { HUD_ON.on = true; }
}

// ---------------------------------------------------------------- the export
const NOVA = {
  title: 'NOVA',
  get state() { return S; },
  get dev() { return { newRun, startWave, typeChar, fireNova, update, spawn, waveSpec }; },
  showcase: NOVA_SHOWCASE,
  audio: NovaAudio,

  enter() {
    S.active = true;
    loadAssets();
    S.mode = 'title';
    S.modeT = S.t;
    S.sel = 0;
    S.lastSec = null;
    S.flash = null;
    S.shake = 0;
    S.bg = { sector: 0, from: 0, mix: 1, scroll: 0, warp: 0 };
    MUS.setMuffle(0);
    MUS.play('menu', { now: true, fade: 1 });
  },

  exit() {
    S.active = false;
    if (typeof window !== 'undefined' && window.TYPEMAXX) window.TYPEMAXX.pixel = null;
    NovaAudio.pause(false);
    NovaAudio.stopAll(0.8);
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
    if (S.mode === 'play' && S.R) update(S.dt);
    if (S.shake > 0) {
      const a = S.shake;
      g.translate(Math.round((hash((S.t * 60) | 0, 1) - 0.5) * a * 2), Math.round((hash((S.t * 60) | 0, 2) - 0.5) * a * 2));
      S.shake = Math.max(0, S.shake - S.dt * 20);
    }
    switch (S.mode) {
      case 'title': drawTitle(); break;
      case 'howto': drawHowto(); break;
      case 'play': drawRun(); break;
      case 'pause': drawPause(); break;
      case 'results': drawResults(); break;
    }
    if (S.flash) {
      const u = (S.t - S.flash.t0) / S.flash.dur;
      if (u >= 1) S.flash = null;
      else { g.globalAlpha = 1 - u; g.fillStyle = S.flash.css; g.fillRect(-4, -4, LW + 8, LH + 8); g.globalAlpha = 1; }
    }
    g.restore();
  },
};

if (typeof window !== 'undefined') {
  const start = () => { if (!S.ready && !S.loading) loadAssets(); };
  if (document.readyState === 'complete') setTimeout(start, 400);
  else addEventListener('load', () => setTimeout(start, 400), { once: true });
}

export default NOVA;
export { NOVA };
