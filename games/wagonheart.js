/*
 * WAGONHEART - a typing journey for TYPEMAXX.
 *
 * Lead a wagon west across a land with no far edge. Every word you type moves
 * the wheels: type fast and you cover ground but wear out people and horses;
 * type carelessly and the wagon jolts. Rivers, sickness, broken wheels, wolves,
 * strangers, the hunt, graves by the road and the standing stones that carve a
 * poem one line at a time. When the coast comes, the trail begins again.
 *
 * Contract (TYPEMAXX engine): export an object with enter(), exit() and
 * draw(ctx, W, H, seconds, now, input). input.pull() returns
 * { chars, keys, back, enter }. Everything is drawn in 320x240.
 *
 * Modules: wagonheart-sim.js (the journey), wagonheart-text.js (words),
 * wagonheart-light.js (every land at every hour), wagonheart-audio.js (sound).
 * Art: assets/wagonheart/atlas.png, land.png, manifest.json.
 * Nothing is stored locally. Nothing sounds on a keystroke itself.
 */

import Sim from './wagonheart-sim.js';
import TXT from './wagonheart-text.js';
import { lightAt, lightBetween } from './wagonheart-light.js';
import Audio from './wagonheart-audio.js';

const BASE = new URL('../assets/wagonheart/', import.meta.url).href;
const SND = (n, o) => Audio.sfx(n, o);
const MUS = Audio.music;
const AFTER_KEY = 0.06;
const LW = 320, LH = 240;
const TAU = Math.PI * 2;
const GROUND = 190, ROAD = 202;
const WAGON_X = 196;

const COL = {
  ink: '#2A1C14', paper: '#F4EAD2', cream: '#FFF6E0', dim: '#8A7A64', faint: '#B8A88C', red: '#C0402E', green: '#4A7A34',
  gold: '#E0A030', white: '#FFFFFF', sky: '#DCEBFF', shadow: '#1A120C', hot: '#F2C860', blue: '#4A6AA8',
};

// ---------------------------------------------------------------- state
const S = {
  loading: false, ready: false, error: null, M: null, img: null, land: null, tint: {}, fontY0: 0,
  mode: 'title', modeT: 0, t: 0, lastSec: null, dt: 0, ctx: null, active: false, sel: 0, flash: null, shake: 0,
  R: null, view: null, overlay: null, toast: null, best: 0,
};
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, u) => a + (b - a) * u;
const easeIO = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
const easeOut = u => 1 - Math.pow(1 - u, 3);
function hash(i, k) { let x = (i * 374761393 + k * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- assets
async function loadImg(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('failed to load ' + src)); img.src = src; });
  if (img.decode) await Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
  return img;
}
async function loadAssets() {
  if (S.loading || S.ready) return;
  S.loading = true;
  try {
    const M = await (await fetch(BASE + 'manifest.json')).json();
    const [img, land] = await Promise.all([loadImg(BASE + 'atlas.png'), loadImg(BASE + M.land.file)]);
    S.M = M; S.img = img; S.land = land;
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
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(S.img, 0, y0, w, h, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = css; g.fillRect(0, 0, w, h);
    S.tint[name] = c;
  }
}

// ---------------------------------------------------------------- drawing kit
const ctx = () => S.ctx;
function rect(x, y, w, h, css, a) { const g = ctx(); if (a != null) g.globalAlpha = clamp(a, 0, 1); g.fillStyle = css; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); g.globalAlpha = 1; }
function frame1(x, y, w, h, css) { rect(x, y, w, 1, css); rect(x, y + h - 1, w, 1, css); rect(x, y, 1, h, css); rect(x + w - 1, y, 1, h, css); }
function clipFrame(name, i) { const c = S.M.clips[name]; if (!c) return null; const n = c.frames.length; return [c, c.frames[((Math.floor(i) % n) + n) % n]]; }
const frameOf = (name, sec) => { const c = S.M.clips[name]; return c ? Math.floor(sec * 1000 / c.ms) : 0; };
function put(name, i, x, y, opt) {
  const cf = clipFrame(name, i); if (!cf) return;
  const [c, f] = cf;
  const g = ctx();
  const src = opt && opt.lit ? litSprite(name, i, f, opt.lit) : null;
  const flip = opt && opt.flip;
  const ax = flip ? f[2] - 1 - c.anchor[0] : c.anchor[0];
  if (opt && opt.alpha != null) g.globalAlpha = clamp(opt.alpha, 0, 1);
  if (flip) { g.save(); g.translate(Math.round(x - ax) + f[2], Math.round(y - c.anchor[1])); g.scale(-1, 1); }
  const dx = flip ? 0 : Math.round(x - ax), dy = flip ? 0 : Math.round(y - c.anchor[1]);
  if (src) g.drawImage(src, 0, 0, f[2], f[3], dx, dy, f[2], f[3]);
  else g.drawImage(S.img, f[0], f[1], f[2], f[3], dx, dy, f[2], f[3]);
  if (flip) g.restore();
  g.globalAlpha = 1;
}
function tile(name) { return S.M.tiles[name]; }
function blit(name, x, y, s, a) { const t = tile(name); if (!t) return; s = s || 1; const g = ctx(); if (a != null) g.globalAlpha = clamp(a, 0, 1); g.drawImage(S.img, t[0], t[1], t[2], t[3], Math.round(x), Math.round(y), Math.round(t[2] * s), Math.round(t[3] * s)); g.globalAlpha = 1; }
const face = n => S.M.fonts[n];
function textW(f, str) { const G = face(f).glyphs; let w = 0; for (const ch of str) { const g = G[ch]; w += g ? g[4] : 3; } return w; }
function text(f, str, x, y, colour, a) {
  const sheet = S.tint[colour] || S.tint.ink, G = face(f).glyphs, g2 = ctx();
  if (a != null) g2.globalAlpha = clamp(a, 0, 1);
  let pen = Math.round(x); const top = Math.round(y);
  for (const ch of str) { const g = G[ch]; if (!g) { pen += 3; continue; } if (g[2] && g[3]) g2.drawImage(sheet, g[0], g[1] - S.fontY0, g[2], g[3], pen + g[5], top + g[6], g[2], g[3]); pen += g[4]; }
  g2.globalAlpha = 1;
  return pen;
}
const textC = (f, s, cx, y, c, a) => text(f, s, Math.round(cx - textW(f, s) / 2), y, c, a);
const textR = (f, s, rx, y, c, a) => text(f, s, Math.round(rx - textW(f, s)), y, c, a);
function shadowText(f, s, x, y, c, a) { text(f, s, x + 1, y + 1, 'shadow', a == null ? 0.6 : a * 0.6); return text(f, s, x, y, c, a); }
function shadowTextC(f, s, cx, y, c, a) { return shadowText(f, s, Math.round(cx - textW(f, s) / 2), y, c, a); }
// a parchment panel
function panel(x, y, w, h, a) {
  a = a == null ? 1 : a;
  rect(x + 2, y + 2, w, h, '#1A120C', 0.35 * a);
  rect(x, y, w, h, '#EFE2C4', a);
  rect(x, y, w, 2, '#F8F0DC', a); rect(x, y + h - 2, w, 2, '#CDB894', a);
  frame1(x - 1, y - 1, w + 2, h + 2, 'rgba(58,36,22,' + a + ')');
  for (let i = 0; i < 6; i++) rect(x + ((hash(i, 91) * (w - 6)) | 0) + 3, y + ((hash(i, 92) * (h - 4)) | 0) + 2, 2, 1, '#D8C6A0', a * 0.6);
}

// ---------------------------------------------------------------- light
// tinted copies of land layers and sprites, cached by a quantised light
const tintCache = new Map();
function tintKey(tint, lift, liftCol) { return tint + '|' + Math.round(lift * 20) + '|' + liftCol; }
function tinted(srcImg, sx, sy, sw, sh, tint, lift, liftCol, key) {
  const k = key + '|' + tintKey(tint, lift, liftCol);
  let c = tintCache.get(k);
  if (c) return c;
  c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const g = c.getContext('2d');
  g.drawImage(srcImg, sx, sy, sw, sh, 0, 0, sw, sh);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, sw, sh);
  if (lift > 0.01) { g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.min(0.85, lift); g.fillStyle = liftCol; g.fillRect(0, 0, sw, sh); g.globalAlpha = 1; }
  g.globalCompositeOperation = 'destination-in'; g.drawImage(srcImg, sx, sy, sw, sh, 0, 0, sw, sh);
  tintCache.set(k, c);
  if (tintCache.size > 700) { const first = tintCache.keys().next().value; tintCache.delete(first); }
  return c;
}
const hexToRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbHex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function litSprite(name, i, f, L) {
  const amb = clamp(L.amb, 0.25, 1.25);
  const a = Math.round(amb * 20) / 20;
  const shade = a >= 1 ? '#FFFFFF' : rgbHex([255 * a, 255 * a, 255 * Math.min(1, a * 1.08)]);
  const rimM = /rgba?\(([^)]+)\)/.exec(L.rim);
  const rp = rimM ? rimM[1].split(',').map(Number) : [255, 255, 255, 0];
  const rimCol = rgbHex(rp.slice(0, 3));
  const lift = (a > 1 ? (a - 1) * 0.6 : 0) + (rp[3] || 0) * 0.12;
  return tinted(S.img, f[0], f[1], f[2], f[3], shade, Math.round(lift * 20) / 20, a > 1 ? '#FFFFFF' : rimCol, 'spr:' + name + ':' + Math.floor(i));
}

// the light on the trail right now (quantised so caches hold)
function currentLight(R) {
  const hour = Math.round(((R.hour % 8) + 8) % 8 * 8) / 8;
  if (R.transition) return lightBetween(R.transition.from, R.transition.to, hour, Math.round(R.transition.t * 10) / 10);
  return lightAt(Sim.biome(R), hour);
}

// ---------------------------------------------------------------- the land
function landLayer(name) { return S.M.land.layers[name]; }
// the wagon rolls west (screen left), so the land slides to the right as the miles grow
const tileStart = (scroll, w) => (((scroll % w) + w) % w) - w;
function drawLayer(name, topY, scroll, tint, lift, liftCol, alpha) {
  const layer = landLayer(name); if (!layer) return;
  const [sx, sy, sw, sh] = layer.rect;
  const c = tinted(S.land, sx, sy, sw, sh, tint, lift, liftCol, 'land:' + name);
  const g = ctx();
  if (alpha != null) g.globalAlpha = clamp(alpha, 0, 1);
  for (let x = Math.round(tileStart(scroll, sw)); x < LW; x += sw) g.drawImage(c, x, Math.round(topY));
  g.globalAlpha = 1;
}
function drawSky(L, R, scroll) {
  const g = ctx();
  const gr = g.createLinearGradient(0, 0, 0, GROUND);
  gr.addColorStop(0, L.sky[0]); gr.addColorStop(0.55, L.sky[1]); gr.addColorStop(1, L.sky[2]);
  g.fillStyle = gr; g.fillRect(0, 0, LW, GROUND);
  // stars
  if (L.stars > 0.02) {
    for (let i = 0; i < 90; i++) {
      const x = hash(i, 3) * LW, y = hash(i, 4) * 150;
      const tw = 0.5 + 0.5 * Math.sin(S.t * (1 + hash(i, 5) * 2) + i);
      rect(x, y, 1, 1, i % 7 ? '#FFFFFF' : '#FFE8C0', L.stars * tw * (0.4 + hash(i, 6) * 0.6));
    }
  }
  // aurora in the Pass
  if (L.fx === 'aurora') {
    for (let x = 0; x < LW; x += 2) {
      const y = 40 + Math.sin(x * 0.03 + S.t * 0.6) * 14 + Math.sin(x * 0.011 - S.t * 0.3) * 10;
      const a = (0.18 + 0.12 * Math.sin(x * 0.05 + S.t)) * (L.fxA || 1);
      rect(x, y, 2, 26 + Math.sin(x * 0.07 + S.t) * 8, '#6CF0B4', a);
      rect(x, y - 8, 2, 8, '#B48CFF', a * 0.5);
    }
  }
  // sun and moon on their arcs
  const body = (b, isSun) => {
    if (!b) return;
    const vis = b[4] == null ? 1 : b[4];
    const h = b[3];
    const x = isSun ? lerp(60, 260, clamp(1 - h, 0, 1)) : lerp(250, 70, clamp(1 - h, 0, 1));
    const y = lerp(GROUND - 6, 26, h);
    const glowR = b[2];
    const rg = g.createRadialGradient(x, y, 0, x, y, glowR);
    rg.addColorStop(0, b[1]); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = vis; g.fillStyle = rg; g.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2);
    g.fillStyle = b[0];
    g.beginPath(); g.arc(Math.round(x), Math.round(y), isSun ? 7 : 5, 0, TAU); g.fill();
    if (!isSun) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.beginPath(); g.arc(Math.round(x) + 2, Math.round(y) - 1, 2, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  };
  body(L.sun, true); body(L.moon, false);
}
function drawLand(R, L, scroll, biome, nextBiome, mix) {
  const B = S.M.land.biomes;
  const drawBiome = (b, a) => {
    if (a <= 0.001) return;
    const spec = B[b];
    if (spec.clouds) {
      const cl = landLayer('clouds_' + spec.clouds);
      // clouds take the colour of the sky they sit in, and fade out under the stars
      // a cloud bank sunk behind the far hills, so only its crown rises over the horizon
      drawLayer('clouds_' + spec.clouds, 58 - cl.y, scroll * 0.03 + S.t * 1.5, mixCol(L.sky[2], '#FFFFFF', 0.35), 0.1, L.sky[1], a * clamp(1 - L.stars * 0.6, 0.3, 0.9));
    }
    const far = landLayer(b + '_far');
    if (far) drawLayer(b + '_far', spec.farBase - far.rect[3], scroll * 0.12, L.far[0], L.far[1], L.sky[2], a);
    if (spec.sea) drawSea(L, scroll, a);
    const mid = landLayer(b + '_mid');
    if (!spec.noMid && mid) drawLayer(b + '_mid', spec.midBase - mid.rect[3], scroll * 0.35, L.mid[0], L.mid[1], L.sky[2], a);
  };
  drawBiome(biome, 1);
  if (nextBiome && mix > 0) drawBiome(nextBiome, mix);
  // fog at the horizon
  if (L.fog[1] > 0.02) {
    const g = ctx(), gr = g.createLinearGradient(0, 120, 0, GROUND);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); const c = hexToRgb(L.fog[0]);
    gr.addColorStop(1, 'rgba(' + c.join(',') + ',' + (L.fog[1] * 0.8).toFixed(3) + ')');
    g.fillStyle = gr; g.fillRect(0, 120, LW, GROUND - 120);
  }
}
function mixCol(a, b, u) { const A = hexToRgb(a), Bc = hexToRgb(b); return rgbHex(A.map((v, i) => v + (Bc[i] - v) * u)); }
function drawSea(L, scroll, a) {
  const layer = landLayer('coast_sea'); if (!layer) return;
  const [sx, sy, sw, sh] = layer.rect;
  const c = tinted(S.land, sx, sy, sw, sh, L.mid[0], L.mid[1], L.sky[2], 'land:coast_sea');
  const g = ctx(); g.globalAlpha = a;
  // the sea reaches back to the horizon and laps the foot of the far island
  for (let x = Math.round(tileStart(scroll * 0.2 + S.t * 3, sw)); x < LW; x += sw) g.drawImage(c, x, 140);
  if (L.sun && L.sun[3] < 0.3) for (let i = 0; i < 12; i++) rect(lerp(60, 260, clamp(1 - L.sun[3], 0, 1)) - 12 + hash(i, 81) * 24 + Math.sin(S.t * 2 + i) * 3, 142 + i * 3, 6 + hash(i, 82) * 10, 1, '#FFE0A0', (0.5 - i * 0.03) * (L.sun[4] == null ? 1 : L.sun[4]));
  g.globalAlpha = 1;
}
function drawGround(L, scroll, biome, nextBiome, mix) {
  const one = (b, a) => {
    const layer = landLayer(b + '_ground'); if (!layer || a <= 0) return;
    const [sx, sy, sw, sh] = layer.rect;
    const c = tinted(S.land, sx, sy, sw, sh, L.near[0], L.near[1], L.sky[2], 'land:' + b + '_ground');
    const g = ctx(); g.globalAlpha = a;
    const y = GROUND - 14;
    for (let x = Math.round(tileStart(scroll, sw)); x < LW; x += sw) g.drawImage(c, x, y);
    // the earth continues below the strip in its last row's colour
    g.drawImage(c, 10, sh - 1, 1, 1, 0, y + sh, LW, LH + SHOW_LIFT - (y + sh));
    g.globalAlpha = 1;
  };
  one(biome, 1);
  if (nextBiome && mix > 0) one(nextBiome, mix);
}

// roadside dressing: deterministic by distance, per biome
const DRESS = {
  meadow: [['tree_oak', 0.18], ['tree_oak2', 0.12], ['bush_berry', 0.2], ['bush', 0.25], ['stone_0', 0.07], ['stone_1', 0.06]],
  river: [['tree_oak', 0.22], ['bush', 0.3], ['tree_oak2', 0.15], ['rock_a', 0.12]],
  barrens: [['stone_0', 0.14], ['stone_1', 0.12], ['stone_2', 0.05], ['rock_a', 0.3], ['rock_b', 0.25], ['shrub', 0.2]],
  highwood: [['tree_pine', 0.35], ['bush', 0.25], ['rock_b', 0.1]],
  pass: [['tree_pine', 0.25], ['rock_a', 0.25], ['rock_b', 0.2]],
  saltmere: [['tree_joshua', 0.08], ['tree_joshua2', 0.1], ['rock_a', 0.12], ['shrub', 0.08]],
  coast: [['tree_oak', 0.15], ['bush_berry', 0.2], ['rock_b', 0.2], ['bush', 0.2]],
};
function drawDressing(R, L, scroll, biome, back) {
  const list = DRESS[biome] || DRESS.meadow;
  const speed = back ? 0.7 : 1;
  const cell = back ? 46 : 70;
  const s = scroll * speed;
  // world position u sits at screen x = s - u, so things drift right as the wagon goes west
  const first = Math.floor((s - LW - 120) / cell), last = Math.ceil((s + 120) / cell);
  for (let i = first; i <= last; i++) {
    const r = hash(i, back ? 71 : 73);
    let acc = 0, chosen = null;
    for (const [name, p] of list) { acc += p * (back ? 1 : 0.45); if (r < acc) { chosen = name; break; } }
    if (!chosen) continue;
    const x = s - (i * cell + hash(i, 74) * cell * 0.6);
    const y = back ? GROUND + 1 + hash(i, 75) * 3 : LH + 8;
    // the near row only takes low things, so it never hides the wagon
    if (!back && !/bush|rock|shrub/.test(chosen)) continue;
    put(chosen, 0, x, y, { lit: L, flip: hash(i, 76) < 0.5 && !chosen.startsWith('stone') });
  }
}

// ---------------------------------------------------------------- a new run
function newJourney(trade, names) {
  const R = Sim.createRun({ trade, names });
  S.R = R;
  S.view = { scroll: 0, target: 0, line: null, typed: 0, errs: 0, lineErrT: -9, keysT: [], shown: 0, walkT: 0, lastPaceKey: 'steady', lastWeather: 'clear', loops: {} };
  nextLine();
  return R;
}
function fillNames(line) {
  const R = S.R;
  const alive = Sim.living(R);
  const a = alive[Math.floor(Math.random() * alive.length)];
  const others = alive.filter(p => p !== a);
  const b = others.length ? others[Math.floor(Math.random() * others.length)] : a;
  return line.replace(/\{a\}/g, a ? a.name : 'the leader').replace(/\{b\}/g, b ? b.name : 'the leader');
}
function nextLine() {
  const R = S.R, V = S.view;
  const b = Sim.biome(R);
  const P = TXT.PROSE[b] || TXT.PROSE.meadow;
  const hourName = ['night', 'night', 'dawn', 'any', 'any', 'any', 'dusk', 'night'][Math.floor(((R.hour % 8) + 8) % 8)];
  let pool = [...P.any];
  if (P[hourName]) pool = pool.concat(P[hourName], P[hourName]);
  const w = R.weather.kind;
  if (TXT.PROSE_STATE[w]) pool = pool.concat(TXT.PROSE_STATE[w], TXT.PROSE_STATE[w]);
  const alive = Sim.living(R);
  if (alive.some(p => p.ill)) pool = pool.concat(TXT.PROSE_STATE.sick);
  if (R.inv.food < alive.length * 8) pool = pool.concat(TXT.PROSE_STATE.hungry);
  if (R.morale > 80) pool = pool.concat(TXT.PROSE_STATE.happy);
  if (R.morale < 30) pool = pool.concat(TXT.PROSE_STATE.grief);
  if (V.queued && V.queued.length) { V.line = V.queued.shift(); }
  else {
    let line = pick(pool);
    for (let k = 0; k < 4 && line === V.lastLine; k++) line = pick(pool);
    V.line = fillNames(line);
  }
  V.lastLine = V.line;
  V.typed = 0; V.errs = 0;
}

// ---------------------------------------------------------------- travel
function travelChar(ch) {
  const R = S.R, V = S.view;
  if (!V.line || S.overlay) return;
  ch = ch.toLowerCase();
  const want = V.line[V.typed];
  if (ch === want) {
    V.typed++;
    V.keysT.push(S.t);
    const out = Sim.travelLetter(R, true);
    if (out.day) onNewDay();
    if (V.typed >= V.line.length) {
      Sim.finishLine(R, V.errs === 0);
      if (V.errs === 0) { V.flawlessT = S.t; if (Math.random() < 0.3) SND('cheer', { vol: 0.25, delay: AFTER_KEY }); }
      nextLine();
    }
  } else if (/^[a-z ]$/.test(ch)) {
    V.errs++;
    V.lineErrT = S.t;
    Sim.travelLetter(R, false);
    S.shake = Math.max(S.shake, 1.2);
    SND('creak', { delay: AFTER_KEY, vol: 0.25 });
  }
}
function onNewDay() {
  const R = S.R;
  if (R.weather.kind !== S.view.lastWeather) {
    S.view.lastWeather = R.weather.kind;
    if (R.weather.kind === 'storm') { SND('thunder', { delay: 0.4 }); S.view.lightningT = S.t + 0.3; }
  }
  if (Math.floor(R.hour) === 2 && Math.random() < 0.3) Audio.sting('dawn');
}
function rollingWpm() {
  const V = S.view;
  const cutoff = S.t - 8;
  while (V.keysT.length && V.keysT[0] < cutoff) V.keysT.shift();
  const span = Math.max(2, Math.min(8, S.t - (V.keysT[0] || S.t)));
  return V.keysT.length / 5 / (span / 60);
}
function updateTravel(dt) {
  const R = S.R, V = S.view;
  // pace from the keyboard
  const wpm = V.keysT.length > 4 ? rollingWpm() : 0;
  const idle = S.t - (V.keysT[V.keysT.length - 1] || -99) > 1.2;
  if (!idle) Sim.setPace(R, wpm);
  if (R.paceKey !== V.lastPaceKey) {
    if (['steady', 'hard', 'driven'].indexOf(R.paceKey) > ['steady', 'hard', 'driven'].indexOf(V.lastPaceKey) && R.paceKey !== 'easy') SND('whip', { vol: 0.3 });
    V.lastPaceKey = R.paceKey;
  }
  // the camera follows the miles: 1 mile of travel = 60 px of road
  V.target = R.miles * 60;
  V.scroll += (V.target - V.scroll) * Math.min(1, dt * 6);
  V.moving = Math.abs(V.target - V.scroll) > 0.8 || !idle;
  V.walkT += dt * (V.moving ? 1 : 0);
  // music follows the pace, the weather and the danger
  MUS.setIntensity(idle ? 0 : ['easy', 'steady', 'hard', 'driven'].indexOf(R.paceKey));
  MUS.setTag('storm', R.weather.kind === 'storm');
  MUS.setTag('danger', Sim.living(R).some(p => p.health < 25));
  const song = R.transition && R.transition.t > 0.5 ? R.transition.to : Sim.biome(R);
  if (MUS.current !== song && S.mode === 'travel' && !S.overlay) MUS.play(song, { fade: 2 });
  updateAmbience(R);
  // the journey speaks
  if (!S.overlay && R.pending.length) openEvent(R.pending.shift());
  if (!S.overlay && (R.over || !Sim.living(R).length)) endJourney();
}
const AMBI = ['rain_loop', 'wind_loop', 'river_loop', 'crickets_loop', 'surf_loop'];
function updateAmbience(R) {
  const V = S.view;
  const b = Sim.biome(R), w = R.weather.kind;
  const night = [0, 1, 7].includes(Math.floor(((R.hour % 8) + 8) % 8));
  const want = {
    rain_loop: w === 'rain' || w === 'storm' ? 0.35 : 0,
    wind_loop: b === 'pass' || w === 'dust' || w === 'snow' || (b === 'saltmere' && w === 'heat') ? 0.3 : b === 'barrens' ? 0.15 : 0,
    river_loop: b === 'river' ? 0.18 : 0,
    crickets_loop: night && ['meadow', 'river', 'highwood', 'coast'].includes(b) ? 0.2 : 0,
    surf_loop: b === 'coast' ? 0.25 : 0,
  };
  if (!Audio.ready) return;
  // now and then the land itself speaks: birds by day, an owl by night, gulls on the coast
  if (S.mode === 'travel' && !S.overlay && S.t > (V.nextCall || 0)) {
    V.nextCall = S.t + 9 + Math.random() * 14;
    if (b === 'coast' && !night) SND('gull', { vol: 0.25, pan: Math.random() * 1.2 - 0.6 });
    else if (night && ['meadow', 'river', 'highwood'].includes(b)) SND('owl', { vol: 0.22, pan: Math.random() * 1.2 - 0.6 });
    else if (!night && ['meadow', 'river', 'highwood'].includes(b) && w !== 'rain' && w !== 'storm') SND('birds', { vol: 0.2, pan: Math.random() * 1.2 - 0.6 });
  }
  const fire = S.overlay && S.overlay.kind === 'camp';
  if (fire && !V.loops.fire_loop) V.loops.fire_loop = Audio.loop('fire_loop', { vol: 0.3, fade: 0.8 });
  else if (!fire && V.loops.fire_loop) { V.loops.fire_loop.stop(1); V.loops.fire_loop = null; }
  for (const n of AMBI) {
    const v = S.mode === 'travel' && !S.overlay ? want[n] : want[n] * 0.4;
    if (v > 0 && !V.loops[n]) V.loops[n] = Audio.loop(n, { vol: v, fade: 1.5 });
    else if (V.loops[n]) { if (v <= 0) { V.loops[n].stop(1.5); V.loops[n] = null; } else V.loops[n].set(v, 0.8); }
  }
}
function stopAmbience() { const V = S.view; if (!V) return; for (const n of AMBI.concat('fire_loop')) if (V.loops[n]) { V.loops[n].stop(0.8); V.loops[n] = null; } }

// ---------------------------------------------------------------- the travel scene
function drawTrail(opts) {
  opts = opts || {};
  const R = S.R, V = S.view;
  const L = opts.light || currentLight(R);
  const scroll = opts.scroll != null ? opts.scroll : V.scroll;
  const biome = opts.biome || (R.transition ? R.transition.from : Sim.biome(R));
  const next = opts.biome ? null : R.transition ? R.transition.to : null;
  const mix = next ? easeIO(R.transition.t) : 0;
  drawSky(L, R, scroll);
  drawLand(R, L, scroll, mix >= 1 ? next : biome, mix > 0 && mix < 1 ? next : null, mix);
  drawGround(L, scroll, mix >= 1 ? next : biome, mix > 0 && mix < 1 ? next : null, mix);
  drawDressing(R, L, scroll, mix > 0.5 && next ? next : biome, true);
  if (!opts.noLandmark) drawLandmarkAhead(R, L, scroll);
  drawGraves(R, L, scroll);
  if (!opts.noWagon) drawCaravan(R, L, opts);
  drawDressing(R, L, scroll, mix > 0.5 && next ? next : biome, false);
  drawWeather(R, L);
  // lantern glow at night
  if (L.lamps > 0.05 && !opts.noWagon) {
    const g = ctx(), x = WAGON_X - 40, y = ROAD - 30;
    const rg = g.createRadialGradient(x, y, 0, x, y, 46);
    rg.addColorStop(0, 'rgba(255,200,110,' + (0.35 * L.lamps).toFixed(3) + ')'); rg.addColorStop(1, 'rgba(255,200,110,0)');
    g.fillStyle = rg; g.fillRect(x - 46, y - 46, 92, 92);
    rect(x - 1, y - 1, 3, 3, '#FFE0A0', L.lamps);
  }
  if (V.lightningT && S.t > V.lightningT && S.t < V.lightningT + 0.12) rect(0, 0, LW, LH, '#E8F0FF', 0.55);
}
function drawCaravan(R, L, opts) {
  const V = S.view;
  const moving = opts.moving != null ? opts.moving : V.moving;
  const t = opts.walkT != null ? opts.walkT : V.walkT;
  const bob = moving ? Math.round(Math.sin(t * 9) * 0.6) : 0;
  const wear = Math.max(R.wear.wheel, R.wear.axle, R.wear.tongue);
  const wagonClip = 'wagon_' + (wear > 65 ? 2 : wear > 35 ? 1 : 0);
  const team = Sim.healthyOxen(R).length;
  const horseClip = moving ? 'horse_walk' : 'horse_idle';
  const hf = moving ? t * 1000 / 95 : t * 1000 / 140;
  // the far horse of the pair, then the wagon, then the near horse
  if (team >= 2 || opts.noSim) put(horseClip + '_far', hf + 4, WAGON_X - 82, ROAD - 2, { lit: L });
  put(wagonClip, moving ? Math.floor(t * 10) : 0, WAGON_X, ROAD + 4 + bob, { lit: L });
  if (team >= 1 || opts.noSim) put(horseClip, hf, WAGON_X - 90, ROAD + 1, { lit: L });
  // the party: the leader walks with the team, two more walk behind the wagon
  const alive = Sim.living(R).filter(p => !p.riding);
  alive.slice(0, 3).forEach((p, i) => {
    const idx = R.party.indexOf(p);
    const base = PEOPLE[idx % PEOPLE.length];
    const x = i === 0 ? WAGON_X - 58 : WAGON_X + 64 + (i - 1) * 18;
    const y = ROAD + 9 + (i === 1 ? 0 : 1);
    const pace = (p.health < 35 ? 1.5 : 1) * (base.startsWith('man') ? 170 : 120);
    if (moving) put(base + '_walk', t * 1000 / pace + i * 2, x, y, { lit: L });
    else put(base + '_idle', frameOf(base + '_idle', S.t + i), x, y, { lit: L });
  });
}
const PEOPLE = ['man_bowler', 'woman_blue', 'man_coat', 'woman_red', 'man_tophat', 'woman_green'];
function drawLandmarkAhead(R, L, scroll) {
  const leg = Sim.leg(R);
  if (!leg) return;
  const left = leg.length - R.legMiles;
  // the landmark sits at the end of the leg, 60 px a mile ahead of the wagon, and rolls in
  const x = WAGON_X - 150 - left * 60;
  if (x < -140 || x > LW + 140) return;
  const kind = leg.kind;
  const y = GROUND + 2;
  if (kind === 'fort') put(leg.gateway ? 'fort' : (hash(R.legIndex, 9) < 0.5 ? 'cabin' : 'fort'), 0, x, y, { lit: L });
  else if (kind === 'stone') put('stone_2', 0, x, y, { lit: L });
  else if (kind === 'river') drawRiverBand(x, L);
  else put('signpost', 0, x + 20, ROAD + 2, { lit: L });
  if (kind === 'fort') { put('tent', 0, x + 70, y, { lit: L }); put('campfire', frameOf('campfire', S.t), x + 90, y + 2); }
}
function drawRiverBand(x, L) {
  const g = ctx();
  for (let k = -2; k <= 2; k++) put('water_river', frameOf('water_river', S.t), x + k * 64, ROAD + 8, { lit: L });
  void g;
}
function drawGraves(R, L, scroll) {
  for (const gr of R.graves) {
    const x = WAGON_X - (gr.mile * 60 - scroll) * 0.9;
    if (x < -20 || x > LW + 20) continue;
    put(gr.name.length % 2 ? 'grave_cross' : 'grave_stone', 0, x, GROUND + 6, { lit: L });
  }
}
function drawWeather(R, L) {
  const w = R.weather.kind, g = ctx();
  if (w === 'rain' || w === 'storm') {
    for (let i = 0; i < (w === 'storm' ? 60 : 35); i++) {
      const x = (hash(i, 31) * LW + S.t * 40) % LW, y = (hash(i, 32) * LH + S.t * 220 * (0.8 + hash(i, 33) * 0.4)) % LH;
      rect(x, y, 1, 5, '#D8E4F8', 0.6); rect(x - 1, y + 5, 1, 2, '#D8E4F8', 0.35);
    }
    rect(0, -SHOW_LIFT, LW, LH + 2 * SHOW_LIFT, '#20304A', w === 'storm' ? 0.22 : 0.12);
  } else if (w === 'snow') {
    for (let i = 0; i < 70; i++) {
      const x = (hash(i, 41) * LW + Math.sin(S.t + i) * 8 - S.t * 12) % LW, y = (hash(i, 42) * LH + S.t * 30 * (0.6 + hash(i, 43))) % LH;
      rect((x + LW) % LW, y, hash(i, 44) < 0.3 ? 2 : 1, hash(i, 44) < 0.3 ? 2 : 1, '#FFFFFF', 0.8);
    }
    rect(0, -SHOW_LIFT, LW, LH + 2 * SHOW_LIFT, '#E8F0FF', 0.12);
  } else if (w === 'dust') {
    for (let i = 0; i < 50; i++) { const x = (hash(i, 51) * LW - S.t * 90 * (0.6 + hash(i, 52))) % LW; rect((x + LW) % LW, hash(i, 53) * LH, 3, 1, '#D8B888', 0.35); }
    rect(0, -SHOW_LIFT, LW, LH + 2 * SHOW_LIFT, '#B89060', 0.2);
  } else if (w === 'fog') {
    const gr = g.createLinearGradient(0, 80, 0, LH); gr.addColorStop(0, 'rgba(220,226,230,0)'); gr.addColorStop(0.6, 'rgba(220,226,230,0.45)'); gr.addColorStop(1, 'rgba(220,226,230,0.25)');
    g.fillStyle = gr; g.fillRect(0, -SHOW_LIFT, LW, LH + 2 * SHOW_LIFT);
  } else if (w === 'heat') {
    rect(0, -SHOW_LIFT, LW, LH + 2 * SHOW_LIFT, '#FFF0D0', 0.08);
  }
  // ambient particles of the hour
  if (L.fx === 'fireflies') for (let i = 0; i < 14; i++) { const x = (hash(i, 61) * LW + Math.sin(S.t * 0.7 + i) * 12) % LW, y = 150 + hash(i, 62) * 50 + Math.sin(S.t * 1.3 + i) * 6; rect(x, y, 1, 1, '#E8FF90', (0.5 + 0.5 * Math.sin(S.t * 3 + i * 2)) * (L.fxA || 1)); }
  if (L.fx === 'motes') for (let i = 0; i < 20; i++) { const x = (hash(i, 63) * LW + S.t * 6) % LW, y = 60 + hash(i, 64) * 140; rect(x, y, 1, 1, '#FFF0C0', 0.35 * (L.fxA || 1)); }
  if (L.fx === 'rays') { const gr = g.createLinearGradient(40, 0, 180, 200); gr.addColorStop(0, 'rgba(255,240,190,0.16)'); gr.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = gr; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(60 + k * 50, 0); g.lineTo(90 + k * 50, 0); g.lineTo(170 + k * 70, 200); g.lineTo(120 + k * 70, 200); g.fill(); } }
  if (L.fx === 'snowglint') for (let i = 0; i < 16; i++) { if (Math.sin(S.t * 4 + i * 7) > 0.9) rect(hash(i, 65) * LW, GROUND - 2 + hash(i, 66) * 40, 1, 1, '#FFFFFF', 0.9); }
  if (L.fx === 'shimmer') { rect(0, GROUND - 8 + Math.sin(S.t * 5) * 1, LW, 2, '#FFFFFF', 0.12); }
  if (L.fx === 'mist') { const gr = g.createLinearGradient(0, GROUND - 30, 0, GROUND + 10); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.25)'); g.fillStyle = gr; g.fillRect(0, GROUND - 30, LW, 40); }
  if (L.fx === 'glints') for (let i = 0; i < 10; i++) { if (Math.sin(S.t * 3 + i * 5) > 0.85) rect(hash(i, 67) * LW, GROUND - 4 + hash(i, 68) * 6, 2, 1, '#FFFFFF', 0.7); }
  if (L.fx === 'spray') for (let i = 0; i < 8; i++) { const u = (S.t * 0.8 + hash(i, 69)) % 1; rect(hash(i, 70) * LW, 170 - u * 20, 1, 1, '#FFFFFF', 0.6 * (1 - u)); }
}

// ---------------------------------------------------------------- HUD
function drawHud() {
  const R = S.R, V = S.view;
  rect(0, 0, LW, 15, '#1A120C', 0.55);
  const season = Sim.season(R);
  shadowText('mono', 'YEAR ' + Sim.year(R) + '  ' + season.toUpperCase(), 4, 1, 'cream');
  const leg = Sim.leg(R);
  const left = Math.max(0, Math.ceil(leg.length - R.legMiles));
  // supplies, right to left: an icon then its count
  let x = LW - 4;
  const item = (icon, val, low) => { const s = String(val); textR('mono', s, x, 1, low ? 'red' : 'cream'); x -= textW('mono', s) + 8; put(icon, 0, x + 2, 7); x -= 8; };
  const alive = Sim.living(R);
  item('icon_food', Math.floor(R.inv.food), R.inv.food < alive.length * 10);
  item('icon_team', Sim.healthyOxen(R).length, Sim.healthyOxen(R).length < 3);
  if (['barrens', 'saltmere'].includes(Sim.biome(R))) item('icon_water', R.inv.water.toFixed(1), R.inv.water < 1);
  // party: a pip each, coloured by health
  rect(0, 15, LW, 11, '#1A120C', 0.3);
  let px = 4;
  for (const p of R.party) {
    const col = !p.alive ? '#5A4A3A' : p.health > 70 ? '#7AC050' : p.health > 45 ? '#E0C050' : p.health > 20 ? '#E08040' : '#E04040';
    rect(px, 18, 5, 5, col); frame1(px - 1, 17, 7, 7, '#1A120C');
    if (p.ill && p.alive && ((S.t * 3) | 0) % 2) rect(px + 2, 19, 1, 3, '#FFFFFF');
    const nm = p.name.slice(0, 6);
    text('mono', nm, px + 8, 14, p.alive ? 'cream' : 'dim');
    px += 12 + textW('mono', nm);
  }
  textR('mono', leg.name.toUpperCase() + ' ' + left + ' MI', LW - 4, 14, 'cream');
  // the pace sits on the ribbon's shoulder
  const pace = R.pace.name, pw = textW('mono', pace) + 8;
  rect(12, 206, pw, 11, '#1A120C', 0.55);
  text('mono', pace, 16, 204, R.paceKey === 'driven' ? 'red' : R.paceKey === 'hard' ? 'gold' : 'cream');
  drawRibbon();
}
function drawRibbon() {
  const V = S.view;
  if (!V.line) return;
  const y = 220;
  panel(8, y - 2, LW - 16, 18, 0.94);
  const w = textW('old', V.line);
  let x = Math.round(LW / 2 - w / 2);
  const shake = S.t - V.lineErrT < 0.15 ? Math.round(Math.sin(S.t * 90) * 1) : 0;
  const G = face('old').glyphs;
  for (let i = 0; i < V.line.length; i++) {
    const ch = V.line[i];
    const col = i < V.typed ? 'green' : i === V.typed ? (S.t - V.lineErrT < 0.25 ? 'red' : 'ink') : 'dim';
    if (i === V.typed) rect(x, y + 12, Math.max(3, (G[ch] ? G[ch][4] : 3) - 1), 1, S.t - V.lineErrT < 0.25 ? COL.red : COL.ink);
    x = text('old', ch, x + shake, y + 2, col) - shake;
  }
  if (V.flawlessT && S.t - V.flawlessT < 0.6) textR('mono', '+ steady', LW - 14, y - 12, 'gold', 1 - (S.t - V.flawlessT) / 0.6);
}

// ---------------------------------------------------------------- overlays: events and challenges
// A challenge is a list of phrases typed in order against a timer.
function challenge(opts) {
  return Object.assign({ kind: 'challenge', phrases: [], i: 0, typed: 0, errs: 0, t0: S.t, time: 10, done: false, result: null }, opts);
}
function openEvent(e) {
  const R = S.R;
  const T = TXT.EVENT_TEXT;
  const name = n => n;
  switch (e.type) {
    case 'arrive': return openArrival(e.leg);
    case 'region': {
      const B = TXT.BIOMES[e.biome];
      S.toast = { big: B.name, sub: B.sub, t0: S.t, dur: 3.5 };
      Audio.sting('region');
      return;
    }
    case 'crossing': S.toast = { big: 'CROSSING ' + roman(e.crossing), sub: 'the trail begins again', t0: S.t + 3.6, dur: 3.5 }; Audio.sting('crossing_done'); return;
    case 'illness': {
      const ill = TXT.ILLNESS_NAME[e.kind];
      const phrases = TXT.REMEDIES[e.kind].slice(0, Sim.hasTrait(R, 'healer') ? 3 : 4);
      S.overlay = { kind: 'card', title: e.kind === 'snakebite' ? 'SNAKEBITE' : e.kind === 'fracture' ? 'A FALL' : 'SICKNESS', body: T[e.kind === 'snakebite' ? 'snakebite' : e.kind === 'fracture' ? 'fracture' : 'illness'].replace('{a}', name(e.who)).replace('{ill}', ill),
        note: R.inv.medicine > 0 ? 'type the remedy (uses 1 medicine)' : 'no medicine: type the remedy anyway',
        ch: challenge({ phrases, time: 4 + phrases.length * 2.6 * (e.kind === 'snakebite' ? 0.7 : 1) }),
        onDone: ok => { Sim.illnessOutcome(R, e.who, e.kind, ok); SND(ok ? 'heal' : 'cough'); toast(ok ? e.who + ' is tended' : e.who + ' worsens'); } };
      SND(e.kind === 'snakebite' ? 'rattle' : 'cough');
      return;
    }
    case 'breakdown': {
      const part = e.part;
      const hasSpare = R.inv[part] > 0;
      const smith = Sim.hasTrait(R, 'smith');
      S.overlay = { kind: 'choice', title: 'BROKEN ' + part.toUpperCase(), body: T[part], options: (hasSpare ? ['replace'] : []).concat(['mend', 'wait']),
        hints: { replace: 'use a spare ' + part, mend: smith ? 'the smith can mend it well' : 'rig it with what you have', wait: 'wait for help: lose days' },
        onPick: opt => {
          if (opt === 'wait') { Sim.breakdownOutcome(R, part, 'wait', true); toast('help came after a few days'); return null; }
          const phrases = opt === 'replace' ? TXT.REPAIRS[part] : TXT.JURY_RIG.slice(0, smith ? 4 : 6);
          return { ch: challenge({ phrases, time: 6 + phrases.length * 2.2 }), onDone: ok => { Sim.breakdownOutcome(R, part, opt === 'replace' ? 'spare' : 'jury', ok || smith); SND('hammer'); toast(ok ? 'the wagon rolls again' : 'it will hold, for now'); } };
        } };
      SND('wheels_break');
      return;
    }
    case 'oxlost': return quick('A HORSE WANDERS', T.oxlost, ['whistle', 'call her', 'lead rope'], 7, ok => { if (!ok) { const o = Sim.healthyOxen(R)[0]; if (o) o.health = 0; toast('the horse is gone'); } else { SND('hooves'); toast('back in harness'); } });
    case 'mud': return quick('STUCK', T.mud, ['push', 'heave', 'pull', 'again'], 6, ok => { if (!ok) Sim.restDays(R, 1, true); SND('mud'); toast(ok ? 'free of the mud' : 'a day lost to the mud'); });
    case 'stampede': SND('stampede'); return quick('STAMPEDE', T.stampede, ['left', 'hold', 'steady'], 5, ok => { if (!ok) { const p = pick(Sim.living(R)); if (p) { p.health = Math.max(1, p.health - 25); toast(p.name + ' is trampled'); } } else toast('the herd thunders past'); });
    case 'lost': {
      const opts = ['north stone', 'creek bend', 'old oak'];
      const right = opts[Math.floor(Math.random() * 3)];
      return (S.overlay = { kind: 'choice', title: 'LOST', body: T.lost, options: opts, hints: Object.fromEntries(opts.map(o => [o, Sim.hasTrait(R, 'scout') && o === right ? 'the scout points this way' : ''])),
        onPick: o => { if (o !== right) { Sim.restDays(R, 2, true); toast('two days wandering'); } else toast('the ruts appear again'); return null; } });
    }
    case 'wolves': SND('howl'); return quick('WOLVES', T.wolves, ['fire', 'shout', 'torch', 'drive them'], 7, ok => { if (!ok) { R.inv.food = Math.floor(R.inv.food * 0.8); toast('wolves took some meat'); } else toast('the wolves slink away'); });
    case 'thieves': return quick('THIEVES', T.thieves, ['who goes', 'stand back', 'lantern'], 6, ok => { if (!ok) { R.inv.food = Math.floor(R.inv.food * 0.85); R.inv.shot = Math.max(0, R.inv.shot - 10); toast('supplies were stolen'); } else toast('they run into the dark'); });
    case 'stranger': {
      const [line, deal] = TXT.STRANGER_OFFERS[e.offer];
      const can = Sim.canAfford(R, deal.give);
      return (S.overlay = { kind: 'choice', title: 'A TRAVELLER', body: '"' + line + '"', options: can ? ['accept', 'refuse'] : ['refuse'], hints: {},
        onPick: o => { if (o === 'accept') { for (const [k, v] of Object.entries(deal.give)) R.inv[k] -= v; Sim.applyGains(R, deal.get); SND('coin'); toast('a fair trade'); } return null; } });
    }
    case 'berries': return quick('BERRIES', T.berries, ['pick', 'fill', 'basket', 'more'], 8, ok => { Sim.forageOutcome(R, ok ? 8 : 3); SND('pickup'); toast('berries gathered'); });
    case 'wagon': Sim.applyGains(R, { wheel: 1, food: 30 }); toast('salvaged a wheel and food'); SND('pickup'); return;
    case 'spring': Sim.applyGains(R, { water: 3 }); toast('water casks filled'); SND('splash'); return;
    case 'musician': Sim.applyGains(R, { morale: 20 }); toast('a fiddler plays by the fire'); Audio.sting('landmark'); return;
    case 'wildfire': SND('fire_whoosh'); return quick('WILDFIRE', T.wildfire, ['run', 'to the stones', 'faster', 'go'], 6, ok => { if (!ok) { R.inv.food = Math.floor(R.inv.food * 0.85); R.inv.clothing = Math.max(0, R.inv.clothing - 1); toast('the fire caught the wagon'); } else toast('safe among the stones'); });
    case 'mirage': {
      const real = pick(TXT.LANDMARKS.saltmere.sights), fake = 'Silver Town';
      const opts = Math.random() < 0.5 ? [real, fake] : [fake, real];
      return (S.overlay = { kind: 'choice', title: 'MIRAGE', body: T.mirage, options: opts.map(o => o.toLowerCase()), hints: {}, shimmer: fake.toLowerCase(),
        onPick: o => { if (o === fake.toLowerCase()) { Sim.restDays(R, 1, true); toast('there was nothing there'); } else toast('the true trail'); return null; } });
    }
    case 'stag': SND('stag'); return (S.overlay = { kind: 'choice', title: 'THE WHITE STAG', body: T.stag, options: ['spare', 'hunt'], hints: { spare: 'let it go', hunt: 'take the shot' },
      onPick: o => { if (o === 'spare') { Sim.applyGains(R, { morale: 15 }); toast('the stag bows and is gone'); } else { Sim.applyGains(R, { food: 40, morale: -10 }); toast('the party is uneasy'); } return null; } });
    case 'recruit': return (S.overlay = { kind: 'choice', title: 'A TRAVELLER', body: e.name + ' asks to join your party.', options: R.party.length < 6 ? ['welcome', 'refuse'] : ['refuse'], hints: {},
      onPick: o => { if (o === 'welcome') { const traits = Object.keys(TXT.TRAITS); R.party.push(Sim.person(e.name, pick(traits))); Sim.applyGains(R, { morale: 8 }); toast(e.name + ' joins the wagon'); SND('cheer'); } return null; } });
    case 'banter': { const [a, b] = pick(TXT.BANTER); S.view.queued = [fillNames(a).replace(/:/g, ''), fillNames(b).replace(/:/g, '')].map(s => s.replace(/[^a-z {}]/g, '')); return; }
    case 'death': return openGrave(e);
    case 'recovered': toast(e.who + ' has recovered'); return;
    case 'oxdied': toast('a horse has died'); SND('hurt'); return;
    case 'stranded': return (S.overlay = { kind: 'choice', title: 'STRANDED', body: 'The wagon cannot move.', options: ['walk on'], hints: { 'walk on': 'carry what you can to the next fort' },
      onPick: () => { R.onFoot = true; toast('on foot now'); return null; } });
  }
}
function quick(title, body, phrases, time, done) {
  S.overlay = { kind: 'card', title, body, note: 'type it fast', ch: challenge({ phrases, time }), onDone: done };
}
function toast(msg) { S.toastSmall = { msg, t0: S.t }; }
const roman = n => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] || String(n);

function overlayChar(ch) {
  const O = S.overlay;
  if (!O) return;
  if (O.kind === 'choice' || O.kind === 'camp' || O.kind === 'arrival' || O.kind === 'river') {
    O.buf = ((O.buf || '') + ch.toLowerCase()).slice(0, 24);
    const hit = O.options.find(o => o === O.buf.trim());
    // a prefix that matches nothing is a typo: shake and clear
    if (!O.options.some(o => o.startsWith(O.buf))) { O.errT = S.t; O.buf = ''; SND('creak', { delay: AFTER_KEY, vol: 0.2 }); }
    return;
  }
  if (O.kind === 'card' || O.kind === 'work' || O.kind === 'carve') return challengeChar(O.ch, ch);
  if (O.kind === 'grave') { if (/^[a-z ]$/.test(ch.toLowerCase()) && O.text.length < 30) O.text += ch.toLowerCase(); return; }
}
function challengeChar(C, ch) {
  if (!C || C.done) return;
  const phrase = C.phrases[C.i];
  const want = phrase[C.typed];
  if (ch.toLowerCase() === want) {
    C.typed++;
    if (S.overlay && S.overlay.kind === 'carve') SND('carve', { delay: AFTER_KEY });
    if (C.typed >= phrase.length) { C.i++; C.typed = 0; if (C.i >= C.phrases.length) finishChallenge(C, true); }
  } else if (/^[a-z ]$/.test(ch.toLowerCase())) { C.errs++; C.errT = S.t; if (C.strict) { C.typed = 0; } }
}
function finishChallenge(C, ok) {
  if (C.done) return;
  C.done = true; C.result = ok; C.doneT = S.t;
  const O = S.overlay;
  Audio.sting(ok ? 'success' : 'fail');
  if (O && O.onDone) { O.onDone(ok, C); O.onDone = null; }
}
function overlayEnter() {
  const O = S.overlay;
  if (!O) return;
  if (O.kind === 'card' || O.kind === 'work' || O.kind === 'carve') { if (O.ch.done && S.t - O.ch.doneT > 0.4) closeOverlay(); return; }
  if (O.kind === 'grave') { finishGrave(); return; }
  if (O.kind === 'choice' || O.kind === 'camp' || O.kind === 'arrival' || O.kind === 'river') {
    const opt = O.options.find(o => o === (O.buf || '').trim()) || (O.options.length === 1 ? O.options[0] : null);
    if (!opt) { O.errT = S.t; return; }
    O.buf = '';
    SND('ui_select');
    const next = O.onPick(opt);
    if (next && next.ch) { S.overlay = { kind: 'card', title: O.title, body: O.body, note: 'type it', ch: next.ch, onDone: next.onDone }; }
    else if (next && next.overlay) S.overlay = next.overlay;
    else if (next !== 'keep') closeOverlay();
  }
}
function updateOverlay() {
  const O = S.overlay;
  if (!O) return;
  const C = O.ch;
  if (C && !C.done && S.t - C.t0 > C.time) finishChallenge(C, C.i >= C.phrases.length - 1 && C.typed > 0 ? true : false);
  if (C && C.done && S.t - C.doneT > 1.6) closeOverlay();
}
function closeOverlay() {
  const O = S.overlay;
  S.overlay = null;
  if (O && O.after) O.after();
}

function wrapLines(f, str, w) {
  const out = []; let line = '';
  for (const wd of str.split(' ')) { const test = line ? line + ' ' + wd : wd; if (textW(f, test) > w && line) { out.push(line); line = wd; } else line = test; }
  if (line) out.push(line);
  return out;
}
function drawOverlay() {
  const O = S.overlay;
  if (!O) return;
  rect(0, 0, LW, LH, '#1A120C', 0.35);
  const w = 272, x = (LW - w) / 2;
  const body = O.body ? wrapLines('old', O.body, w - 28) : [];
  const choice = !(O.ch || O.kind === 'grave');
  // the panel grows to fit: title, body, then the challenge or the list of choices
  const content = O.ch ? 58 : O.kind === 'grave' ? 42 : O.options.length * 13 + 20;
  const h = 30 + body.length * 12 + content;
  const y = Math.round(clamp((200 - h) / 2, 30, 60));
  panel(x, y, w, h);
  textC('big', O.title, LW / 2, y + 6, 'ink');
  rect(x + 30, y + 22, w - 60, 1, '#B8A080');
  body.forEach((l, i) => textC('old', l, LW / 2, y + 27 + i * 12, 'ink'));
  const top = y + 32 + body.length * 12;
  if (O.ch) {
    const C = O.ch;
    const u = clamp((S.t - C.t0) / C.time, 0, 1);
    rect(x + 12, y + h - 9, (w - 24) * (1 - (C.done ? 0 : u)), 3, u > 0.75 ? COL.red : COL.gold);
    if (C.done) textC('big', C.result ? 'DONE' : 'TOO LATE', LW / 2, top + 10, C.result ? 'green' : 'red');
    else {
      const phrase = C.phrases[C.i];
      let pen = Math.round(LW / 2 - textW('big', phrase) / 2);
      const shake = S.t - (C.errT || -9) < 0.15 ? Math.round(Math.sin(S.t * 90)) : 0;
      for (let i = 0; i < phrase.length; i++) pen = text('big', phrase[i], pen + (i === C.typed ? shake : 0), top + 6, i < C.typed ? 'green' : i === C.typed ? (S.t - (C.errT || -9) < 0.25 ? 'red' : 'ink') : 'dim') - (i === C.typed ? shake : 0);
      textC('mono', (C.i + 1) + ' / ' + C.phrases.length + (O.note ? '   ' + O.note : ''), LW / 2, top + 26, 'dim');
    }
  } else if (O.kind === 'grave') {
    panel(x + 30, top + 2, w - 60, 18);
    textC('old', O.text + (((S.t * 2) | 0) % 2 ? '_' : ' '), LW / 2, top + 6, 'ink');
    textC('mono', 'type an epitaph, then enter', LW / 2, top + 24, 'dim');
  } else if (choice) {
    const buf = O.buf || '';
    const colW = Math.max(...O.options.map(o => textW('old', o)));
    const hintW = Math.max(0, ...O.options.map(o => O.hints && O.hints[o] ? textW('mono', O.hints[o]) : 0));
    const left = Math.round(LW / 2 - (colW + (hintW ? hintW + 10 : 0)) / 2);
    O.options.forEach((o, i) => {
      const oy = top + i * 13;
      const match = buf && o.startsWith(buf);
      if (match) rect(left - 4, oy - 1, colW + 8, 12, '#DCCAA4');
      let pen = left;
      for (let k = 0; k < o.length; k++) pen = text('old', o[k], pen, oy, match && k < buf.length ? 'green' : o === O.shimmer && ((S.t * 8) | 0) % 2 ? 'faint' : 'ink');
      const hint = O.hints && O.hints[o];
      if (hint) text('mono', hint, left + colW + 10, oy - 1, 'dim');
    });
    textC('mono', 'type a choice, then enter', LW / 2, y + h - 13, S.t - (O.errT || -9) < 0.4 ? 'red' : 'dim');
  }
}
function wrapText(f, str, x, y, w, col) {
  const words = str.split(' ');
  let line = '', yy = y;
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd;
    if (textW(f, test) > w && line) { textC(f, line, x + w / 2, yy, col); line = wd; yy += 12; }
    else line = test;
  }
  if (line) textC(f, line, x + w / 2, yy, col);
  return yy;
}

// ---------------------------------------------------------------- landmarks, forts, stones
function openArrival(leg, quiet) {
  const R = S.R;
  if (!quiet) { Audio.sting(leg.kind === 'fort' ? 'fort' : 'landmark'); SND('arrive'); }
  if (leg.kind === 'river') return openRiver(leg);
  const opts = ['continue'];
  if (leg.kind === 'fort') opts.unshift('store', 'work', 'rest');
  if (leg.kind === 'stone' && !leg.read) opts.unshift('read');
  if (leg.kind !== 'fort') opts.unshift('rest');
  const body = leg.kind === 'fort' ? 'A place to trade, rest and find work.' : leg.kind === 'stone' ? 'Old stones stand here, carved with something half-worn.' : 'You stop to look at ' + leg.name + '.';
  S.overlay = { kind: 'arrival', title: leg.name.toUpperCase(), body, options: opts, hints: { store: 'buy supplies', work: 'write letters for coin', rest: 'rest two days', read: 'wake the stone', continue: 'move on' },
    onPick: o => {
      if (o === 'continue') { Sim.departLandmark(R); nextLine(); return null; }
      if (o === 'rest') { Sim.restDays(R, 2); toast('rested two days'); openArrival(leg, true); return 'keep'; }
      if (o === 'store') { openStore(() => { S.overlay = null; openArrival(leg, true); }); return 'keep'; }
      if (o === 'work') {
        const sentences = pick([['dear mother all is well', 'the land is wide', 'we will write again'], ['to my brother', 'the crops came in', 'come west in spring'], ['my dearest', 'i think of you each night', 'yours always']]);
        return { overlay: { kind: 'work', title: 'LETTERS HOME', body: 'Settlers pay for a steady hand.', note: 'copy the letter', ch: challenge({ phrases: sentences, time: 8 + sentences.join('').length * 0.28 }),
          onDone: (ok, C) => { const q = clamp(1 - C.errs / 12, 0, 1) * (ok ? 1 : 0.5); const pay = Sim.letterWork(R, q, 3); SND('coin'); toast('earned $' + pay); }, after: () => openArrival(leg, true) } };
      }
      if (o === 'read') {
        const line = TXT.POEM[R.poem] || TXT.POEM[TXT.POEM.length - 1];
        return { overlay: { kind: 'carve', title: 'THE STANDING STONE', body: 'Trace the carving without a slip.', note: 'no mistakes', ch: challenge({ phrases: [line], time: 4 + line.length * 0.4, strict: false }),
          onDone: (ok, C) => { if (ok && C.errs <= (Sim.verseActive(R, 2) ? 1 : 0)) { const w = Sim.wakeStone(R); SND('stone_wake'); toast('the stone wakes'); if (w.newVerse) { Audio.sting('verse'); S.toast = { big: 'THE VERSE OF ' + TXT.VERSE_NAMES[w.verse - 1], sub: TXT.VERSE_BONUS[w.verse - 1], t0: S.t + 1.2, dur: 4 }; } } else toast('the carving slips away'); },
          after: () => { leg.read = true; openArrival(leg, true); } } };
      }
      return null;
    } };
}

function openStore(back) {
  const R = S.R;
  S.mode = 'store'; S.sel = 0;
  S.store = { back, qty: '', msg: '', msgT: -9 };
  SND('store_bell');
}
function storeInput(k) {
  const R = S.R, st = S.store;
  const items = TXT.STORE.concat([{ key: 'leave', label: 'LEAVE' }]);
  const keys = k.keys || [];
  if (keys.includes('ArrowDown')) { S.sel = (S.sel + 1) % items.length; st.qty = ''; SND('ui_move'); }
  if (keys.includes('ArrowUp')) { S.sel = (S.sel + items.length - 1) % items.length; st.qty = ''; SND('ui_move'); }
  for (const ch of k.chars || []) if (/[0-9]/.test(ch) && st.qty.length < 4) st.qty += ch;
  if (k.back) st.qty = st.qty.slice(0, -1);
  if (keys.includes('Escape')) return leaveStore();
  if (k.enter) {
    const it = items[S.sel];
    if (it.key === 'leave') return leaveStore();
    const q = parseInt(st.qty || String(it.step), 10);
    const res = Sim.buy(R, it.key, q);
    if (res.ok) { SND('coin'); st.msg = 'bought ' + q + ' ' + it.label.toLowerCase(); }
    else { SND('ui_back'); st.msg = res.why; }
    st.msgT = S.t; st.qty = '';
  }
}
function leaveStore() { const back = S.store.back; S.mode = 'travel'; S.store = null; SND('ui_back'); if (back) back(); }
function drawStore() {
  const R = S.R, st = S.store;
  drawTrail({ noLandmark: true });
  rect(0, 0, LW, LH, '#1A120C', 0.4);
  panel(24, 18, LW - 48, LH - 36);
  textC('big', 'GENERAL STORE', LW / 2, 24, 'ink');
  textR('mono', '$' + R.inv.money.toFixed(0), LW - 34, 25, 'green');
  const items = TXT.STORE.concat([{ key: 'leave', label: 'LEAVE' }]);
  items.forEach((it, i) => {
    const y = 44 + i * 15;
    const on = i === S.sel;
    if (on) rect(30, y - 2, LW - 60, 14, '#D8C49C');
    text('old', it.label, 36, y, on ? 'ink' : 'dim');
    if (it.key !== 'leave') {
      text('mono', '$' + Sim.price(R, it.key).toFixed(it.price < 1 ? 2 : 0) + ' ' + it.unit, 116, y - 1, 'dim');
      textR('mono', String(it.key === 'oxen' ? Sim.healthyOxen(R).length : Math.floor(R.inv[it.key])), 238, y - 1, 'ink');
      if (on) textR('old', 'x' + (st.qty || String(it.step)) + (((S.t * 2) | 0) % 2 ? '_' : ' '), LW - 34, y, 'ink');
    }
  });
  textC('mono', S.t - st.msgT < 2 ? st.msg : 'arrows choose, numbers set, enter buys', LW / 2, LH - 30, S.t - st.msgT < 2 ? 'green' : 'dim');
}

// ---------------------------------------------------------------- rivers
function openRiver(leg) {
  const R = S.R, r = leg.river;
  const cur = r.current;
  const opts = ['ford', 'caulk'].concat(R.inv.money >= r.ferry ? ['ferry'] : [], ['wait']);
  S.overlay = { kind: 'river', title: leg.name.toUpperCase(), body: 'The river is ' + r.depth + ' feet deep, ' + r.width + ' feet wide and ' + cur + '.', options: opts,
    hints: { ford: 'wade across', caulk: 'float the wagon', ferry: '$' + r.ferry, wait: 'a day for the water to change' },
    onPick: o => {
      if (o === 'wait') { Sim.riverOutcome(R, r, 'wait', 0); openRiver(leg); return 'keep'; }
      if (o === 'ferry') { Sim.riverOutcome(R, r, 'ferry', 1); SND('splash'); toast('the ferry carries you across'); Sim.departLandmark(R); return null; }
      startCrossing(leg, o);
      return 'keep';
    } };
}
function startCrossing(leg, method) {
  const R = S.R, r = leg.river;
  const n = Math.round(4 + r.width / 120 + (r.current === 'raging' ? 3 : r.current === 'swift' ? 1 : 0));
  const pool = ['rock', 'log', 'snag', 'eddy', 'root', 'drift', 'boulder', 'branch', 'current', 'stump'];
  S.overlay = null;
  S.mode = 'river';
  S.cross = { leg, method, t0: S.t, dur: 6 + n * 1.4, items: Array.from({ length: n }, (_, i) => ({ word: pick(pool), at: 1.2 + i * (1.2 + Math.random() * 0.5), typed: 0, state: 'wait' })), active: null, cleared: 0, missed: 0, done: false };
  MUS.play('crossing', { now: true, fade: 0.4 });
  SND('splash');
}
function crossChar(ch) {
  const X = S.cross; if (!X || X.done) return;
  ch = ch.toLowerCase();
  let it = X.active;
  if (!it) { it = X.items.find(q => q.state === 'come' && q.word[0] === ch); if (!it) return; X.active = it; }
  if (it.word[it.typed] === ch) { it.typed++; if (it.typed >= it.word.length) { it.state = 'cleared'; X.cleared++; X.active = null; SND('splash', { vol: 0.35, delay: AFTER_KEY }); } }
}
function updateCrossing() {
  const X = S.cross, R = S.R;
  const t = S.t - X.t0;
  for (const it of X.items) {
    if (it.state === 'wait' && t >= it.at) it.state = 'come';
    if (it.state === 'come' && t >= it.at + 3.2) { it.state = 'hit'; X.missed++; if (X.active === it) X.active = null; S.shake = 3; SND('jolt'); }
  }
  if (!X.done && t > X.dur) {
    X.done = true;
    const total = X.items.length;
    const score = total ? X.cleared / total : 1;
    const res = Sim.riverOutcome(R, X.leg.river, X.method, score);
    let msg = res.safe ? 'across safely' : 'the river took ' + Object.entries(res.lost).filter(([k]) => k !== 'swept').map(([k, v]) => (k === 'oxen' ? 'a horse' : v + ' ' + k)).join(', ');
    if (res.lost.swept) {
      const p = R.party.find(q => q.name === res.lost.swept);
      if (p && score < 0.5) { Sim.kill(R, p, 'drowned'); msg += '. ' + p.name + ' was swept away'; }
    }
    X.msg = msg || 'across';
    X.doneT = S.t;
    Audio.sting(res.safe ? 'success' : 'fail');
  }
  if (X.done && S.t - X.doneT > 2.2) { S.mode = 'travel'; S.cross = null; Sim.departLandmark(R); nextLine(); MUS.play(Sim.biome(R), { now: true, fade: 1 }); }
}
function drawCrossing() {
  const R = S.R, X = S.cross;
  const L = currentLight(R);
  const t = S.t - X.t0;
  drawTrail({ light: L, noWagon: true, noLandmark: true, scroll: S.view.scroll + t * 20 });
  // the river fills the road
  for (let k = -1; k < 7; k++) put('water_river', frameOf('water_river', S.t) + k, k * 64 - ((t * 30) % 64), ROAD + 12, { lit: L });
  rect(0, ROAD + 26, LW, LH - ROAD - 26, '#1E4A5A', 0.9);
  const bob = Math.sin(t * 3) * 2;
  if (X.method === 'caulk') put('raft', 0, WAGON_X, ROAD + 8 + bob, { lit: L });
  drawCaravan(R, L, { moving: true, walkT: t });
  // obstacles ride the current toward the wagon
  for (const it of X.items) {
    if (it.state !== 'come') continue;
    const u = (t - it.at) / 3.2;
    const k = X.items.indexOf(it);
    const x = lerp(14, WAGON_X - 70, u), y = ROAD + 12 + (k % 3) * 4;
    put(it.word === 'log' || it.word === 'branch' || it.word === 'drift' ? 'raft' : 'rock_a', 0, x, y, { lit: L });
    const w = textW('old', it.word);
    const lx = Math.round(Math.max(4, x - w / 2)), ly = y - 30 - (k % 3) * 14;
    panel(lx - 3, ly - 2, w + 6, 13, 0.92);
    let pen = lx;
    for (let k = 0; k < it.word.length; k++) pen = text('old', it.word[k], pen, ly, k < it.typed ? 'green' : 'ink');
  }
  panel(8, 26, 140, 16, 0.9);
  text('mono', X.method === 'caulk' ? 'FLOATING ACROSS' : 'FORDING', 14, 27, 'ink');
  rect(10, 40, 136 * clamp(t / X.dur, 0, 1), 1, COL.gold);
  if (X.done) { panel(40, 90, LW - 80, 36); wrapText('old', X.msg, 48, 98, LW - 96, 'ink'); }
}

// ---------------------------------------------------------------- hunting
const HUNT_WORDS = {
  3: ['aim', 'fur', 'paw', 'run', 'dew', 'elm', 'fen', 'hop', 'oak', 'sly'],
  4: ['dash', 'leap', 'hush', 'fern', 'reed', 'moss', 'burr', 'tuft', 'wisp', 'glen'],
  5: ['swift', 'still', 'track', 'fleet', 'bound', 'brush', 'thorn', 'creek', 'grove', 'ridge'],
  6: ['steady', 'quiet', 'antler', 'hollow', 'burrow', 'furrow', 'autumn', 'meadow', 'bramble', 'silver'],
  7: ['thicket', 'thunder', 'bristle', 'crested', 'hickory', 'hunting', 'tracker', 'tusking', 'willows', 'wildest'],
  8: ['wanderer', 'firewood', 'hillside', 'stalking', 'riverbed', 'overhang', 'bramblet', 'woodland', 'deadfall', 'moonrise'],
  9: ['underbush', 'blackbear', 'pinewoods', 'wilderness', 'rockslide', 'hibernate', 'honeycomb', 'thornwood', 'grizzled', 'riverbank'],
  10: ['thundering', 'wilderness', 'huckleberry', 'mountainous', 'timberline', 'windfallen', 'bearskins', 'honeycombs', 'backwoods', 'switchback'],
};
function huntWord(mn, mx, avoid) {
  const pool = [];
  for (let n = mn; n <= mx; n++) for (const w of HUNT_WORDS[n] || []) if (w.length >= mn && w.length <= mx + 1) pool.push(w);
  const ok = pool.filter(w => !avoid.has(w[0]));
  return pick(ok.length ? ok : pool.length ? pool : HUNT_WORDS[5]);
}
function startHunt() {
  const R = S.R;
  if (R.inv.shot <= 0) { toast('no shot left'); return; }
  S.overlay = null;
  S.mode = 'hunt';
  const list = TXT.ANIMALS[Sim.biome(R)] || TXT.ANIMALS.meadow;
  const scarce = Math.max(0.35, (1 - (R.region.hunted || 0) * 0.2) * R.tune.game);
  S.hunt = { t0: S.t, dur: 40, animals: [], active: null, meat: 0, shots: 0, next: 0.6, list, scarce, done: false };
  MUS.play('hunt', { now: true, fade: 0.3 });
}
function huntSpawn() {
  const H = S.hunt;
  if (H.animals.filter(a => !a.dead).length >= 3) return;
  const [name, sprite, mn, mx, meat] = pick(H.list);
  const taken = new Set(H.animals.filter(a => !a.dead).map(a => a.word[a.typed]));
  const word = huntWord(mn, mx, taken);
  const fromLeft = Math.random() < 0.5;
  const lane = Math.floor(Math.random() * 3);
  const speed = { rabbit: 58, fox: 48, deer: 42, boar: 34, bear: 24 }[name] || 40;
  H.animals.push({ name, sprite, meat, word, typed: 0, x: fromLeft ? -40 : LW + 40, dir: fromLeft ? 1 : -1, y: GROUND + 10 + lane * 14, speed: speed * (0.85 + Math.random() * 0.3), dead: false });
  H.animals.sort((a, b) => a.y - b.y);
}
function huntChar(ch) {
  const H = S.hunt, R = S.R; if (!H || H.done) return;
  ch = ch.toLowerCase();
  if (!/^[a-z]$/.test(ch)) return;
  if (R.inv.shot - H.shots <= 0) return;
  // a finished word is one shot; a slip spooks the animal and wastes the shot
  let a = H.active;
  if (!a || a.dead) { a = H.animals.find(q => !q.dead && q.word[0] === ch && q.x > 0 && q.x < LW); if (!a) return; H.active = a; }
  if (a.word[a.typed] === ch) {
    a.typed++;
    if (a.typed >= a.word.length) { H.shots++; a.dead = true; a.deadT = S.t; H.active = null; H.meat += a.meat; SND('shot', { delay: AFTER_KEY }); SND('animal_fall', { delay: 0.3 }); }
  } else { H.shots++; a.typed = 0; a.speed *= 1.7; H.active = null; SND('shot_miss', { delay: AFTER_KEY }); SND('bolt', { delay: 0.15 }); }
}
function updateHunt(dt) {
  const H = S.hunt, R = S.R;
  const t = S.t - H.t0;
  if (!H.done) {
    H.next -= dt;
    if (H.next <= 0 && t < H.dur - 3) { huntSpawn(); H.next = (1.4 + Math.random() * 1.6) / H.scarce; }
    for (const a of H.animals) if (!a.dead) a.x += a.dir * a.speed * dt;
    H.animals = H.animals.filter(a => (a.dead && S.t - a.deadT < 2) || (!a.dead && a.x > -80 && a.x < LW + 80));
    if (t > H.dur || R.inv.shot - H.shots <= 0) {
      H.done = true; H.doneT = S.t;
      const res = Sim.huntOutcome(R, H.shots, H.meat);
      H.msg = res.kept ? res.kept + ' lbs of meat carried home' + (res.wasted ? ', ' + res.wasted + ' left' : '') : 'nothing to show for it';
      Audio.sting(res.kept ? 'success' : 'fail');
    }
  } else if (S.t - H.doneT > 2.5) { S.mode = 'travel'; S.hunt = null; MUS.play(Sim.biome(R), { now: true, fade: 1 }); }
}
function drawHunt() {
  const R = S.R, H = S.hunt;
  // a hunt fills a whole day: it plays out in the morning light of the land
  const L = lightAt(Sim.biome(R), 3.4 + clamp((S.t - H.t0) / 40, 0, 1) * 1.4);
  drawTrail({ light: L, noWagon: true, noLandmark: true });
  for (const a of H.animals) {
    const flip = a.dir > 0;
    const idle = a.sprite.replace(/_(run|hop|walk)$/, '_idle');
    if (a.dead) { put(S.M.clips[idle] ? idle : a.sprite, 0, a.x, a.y, { lit: L, flip, alpha: 1 - (S.t - a.deadT) / 2 }); continue; }
    put(a.sprite, frameOf(a.sprite, S.t + a.x * 0.01), a.x, a.y, { lit: L, flip });
  }
  for (const a of H.animals) {
    if (a.dead) continue;
    const h = S.M.clips[a.sprite].frames[0][3];
    const label = a.word;
    const w = textW('old', label);
    const lx = Math.round(clamp(a.x, w / 2 + 6, LW - w / 2 - 6) - w / 2), ly = a.y - h - 16;
    panel(lx - 3, ly - 2, w + 6, 13, 0.92);
    let pen = lx;
    for (let k = 0; k < label.length; k++) pen = text('old', label[k], pen, ly, k < a.typed ? 'green' : H.active === a || !H.active ? 'ink' : 'dim');
  }
  rect(0, 0, LW, 16, '#1A120C', 0.6);
  shadowText('mono', 'HUNT  ' + Math.max(0, Math.ceil(H.dur - (S.t - H.t0))) + 's', 6, 1, 'cream');
  shadowTextC('mono', 'MEAT ' + H.meat + ' LBS', LW / 2, 1, 'cream');
  shadowText('mono', 'SHOT ' + Math.max(0, R.inv.shot - H.shots), LW - 70, 1, R.inv.shot - H.shots < 10 ? 'red' : 'cream');
  if (H.done) { const w = textW('old', H.msg) + 24; panel(LW / 2 - w / 2, 96, w, 22); textC('old', H.msg, LW / 2, 101, 'ink'); }
}

// ---------------------------------------------------------------- camp
function openCamp() {
  const R = S.R;
  if (MUS.current !== 'camp') { SND('fire_whoosh', { vol: 0.3 }); MUS.play('camp', { fade: 1.5 }); }
  const alive = Sim.living(R);
  const sick = alive.filter(p => p.ill || p.health < 50);
  S.overlay = { kind: 'camp', title: 'CAMP', body: '', options: ['rest', 'hunt', 'forage', 'rations', 'heal', 'mend', 'status', 'go on'],
    hints: { rest: 'two days by the fire', hunt: R.inv.shot + ' shot', forage: 'gather food nearby', rations: 'now ' + R.rations, heal: sick.length ? 'tend ' + sick[0].name : 'no one needs it', mend: 'patch the wagon', status: 'the party and supplies', 'go on': 'back to the trail' },
    onPick: o => {
      if (o === 'go on') return null;
      if (o === 'rest') { Sim.restDays(R, 2); SND('fire_whoosh', { vol: 0.2 }); toast('rested two days'); openCamp(); return 'keep'; }
      if (o === 'hunt') { startHunt(); return 'keep'; }
      if (o === 'forage') return { ch: challenge({ phrases: ['roots', 'greens', 'nuts', 'herbs'], time: 9 }), onDone: ok => { Sim.forageOutcome(R, ok ? 7 : 3); toast('foraged some food'); SND('pickup'); } };
      if (o === 'rations') { R.rations = R.rations === 'filling' ? 'meagre' : R.rations === 'meagre' ? 'bare' : 'filling'; toast('rations: ' + R.rations); openCamp(); return 'keep'; }
      if (o === 'heal') { if (!sick.length) { toast('everyone is well enough'); openCamp(); return 'keep'; } const p = sick[0]; const kind = p.ill ? p.ill.kind : 'exhaustion'; return { ch: challenge({ phrases: TXT.REMEDIES[kind], time: 12 }), onDone: ok => { if (R.inv.medicine > 0 && ok) { R.inv.medicine--; if (p.ill) p.ill.sev *= 0.4; p.health = Math.min(100, p.health + 15); toast(p.name + ' feels better'); SND('heal'); } else toast('not enough to help'); } }; }
      if (o === 'mend') return { ch: challenge({ phrases: ['grease the hubs', 'tighten spokes', 'patch canvas'], time: 12 }), onDone: ok => { if (ok) { for (const k of Object.keys(R.wear)) R.wear[k] = Math.max(5, R.wear[k] - 20); toast('the wagon is sounder'); SND('hammer'); } } };
      if (o === 'status') { S.overlay = { kind: 'choice', title: 'THE PARTY', body: statusLine(), options: ['back'], hints: {}, onPick: () => { openCamp(); return 'keep'; } }; return 'keep'; }
      return null;
    } };
}
function statusLine() {
  const R = S.R;
  const people = R.party.filter(p => p.alive).map(p => p.name + ' ' + Math.round(p.health) + (p.ill ? ' sick' : '')).join(', ');
  return people + '. food ' + Math.floor(R.inv.food) + ' water ' + R.inv.water.toFixed(1) + ' clothes ' + R.inv.clothing + ' shot ' + R.inv.shot + ' medicine ' + R.inv.medicine + ' $' + Math.floor(R.inv.money);
}

// ---------------------------------------------------------------- graves
function openGrave(e) {
  S.overlay = { kind: 'grave', title: 'REST, ' + e.who.toUpperCase(), body: e.who + ' died of ' + (TXT.ILLNESS_NAME[e.cause] || e.cause) + '.', text: '', who: e.who };
  MUS.play('lament', { now: true, fade: 0.8 });
  Audio.sting('death');
  SND('shovel', { delay: 1.2 });
}
function finishGrave() {
  const O = S.overlay, R = S.R;
  Sim.addGrave(R, O.who, O.text.trim() || pick(TXT.EPITAPHS));
  S.overlay = null;
  MUS.play(Sim.biome(R), { now: true, fade: 2 });
}

// ---------------------------------------------------------------- screens
function setMode(m) { S.mode = m; S.modeT = S.t; S.sel = 0; }
const MENU = ['START', 'HOW TO PLAY', 'BACK'];
function menuNav(k, n, pickFn, backFn) {
  const keys = k.keys || [];
  if (keys.includes('ArrowDown') || keys.includes('ArrowRight')) { S.sel = (S.sel + 1) % n; SND('ui_move'); }
  if (keys.includes('ArrowUp') || keys.includes('ArrowLeft')) { S.sel = (S.sel + n - 1) % n; SND('ui_move'); }
  if (k.enter) { SND('ui_select'); pickFn(S.sel); return; }
  if (keys.includes('Escape') && backFn) { SND('ui_back'); backFn(); }
}
function exitGame() {
  if (typeof window === 'undefined') return;
  if (window.TYPEMAXX) window.TYPEMAXX.pixel = null;
  if (typeof window.TYPEMAXX_SETGAME === 'function') window.TYPEMAXX_SETGAME(null);
  else if (typeof window.TYPEMAXX_RESTORE_MENU === 'function') window.TYPEMAXX_RESTORE_MENU();
}
function beginDeparture() {
  const R = S.R;
  setMode('store');
  openStore(() => {
    if (!Sim.healthyOxen(R).length) Sim.buy(R, 'oxen', 2);
    setMode('travel');
    toast('the wagon rolls west');
    SND('whip'); SND('hooves', { delay: 0.2 });
    MUS.play(Sim.biome(R), { now: true, fade: 1 });
    S.toast = { big: TXT.BIOMES.meadow.name, sub: TXT.BIOMES.meadow.sub, t0: S.t + 0.6, dur: 3.5 };
  });
}

function handleInput(k) {
  const keys = k.keys || [];
  const esc = keys.includes('Escape');
  switch (S.mode) {
    case 'title': return menuNav(k, MENU.length, i => { if (i === 0) { S.trade = 1; setMode('trade'); } else if (i === 1) setMode('howto'); else exitGame(); }, exitGame);
    case 'howto': if (k.enter || esc) { SND('ui_back'); setMode('title'); } return;
    case 'trade': return menuNav(k, 3, i => { S.pickTrade = TXT.TRADES[i].key; S.names = []; S.nameBuf = ''; setMode('names'); }, () => setMode('title'));
    case 'names': {
      for (const ch of k.chars || []) if (/^[a-z]$/i.test(ch) && S.nameBuf.length < 8) S.nameBuf += ch.toLowerCase();
      if (k.back) S.nameBuf = S.nameBuf.slice(0, -1);
      if (k.enter) {
        S.names.push(S.nameBuf || TXT.DEFAULT_NAMES[S.names.length]);
        S.nameBuf = '';
        SND('ui_select');
        if (S.names.length >= 5) { newJourney(S.pickTrade, S.names); beginDeparture(); }
      }
      if (esc) setMode('trade');
      return;
    }
    case 'store': return storeInput(k);
    case 'travel': {
      if (esc && !S.overlay) { setMode('pause'); Audio.pause(true); return; }
      if (S.overlay) {
        if (S.overlay.kind === 'grave' && k.back) S.overlay.text = S.overlay.text.slice(0, -1);
        else if (k.back && S.overlay.buf) S.overlay.buf = S.overlay.buf.slice(0, -1);
        for (const ch of k.chars || []) overlayChar(ch);
        if (k.enter) overlayEnter();
        return;
      }
      for (const ch of k.chars || []) travelChar(ch);
      if (k.enter) openCamp();
      return;
    }
    case 'pause': return menuNav(k, 2, i => { Audio.pause(false); if (i === 0) S.mode = 'travel'; else endJourney(); }, () => { Audio.pause(false); S.mode = 'travel'; });
    case 'hunt': { if (esc && S.hunt && !S.hunt.done) S.hunt.dur = S.t - S.hunt.t0; for (const ch of k.chars || []) huntChar(ch); return; }
    case 'river': for (const ch of k.chars || []) crossChar(ch); return;
    case 'results': if (S.t - S.modeT > 1) menuNav(k, 2, i => { if (i === 0) { S.trade = 1; setMode('trade'); MUS.play('menu', { now: true, fade: 1 }); } else { setMode('title'); MUS.play('menu', { now: true, fade: 1 }); } }); return;
  }
}
function endJourney() {
  const R = S.R;
  stopAmbience();
  R.finalScore = Sim.score(R);
  R.finalTitle = Sim.title(R);
  R.newBest = R.finalScore > S.best;
  S.best = Math.max(S.best, R.finalScore);
  setMode('results');
  MUS.play('results', { now: true, fade: 1.2 });
}

function drawTitle() {
  const t = S.t;
  if (!S.demo) S.demo = Sim.createRun({ seed: 7 });
  const R = S.demo;
  R.hour = 2.6 + Math.sin(t * 0.05) * 0.4;
  const prev = S.R, prevV = S.view;
  S.R = R; S.view = { scroll: t * 22, walkT: t, moving: true, loops: {} };
  drawTrail({ scroll: t * 22, moving: true, walkT: t, noLandmark: true, noSim: true });
  S.R = prev; S.view = prevV;
  const lt = tile('logo_wagonheart');
  const e = easeOut(clamp((t - S.modeT) / 0.8, 0, 1));
  blit('logo_wagonheart', LW / 2 - lt[2] / 2, 26 - (1 - e) * 12, 1, e);
  shadowTextC('old', 'a typing journey west', LW / 2, 74, 'cream', e);
  panel(LW / 2 - 60, 94, 120, 58, 0.9);
  MENU.forEach((m, i) => textC('big', m, LW / 2, 100 + i * 17, i === S.sel ? 'ink' : 'dim'));
  if (S.best) shadowTextC('mono', 'BEST ' + S.best, LW / 2, 156, 'cream');
}
function drawHowto() {
  drawTitleBackdrop();
  panel(20, 14, LW - 40, LH - 28);
  textC('big', 'HOW TO PLAY', LW / 2, 20, 'ink');
  const lines = [
    ['type', 'the wagon rolls west'],
    ['faster', 'more miles, more wear'],
    ['slips', 'jolt the wagon'],
    ['enter', 'make camp: rest, hunt'],
    ['trouble', 'type the remedy'],
    ['rivers', 'ford, float or ferry'],
    ['forts', 'trade and earn coin'],
    ['stones', 'carve the old poem'],
    ['the coast', 'the trail goes on'],
  ];
  lines.forEach(([a, b], i) => { textR('old', a, 120, 42 + i * 18, 'ink'); text('mono', b, 130, 41 + i * 18, 'dim'); });
  textC('mono', 'enter to go back', LW / 2, LH - 24, 'dim');
}
function drawTitleBackdrop() {
  const t = S.t;
  if (!S.demo) S.demo = Sim.createRun({ seed: 7 });
  const prev = S.R, prevV = S.view;
  S.R = S.demo; S.view = { scroll: t * 22, walkT: t, moving: true, loops: {} };
  drawTrail({ scroll: t * 22, moving: true, walkT: t, noLandmark: true, noSim: true });
  S.R = prev; S.view = prevV;
}
function drawTrade() {
  drawTitleBackdrop();
  panel(16, 20, LW - 32, LH - 40);
  textC('big', 'WHO LEADS THE WAGON', LW / 2, 26, 'ink');
  TXT.TRADES.forEach((tr, i) => {
    const y = 52 + i * 50, on = i === S.sel;
    if (on) rect(26, y - 4, LW - 52, 44, '#D8C49C');
    text('big', tr.name, 36, y, on ? 'ink' : 'dim');
    textR('mono', '$' + tr.money + '   score x' + tr.mult, LW - 36, y + 1, on ? 'ink' : 'dim');
    text('old', tr.skill, 36, y + 18, on ? 'ink' : 'dim');
  });
  textC('mono', 'arrows choose, enter picks', LW / 2, LH - 32, 'dim');
}
function drawNames() {
  drawTitleBackdrop();
  panel(30, 30, LW - 60, LH - 60);
  const n = S.names.length;
  textC('big', n === 0 ? 'NAME THE LEADER' : 'NAME COMPANION ' + n, LW / 2, 38, 'ink');
  panel(80, 70, LW - 160, 22);
  textC('big', (S.nameBuf || '') + (((S.t * 2) | 0) % 2 ? '_' : ' '), LW / 2, 74, 'ink');
  textC('mono', 'type a name, enter (blank for ' + TXT.DEFAULT_NAMES[n] + ')', LW / 2, 98, 'dim');
  S.names.forEach((nm, i) => textC('old', nm, LW / 2, 118 + i * 14, 'ink'));
}
function drawTravel() {
  drawTrail();
  drawHud();
  drawToasts();
  drawOverlay();
}
function drawToasts() {
  const tt = S.toast;
  if (tt) {
    const u = S.t - tt.t0;
    if (u > tt.dur) S.toast = null;
    else if (u > 0) {
      const a = clamp(u / 0.5, 0, 1) * clamp((tt.dur - u) / 0.6, 0, 1);
      shadowTextC('big', tt.big, LW / 2, 70, 'cream', a);
      if (tt.sub) shadowTextC('old', tt.sub, LW / 2, 88, 'cream', a);
    }
  }
  const s = S.toastSmall;
  if (s && S.t - s.t0 < 2.6) {
    const a = clamp((2.6 - (S.t - s.t0)) / 0.5, 0, 1);
    const w = textW('old', s.msg) + 12;
    panel(LW / 2 - w / 2, 196, w, 16, a * 0.95);
    textC('old', s.msg, LW / 2, 199, 'ink', a);
  }
}
function drawPause() { drawTrail(); drawHud(); rect(0, 0, LW, LH, '#1A120C', 0.5); panel(90, 80, 140, 60); textC('big', 'PAUSED', LW / 2, 86, 'ink'); ['RESUME', 'END JOURNEY'].forEach((m, i) => textC('old', m, LW / 2, 108 + i * 14, i === S.sel ? 'ink' : 'dim')); }
function drawResults() {
  const R = S.R;
  drawTrail({ moving: false });
  rect(0, 0, LW, LH, '#1A120C', 0.45);
  panel(20, 12, LW - 40, LH - 24);
  textC('big', 'TRAIL\'S END', LW / 2, 18, 'ink');
  textC('old', R.finalTitle.toLowerCase(), LW / 2, 36, 'green');
  const acc = R.stats.letters ? Math.round(100 * (R.stats.letters - R.stats.errors) / R.stats.letters) : 100;
  const rows = [['miles', Math.round(R.miles)], ['days', R.day], ['crossings', R.crossing - 1], ['landmarks', R.stats.landmarks], ['survivors', Sim.living(R).length], ['poem lines', R.poem], ['accuracy', acc + '%'], ['score', R.finalScore]];
  rows.forEach(([k, v], i) => { text('old', k, 40, 54 + i * 12, 'dim'); textR('old', String(v), 150, 54 + i * 12, 'ink'); });
  text('old', 'the ledger', 170, 54, 'dim');
  R.graves.slice(-7).forEach((g, i) => { text('mono', g.name + ' mi ' + g.mile, 170, 66 + i * 11, 'ink'); });
  if (!R.graves.length) text('mono', 'no one was lost', 170, 66, 'green');
  ['NEW PARTY', 'MENU'].forEach((m, i) => textC('big', m, LW / 2, 164 + i * 17, i === S.sel ? 'ink' : 'dim'));
  if (R.newBest) textC('mono', 'best this visit', LW / 2, 204, 'green');
}
function drawLoading() { rect(0, 0, LW, LH, '#1A120C'); for (let i = 0; i < 3; i++) if (((S.t * 3) | 0) % 3 === i) rect(150 + i * 8, 118, 4, 4, COL.gold); }

// ---------------------------------------------------------------- showcase
// A 10 s trailer, five shots cut on the intro music's bar lines (every 2 s at 120 bpm):
// dawn meadow, a river crossing, a deer hunt, the Pass by moonlight, sunset on the coast.
const SHOW_LOOP = 10, SHOW_INTRO = 1.5;
// The select screen lays its logo over the top third and the game tiles over the lower third,
// so every shot is lifted until the road runs through the clear band between them (y ~154).
const SHOW_LIFT = 48;
const SHOTS = [
  { biome: 'meadow', hour: 2.3, weather: 'clear' },
  { biome: 'river', hour: 3.6, weather: 'clear', river: true },
  { biome: 'highwood', hour: 4.4, weather: 'clear', hunt: true },
  { biome: 'pass', hour: 0.3, weather: 'snow' },
  { biome: 'coast', hour: 6.1, weather: 'clear' },
];
function drawShowcase(t) {
  const lt = ((t % SHOW_LOOP) + SHOW_LOOP) % SHOW_LOOP;
  const i = Math.min(4, Math.floor(lt / 2));
  const local = lt - i * 2;
  const shot = SHOTS[i];
  if (!S.showRun) S.showRun = Sim.createRun({ seed: 3 });
  const R = S.showRun;
  R.region.biome = shot.biome; R.transition = null; R.weather = { kind: shot.weather, left: 9 }; R.hour = shot.hour + local * 0.05;
  const prev = S.R, prevV = S.view;
  S.R = R; S.view = { scroll: (i * 900 + local * 40), walkT: local + i, moving: true, loops: {} };
  const L = lightAt(shot.biome, R.hour);
  ctx().save();
  ctx().translate(0, -SHOW_LIFT);
  if (shot.river) {
    drawTrail({ light: L, noWagon: true, noLandmark: true, scroll: S.view.scroll });
    for (let k = -1; k < 7; k++) put('water_river', frameOf('water_river', t) + k, k * 64 - ((local * 30) % 64), ROAD + 12, { lit: L });
    rect(0, ROAD + 26, LW, LH + SHOW_LIFT - ROAD - 26, '#1E4A5A', 0.9);
    put('raft', 0, WAGON_X, ROAD + 8 + Math.sin(local * 3) * 2, { lit: L });
    drawCaravan(R, L, { moving: true, walkT: local, noSim: true });
    if (local > 0.5 && local < 1.6) put('rock_a', 0, lerp(-10, WAGON_X - 60, (local - 0.5) / 1.1), ROAD + 16, { lit: L });
  } else if (shot.hunt) {
    drawTrail({ light: L, noWagon: true, noLandmark: true, scroll: S.view.scroll });
    const x = lerp(-30, 200, local / 2);
    if (local < 1.3) put('deer_run', frameOf('deer_run', t), x, GROUND + 18, { lit: L, flip: false });
    else put('deer_run', 0, lerp(-30, 200, 1.3 / 2), GROUND + 24, { lit: L, alpha: 1 - (local - 1.3) / 0.7 });
    const word = 'antler', typed = Math.min(word.length, Math.floor(local * 6));
    if (local < 1.3) { const wx = x; const w = textW('old', word); panel(wx - w / 2 - 3, GROUND - 38, w + 6, 13, 0.92); let pen = wx - w / 2; for (let k = 0; k < word.length; k++) pen = text('old', word[k], pen, GROUND - 36, k < typed ? 'green' : 'ink'); }
    if (local > 1.25 && local < 1.4) rect(0, SHOW_LIFT, LW, LH, '#FFF4D0', 0.35);
  } else {
    drawTrail({ light: L, scroll: S.view.scroll, moving: true, walkT: local + i, noLandmark: true, noSim: true });
  }
  ctx().restore();
  S.R = prev; S.view = prevV;
  // a quick white wipe on every cut
  if (local < 0.12 && lt > 1) rect(0, 0, LW, LH, '#FFF6E0', 0.55 * (1 - local / 0.12));
}

let showLast = 0, showWatch = null, showLap = null, showPrev = 0;
function showcaseAudio(t) {
  const nowMs = performance.now();
  if (S.active) return;
  const fresh = showLap == null || nowMs - showPrev > 250;
  const lap = Math.floor(t / SHOW_LOOP);
  const wrapped = !fresh && lap !== showLap;
  showLap = lap; showPrev = nowMs; showLast = nowMs;
  if (fresh && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('typemaxx:showcase', { detail: 'wagonheart' }));
  if (!Audio.ready) return;
  if (MUS.current !== 'intro') MUS.play('intro', { now: true, restart: true, fade: 0.25, at: t % SHOW_LOOP });
  else if (wrapped) {
    const p = MUS.position;
    const phase = p ? ((p.step / 16) * (60 / p.bpm * 4)) % SHOW_LOOP : 0;
    if (p && Math.min(phase, SHOW_LOOP - phase) > 0.3) MUS.play('intro', { now: true, restart: true, fade: 0.1, at: t % SHOW_LOOP });
  }
  if (!showWatch) showWatch = setInterval(() => { if (performance.now() - showLast > 250) { if (MUS.current === 'intro') MUS.stop(0.3); clearInterval(showWatch); showWatch = null; } }, 100);
}
if (typeof window !== 'undefined') {
  window.addEventListener('typemaxx:showcase', e => { if (e.detail === 'wagonheart' || S.active) return; if (MUS.current === 'intro') MUS.stop(0.3); });
}

const SHOWCASE = {
  INTRO: SHOW_INTRO, LOOP: SHOW_LOOP,
  get ready() { return S.ready; },
  preload() { if (!S.ready && !S.loading) loadAssets(); return new Promise(res => { const w = () => S.ready || S.error ? res(S.ready) : setTimeout(w, 50); w(); }); },
  background(g, W, H, t, dim) {
    if (!S.ready) { if (!S.loading && !S.error) loadAssets(); g.fillStyle = '#1A120C'; g.fillRect(0, 0, W, H); return; }
    showcaseAudio(t);
    if (S.active) return;
    const sC = S.ctx, sT = S.t;
    S.ctx = g; S.t = t;
    g.save(); g.imageSmoothingEnabled = false; g.scale(W / LW, H / LH);
    try {
      drawShowcase(t);
      const d = dim == null ? 0.5 : dim;
      const gr = g.createLinearGradient(0, 0, 0, LH);
      gr.addColorStop(0, 'rgba(20,12,8,' + (d * 0.9).toFixed(2) + ')'); gr.addColorStop(0.35, 'rgba(20,12,8,' + (d * 0.2).toFixed(2) + ')');
      gr.addColorStop(0.65, 'rgba(20,12,8,' + (d * 0.25).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(20,12,8,' + d.toFixed(2) + ')');
      g.fillStyle = gr; g.fillRect(0, 0, LW, LH);
      // the intro: a wheel rolls in from the dark and the day opens behind it
      if (t < SHOW_INTRO) {
        const u = t / SHOW_INTRO;
        const open = easeIO(clamp((t - 0.6) / 0.8, 0, 1));
        g.fillStyle = '#140C08';
        g.fillRect(0, 0, LW, LH * 0.5 * (1 - open));
        g.fillRect(0, LH - LH * 0.5 * (1 - open), LW, LH * 0.5 * (1 - open));
        if (t < 1.1) {
          const wt = tile('wheel_heart');
          const x = lerp(-40, LW / 2, easeOut(clamp(t / 0.7, 0, 1)));
          g.save(); g.translate(Math.round(x), LH / 2); g.rotate(t * 6);
          g.drawImage(S.img, wt[0], wt[1], wt[2], wt[3], -16, -16, 32, 32); g.restore();
        }
        void u;
      }
    } catch (e) { if (!SHOWCASE.warned) { SHOWCASE.warned = true; console.error('WAGONHEART showcase:', e); } }
    finally { g.restore(); S.ctx = sC; S.t = sT; }
  },
  logo(g, cx, cy, width, t) {
    if (!S.ready) return;
    const tl = tile('logo_wagonheart');
    const e = easeOut(clamp((t - 0.9) / 0.5, 0, 1));
    if (e <= 0) return;
    const sc = width / tl[2], w = tl[2] * sc, h = tl[3] * sc;
    g.save(); g.imageSmoothingEnabled = false; g.globalAlpha = e;
    g.drawImage(S.img, tl[0], tl[1], tl[2], tl[3], Math.round(cx - w / 2), Math.round(cy - h / 2 + (1 - e) * 10 * sc), Math.round(w), Math.round(h));
    // the wheel in the O turns once when the mark lands
    const spin = clamp((t - 1.0) / 1.2, 0, 1);
    if (spin > 0 && spin < 1) {
      const wt = tile('wheel_heart');
      const ox = cx - w / 2 + (tl[2] * 0.338) * sc, oy = cy;
      const ws = 24 * sc;
      g.save(); g.translate(ox, oy); g.rotate(easeOut(spin) * TAU);
      g.drawImage(S.img, wt[0], wt[1], wt[2], wt[3], -ws / 2, -ws / 2, ws, ws); g.restore();
    }
    g.restore();
  },
  icon(g, x, y, size, t, focused) {
    if (!S.ready) return;
    const tl = tile('icon_wagonheart');
    const pop = t < 1.1 ? 0 : t < 1.35 ? 1 - Math.pow(1 - (t - 1.1) / 0.25, 3) : 1;
    if (pop <= 0) return;
    const bounce = t < 1.5 ? 1 + Math.sin(clamp((t - 1.1) / 0.4, 0, 1) * Math.PI) * 0.08 : 1;
    const lift = focused ? Math.round(Math.sin(t * 3) * size * 0.02) - size * 0.03 : 0;
    const s = size * bounce;
    const ix = Math.round(x + (size - s) / 2), iy = Math.round(y + (size - s) / 2 + lift);
    g.save(); g.imageSmoothingEnabled = false; g.globalAlpha = focused ? pop : pop * 0.72;
    g.drawImage(S.img, tl[0], tl[1], tl[2], tl[3], ix, iy, Math.round(s), Math.round(s));
    if (focused) {
      g.globalAlpha = 0.6 + Math.sin(t * 4) * 0.25; g.strokeStyle = '#F8DCA0'; g.lineWidth = Math.max(1, size / 32);
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

// ---------------------------------------------------------------- export
const WAGONHEART = {
  title: 'WAGONHEART',
  get state() { return S; },
  get dev() { return { Sim, newJourney, openEvent, openCamp, openStore, startHunt, openArrival, travelChar, setMode }; },
  showcase: SHOWCASE,
  audio: Audio,
  enter() {
    S.active = true;
    loadAssets();
    setMode('title');
    S.lastSec = null; S.flash = null; S.shake = 0; S.overlay = null;
    MUS.play('menu', { now: true, fade: 1 });
  },
  exit() {
    S.active = false;
    if (typeof window !== 'undefined' && window.TYPEMAXX) window.TYPEMAXX.pixel = null;
    stopAmbience();
    Audio.pause(false);
    Audio.stopAll(0.8);
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
    g.save(); g.imageSmoothingEnabled = false; g.scale(W / LW, H / LH);
    if (!S.ready) { if (!S.loading && !S.error) loadAssets(); drawLoading(); g.restore(); return; }
    handleInput(k);
    if (S.mode === 'travel' && S.R) { if (!S.overlay || S.overlay.kind !== 'grave') updateTravel(S.dt); updateOverlay(); }
    if (S.mode === 'hunt' && S.hunt) updateHunt(S.dt);
    if (S.mode === 'river' && S.cross) updateCrossing();
    if (S.shake > 0) { const a = S.shake; g.translate(Math.round((hash((S.t * 60) | 0, 1) - 0.5) * a * 2), Math.round((hash((S.t * 60) | 0, 2) - 0.5) * a * 2)); S.shake = Math.max(0, S.shake - S.dt * 12); }
    switch (S.mode) {
      case 'title': drawTitle(); break;
      case 'howto': drawHowto(); break;
      case 'trade': drawTrade(); break;
      case 'names': drawNames(); break;
      case 'store': drawStore(); break;
      case 'travel': drawTravel(); break;
      case 'pause': drawPause(); break;
      case 'hunt': drawHunt(); break;
      case 'river': drawCrossing(); break;
      case 'results': drawResults(); break;
    }
    g.restore();
  },
};

if (typeof window !== 'undefined') {
  const start = () => { if (!S.ready && !S.loading) loadAssets(); };
  if (document.readyState === 'complete') setTimeout(start, 500);
  else addEventListener('load', () => setTimeout(start, 500), { once: true });
}

export default WAGONHEART;
export { WAGONHEART };
