/*
 * VECTOR - a light-cycle typing game for TYPEMAXX.
 *
 * Words make you fast, single keys steer you, every typo shortens the wall of light behind
 * you. Isometric, 480x360, sprites pre-rendered from our own Blender models (tools/vectorart).
 *
 * Contract (TYPEMAXX engine): export an object with enter(), exit() and
 * draw(ctx, W, H, seconds, now, input). input.pull() returns { chars, keys, back, enter }.
 * Rules live in vector-sim.js; sound in vector-audio.js. Nothing is stored locally, and
 * nothing sounds on a keystroke itself.
 */

import Sim from './vector-sim.js';
import Audio from './vector-audio.js';

const BASE = new URL('../assets/vector/', import.meta.url).href;
const LW = 480, LH = 360;
const TAU = Math.PI * 2;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const MUS = Audio.music;
const SND = (n, o) => Audio.sfx(n, o);
const AFTER_KEY = 0.05;

const COL = {
  player: [40, 235, 255], drone: [185, 210, 255], hunter: [255, 130, 30], sealer: [255, 60, 200], mirror: [160, 110, 255],
  glitch: [90, 255, 120], warden: [255, 50, 60], boss: [255, 45, 85],
  shield: [120, 200, 255], lance: [255, 240, 120], spike: [255, 120, 60], phase: [190, 140, 255], surge: [255, 220, 60], reset: [120, 255, 200],
  white: [255, 255, 255], ink: [6, 9, 20], dim: [90, 110, 140], gold: [255, 205, 70], red: [255, 70, 80], text: [200, 225, 245],
};
const css = (c, a) => a == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, u) => a + (b - a) * u;
const easeOut = u => 1 - Math.pow(1 - u, 3);
function hash(i, k) { let x = (i * 374761393 + k * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }

// ---------------------------------------------------------------- state
const G = {
  loading: false, ready: false, error: null, M: null, body: null, mask: null, font: null,
  tints: {}, glows: {}, fontTint: {}, wallTiles: {}, logo: null, icon: null,
  mode: 'title', modeT: 0, t: 0, lastSec: null, dt: 0, sel: 0, active: false,
  run: null, S: null, cam: { x: 0, y: 0, shake: 0 }, particles: [], rings: [], toasts: [], floor: null, floorKey: '',
  angle: {}, choices: null, typedChoice: '', demo: null, best: 0, flash: 0, slow: 0, loops: {},
};
let ctx = null, glow = null, glowCtx = null, bloom2 = null, bloom3 = null;

// ---------------------------------------------------------------- assets
async function loadImg(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('failed to load ' + src)); img.src = src; });
  if (img.decode) await img.decode().catch(() => {});
  return img;
}
const idle = () => new Promise(r => (typeof requestIdleCallback === 'function' ? requestIdleCallback(r, { timeout: 80 }) : setTimeout(r, 16)));
async function loadAssets() {
  if (G.loading || G.ready) return;
  G.loading = true;
  try {
    const M = await (await fetch(BASE + 'sprites.json')).json();
    const [body, mask, font] = await Promise.all([loadImg(BASE + 'sprites.png'), loadImg(BASE + 'mask.png'), loadImg(BASE + 'font.png')]);
    G.M = M; G.body = body; G.mask = mask; G.font = font;
    G.maskData = pixels(mask); G.bodyData = pixels(body);
    for (const k of ['player', 'drone', 'hunter']) { await idle(); tintAtlas(k); }
    buildLogo(); buildIcon();
    G.ready = true;
    // the rest of the colours as the page idles
    (async () => { for (const k of ['sealer', 'mirror', 'glitch', 'warden', 'boss', 'shield', 'lance', 'spike', 'phase', 'surge', 'reset']) { await idle(); tintAtlas(k); } })();
  } catch (e) { G.error = String(e && e.message || e); }
  G.loading = false;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function pixels(img) { const c = canvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height); }

// One colour's version of the whole atlas: rim and light take the colour, outlines a dark shade of it.
// Its glow twin holds only the light pixels, for the bloom layer.
function tintAtlas(key) {
  if (G.tints[key]) return G.tints[key];
  const col = COL[key];
  const w = G.body.width, h = G.body.height;
  const b = G.bodyData.data, m = G.maskData.data;
  const out = new ImageData(w, h), gl = new ImageData(w, h);
  const o = out.data, g = gl.data;
  const ink = [col[0] * 0.16, col[1] * 0.16, col[2] * 0.16];
  const L1 = [col[0] * 0.55 + 115, col[1] * 0.55 + 115, col[2] * 0.55 + 115];
  const L2 = [col[0] * 0.3 + 178, col[1] * 0.3 + 178, col[2] * 0.3 + 178];
  for (let i = 0; i < o.length; i += 4) {
    const a = b[i + 3];
    if (!a) continue;
    const mr = m[i], mg = m[i + 1], mb = m[i + 2];
    o[i + 3] = 255;
    if (mb) { o[i] = ink[0]; o[i + 1] = ink[1]; o[i + 2] = ink[2]; }
    else if (mg) {
      const L = mg === 255 ? L1 : L2;
      o[i] = L[0]; o[i + 1] = L[1]; o[i + 2] = L[2];
      g[i] = col[0]; g[i + 1] = col[1]; g[i + 2] = col[2]; g[i + 3] = 255;
    } else if (mr) {
      const f = mr / 255 * 0.8;
      o[i] = Math.min(255, b[i] + col[0] * f); o[i + 1] = Math.min(255, b[i + 1] + col[1] * f); o[i + 2] = Math.min(255, b[i + 2] + col[2] * f);
    } else { o[i] = b[i]; o[i + 1] = b[i + 1]; o[i + 2] = b[i + 2]; }
  }
  const c = canvas(w, h); c.getContext('2d').putImageData(out, 0, 0);
  const cg = canvas(w, h); cg.getContext('2d').putImageData(gl, 0, 0);
  G.tints[key] = c; G.glows[key] = cg;
  return c;
}
const atlasFor = key => G.tints[key] || tintAtlas(key);

// ---------------------------------------------------------------- drawing kit
function rect(x, y, w, h, col, a) { ctx.fillStyle = css(col, a); ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function sprite(name, key, x, y, alpha, glowAlpha) {
  const s = G.M.sprites[name]; if (!s) return;
  const [sx, sy, w, h, ox, oy] = s;
  const dx = Math.round(x - ox), dy = Math.round(y - oy);
  if (alpha != null && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
  ctx.drawImage(atlasFor(key), sx, sy, w, h, dx, dy, w, h);
  ctx.globalAlpha = 1;
  if (glowCtx && glowAlpha !== 0) {
    glowCtx.globalAlpha = (glowAlpha == null ? 1 : glowAlpha) * (alpha == null ? 1 : Math.max(0, alpha));
    glowCtx.drawImage(G.glows[key], sx, sy, w, h, dx / 2, dy / 2, w / 2, h / 2);
    glowCtx.globalAlpha = 1;
  }
}
function fontSheet(col) {
  const k = col.join(',');
  if (G.fontTint[k]) return G.fontTint[k];
  const c = canvas(G.font.width, G.font.height); const g = c.getContext('2d');
  g.drawImage(G.font, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = css(col); g.fillRect(0, 0, c.width, c.height);
  return (G.fontTint[k] = c);
}
function textW(str, scale) { const gl = G.M.font.glyphs; let w = 0; for (const ch of String(str)) w += (gl[ch] ? gl[ch][4] : 5); return w * (scale || 1); }
function text(str, x, y, col, scale, alpha, target) {
  const g = target || ctx, sheet = fontSheet(col || COL.text), gl = G.M.font.glyphs; scale = scale || 1;
  if (alpha != null) g.globalAlpha = clamp(alpha, 0, 1);
  let pen = Math.round(x);
  for (const ch of String(str)) {
    const q = gl[ch];
    if (!q) { pen += 5 * scale; continue; }
    if (q[2] && q[3]) g.drawImage(sheet, q[0], q[1], q[2], q[3], pen + q[5] * scale, Math.round(y) + q[6] * scale, q[2] * scale, q[3] * scale);
    pen += q[4] * scale;
  }
  g.globalAlpha = 1;
  return pen;
}
const textC = (s, cx, y, col, scale, a) => text(s, Math.round(cx - textW(s, scale) / 2), y, col, scale, a);
const textR = (s, rx, y, col, scale, a) => text(s, Math.round(rx - textW(s, scale)), y, col, scale, a);
function glowText(s, cx, y, col, scale, a) {
  textC(s, cx, y, col, scale, a);
  if (glowCtx) { glowCtx.save(); glowCtx.scale(0.5, 0.5); text(s, Math.round(cx - textW(s, scale) / 2), y, col, scale, (a == null ? 1 : a) * 0.9, glowCtx); glowCtx.restore(); }
}
function panel(x, y, w, h, a, edge) {
  rect(x, y, w, h, COL.ink, 0.78 * (a == null ? 1 : a));
  ctx.fillStyle = css(edge || COL.player, 0.55 * (a == null ? 1 : a));
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 1); ctx.fillRect(Math.round(x), Math.round(y + h - 1), Math.round(w), 1);
  ctx.fillRect(Math.round(x), Math.round(y), 1, Math.round(h)); ctx.fillRect(Math.round(x + w - 1), Math.round(y), 1, Math.round(h));
}

// ---------------------------------------------------------------- the world on screen
// Two cameras: near (zoom 1, 48x24 cells) and far (zoom 0.5, with the half-size sprite set).
let Z = 1, HX = 24, HY = 12, WALL_H = 22, TIER_H = 22, SFX = '';
function setZoom(z) { Z = z; HX = 24 * z; HY = 12 * z; WALL_H = Math.round(22 * z); TIER_H = Math.round(22 * z); SFX = z < 1 ? '_s' : ''; }
function iso(x, y, level) { return [LW / 2 + (x + y) * HX - G.cam.x, LH / 2 + (x - y) * HY - (level || 0) * TIER_H - G.cam.y]; }
function bikePos(b) {
  if (b.laid) return [b.x - DX[b.d] * (1 - b.p), b.y - DY[b.d] * (1 - b.p)];
  return [b.x + DX[b.d] * b.p, b.y + DY[b.d] * b.p];
}
// the height a rider is drawn at: ramps are slopes, drops ease down, jumps arc
function bikeLevel(b, S) {
  S = S || G.S;
  const [px, py] = bikePos(b);
  if (b.air > 0) {
    const u = clamp((b.dist - b.airStart) / Sim.JUMP, 0, 1);
    const to = b.airTo >= 0 ? b.airTo : b.airFrom - 3;
    return lerp(b.airFrom, to, u) + 1.8 * Math.sin(Math.PI * u);
  }
  if (S) {
    const lv = surfaceAt(S, px, py);
    if (lv != null) return lv;
  }
  if (b.laid && b.fromLevel !== b.level) return lerp(b.fromLevel, b.level, clamp((b.p - 0.5) * 2, 0, 1));
  return b.level;
}
// the terrain height under a point, ramps sloped
function surfaceAt(S, px, py) {
  const A = S.A, n = A.n;
  const x = Math.round(px), y = Math.round(py);
  if (x < 0 || y < 0 || x >= n || y >= n) return null;
  const i = y * n + x, h = A.h[i];
  if (h < 0) return null;
  const r = A.ramp[i];
  if (r >= 0) return h + 0.5 + clamp((px - x) * DX[r] + (py - y) * DY[r], -0.5, 0.5);
  return h;
}
function bikeKey(b) { return b.kind === 'player' ? 'player' : b.kind; }

// a wall tile per colour and zoom: a lit face under a bright crest, faint scan columns
function wallTile(key) {
  const k = key + '@' + Z;
  if (G.wallTiles[k]) return G.wallTiles[k];
  const col = COL[key] || COL.player;
  const W = Math.round(HX), H = WALL_H;
  const c = canvas(W, H + 2), g = c.getContext('2d');
  for (let y = 0; y < H; y++) {
    const u = y / H, k = 0.32 + 0.43 * Math.pow(1 - u, 1.3);
    g.fillStyle = css([col[0] * k, col[1] * k, col[2] * k]);
    g.fillRect(0, y + 1, W, 1);
  }
  const hot = [Math.min(255, col[0] * 0.3 + 190), Math.min(255, col[1] * 0.3 + 190), Math.min(255, col[2] * 0.3 + 190)];
  g.fillStyle = css(hot); g.fillRect(0, 0, W, Z < 1 ? 2 : 3);
  g.fillStyle = css(col); g.fillRect(0, H, W, 2);
  // its reflection, already upside down and fading
  const r = canvas(W, H), rg = r.getContext('2d');
  for (let y = 0; y < H; y++) { rg.fillStyle = css(col, 0.28 * Math.pow(1 - y / H, 2)); rg.fillRect(0, y, W, 1); }
  const glowTile = canvas(W, H + 2), gg = glowTile.getContext('2d');
  gg.fillStyle = css(hot); gg.fillRect(0, 0, W, 3); gg.fillStyle = css(col, 0.55); gg.fillRect(0, 3, W, H - 3); gg.fillStyle = css(col); gg.fillRect(0, H, W, 2);
  return (G.wallTiles[k] = { face: c, glow: glowTile, refl: r, w: W });
}
function wallSegment(ax, ay, la, bx, by, lb, key, alpha) {
  const [x0, y0] = iso(ax, ay, la), [x1, y1] = iso(bx, by, lb);
  const sdx = x1 - x0, sdy = y1 - y0;
  if (Math.abs(sdx) < 0.5) return;
  const T = wallTile(key);
  const A = alpha == null ? 1 : alpha;
  ctx.save(); ctx.globalAlpha = A;
  ctx.transform(sdx / T.w, sdy / T.w, 0, 1, x0, y0);
  ctx.drawImage(T.refl, 0, 0);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = A;
  ctx.transform(sdx / T.w, sdy / T.w, 0, 1, x0, y0 - WALL_H);
  ctx.drawImage(T.face, 0, 0);
  ctx.restore();
  if (glowCtx) {
    glowCtx.save(); glowCtx.globalAlpha = A;
    glowCtx.transform(sdx / T.w / 2, sdy / T.w / 2, 0, 0.5, x0 / 2, (y0 - WALL_H) / 2);
    glowCtx.drawImage(T.glow, 0, 0);
    glowCtx.restore();
  }
}

// ---------------------------------------------------------------- the stadium: terrain in cached chunks
// The arena floats in a dark city. Every cell is a block at its tier: a top face and the two
// front faces the camera can see. Beyond the far edges rise the stands, with their crowd.
const CH = 12;              // cells per chunk side
const STAND = 9;            // cells of stands and gap beyond the arena
const TIER_TOP = [[3, 5, 10], [4, 7, 13], [5, 9, 16]];
const TIER_EDGE = [[60, 160, 200], [120, 220, 245], [190, 240, 255]];
function cellHeight(S, x, y) {
  // arena cells: their tier (void -9). Outside: a gap, then stands on the two far sides only.
  const A = S.A, n = A.n;
  if (x >= 0 && y >= 0 && x < n && y < n) { const h = A.h[y * n + x]; return h < 0 ? -9 : h; }
  const far = x < 0 ? -x : y >= n ? y - n + 1 : 0;
  const near = x >= n || y < 0;
  if (near || far < 3 || x < -STAND || y > n - 1 + STAND) return -9;
  if (x >= 0 && y < n) return -9;
  return Math.min(5, 1 + Math.floor((far - 3) / 1.5));
}
// the height of one corner of a cell (corners: 0 top, 1 right, 2 bottom, 3 left), ramps included
const CORNER = [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]];
function cornerHeight(S, x, y, c) {
  const h = cellHeight(S, x, y);
  const A = S.A, n = A.n;
  if (h >= 0 && x >= 0 && y >= 0 && x < n && y < n) {
    const r = A.ramp[y * n + x];
    if (r >= 0) return h + (CORNER[c][0] * DX[r] + CORNER[c][1] * DY[r] > 0 ? 1 : 0);
  }
  return h;
}
function drawCellTerrain(g, S, x, y, sx, sy) {
  const h = cellHeight(S, x, y);
  if (h < -1) return;
  const A = S.A, n = A.n, inArena = x >= 0 && y >= 0 && x < n && y < n;
  const i = inArena ? y * n + x : -1;
  const ch = [0, 1, 2, 3].map(c => cornerHeight(S, x, y, c));
  const P = c => [sx + (c === 1 ? HX : c === 3 ? -HX : 0), sy + (c === 0 ? -HY : c === 2 ? HY : 0) - ch[c] * TIER_H];
  const stand = !inArena;
  const tier = Math.min(2, Math.max(0, h));
  // front faces: black glass, lit only along the top edge
  const faces = [[1, 2, x + 1, y, 3, 0], [2, 3, x, y - 1, 0, 1]];
  faces.forEach(([c1, c2, nx, ny, nc1, nc2], fi) => {
    const nh1 = cellHeight(S, nx, ny) < -1 ? -5 : cornerHeight(S, nx, ny, nc1);
    const nh2 = cellHeight(S, nx, ny) < -1 ? -5 : cornerHeight(S, nx, ny, nc2);
    if (ch[c1] <= nh1 && ch[c2] <= nh2) return;
    const [ax, ay] = P(c1), [bx, by] = P(c2);
    const ay2 = ay + (ch[c1] - Math.min(ch[c1], nh1)) * TIER_H, by2 = by + (ch[c2] - Math.min(ch[c2], nh2)) * TIER_H;
    const abyss = nh1 < -1;
    const grd = g.createLinearGradient(0, Math.min(ay, by), 0, Math.max(ay2, by2));
    grd.addColorStop(0, fi === 0 ? '#0b1320' : '#070c16');
    grd.addColorStop(1, '#010206');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx, by2); g.lineTo(ax, ay2); g.closePath(); g.fill();
    g.strokeStyle = stand ? 'rgba(90,130,170,0.35)' : css(TIER_EDGE[tier], 0.95);
    g.lineWidth = Z < 1 ? 1 : 2;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  });
  // the top: glass
  g.fillStyle = css(stand ? [2, 3, 7] : TIER_TOP[tier]);
  g.beginPath(); for (let c = 0; c < 4; c++) { const [px, py] = P(c); c ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill();
  if (stand) {
    // the stands are silhouettes; a few seat lights along each step
    if (hash(x * 7, y * 13) < 0.22) { const [px, py] = [sx, sy - h * TIER_H]; g.fillStyle = 'rgba(120,200,230,0.35)'; g.fillRect(Math.round(px), Math.round(py), 1, 1); }
    return;
  }
  const top = P(0), right = P(1), left = P(3);
  if (A.mod[i] > 1) { g.fillStyle = 'rgba(40,220,190,0.07)'; g.beginPath(); for (let c = 0; c < 4; c++) { const [px, py] = P(c); c ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill(); }
  if (A.ramp[i] >= 0) {
    g.strokeStyle = css(TIER_EDGE[tier], 0.3); g.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      const u = k / 4 - 0.5, r = A.ramp[i];
      const ox = DX[r] * u, oy = DY[r] * u, px = -DY[r] * 0.45, py = DX[r] * 0.45;
      const a2 = iso0(sx, sy, ox - px, oy - py, h + 0.5 + u), b2 = iso0(sx, sy, ox + px, oy + py, h + 0.5 + u);
      g.beginPath(); g.moveTo(a2[0], a2[1]); g.lineTo(b2[0], b2[1]); g.stroke();
    }
  }
  // the grid: hairlines on every cell, a clear line every fourth
  g.lineWidth = 1;
  const major = (x + 1) % 4 === 0, majorY = y % 4 === 0;
  g.strokeStyle = 'rgba(50,120,150,0.1)';
  g.beginPath(); g.moveTo(...left); g.lineTo(...top); g.lineTo(...right); g.stroke();
  if (major) { g.strokeStyle = 'rgba(80,190,225,0.5)'; g.beginPath(); g.moveTo(...top); g.lineTo(...right); g.stroke(); }
  if (majorY) { g.strokeStyle = 'rgba(80,190,225,0.5)'; g.beginPath(); g.moveTo(...left); g.lineTo(...top); g.stroke(); }
}
const iso0 = (sx, sy, dx, dy, lv) => [sx + (dx + dy) * HX, sy + (dx - dy) * HY - lv * TIER_H + 0];
function chunkCanvas(S, cx, cy) {
  const key = `${Z}:${cx}:${cy}`;
  const cache = G.chunks || (G.chunks = new Map());
  if (cache.has(key)) { const c = cache.get(key); cache.delete(key); cache.set(key, c); return c; }
  const x0 = cx * CH, y0 = cy * CH;
  const w = Math.ceil(2 * CH * HX + 8), h = Math.ceil(2 * CH * HY + 8 * TIER_H + 90 * Z);
  // the canvas's own origin: cell (x0, y0) sits at (ox, oy) inside it
  const ox = Math.ceil(HX + 4) - (0) , oy = Math.ceil((CH - 1) * HY + HY + 6 * TIER_H + 4);
  const c = canvas(w, h), g = c.getContext('2d');
  // back to front: increasing x - y
  const cells = [];
  for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) cells.push([x, y]);
  cells.sort((a, b) => (a[0] - a[1]) - (b[0] - b[1]));
  for (const [x, y] of cells) {
    const sx = ox + ((x - x0) + (y - y0)) * HX, sy = oy + ((x - x0) - (y - y0)) * HY;
    drawCellTerrain(g, S, x, y, sx, sy);
  }
  const out = { c, ox, oy, x0, y0 };
  cache.set(key, out);
  while (cache.size > (Z < 1 ? 60 : 24)) cache.delete(cache.keys().next().value);
  return out;
}
function visibleCells(S, pad) {
  // invert the projection at the screen corners, ignoring height, then pad for tiers and stands
  const pts = [[0, 0], [LW, 0], [0, LH], [LW, LH]].map(([sx, sy]) => {
    const u = (sx - LW / 2 + G.cam.x) / HX, v = (sy - LH / 2 + G.cam.y) / HY;
    return [(u + v) / 2, (u - v) / 2];
  });
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.floor(Math.min(...xs)) - pad, x1: Math.ceil(Math.max(...xs)) + pad, y0: Math.floor(Math.min(...ys)) - pad, y1: Math.ceil(Math.max(...ys)) + pad + 4 };
}
function drawTerrain(S) {
  const v = visibleCells(S, 3);
  const n = S.A.n;
  const cx0 = Math.floor(Math.max(-STAND, v.x0) / CH) - 1, cx1 = Math.floor(Math.min(n + STAND, v.x1) / CH);
  const cy0 = Math.floor(Math.max(-STAND, v.y0) / CH) - 1, cy1 = Math.floor(Math.min(n + STAND, v.y1) / CH);
  const list = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) list.push([cx, cy]);
  list.sort((a, b) => (a[0] - a[1]) - (b[0] - b[1]));
  for (const [cx, cy] of list) {
    const ch = chunkCanvas(S, cx, cy);
    const [sx, sy] = iso(ch.x0, ch.y0, 0);
    ctx.drawImage(ch.c, Math.round(sx - ch.ox), Math.round(sy - ch.oy));
  }
}
function invalidateTerrain() { if (G.chunks) G.chunks.clear(); G.miniKey = ''; }

// the city beyond, and light towers over the stands
function buildSkyline() {
  const W = 1600, H = 260, c = canvas(W, H), g = c.getContext('2d');
  let x = 0, k = 0;
  while (x < W) {
    const w = 14 + Math.floor(hash(k, 1) * 40), h = 40 + Math.floor(hash(k, 2) * 180);
    g.fillStyle = hash(k, 3) < 0.5 ? '#070a16' : '#0a0e1d';
    g.fillRect(x, H - h, w, h);
    g.fillStyle = 'rgba(90,190,220,0.35)';
    g.fillRect(x, H - h, w, 1);
    for (let wy = H - h + 6; wy < H - 4; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (hash(wx, wy) < 0.06) { g.fillStyle = 'rgba(120,210,235,0.35)'; g.fillRect(wx, wy, 1, 1); }
    x += w + Math.floor(hash(k, 5) * 6); k++;
  }
  G.skyline = c;
}
function drawBackdrop(S) {
  const grd = ctx.createLinearGradient(0, 0, 0, LH);
  grd.addColorStop(0, '#010207'); grd.addColorStop(0.45, '#03141b'); grd.addColorStop(0.7, '#020a10'); grd.addColorStop(1, '#010206');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, LW, LH);
  if (!G.skyline) buildSkyline();
  const off = ((G.cam.x * 0.06) % 1600 + 1600) % 1600;
  const y = Math.round(30 - G.cam.y * 0.03);
  ctx.globalAlpha = 0.45;
  for (let k = -1; k < 2; k++) ctx.drawImage(G.skyline, Math.round(-off + k * 1600), y);
  ctx.globalAlpha = 1;
}
function drawTowers(S) {
  const n = S.A.n;
  for (const [x, y, ph] of [[-STAND + 1, n + STAND - 2, 0], [-STAND + 1, -2, 1.7], [n + 1, n + STAND - 2, 3.1]]) {
    const [sx, sy] = iso(x, y, 0);
    if (sx < -120 || sx > LW + 120 || sy < -300 || sy > LH + 200) continue;
    const top = sy - 150 * Z;
    ctx.fillStyle = '#05080f'; ctx.fillRect(sx - 3 * Z, top, 6 * Z, sy - top);
    rect(sx - 8 * Z, top - 4 * Z, 16 * Z, 6 * Z, [200, 240, 255]);
    // a beam that sweeps the arena
    const a = Math.sin(G.t * 0.35 + ph) * 0.6 + 0.9;
    const [cx, cy] = iso(n / 2 + Math.cos(G.t * 0.3 + ph) * n * 0.3, n / 2 + Math.sin(G.t * 0.27 + ph) * n * 0.3, 0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createLinearGradient(sx, top, cx, cy);
    grd.addColorStop(0, 'rgba(160,220,255,0.12)'); grd.addColorStop(1, 'rgba(160,220,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(cx - 60 * Z * a, cy); ctx.lineTo(cx + 60 * Z * a, cy); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (glowCtx) { glowCtx.fillStyle = 'rgba(200,240,255,0.9)'; glowCtx.fillRect(sx / 2 - 4 * Z, top / 2 - 2, 8 * Z, 3); }
  }
}
// live details on top of the cached terrain: pads, lane chevrons, the collapse warning
function drawLiveTerrain(S) {
  const A = S.A, n = A.n;
  const v = visibleCells(S, 2);
  for (let y = Math.max(0, v.y0); y <= Math.min(n - 1, v.y1); y++) for (let x = Math.max(0, v.x0); x <= Math.min(n - 1, v.x1); x++) {
    const i = y * n + x, h = A.h[i];
    if (h < 0) continue;
    if (A.jump[i] >= 0) {
      const [cx, cy] = iso(x, y, h);
      const d = A.jump[i];
      ctx.strokeStyle = 'rgba(255,205,90,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy - HY * 0.6); ctx.lineTo(cx + HX * 0.6, cy); ctx.lineTo(cx, cy + HY * 0.6); ctx.lineTo(cx - HX * 0.6, cy); ctx.closePath(); ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const u = ((G.t * 2 + k / 3) % 1) - 0.5;
        for (const sgn of [1, -1]) {
          const [px, py] = iso(x + DX[d] * u * sgn, y + DY[d] * u * sgn, h);
          rect(px - 1, py - 1, 2, 2, COL.gold, 0.9 * (0.5 - Math.abs(u)) * 2);
        }
      }
      if (glowCtx) { glowCtx.fillStyle = 'rgba(255,190,50,0.35)'; glowCtx.fillRect(cx / 2 - 3 * Z, cy / 2 - 1.5 * Z, 6 * Z, 3 * Z); }
    } else if (A.mod[i] > 1 && ((x + y + Math.floor(G.t * 8)) % 4 === 0)) {
      const [cx, cy] = iso(x, y, h);
      rect(cx - 2 * Z, cy - 1, 4 * Z, 1, [80, 255, 210], 0.45);
    }
  }
  if (A.warnRing >= 0) {
    const k = A.warnRing, on = Math.sin(G.t * 24) > 0;
    ctx.strokeStyle = on ? 'rgba(255,60,80,0.9)' : 'rgba(255,60,80,0.35)'; ctx.lineWidth = 2;
    const c0 = iso(k - 0.5, k - 0.5, 0), c1 = iso(n - k - 0.5, k - 0.5, 0), c2 = iso(n - k - 0.5, n - k - 0.5, 0), c3 = iso(k - 0.5, n - k - 0.5, 0);
    ctx.beginPath(); ctx.moveTo(...c0); ctx.lineTo(...c1); ctx.lineTo(...c2); ctx.lineTo(...c3); ctx.closePath(); ctx.stroke();
    ctx.lineWidth = 1;
    if (glowCtx) { glowCtx.strokeStyle = 'rgba(255,60,80,0.9)'; glowCtx.beginPath(); glowCtx.moveTo(c0[0] / 2, c0[1] / 2); glowCtx.lineTo(c1[0] / 2, c1[1] / 2); glowCtx.lineTo(c2[0] / 2, c2[1] / 2); glowCtx.lineTo(c3[0] / 2, c3[1] / 2); glowCtx.closePath(); glowCtx.stroke(); }
  }
}
function diamond(cx, cy, s) { ctx.beginPath(); ctx.moveTo(cx, cy - HY * s); ctx.lineTo(cx + HX * s, cy); ctx.lineTo(cx, cy + HY * s); ctx.lineTo(cx - HX * s, cy); ctx.closePath(); ctx.fill(); }
// cells standing in front of a rider and above it get drawn again over the rider
function drawOccluders(S, b) {
  const [px, py] = bikePos(b);
  const lv = bikeLevel(b, S);
  const bx = Math.round(px), by = Math.round(py);
  for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) {
    if (!i && !j) continue;
    const x = bx + i, y = by - j;
    const h = cellHeight(S, x, y);
    if (h < 0 || h <= lv + 0.3) continue;
    if ((x - y) <= (px - py) + 0.5) continue;
    const [sx, sy] = iso(x, y, 0);
    drawCellTerrain(ctx, S, x, y, sx, sy);
  }
}

// ---------------------------------------------------------------- walls, bikes, pickups: depth-sorted
function cellLevel(S, x, y) { const i = y * S.A.n + x; const h = Math.max(0, S.A.h[i]); return S.A.ramp[i] >= 0 ? h + 0.5 : h; }
function collectWalls(S, list) {
  const n = S.A.n;
  const v = visibleCells(S, 2);
  const X0 = Math.max(0, v.x0), X1 = Math.min(n - 1, v.x1), Y0 = Math.max(0, v.y0), Y1 = Math.min(n - 1, v.y1);
  for (let lv = 0; lv < 3; lv++) {
    const own = S.wallOwner[lv], stamp = S.wallStamp[lv];
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const i = y * n + x;
      const o = own[i];
      if (o === -1 || !Sim.wallAlive(S, lv, i)) continue;
      if (o === -2) { list.push({ k: x - y, f: () => pillar(x, y, lv) }); continue; }
      const b = S.bikes[o];
      const key = b ? bikeKey(b) : 'drone';
      const fade = b && !b.alive ? clamp(1 - (S.t - b.deadAt) / 0.6, 0, 1) : 1;
      const s = stamp[i];
      for (let d = 0; d < 4; d++) {
        const px = x + DX[d], py = y + DY[d];
        if (px < 0 || py < 0 || px >= n || py >= n) continue;
        const j = py * n + px;
        let jl = -1;
        for (let q = 0; q < 3; q++) if (S.wallOwner[q][j] === o) { jl = q; break; }
        if (jl < 0) continue;
        const ds = s - S.wallStamp[jl][j];
        if (ds > 0.5 && ds < 1.6 && Sim.wallAlive(S, jl, j)) {
          const la = cellLevel(S, px, py), lb = cellLevel(S, x, y);
          list.push({ k: (x + px) / 2 - (y + py) / 2 - 0.02, f: () => wallSegment(px, py, la, x, y, lb, key, fade) });
        }
      }
    }
  }
  for (const b of S.bikes) {
    if (!b.alive || b.lastWall < 0 || b.rezT > 0 || b.air > 0) continue;
    const lx = b.lastWall % n, ly = (b.lastWall / n) | 0;
    if (!Sim.wallAlive(S, b.lastWallLevel, b.lastWall)) continue;
    const [px, py] = bikePos(b);
    const pts = [[lx, ly, cellLevel(S, lx, ly)]];
    if (!b.laid && (lx !== b.x || ly !== b.y)) pts.push([b.x, b.y, cellLevel(S, b.x, b.y)]);
    pts.push([px, py, bikeLevel(b, S)]);
    const key = bikeKey(b);
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay, la] = pts[k], [bx, by, lb] = pts[k + 1];
      if (Math.abs(ax - bx) + Math.abs(ay - by) < 0.02) continue;
      if (Math.abs(ax - bx) + Math.abs(ay - by) > 1.6) continue;
      list.push({ k: (ax + bx) / 2 - (ay + by) / 2 - 0.02, f: () => wallSegment(ax, ay, la, bx, by, lb, key, 1) });
    }
  }
}
function pillar(x, y, lv) {
  const [cx, cy] = iso(x, y, lv);
  const h = 34 * Z;
  ctx.fillStyle = '#7a1830'; ctx.fillRect(cx - 10 * Z, cy - h, 20 * Z, h);
  ctx.fillStyle = '#b02448'; ctx.fillRect(cx - 10 * Z, cy - h, 20 * Z, Math.round(h * 0.4));
  ctx.fillStyle = 'rgba(255,200,210,0.9)'; ctx.fillRect(cx - 10 * Z, cy - h, 20 * Z, 2);
  if (glowCtx) { glowCtx.fillStyle = 'rgba(255,50,90,0.8)'; glowCtx.fillRect(cx / 2 - 5 * Z, (cy - h) / 2, 10 * Z, h / 2); }
}
function drawBike(S, b) {
  const [px, py] = bikePos(b);
  const lv = bikeLevel(b, S);
  const [sx, sy] = iso(px, py, lv);
  const key = bikeKey(b);
  const target = b.d * 4;
  let a = G.angle[b.id];
  if (a == null) a = target;
  const diff = ((target - a + 24) % 16) - 8;
  a = (a + diff * Math.min(1, G.dt * 16) + 16) % 16;
  if (Math.abs(diff) < 0.05) a = target;
  G.angle[b.id] = a;
  const dir = Math.round(a) % 16;
  const leanI = b.leanT > 0 ? (b.lean < 0 ? 1 : 2) : 0;
  const spin = Math.floor(b.dist * 6) % 3;
  const family = b.kind === 'warden' && b.armour > 0 ? 'warden' : 'rider';
  const col = COL[key];
  // its shadow and light pool on whatever is beneath
  const ground = b.air > 0 ? surfaceAt(S, px, py) : lv;
  if (ground != null) {
    const [gx, gy] = iso(px, py, ground);
    ctx.fillStyle = b.air > 0 ? 'rgba(0,0,0,0.45)' : css(col, 0.08);
    ctx.beginPath(); ctx.ellipse(gx, gy + 2 * Z, 30 * Z, 11 * Z, 0, 0, TAU); ctx.fill();
  }
  // the countdown: the rider sprints in, leaps, and the bike forms under them as they land
  if (S.countdown > 0 && S.countdown <= 3.2) {
    const u = 1 - S.countdown / 3.2;
    const rdir = String((b.d * 2) % 8).padStart(2, '0');
    if (u < 0.86) {
      const run = clamp(u / 0.72, 0, 1);
      const back = 3.2 * (1 - easeOut(run));
      const lift = u > 0.72 ? Math.sin((u - 0.72) / 0.14 * Math.PI) * 0.9 : 0;
      const [rx, ry] = iso(px - DX[b.d] * back, py - DY[b.d] * back, lv + lift);
      const frame = u > 0.72 ? (u > 0.8 ? 7 : 6) : Math.floor(G.t * 12 + b.id) % 6;
      if (lift > 0) { const [gx, gy] = iso(px - DX[b.d] * back, py - DY[b.d] * back, lv); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(gx, gy, 10 * Z, 4 * Z, 0, 0, TAU); ctx.fill(); }
      sprite(`runner_${rdir}_${frame}${SFX}`, key, rx, ry, 1, 0.6);
      return;
    }
    b.rezShow = (u - 0.86) / 0.14;
  } else b.rezShow = null;
  const rez = b.rezShow != null ? b.rezShow : b.rezT > 0 ? 1 - b.rezT / 0.6 : 1;
  const name = `${family}_${String(dir).padStart(2, '0')}_${leanI}_${spin}${SFX}`;
  if (rez < 1) {
    const s = G.M.sprites[`${family}_${String(dir).padStart(2, '0')}_0_0${SFX}`];
    if (s) {
      const [sxa, sya, w, h, ox, oy] = s;
      const shown = Math.round(h * rez);
      ctx.drawImage(atlasFor(key), sxa, sya + h - shown, w, shown, Math.round(sx - ox), Math.round(sy - oy + h - shown), w, shown);
      rect(sx - ox - 4, sy - oy + h - shown, w + 8, 1, COL.white, 0.9);
    }
    return;
  }
  const flick = b.kind === 'glitch' && Math.sin(G.t * 40 + b.id) > 0.85;
  if (!(b.air > 0)) {
    const s2 = G.M.sprites[name];
    if (s2) {
      const [sxa, sya, w, h, ox, oy] = s2;
      ctx.save(); ctx.globalAlpha = 0.22; ctx.translate(Math.round(sx - ox), Math.round(sy + oy)); ctx.scale(1, -1);
      ctx.drawImage(atlasFor(key), sxa, sya, w, h, 0, 0, w, h); ctx.restore();
    }
  }
  sprite(name, key, sx, sy, b.phase > 0 || flick ? 0.55 : 1, 0.45);
  if (b.shield > 0) {
    const r = (26 + Math.sin(G.t * 10) * 1.5) * Z;
    ctx.strokeStyle = css(COL.shield, 0.55); ctx.beginPath(); ctx.ellipse(sx, sy - 12 * Z, r, r * 0.62, 0, 0, TAU); ctx.stroke();
  }
  if (b.sealed && b.kind !== 'player') {
    const u = (G.t * 3) % 1;
    ctx.strokeStyle = css(COL.gold, 0.8 * (1 - u)); ctx.beginPath(); ctx.ellipse(sx, sy, (14 + u * 30) * Z, (14 + u * 30) / 2 * Z, 0, 0, TAU); ctx.stroke();
  }
  if (b.grindSide && b.speed > 1) {
    const side = b.grindSide < 0 ? (b.d + 3) % 4 : (b.d + 1) % 4;
    const [gx, gy] = iso(px + DX[side] * 0.45, py + DY[side] * 0.45, lv);
    for (let k = 0; k < 2; k++) spark(gx + G.cam.x, gy - 4 * Z + G.cam.y, key);
  }
}
function drawCell(S, c) {
  const lv = c.level || 0;
  const [sx, sy] = iso(c.x, c.y, lv);
  const f = Math.floor(G.t * 10 + c.x) % 8;
  const bob = Math.sin(G.t * 3 + c.x) * 2 * Z;
  ctx.fillStyle = css(COL[c.kind], 0.2); ctx.beginPath(); ctx.ellipse(sx, sy, 12 * Z, 5 * Z, 0, 0, TAU); ctx.fill();
  sprite(`cell_${String(f).padStart(2, '0')}${SFX}`, c.kind, sx, sy + bob);
  text(c.kind[0].toUpperCase(), sx - 4, sy - 34 * Z + bob, COL[c.kind], Z < 1 ? 1 : 2);
}
function drawPylon(S, py) {
  if (!py.alive) return;
  const [sx, sy] = iso(py.x, py.y, 0);
  sprite('pylon' + SFX, 'boss', sx, sy);
  const B = S.boss;
  if (B && !B.down) {
    const [bx, by] = iso(B.x, B.y, 0);
    const top = [sx, sy - 70 * Z], end = [bx, by - 88 * Z];
    ctx.strokeStyle = `rgba(255,70,110,${0.35 + 0.2 * Math.sin(G.t * 9 + py.x)})`; ctx.beginPath(); ctx.moveTo(...top); ctx.lineTo(...end); ctx.stroke();
    if (glowCtx) { glowCtx.strokeStyle = 'rgba(255,60,100,0.6)'; glowCtx.beginPath(); glowCtx.moveTo(top[0] / 2, top[1] / 2); glowCtx.lineTo(end[0] / 2, end[1] / 2); glowCtx.stroke(); }
  }
}
function drawBoss(S) {
  const B = S.boss; if (!B) return;
  const [sx, sy] = iso(B.x, B.y, 0);
  if (B.down) {
    const u = clamp((S.t - B.downAt) / 1.4, 0, 1);
    if (u >= 1) return;
    sprite(`boss_1_${String(Math.floor(G.t * 20) % 12).padStart(2, '0')}${SFX}`, 'boss', sx + Math.sin(G.t * 60) * 3 * u, sy + u * 50 * Z, 1 - u);
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(sx, sy, 90 * Z, 38 * Z, 0, 0, TAU); ctx.fill();
  const charged = B.attacks.some(a => !a.fired) ? 1 : 0;
  const f = Math.floor(G.t * 6) % 12;
  sprite(`boss_${charged}_${String(f).padStart(2, '0')}${SFX}`, 'boss', sx, sy + Math.sin(G.t * 1.6) * 4 * Z);
}
function drawAttacks(S) {
  const B = S.boss; if (!B) return;
  const n = S.A.n;
  for (const a of B.attacks) {
    if (a.kind === 'sweep') {
      const live = a.fired;
      const warnA = live ? 0.9 : 0.25 + 0.3 * (Math.sin(G.t * 26) > 0 ? 1 : 0);
      for (let k = 1; k < n - 1; k++) {
        const x = a.horiz ? k : a.line, y = a.horiz ? a.line : k;
        const [cx, cy] = iso(x, y, cellLevel(S, x, y));
        ctx.fillStyle = live ? `rgba(255,230,240,${warnA})` : `rgba(255,50,90,${warnA})`;
        diamond(cx, cy, live ? 0.7 : 0.9);
      }
    } else if (a.kind === 'drop' && !a.fired) {
      const u = clamp(a.t / a.warn, 0, 1);
      for (const i of a.cells) {
        const x = i % n, y = (i / n) | 0;
        const [cx, cy] = iso(x, y, cellLevel(S, x, y));
        ctx.fillStyle = `rgba(0,0,0,${0.3 + 0.4 * u})`; ctx.beginPath(); ctx.ellipse(cx, cy, (6 + 14 * u) * Z, (6 + 14 * u) / 2 * Z, 0, 0, TAU); ctx.fill();
      }
    }
  }
}

// ---------------------------------------------------------------- the minimap
function drawMinimap(S) {
  const A = S.A, n = A.n, size = 72;
  const X = LW - size - 6, Y = 34;
  const key = S.run.seed + ':' + S.sector + ':' + A.ring;
  if (G.miniKey !== key) {
    const c = G.miniBase || (G.miniBase = canvas(size, size)), g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      // rotate so the minimap matches the screen: +x runs right-down, +y right-up
      const u = px / size, w = py / size;
      const x = Math.floor((u + w) / 2 * n * 1.0), y = Math.floor((u - w + 1) / 2 * n);
      const o = (py * size + px) * 4;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const h = A.h[y * n + x];
      if (h < 0) continue;
      const t = TIER_EDGE[Math.min(2, h)];
      img.data[o] = 10 + t[0] * 0.12 * (h + 1); img.data[o + 1] = 14 + t[1] * 0.12 * (h + 1); img.data[o + 2] = 30 + t[2] * 0.12 * (h + 1); img.data[o + 3] = 220;
    }
    g.putImageData(img, 0, 0);
    G.miniKey = key;
  }
  rect(X - 2, Y - 2, size + 4, size + 4, COL.ink, 0.8);
  ctx.drawImage(G.miniBase, X, Y);
  const toMini = (x, y) => [X + ((x + 0.5) / n + (y + 0.5) / n - 1) * size * 0.5 + size / 2, Y + ((x + 0.5) / n - (y + 0.5) / n) * size * 0.5 + size / 2];
  // walls every other frame's worth: sample by cell
  const step = n > 72 ? 2 : 1;
  for (let lv = 0; lv < 3; lv++) {
    const own = S.wallOwner[lv];
    for (let i = 0; i < own.length; i += step) {
      const o = own[i]; if (o < 0) continue;
      const b = S.bikes[o]; if (!b) continue;
      const x = i % n, y = (i / n) | 0;
      if (!Sim.wallAlive(S, lv, i)) continue;
      const [mx, my] = toMini(x, y);
      ctx.fillStyle = css(COL[bikeKey(b)], 0.75); ctx.fillRect(Math.round(mx), Math.round(my), 1, 1);
    }
  }
  for (const b of S.bikes) {
    if (!b.alive) continue;
    const [mx, my] = toMini(...bikePos(b));
    const me = b.kind === 'player';
    rect(mx - (me ? 2 : 1), my - (me ? 2 : 1), me ? 4 : 3, me ? 4 : 3, me ? (Math.sin(G.t * 10) > 0 ? COL.white : COL.player) : COL[bikeKey(b)]);
  }
  if (S.boss && !S.boss.down) { const [mx, my] = toMini(S.boss.x, S.boss.y); rect(mx - 3, my - 3, 6, 6, COL.boss, 0.8); }
}

// ---------------------------------------------------------------- particles and effects
function spark(x, y, key) {
  if (G.particles.length > 600) return;
  const a = Math.random() * TAU, v = 30 + Math.random() * 70;
  G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 30, g: 180, life: 0.25 + Math.random() * 0.25, t: 0, col: COL[key] || COL.white, size: 1 });
}
function burst(x, y, key, count, speed) {
  for (let k = 0; k < count; k++) {
    const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
    G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - speed * 0.5, g: 220, life: 0.5 + Math.random() * 0.6, t: 0, col: COL[key] || COL.white, size: Math.random() < 0.3 ? 2 : 1 });
  }
}
function ring(x, y, key, r, life) { G.rings.push({ x, y, col: COL[key] || COL.white, r, life, t: 0 }); }
function drawParticles(dt) {
  for (const p of G.particles) {
    p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const a = 1 - p.t / p.life;
    if (a <= 0) continue;
    rect(p.x - G.cam.x, p.y - G.cam.y, p.size, p.size, p.col, a);
    if (glowCtx) { glowCtx.fillStyle = css(p.col, a); glowCtx.fillRect((p.x - G.cam.x) / 2, (p.y - G.cam.y) / 2, 1, 1); }
  }
  G.particles = G.particles.filter(p => p.t < p.life);
  for (const r of G.rings) {
    r.t += dt;
    const u = r.t / r.life; if (u >= 1) continue;
    const rr = r.r * easeOut(u);
    ctx.strokeStyle = css(r.col, 1 - u); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(r.x - G.cam.x, r.y - G.cam.y, rr, rr / 2, 0, 0, TAU); ctx.stroke(); ctx.lineWidth = 1;
    if (glowCtx) { glowCtx.strokeStyle = css(r.col, 1 - u); glowCtx.beginPath(); glowCtx.ellipse((r.x - G.cam.x) / 2, (r.y - G.cam.y) / 2, rr / 2, rr / 4, 0, 0, TAU); glowCtx.stroke(); }
  }
  G.rings = G.rings.filter(r => r.t < r.life);
}
// derez shards play from the pre-rendered shatter
const derezzes = [];
function drawDerezzes(S) {
  for (const z of derezzes) {
    const u = (G.t - z.t0) / 0.75;
    if (u >= 1) continue;
    const f = Math.min(11, Math.floor(u * 12));
    const [sx, sy] = iso(z.x, z.y, z.level);
    if (f < 2) { ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - u * 4)})`; ctx.beginPath(); ctx.ellipse(sx, sy - 10, 40, 20, 0, 0, TAU); ctx.fill(); }
    sprite(`derez_${String(z.dir).padStart(2, '0')}_${String(f).padStart(2, '0')}${SFX}`, z.key, sx, sy);
  }
  for (let i = derezzes.length - 1; i >= 0; i--) if (G.t - derezzes[i].t0 > 0.8) derezzes.splice(i, 1);
}

// ---------------------------------------------------------------- bloom
function setupGlow() {
  if (!glow) { glow = canvas(LW / 2, LH / 2); glowCtx = glow.getContext('2d'); bloom2 = canvas(LW / 4, LH / 4); bloom3 = canvas(LW / 8, LH / 8); }
  glowCtx.setTransform(1, 0, 0, 1, 0, 0);
  glowCtx.clearRect(0, 0, glow.width, glow.height);
  glowCtx.imageSmoothingEnabled = false;
}
function applyBloom(strength) {
  const g2 = bloom2.getContext('2d'), g3 = bloom3.getContext('2d');
  g2.imageSmoothingEnabled = true; g3.imageSmoothingEnabled = true;
  g2.clearRect(0, 0, bloom2.width, bloom2.height); g2.drawImage(glow, 0, 0, bloom2.width, bloom2.height);
  g3.clearRect(0, 0, bloom3.width, bloom3.height); g3.drawImage(bloom2, 0, 0, bloom3.width, bloom3.height);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.16 * strength; ctx.drawImage(glow, 0, 0, LW, LH);
  ctx.globalAlpha = 0.21 * strength; ctx.drawImage(bloom2, 0, 0, LW, LH);
  ctx.globalAlpha = 0.25 * strength; ctx.drawImage(bloom3, 0, 0, LW, LH);
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
}

// ---------------------------------------------------------------- the scene
// The camera follows in cells (so a zoom change keeps its place) and pulls back with speed.
function updateCamera(S, dt, lead) {
  const P = Sim.player(S);
  let tx, ty, tl;
  if (G.camTarget) [tx, ty, tl] = G.camTarget;
  else {
    const [px, py] = P.alive ? bikePos(P) : [G.lastPX || S.A.n / 2, G.lastPY || S.A.n / 2];
    if (P.alive) { G.lastPX = px; G.lastPY = py; G.lastPL = bikeLevel(P, S); }
    const la = (lead == null ? 1.6 : lead) / Z;
    tx = px + DX[P.d] * la; ty = py + DY[P.d] * la; tl = G.lastPL || 0;
  }
  const c = G.cam;
  if (c.cx == null) { c.cx = tx; c.cy = ty; c.cl = tl || 0; }
  c.cx = lerp(c.cx, tx, Math.min(1, dt * 4)); c.cy = lerp(c.cy, ty, Math.min(1, dt * 4)); c.cl = lerp(c.cl, tl || 0, Math.min(1, dt * 3));
  c.shake = Math.max(0, c.shake - dt * 18);
  const nx = Math.round((c.cx + c.cy) * HX + (Math.random() - 0.5) * c.shake);
  const ny = Math.round((c.cx - c.cy) * HY - c.cl * TIER_H - 16 * Z + (Math.random() - 0.5) * c.shake);
  c.dx = nx - c.x; c.dy = ny - c.y;
  c.x = nx; c.y = ny;
}
// near when slow, far when fast; a short lens pull between them
function updateZoom(S, dt, force) {
  const P = Sim.player(S);
  const fast = force != null ? force : (S.A.boss || (P.alive && P.speed > 6.2));
  G.zoomHold = (G.zoomHold || 0) + dt;
  const want = fast ? 0.5 : 1;
  if (want !== Z && (force != null || G.zoomHold > (want < 1 ? 0.5 : 1.4))) {
    // keep the old frame for the lens pull
    G.lens = { img: G.lensCanvas || (G.lensCanvas = canvas(LW, LH)), t0: G.t, from: Z, to: want };
    const lg = G.lens.img.getContext('2d');
    lg.clearRect(0, 0, LW, LH);
    if (G.worldSnap) lg.drawImage(G.worldSnap, 0, 0); else G.lens = null;
    setZoom(want);
    G.zoomHold = 0;
  } else if (want === Z) G.zoomHold = 0;
}
function drawLens() {
  const L = G.lens; if (!L) return;
  const u = (G.t - L.t0) / 0.3;
  if (u >= 1) { G.lens = null; return; }
  const k = lerp(1, L.to / L.from, easeOut(u));
  ctx.save(); ctx.globalAlpha = 1 - u; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(L.img, LW / 2 - LW * k / 2, LH / 2 - LH * k / 2, LW * k, LH * k);
  ctx.restore(); ctx.imageSmoothingEnabled = false;
}
function drawScene(S, dt, opts) {
  opts = opts || {};
  setupGlow();
  drawBackdrop(S);
  drawTowers(S);
  const sceneKey = `${S.run.seed}_${S.sector}`;
  if (G.floorKey !== sceneKey) { invalidateTerrain(); G.floorKey = sceneKey; }
  if (G.ringKey !== S.A.ring) { invalidateTerrain(); G.ringKey = S.A.ring; }
  drawTerrain(S);
  drawLiveTerrain(S);
  drawAttacks(S);
  const list = [];
  collectWalls(S, list);
  for (const b of S.bikes) if (b.alive) { const [px, py] = bikePos(b); list.push({ k: px - py + 0.05, f: () => { drawBike(S, b); drawOccluders(S, b); } }); }
  for (const c of S.cells) list.push({ k: c.x - c.y + 0.03, f: () => drawCell(S, c) });
  for (const py of S.A.pylons) list.push({ k: py.x - py.y + 0.04, f: () => drawPylon(S, py) });
  list.sort((a, b) => a.k - b.k);
  for (const it of list) it.f();
  drawDerezzes(S);
  drawBoss(S);
  drawParticles(dt);
  applyBloom(opts.bloom == null ? 1 : opts.bloom);
  // keep this frame's world, without the HUD, for a lens pull when the camera changes zoom
  const snap = G.worldSnap || (G.worldSnap = canvas(LW, LH));
  const sg = snap.getContext('2d'); sg.imageSmoothingEnabled = true;
  try { sg.clearRect(0, 0, LW, LH); sg.drawImage(ctx.canvas, 0, 0, LW, LH); } catch (e) {}
  drawLens();
}

// ---------------------------------------------------------------- HUD and typing
function keycap(x, y, label, active, col, part) {
  const w = Math.max(22, textW(label, 2) + 10), h = 22;
  x = Math.round(x - w / 2); y = Math.round(y - h / 2);
  rect(x, y + 3, w, h, [0, 0, 0], 0.55);
  rect(x, y, w, h, active ? col : [16, 24, 42]);
  rect(x, y, w, 1, col, 0.9); rect(x, y, 1, h, col, 0.5); rect(x + w - 1, y, 1, h, col, 0.5);
  rect(x + 1, y + h - 3, w - 2, 3, [0, 0, 0], 0.4);
  let pen = x + 5;
  for (let i = 0; i < label.length; i++) pen = text(label[i].toUpperCase(), pen, y + 1, i < part ? COL.dim : active ? COL.ink : COL.white, 2);
  if (glowCtx) { glowCtx.fillStyle = css(col, 0.35); glowCtx.fillRect(x / 2, y / 2, w / 2, h / 2); }
}
function drawTyping(S) {
  const P = Sim.player(S), ty = S.typing;
  if (!P.alive || S.cleared) return;
  if (S.countdown > 0 && S.countdown > 3.2 * 0.14) return;   // the rider is still running in
  const [px, py] = bikePos(P);
  const [sx, sy] = iso(px, py, bikeLevel(P, S));
  // steer keys sit to the bike's left and right, in the direction a turn would go
  const L = (P.d + 3) % 4, R = (P.d + 1) % 4;
  const [lx, ly] = iso(px + DX[L] * 1.5, py + DY[L] * 1.5, bikeLevel(P, S));
  const [rx, ry] = iso(px + DX[R] * 1.5, py + DY[R] * 1.5, bikeLevel(P, S));
  const pendL = P.queue[0] === 'L', pendR = P.queue[0] === 'R';
  keycap(lx, ly - 22, ty.L, pendL, COL.player, ty.lT);
  keycap(rx, ry - 22, ty.R, pendR, COL.player, ty.rT);
  chevron(lx, ly - 6, L); chevron(rx, ry - 6, R);
  // the word rides above the bike
  const w = ty.word, total = textW(w, 2) + 14;
  const wx = Math.round(clamp(sx - total / 2, 4, LW - total - 4)), wy = Math.round(clamp(sy - 82, 24, LH - 60));
  const gold = ty.ability;
  panel(wx, wy, total, 27, 0.92, gold ? COL.gold : COL.player);
  let pen = wx + 7;
  const shake = G.t - (G.typoT || -9) < 0.15 ? Math.round(Math.sin(G.t * 90) * 2) : 0;
  for (let i = 0; i < w.length; i++) {
    const c = i < ty.typed ? (gold ? COL.gold : COL.player) : i === ty.typed ? COL.white : COL.dim;
    if (i === ty.typed) rect(pen, wy + 23, textW(w[i], 2) - 2, 2, G.t - (G.typoT || -9) < 0.25 ? COL.red : COL.white);
    pen = text(w[i], pen + (i === ty.typed ? shake : 0), wy + 1, c, 2) - (i === ty.typed ? shake : 0);
  }
}
function chevron(x, y, d) {
  // a small arrow along the turn direction on screen
  const sdx = (DX[d] + DY[d]) * HX, sdy = (DX[d] - DY[d]) * HY;
  const l = Math.hypot(sdx, sdy), ux = sdx / l, uy = sdy / l;
  ctx.strokeStyle = css(COL.player, 0.8);
  ctx.beginPath(); ctx.moveTo(x - ux * 4 - uy * 3, y - uy * 4 + ux * 3); ctx.lineTo(x + ux * 3, y + uy * 3); ctx.lineTo(x - ux * 4 + uy * 3, y - uy * 4 - ux * 3); ctx.stroke();
}
function drawHud(S) {
  const run = S.run, P = Sim.player(S);
  rect(0, 0, LW, 28, COL.ink, 0.8);
  rect(0, 28, LW, 2, COL.player, 0.6);
  text('SECTOR ' + String(S.sector).padStart(2, '0'), 6, 1, S.A.boss ? COL.boss : COL.white, 2);
  textC(String(run.score).padStart(7, '0'), LW / 2, 1, COL.white, 2);
  for (let i = 0; i < Math.max(run.cores, 3); i++) {
    const x = LW - 12 - i * 18, on = i < run.cores;
    ctx.fillStyle = css(on ? COL.player : COL.dim, on ? 1 : 0.45);
    ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = TAU * k / 6 + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * 7, 14 + Math.sin(a) * 7); } ctx.fill();
  }
  if (S.streak > 1) textR('x' + S.streak, LW - 70, 1, S.streak >= 10 ? COL.gold : COL.white, 2);
  rect(0, LH - 30, LW, 30, COL.ink, 0.8);
  rect(0, LH - 32, LW, 2, COL.player, 0.6);
  // energy: twenty bold cells
  for (let i = 0; i < 20; i++) {
    const on = S.energy >= (i + 1) * 5;
    rect(8 + i * 8, LH - 22, 6, 14, on ? (S.energy >= 100 ? COL.gold : COL.player) : [40, 55, 80]);
  }
  rect(176, LH - 22, 50, 14, [40, 55, 80]); rect(176, LH - 22, 50 * clamp(S.brakeLeft / Sim.T.brakeReserve, 0, 1), 14, COL.text);
  if (S.carried.length) text(S.carried[0].toUpperCase(), 236, LH - 28, COL[S.carried[0]], 2);
  textR(P.speed.toFixed(1), LW - 8, LH - 28, P.speed > 7 ? COL.gold : COL.white, 2);
  if (S.playerSealed && P.alive) glowText('SEALED IN', LW / 2, 40, COL.red, 2, 0.6 + 0.4 * Math.sin(G.t * 10));
  else if (P.holding) glowText('BUFFER', LW / 2, 40, COL.gold, 2, 0.9);
}
function drawToasts() {
  for (const t of G.toasts) {
    const u = (G.t - t.t0) / t.dur;
    if (u < 0 || u > 1) continue;
    const a = clamp(u / 0.12, 0, 1) * clamp((1 - u) / 0.25, 0, 1);
    glowText(t.big, LW / 2, t.y || 110, t.col || COL.white, t.scale || 3, a);
    if (t.sub) textC(t.sub, LW / 2, (t.y || 110) + 14 * (t.scale || 3) + 4, COL.white, 2, a);
  }
  G.toasts = G.toasts.filter(t => G.t - t.t0 < t.dur);
}
function toast(big, opts) { G.toasts.push(Object.assign({ big, t0: G.t, dur: 1.4 }, opts || {})); }

// ---------------------------------------------------------------- events: sound, particles, words on screen
function handleEvents(S) {
  const P = Sim.player(S);
  for (const e of Sim.takeEvents(S)) {
    switch (e.type) {
      case 'count': SND('count'); toast(String(e.n), { dur: 0.9, scale: 4, y: 250, col: COL.player }); break;
      case 'go': SND('go'); toast('GO', { dur: 0.7, scale: 5, y: 120, col: COL.white }); if (S.A.boss) MUS.play('boss', { now: true, fade: 0.2 }); else MUS.play(S.sector % 2 ? 'sector' : 'sector2', { now: true, fade: 0.2 }); break;
      case 'turn': if (e.bike === 0) SND('turn', { vol: 0.5 }); break;
      case 'word': {
        SND('word_pulse', { vol: 0.35 });
        const [x, y] = iso(...bikePos(P), bikeLevel(P, S));
        ring(x + G.cam.x, y + G.cam.y, e.ability ? 'gold' : 'player', 26, 0.35);
        break;
      }
      case 'streak': Audio.sting('streak'); toast('STREAK ' + e.streak, { dur: 1.0, scale: 2, y: 64, col: COL.gold }); break;
      case 'typo': {
        G.typoT = G.t;
        if (e.free) { toast('CLEAN CODE', { dur: 0.8, scale: 1, y: 60, col: COL.player }); break; }
        SND('wall_cut', { delay: AFTER_KEY, vol: 0.5 }); SND('sputter', { delay: AFTER_KEY + 0.05, vol: 0.35 });
        const [x, y] = iso(...bikePos(P), bikeLevel(P, S));
        for (let k = 0; k < 10; k++) spark(x + G.cam.x, y + G.cam.y - 6, 'red');
        break;
      }
      case 'derez': {
        const b = S.bikes[e.bike];
        const key = bikeKey(b);
        const [px, py] = bikePos(b);
        derezzes.push({ x: px, y: py, level: e.level, dir: (b.d * 2) % 8, key, t0: G.t });
        const [sx, sy] = iso(px, py, e.level);
        burst(sx + G.cam.x, sy + G.cam.y - 10, key, 40, 90);
        ring(sx + G.cam.x, sy + G.cam.y, key, 60, 0.5);
        SND('derez', { vol: b.kind === 'player' ? 0.9 : 0.6 });
        if (b.kind === 'player') { Audio.sting('core_lost'); G.cam.shake = 10; G.slow = 0.5; G.flash = 0.5; toast('SHATTERED', { dur: 1.4, scale: 3, y: 100, col: COL.red, sub: S.run.cores > 0 ? S.run.cores + ' CORES LEFT' : '' }); }
        else { Audio.sting('derez_rival'); G.cam.shake = Math.max(G.cam.shake, 4); }
        break;
      }
      case 'seal': Audio.sting('seal'); SND('seal_close'); toast('SEALED', { dur: 1.1, scale: 2, y: 70, col: COL.gold, sub: '+' + 250 * S.sector }); break;
      case 'armour': SND('shield_break'); toast('ARMOUR CRACKED', { dur: 1, scale: 1, y: 70, col: COL.warden }); break;
      case 'trapped': SND('boss_sweep_warn', { vol: 0.4 }); break;
      case 'hold': if (e.bike === 0) G.cam.shake = Math.max(G.cam.shake, 2); break;
      case 'pickup': SND('pickup'); toast(e.kind.toUpperCase(), { dur: 0.9, scale: 1, y: 70, col: COL[e.kind], sub: 'ENTER TO USE' }); break;
      case 'power': SND(e.kind === 'shield' ? 'shield_break' : e.kind, { vol: 0.8 }); SND('cell_fire', { vol: 0.5 }); break;
      case 'shield_break': { SND('shield_break'); const [x, y] = iso(e.x, e.y, 0); burst(x + G.cam.x, y + G.cam.y - 10, 'shield', 20, 60); break; }
      case 'lance': {
        const [x0, y0] = iso(e.x0, e.y0, 0), [x1, y1] = iso(e.x1, e.y1, 0);
        G.lances = (G.lances || []).concat([{ x0: x0 + G.cam.x, y0: y0 + G.cam.y, x1: x1 + G.cam.x, y1: y1 + G.cam.y, t0: G.t }]);
        G.cam.shake = 5;
        break;
      }
      case 'pulse': { SND('pulse_ring'); const [x, y] = iso(e.x, e.y, 0); ring(x + G.cam.x, y + G.cam.y, 'gold', 150, 0.6); G.flash = 0.25; toast('PULSE', { dur: 0.8, scale: 2, y: 70, col: COL.gold }); break; }
      case 'surge': toast('SURGE', { dur: 0.8, scale: 2, y: 70, col: COL.surge }); break;
      case 'portal': if (e.bike === 0) SND('portal'); break;
      case 'fault_warn': if (Math.random() < 0.3) SND('fault_warn', { vol: 0.3 }); break;
      case 'fault_fall': if (Math.random() < 0.3) SND('fault_fall', { vol: 0.3 }); break;
      case 'gate_move': SND('gate_move', { vol: 0.35 }); break;
      case 'boss_sweep_warn': SND('boss_sweep_warn'); break;
      case 'boss_sweep': SND('boss_sweep'); G.cam.shake = 6; break;
      case 'boss_drop_warn': SND('boss_drop_warn'); break;
      case 'boss_drop': SND('boss_drop'); G.cam.shake = 8; break;
      case 'boss_brood': toast('BROOD', { dur: 0.8, scale: 1, y: 70, col: COL.boss }); break;
      case 'anchor_break': { SND('anchor_break'); const [x, y] = iso(e.x, e.y, 0); burst(x + G.cam.x, y + G.cam.y - 40, 'boss', 50, 120); G.cam.shake = 10; toast('ANCHOR DOWN', { dur: 1.2, scale: 2, y: 70, col: COL.boss, sub: e.left + ' LEFT' }); break; }
      case 'boss_down': { S.boss.downAt = S.t; Audio.sting('boss_down'); G.cam.shake = 16; G.flash = 0.8; toast('OVERSEER DOWN', { dur: 2, scale: 3, y: 90, col: COL.white }); break; }
      case 'exit_open': toast('SECTOR CLEAR', { dur: 2.0, scale: 3, y: 90, col: COL.player }); break;
      case 'sector_clear': Audio.sting('sector_clear'); break;
      case 'core_restored': toast('CORE RESTORED', { dur: 1.4, scale: 1, y: 140, col: COL.player }); break;
      case 'rez': SND('rez_in'); break;
      case 'gameover': Audio.sting('gameover'); break;
      case 'collapse_warn': if (e.ring <= 1) toast('THE ARENA IS CLOSING', { dur: 2, scale: 2, y: 64, col: COL.red }); SND('fault_warn', { vol: 0.35 }); break;
      case 'collapse': SND('fault_fall', { vol: 0.5 }); G.cam.shake = Math.max(G.cam.shake, 3); break;
      case 'jump': if (e.bike === 0) SND('portal', { vol: 0.6 }); break;
      case 'land': if (e.bike === 0) { SND('gate_move', { vol: 0.4 }); G.cam.shake = Math.max(G.cam.shake, 4); } break;
    }
  }
}
function drawLances() {
  for (const l of G.lances || []) {
    const u = (G.t - l.t0) / 0.35; if (u > 1) continue;
    ctx.strokeStyle = css(COL.lance, 1 - u); ctx.lineWidth = 3 - u * 2;
    ctx.beginPath(); ctx.moveTo(l.x0 - G.cam.x, l.y0 - G.cam.y - 10); ctx.lineTo(l.x1 - G.cam.x, l.y1 - G.cam.y - 10); ctx.stroke(); ctx.lineWidth = 1;
  }
  if (G.lances) G.lances = G.lances.filter(l => G.t - l.t0 < 0.35);
}

// ---------------------------------------------------------------- audio beds
function updateAudio(S, dt) {
  const P = Sim.player(S);
  if (!Audio.ready) return;
  const cap = 10;
  const v = P.alive ? P.speed : 0;
  MUS.setIntensity(S.countdown > 0 ? 0 : v < 4 ? 1 : v < 6 ? 2 : 3);
  MUS.setTag('danger', !!(S.playerSealed || P.holding || S.run.cores === 1));
  MUS.setTag('boost', S.pulseV > 0.6 || S.streak >= 10);
  // the engine: three hums crossfaded by speed
  const playing = G.mode === 'play' && P.alive && S.countdown <= 0 && !S.cleared;
  const u = clamp((v - 2) / 7, 0, 1);
  const want = { engine_low: playing ? 0.28 * (1 - u) : 0, engine_mid: playing ? 0.24 * (1 - Math.abs(u - 0.5) * 2) : 0, engine_high: playing ? 0.22 * u : 0,
    grind_loop: playing && P.grindSide ? 0.3 : 0, brake_loop: playing && S.braking && S.brakeLeft > 0 ? 0.25 : 0 };
  for (const [n, vol] of Object.entries(want)) {
    const h = G.loops[n];
    if (vol > 0.001 && !h) G.loops[n] = Audio.loop(n, { vol, fade: 0.4 });
    else if (h && vol <= 0.001) { h.stop(0.4); G.loops[n] = null; }
    else if (h) h.set(vol, 0.15);
  }
}
function stopLoops() { for (const n of Object.keys(G.loops)) if (G.loops[n]) { G.loops[n].stop(0.3); G.loops[n] = null; } }

// ---------------------------------------------------------------- flow
function setMode(m) { G.mode = m; G.modeT = G.t; G.sel = 0; }
function newRun() {
  G.run = Sim.createRun({});
  startSector();
}
function startSector() {
  G.S = Sim.startSector(G.run);
  G.angle = {}; G.particles = []; G.rings = []; derezzes.length = 0; G.cam.cx = null; G.camTarget = null; G.floorKey = ''; setZoom(1); G.lens = null;
  setMode('play');
  MUS.play('boot', { now: true, fade: 0.3 });
  toast(G.S.A.boss ? 'OVERSEER' : 'SECTOR ' + String(G.S.sector).padStart(2, '0'), { dur: 2.6, scale: 3, y: 44, col: G.S.A.boss ? COL.boss : COL.player, sub: sectorHint(G.S) });
}
function sectorHint(S) {
  const s = S.sector;
  if (S.A.boss) return 'circle an anchor pylon with your wall to break it';
  const kinds = [...new Set(S.bikes.filter(b => b.kind !== 'player').map(b => b.kind))];
  const fresh = { 2: 'hunters cut across your path', 3: 'green strips speed you up', 4: 'sealers hunt in pairs', 6: 'ramps climb onto decks', 8: 'portals keep your heading', 10: 'red tiles fall away', 12: 'gates swap lanes' }[s];
  return fresh || (kinds.length ? kinds.join(' / ') : '');
}
function toCompile() {
  G.choices = Sim.upgradeChoices(G.run);
  G.typedChoice = '';
  setMode('compile');
  stopLoops();
  MUS.play('compile', { now: true, fade: 0.6 });
}
function exitGame() {
  if (typeof window === 'undefined') return;
  if (window.TYPEMAXX) window.TYPEMAXX.pixel = null;
  if (typeof window.TYPEMAXX_SETGAME === 'function') window.TYPEMAXX_SETGAME(null);
}

const MENU = ['START', 'HOW TO PLAY', 'BACK'];
function menuNav(k, n, pick, back) {
  const keys = k.keys || [];
  if (keys.includes('ArrowDown')) { G.sel = (G.sel + 1) % n; SND('ui_move'); }
  if (keys.includes('ArrowUp')) { G.sel = (G.sel + n - 1) % n; SND('ui_move'); }
  if (k.enter) { SND('ui_select'); pick(G.sel); }
  else if (keys.includes('Escape') && back) { SND('ui_back'); back(); }
}
function handleInput(k) {
  const keys = k.keys || [];
  const esc = keys.includes('Escape');
  switch (G.mode) {
    case 'title': return menuNav(k, MENU.length, i => { if (i === 0) newRun(); else if (i === 1) setMode('howto'); else exitGame(); }, exitGame);
    case 'howto': if (k.enter || esc) { SND('ui_back'); setMode('title'); } return;
    case 'play': {
      const S = G.S;
      if (esc) { setMode('pause'); Audio.pause(true); stopLoops(); return; }
      for (const ch of k.chars || []) Sim.key(S, ch);
      if (k.enter) Sim.fire(S);
      // Backspace brakes while it is held: the engine hands a count per frame, so hold for a moment
      if (k.back) G.brakeUntil = G.t + 0.14;
      Sim.brake(S, G.t < (G.brakeUntil || 0));
      return;
    }
    case 'pause': return menuNav(k, 2, i => { Audio.pause(false); if (i === 0) G.mode = 'play'; else endRun(); }, () => { Audio.pause(false); G.mode = 'play'; });
    case 'compile': {
      for (const ch of k.chars || []) if (/^[a-z ]$/i.test(ch)) { G.typedChoice = (G.typedChoice + ch.toLowerCase()).slice(0, 16); if (!G.choices.some(c => c.name.startsWith(G.typedChoice))) { G.typedChoice = ''; G.choiceErrT = G.t; } }
      if (k.back) G.typedChoice = G.typedChoice.slice(0, -1);
      const hit = G.choices.find(c => c.name === G.typedChoice);
      if (hit && (k.enter || true)) {
        Sim.takeUpgrade(G.run, hit.key); Audio.sting('upgrade'); G.picked = { name: hit.name, t0: G.t };
        G.choices = null; setTimeout(() => {}, 0);
        startSectorSoon();
      }
      return;
    }
    case 'results': if (G.t - G.modeT > 1) menuNav(k, 2, i => { if (i === 0) newRun(); else { setMode('title'); MUS.play('menu', { now: true, fade: 1 }); } }); return;
  }
}
function startSectorSoon() { G.nextSectorAt = G.t + 0.9; }
function endRun() {
  stopLoops();
  G.best = Math.max(G.best, G.run.score);
  setMode('results');
  MUS.play('results', { now: true, fade: 1 });
}

function updatePlay(dt) {
  const S = G.S;
  const slow = G.slow > 0 ? 0.35 : 1;
  G.slow = Math.max(0, G.slow - dt);
  Sim.step(S, dt * slow);
  handleEvents(S);
  updateAudio(S, dt);
  if (S.cleared && !G.clearAt) G.clearAt = G.t + 1.2;
  if (G.clearAt && G.t >= G.clearAt) { G.clearAt = null; toCompile(); }
  if (S.over && !G.overAt) G.overAt = G.t + 2.2;
  if (G.overAt && G.t >= G.overAt) { G.overAt = null; endRun(); }
}

// ---------------------------------------------------------------- screens
function drawPlay(dt) {
  const S = G.S;
  updateZoom(S, dt);
  updateCamera(S, dt);
  drawScene(S, dt);
  drawLances();
  drawTyping(S);
  drawHud(S);
  drawMinimap(S);
  drawToasts();
  
  if (G.flash > 0) { rect(0, 0, LW, LH, COL.white, G.flash * 0.6); G.flash = Math.max(0, G.flash - dt * 2); }
}
function drawCompile(dt) {
  const S = G.S;
  G.camTarget = null;
  updateCamera(S, dt * 0.3, 0);
  drawScene(S, dt, { bloom: 0.6 });
  rect(0, 0, LW, LH, COL.ink, 0.6);
  glowText('COMPILE', LW / 2, 50, COL.player, 3);
  textC('type one to install it', LW / 2, 96, COL.white, 2);
  const ch = G.choices;
  if (ch) ch.forEach((c, i) => {
    const y = 130 + i * 58, w = 300, x = LW / 2 - w / 2;
    const match = G.typedChoice && c.name.startsWith(G.typedChoice);
    panel(x, y, w, 46, 1, match ? COL.gold : COL.player);
    let pen = x + 14;
    for (let k = 0; k < c.name.length; k++) pen = text(c.name[k].toUpperCase(), pen, y + 8, match && k < G.typedChoice.length ? COL.gold : COL.white, 2);
    text(c.text, x + 14, y + 32, COL.white);
    const lvl = G.run.up[c.key] || 0;
    textR(lvl ? 'LV ' + (lvl + 1) : 'NEW', x + w - 10, y + 10, COL.dim);
  });
  if (G.picked) { const u = (G.t - G.picked.t0) / 0.9; glowText('INSTALLED ' + G.picked.name.toUpperCase(), LW / 2, 310, COL.gold, 1, 1 - u); }
  if (G.nextSectorAt && G.t >= G.nextSectorAt) { G.nextSectorAt = null; G.picked = null; startSector(); }
}
function drawTitle(dt) {
  demoStep(dt);
  const D = G.demo;
  G.camTarget = null;
  setZoom(0.5);
  updateCamera(D, dt, 2);
  drawScene(D, dt);
  rect(0, 0, LW, LH, COL.ink, 0.35);
  drawLogoPixel(LW / 2, 86, 1);
  textC('light-cycle typing', LW / 2, 118, COL.white, 2);
  MENU.forEach((m, i) => {
    const on = i === G.sel;
    if (on) { panel(LW / 2 - 90, 156 + i * 34, 180, 30, 1, COL.player); }
    textC(m, LW / 2, 158 + i * 34, on ? COL.white : COL.text, 2);
  });
  if (G.best) textC('BEST ' + G.best, LW / 2, 262, COL.gold, 2);
  textC('type to ride', LW / 2, LH - 34, COL.text, 2);
}
function drawHowto(dt) {
  demoStep(dt);
  setZoom(0.5);
  updateCamera(G.demo, dt, 2);
  drawScene(G.demo, dt, { bloom: 0.5 });
  rect(0, 0, LW, LH, COL.ink, 0.75);
  glowText('HOW TO RIDE', LW / 2, 12, COL.player, 3);
  const rows = [
    ['STEER', 'press the key beside you'],
    ['WORD', 'type the word to speed up'],
    ['TYPO', 'cuts four cells of wall'],
    ['GRIND', 'ride by walls to charge'],
    ['SEAL', 'box a rival in to win'],
    ['ENTER', 'fire a power cell'],
    ['BKSP', 'brake'],
    ['PADS', 'jump the gaps'],
    ['BOSS', 'circle its pylons'],
  ];
  rows.forEach(([a, b], i) => { textR(a, 128, 50 + i * 30, COL.player, 2); text(b, 140, 50 + i * 30, COL.white, 2); });
  textC('enter to go back', LW / 2, LH - 30, COL.text, 2);
}
function drawPause(dt) {
  const S = G.S;
  drawScene(S, 0);
  drawHud(S);
  rect(0, 0, LW, LH, COL.ink, 0.6);
  glowText('PAUSED', LW / 2, 120, COL.player, 3);
  ['RESUME', 'END RUN'].forEach((m, i) => textC(m, LW / 2, 176 + i * 34, i === G.sel ? COL.white : COL.text, 2));
}
function drawResults(dt) {
  const S = G.S, run = G.run;
  updateCamera(S, dt * 0.3, 0);
  drawScene(S, dt, { bloom: 0.6 });
  rect(0, 0, LW, LH, COL.ink, 0.7);
  glowText('SIGNAL LOST', LW / 2, 40, COL.red, 3);
  const st = run.stats;
  const acc = st.letters ? Math.round(100 * (st.letters - st.typos) / st.letters) : 100;
  const rows = [['SCORE', run.score], ['SECTOR', run.sector], ['SHATTERED', st.derez], ['SEALS', st.seals], ['ANCHORS', st.bosses ? st.bosses + ' OVERSEERS' : '0'], ['WORDS', st.words], ['BEST STREAK', st.best], ['ACCURACY', acc + '%']];
  rows.forEach(([a, b], i) => { textR(a, LW / 2 - 10, 88 + i * 22, COL.text, 2); text(String(b), LW / 2 + 10, 88 + i * 22, COL.white, 2); });
  ['NEW RUN', 'MENU'].forEach((m, i) => { const on = i === G.sel; if (on) panel(LW / 2 - 70, 272 + i * 34, 140, 30, 1); textC(m, LW / 2, 274 + i * 34, on ? COL.white : COL.text, 2); });
  
}
function drawLoading() {
  rect(0, 0, LW, LH, [3, 4, 11]);
  for (let i = 0; i < 3; i++) if ((Math.floor(G.t * 3) % 3) === i) rect(LW / 2 - 12 + i * 10, LH / 2, 6, 6, COL.player);
}

// ---------------------------------------------------------------- the demo (title, showcase)
function demoStep(dt) {
  if (!G.demo || G.demo.cleared || G.demo.over || G.demo.t > 40) G.demo = demoSector();
  const D = G.demo;
  const P = Sim.player(D);
  // the demo's "player" rides like a rival
  if (P.alive && P.p < 0.05 && !P.holding) Sim._ai.think(D, P);
  Sim.step(D, dt);
  const ev = Sim.takeEvents(D);
  for (const e of ev) if (e.type === 'derez') { const b = D.bikes[e.bike]; const [px, py] = bikePos(b); derezzes.push({ x: px, y: py, level: e.level, dir: (b.d * 2) % 8, key: bikeKey(b), t0: G.t }); }
}
function demoSector(seed) {
  const run = Sim.createRun({ seed: seed != null ? seed : 11 });
  run.sector = 3;
  const S = Sim.startSector(run);
  S.countdown = 0;
  S.bikes.forEach(b => { b.rezT = 0; });
  G.floorKey = '';
  return S;
}

// ---------------------------------------------------------------- logo and icon
// VECTOR drawn as strokes on a grid, like a line of light
const LOGO = {
  V: [[0, 0, 2, 6], [2, 6, 4, 0]], E: [[0, 0, 0, 6], [0, 0, 4, 0], [0, 3, 3, 3], [0, 6, 4, 6]], C: [[4, 0, 0, 0], [0, 0, 0, 6], [0, 6, 4, 6]],
  T: [[0, 0, 4, 0], [2, 0, 2, 6]], O: [[0, 0, 4, 0], [4, 0, 4, 6], [4, 6, 0, 6], [0, 6, 0, 0]], R: [[0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [1, 3, 4, 6]],
};
function buildLogo() {
  const U = 5, W = 6 * 5 * U + 5 * 2 * U + 8, H = 6 * U + 12;
  const c = canvas(W, H), g = c.getContext('2d');
  const strokes = (col, off, width) => {
    g.strokeStyle = col; g.lineWidth = width; g.lineCap = 'square';
    let x = 4 + off;
    for (const ch of 'VECTOR') {
      for (const [a, b, cc, d] of LOGO[ch]) { g.beginPath(); g.moveTo(Math.round(x + a * U) + 0.5, Math.round(4 + b * U) + 0.5); g.lineTo(Math.round(x + cc * U) + 0.5, Math.round(4 + d * U) + 0.5); g.stroke(); }
      x += 4 * U + 2 * U + 2;
    }
  };
  strokes('rgba(255,60,200,0.55)', 1, 3);
  strokes('rgba(40,235,255,0.9)', -1, 3);
  strokes('#eaffff', 0, 1);
  G.logo = c;
}
function drawLogoPixel(cx, cy, a) {
  if (!G.logo) return;
  const w = G.logo.width, h = G.logo.height;
  const x = Math.round(cx - w), y = Math.round(cy - h);
  ctx.globalAlpha = a; ctx.drawImage(G.logo, x, y, w * 2, h * 2); ctx.globalAlpha = 1;
  if (glowCtx) { glowCtx.globalAlpha = a; glowCtx.drawImage(G.logo, x / 2, y / 2, w, h); glowCtx.globalAlpha = 1; }
  // a sweep of light across the letters
  const sw = ((G.t * 0.5) % 1.6) - 0.3;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const grd = ctx.createLinearGradient(x + sw * w * 2 - 20, 0, x + sw * w * 2 + 20, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.restore();
}
function buildIcon() {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const grd = g.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, '#0a1430'); grd.addColorStop(1, '#03050d');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(40,170,230,0.35)';
  for (let k = -4; k < 8; k++) { g.beginPath(); g.moveTo(k * 16, 64); g.lineTo(k * 16 + 64, 32); g.stroke(); g.beginPath(); g.moveTo(k * 16, 32); g.lineTo(k * 16 + 64, 64); g.stroke(); }
  // a wall of light running in behind the bike
  g.fillStyle = 'rgba(40,235,255,0.55)'; g.beginPath(); g.moveTo(0, 44); g.lineTo(30, 29); g.lineTo(30, 38); g.lineTo(0, 53); g.fill();
  g.fillStyle = '#dfffff'; g.fillRect(0, 44, 30, 1);
  const s = G.M.sprites['rider_02_2_0'];
  if (s) { const [sx, sy, w, h, ox, oy] = s; g.drawImage(atlasFor('player'), sx, sy, w, h, 34 - ox, 42 - oy, w, h); }
  G.icon = c;
}

// ---------------------------------------------------------------- showcase
// The select-screen trailer: a live match in a mid sector, cut every two seconds (on the
// intro music's bar lines) to a different rider. The action rides in the band between the
// select screen's logo and its tiles.
const SHOW_LOOP = 10, SHOW_INTRO = 1.5;
// VECTOR is fine lines of light on black: the tube's grille and rolling bar turn that into streaks,
// so while it is on screen the CRT is softened (engine v1.51: TYPEMAXX.crt)
// the trailer is a lot of light on black: half the tube's gain, no halo. The game keeps a little more.
const SOFT_TUBE = { grille: 0, scanDepth: 0.06, chroma: 0.25, bar: 0, flicker: 0, grain: 0.006, noise: 0, vignette: 0.32, halo: 0, gain: 0.67 };
const SOFT_TUBE_GAME = { grille: 0, scanDepth: 0.06, chroma: 0.25, bar: 0, flicker: 0, grain: 0.006, noise: 0, vignette: 0.32, halo: 0, gain: 0.67 };
function softTube(on) {
  if (typeof window === 'undefined' || !window.TYPEMAXX) return;
  const look = G.active ? SOFT_TUBE_GAME : SOFT_TUBE;
  if (on) { if (window.TYPEMAXX.crt !== look) window.TYPEMAXX.crt = look; }
  else if (window.TYPEMAXX.crt === SOFT_TUBE || window.TYPEMAXX.crt === SOFT_TUBE_GAME) window.TYPEMAXX.crt = null;
}
let showLast = 0, showWatch = null, showLap = null, showPrev = 0, showSim = null, showT = -1;
function showcaseAudio(t) {
  const nowMs = performance.now();
  if (G.active) return;
  const fresh = showLap == null || nowMs - showPrev > 250;
  const lap = Math.floor(t / SHOW_LOOP);
  const wrapped = !fresh && lap !== showLap;
  showLap = lap; showPrev = nowMs; showLast = nowMs;
  if (fresh && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('typemaxx:showcase', { detail: 'vector' }));
  if (!Audio.ready) return;
  if (MUS.current !== 'intro') MUS.play('intro', { now: true, restart: true, fade: 0.25, at: t % SHOW_LOOP });
  else if (wrapped) {
    const p = MUS.position;
    const phase = p ? ((p.step / 16) * (60 / p.bpm * 4)) % SHOW_LOOP : 0;
    if (p && Math.min(phase, SHOW_LOOP - phase) > 0.3) MUS.play('intro', { now: true, restart: true, fade: 0.1, at: t % SHOW_LOOP });
  }
  if (!showWatch) showWatch = setInterval(() => { if (performance.now() - showLast > 250) { if (MUS.current === 'intro') MUS.stop(0.3); if (!G.active) softTube(false); clearInterval(showWatch); showWatch = null; } }, 100);
}
if (typeof window !== 'undefined') {
  window.addEventListener('typemaxx:showcase', e => { if (e.detail === 'vector' || G.active) return; if (MUS.current === 'intro') MUS.stop(0.3); });
}
// ---------------------------------------------------------------- the cinematic
// Five shots cut on the intro music's bar lines (every 2 s), letterboxed, with flashes on the cuts.
// Everything is drawn from the sprite atlas at big pixel scales, plus a few procedural light shapes.
function bigSprite(name, key, cx, cy, scale, flip, alpha) {
  const s = G.M.sprites[name]; if (!s) return;
  const [sx, sy, w, h, ox, oy] = s;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.scale(flip ? -scale : scale, scale);
  ctx.drawImage(atlasFor(key), sx, sy, w, h, -ox, -oy, w, h);
  // light bleeds past its pixels
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.18;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(G.glows[key] || atlasFor(key), sx, sy, w, h, -ox + dx * 1.2, -oy + dy * 1.2, w, h);
  ctx.restore();
}
function glowLine(x0, y0, x1, y1, col, w, a) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [lw, la] of [[w * 5, 0.05], [w * 2.2, 0.16], [w, 0.8]]) {
    ctx.strokeStyle = css(la === 1 ? [Math.min(255, col[0] * 0.4 + 170), Math.min(255, col[1] * 0.4 + 170), Math.min(255, col[2] * 0.4 + 170)] : col, la * (a == null ? 1 : a));
    ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.restore();
}
// a floor of black glass rushing toward the camera under a horizon
function rushGrid(horizon, speed, t, col, vx) {
  const g = ctx;
  const grd = g.createLinearGradient(0, horizon - 60, 0, LH);
  grd.addColorStop(0, 'rgba(3,20,28,0)'); grd.addColorStop(0.25, 'rgba(4,20,26,0.9)'); grd.addColorStop(1, '#010306');
  g.fillStyle = grd; g.fillRect(0, horizon - 60, LW, LH - horizon + 60);
  const cx = LW / 2 + (vx || 0);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let k = -16; k <= 16; k++) {
    const x = cx + k * 70;
    g.strokeStyle = css(col, 0.16); g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + k * 3, horizon); g.lineTo(x, LH); g.stroke();
  }
  for (let j = 0; j < 14; j++) {
    const z = ((j - (t * speed) % 1) + 14) % 14 + 0.6;
    const y = horizon + 180 / z;
    if (y > LH) continue;
    g.strokeStyle = css(col, Math.min(0.3, 0.5 / z));
    g.beginPath(); g.moveTo(0, y); g.lineTo(LW, y); g.stroke();
  }
  g.restore();
  // a hard horizon line
  glowLine(0, horizon, LW, horizon, col, 1, 0.5);
}
function streaks(t, col, count, dir) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const y = 60 + hash(i, 9) * 240;
    const len = 30 + hash(i, 10) * 90;
    const x = (((hash(i, 11) * LW - t * (500 + hash(i, 12) * 600) * dir) % (LW + len)) + LW + len) % (LW + len) - len;
    ctx.fillStyle = css(col, 0.12 + 0.2 * hash(i, 13));
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(len), 1);
  }
  ctx.restore();
}
function drawCinematic(t) {
  const lt = ((t % SHOW_LOOP) + SHOW_LOOP) % SHOW_LOOP;
  const shot = Math.min(4, Math.floor(lt / 2));
  const u = (lt - shot * 2) / 2;            // 0..1 within the shot
  const C = COL.player, O = COL.hunter;
  ctx.fillStyle = '#010206'; ctx.fillRect(0, 0, LW, LH);
  const midY = 196;                           // the clear band between the select logo and its tiles

  if (shot === 0) {
    // IGNITION: an extreme close-up of a hubless wheel coming alive
    const on = easeOut(clamp(u / 0.35, 0, 1));
    const cx = 250 + u * 20, cy = midY + 10, R = 150 + u * 25;
    ctx.fillStyle = '#05080f'; ctx.beginPath(); ctx.arc(cx, cy, R + 18, 0, TAU); ctx.fill();
    ctx.fillStyle = '#010205'; ctx.beginPath(); ctx.arc(cx, cy, R - 34, 0, TAU); ctx.fill();
    // the sheen on the tyre
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(220,235,255,0.25)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, R + 8, -2.4, -1.5); ctx.stroke(); ctx.restore();
    // the ring powers on from one point, sweeping round
    const a0 = -Math.PI / 2 + lt * 2.2;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const [lw, la] of [[34, 0.05], [16, 0.15], [7, 0.8]]) {
      ctx.strokeStyle = la === 0.8 ? 'rgba(210,250,255,0.8)' : css(C, la);
      ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(cx, cy, R - 12, a0, a0 + TAU * on); ctx.stroke();
    }
    // ticks racing round the ring
    for (let k = 0; k < 6; k++) {
      const a = a0 * 3 + k * TAU / 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, R - 12, a, a + 0.08); ctx.stroke();
    }
    ctx.restore();
    // the body of the bike sweeps in over the wheel, with its light line running on from the ring
    ctx.fillStyle = '#04070d';
    ctx.beginPath(); ctx.moveTo(-20, cy - R * 0.95); ctx.quadraticCurveTo(cx - R * 0.4, cy - R * 1.2, cx + R * 0.25, cy - R * 0.72);
    ctx.lineTo(cx - R * 0.2, cy - R * 0.45); ctx.quadraticCurveTo(cx - R * 0.8, cy - R * 0.62, -20, cy - R * 0.4); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(235,245,255,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-20, cy - R * 0.93); ctx.quadraticCurveTo(cx - R * 0.4, cy - R * 1.17, cx + R * 0.22, cy - R * 0.72); ctx.stroke(); ctx.restore();
    const lineOn = clamp((u - 0.2) / 0.3, 0, 1);
    if (lineOn > 0) {
      const ex = lerp(cx - R * 0.55, -20, lineOn), ey = lerp(cy - R * 0.62, cy - R * 0.6, lineOn);
      glowLine(cx - R * 0.55, cy - R * 0.62, ex, ey, C, 4, 1);
    }
    // reflection in the floor
    ctx.save(); ctx.globalAlpha = 0.18 * on; ctx.translate(0, (cy + R + 22) * 2); ctx.scale(1, -1);
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = css(C); ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(cx, cy, R - 12, 0, TAU); ctx.stroke(); ctx.restore();
    if (u < 0.08) rect(0, 0, LW, LH, [255, 255, 255], (0.08 - u) / 0.08 * 0.4 * on);
    streaks(lt, C, Math.floor(20 * on), 1);
  }

  if (shot === 1) {
    // RIDER: a close run in slow motion, then a punch-in on the leap
    rushGrid(150, 3.5, lt, C, -40);
    streaks(lt, C, 26, 1);
    const leap = u > 0.62;
    const punch = leap ? 1.12 : 1;
    const scale = 3.6 * punch;
    const frame = leap ? (u > 0.78 ? 7 : 6) : Math.floor(lt * 9) % 6;
    const x = 230 + (leap ? 10 : u * 24), y = midY + 88 - (leap ? Math.sin((u - 0.62) / 0.38 * Math.PI) * 22 : 0);
    // the rider's own wall of light trailing off screen
    if (leap) rect(0, 0, LW, LH, [0, 0, 0], 0.35);
    bigSprite(`runner_02_${frame}`, 'player', x, y, scale, false);
    if (u > 0.6 && u < 0.66) rect(0, 0, LW, LH, [220, 250, 255], 0.28);
  }

  if (shot === 2) {
    // RIDE: tracking side-on with the bike; its wall unspools behind it
    rushGrid(132, 7, lt, C, 0);
    const scale = 3;
    const bx = 280 + Math.sin(lt * 7) * 2, by = midY + 58 + Math.sin(lt * 23) * 1;
    // the wall: a thick ribbon of light from the tail to the left edge, its reflection under it
    const wallTop = by - 34, wallBot = by + 4, tail = bx - 70;
    ctx.save();
    const wg = ctx.createLinearGradient(0, wallTop, 0, wallBot);
    wg.addColorStop(0, 'rgb(210,250,255)'); wg.addColorStop(0.12, css(C)); wg.addColorStop(1, css([C[0] * 0.45, C[1] * 0.45, C[2] * 0.45]));
    ctx.fillStyle = wg; ctx.fillRect(0, wallTop, tail, wallBot - wallTop);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = css(C, 0.25); ctx.fillRect(0, wallTop - 6, tail, 6);
    const rg = ctx.createLinearGradient(0, wallBot, 0, wallBot + 40);
    rg.addColorStop(0, css(C, 0.35)); rg.addColorStop(1, css(C, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, wallBot, tail, 40);
    ctx.restore();
    const spin = Math.floor(lt * 30) % 3;
    bigSprite(`rider_02_0_${spin}`, 'player', bx, by, scale, false);
    // sparks off the rear wheel
    for (let k = 0; k < 6; k++) { const a = hash(k, Math.floor(lt * 30)); rect(bx - 60 - a * 40, by - 2 - hash(k, 7 + Math.floor(lt * 30)) * 10, 2, 1, [220, 250, 255], 0.8); }
    streaks(lt, [200, 240, 255], 18, 1);
  }

  if (shot === 3) {
    // DUEL: high and wide; orange cuts across cyan's wall and shatters
    setZoom(1);
    const cam = [LW / 2, LH / 2];
    ctx.save();
    ctx.translate(0, 20);
    // a patch of black glass grid seen from above
    for (let k = -8; k <= 8; k++) {
      const a = [cam[0] + k * 48 - 400, cam[1] + k * 24 + 200], b = [cam[0] + k * 48 + 400, cam[1] + k * 24 - 200];
      const c2 = [cam[0] + k * 48 - 400, cam[1] - k * 24 - 200], d2 = [cam[0] + k * 48 + 400, cam[1] - k * 24 + 200];
      ctx.strokeStyle = k % 4 === 0 ? 'rgba(80,190,225,0.45)' : 'rgba(50,120,150,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(...c2); ctx.lineTo(...d2); ctx.stroke();
    }
    const p = clamp(u / 0.62, 0, 1);
    // cyan rides along +x (right-down); its wall is already down
    const cyX = lerp(-40, 330, p), cyY = lerp(60, 245, p);
    glowLine(-60, 50, cyX - 20, cyY - 10, C, 5, 1);
    rect(-60, 0, 0, 0, C);
    bigSprite('rider_00_0_' + (Math.floor(lt * 30) % 3), 'player', cyX, cyY, 2, false);
    // orange rides along -y (right-up) toward cyan's line
    const hit = u >= 0.62;
    const orX = lerp(20, 205, p), orY = lerp(340, 247, p);
    glowLine(-20, 360, orX - 20, orY + 10, O, 5, hit ? clamp(1 - (u - 0.62) / 0.3, 0, 1) : 1);
    if (!hit) bigSprite('rider_12_0_' + (Math.floor(lt * 30) % 3), 'hunter', orX, orY, 2, false);
    else {
      const f = Math.min(11, Math.floor((u - 0.62) / 0.38 * 12));
      bigSprite(`derez_06_${String(f).padStart(2, '0')}`, 'hunter', 205, 247, 2, false);
      if (u < 0.7) rect(0, 0, LW, LH, [255, 200, 150], (0.7 - u) / 0.08 * 0.35);
    }
    ctx.restore();
  }

  if (shot === 4) {
    // HORIZON: low and fast over the grid as walls of light rise and race away
    rushGrid(166, 9, lt, C, Math.sin(lt * 0.8) * 30);
    const rise = easeOut(clamp(u / 0.5, 0, 1));
    const walls = [[-120, C], [-40, [240, 250, 255]], [60, O], [140, C]];
    for (const [off, col] of walls) {
      // each wall runs from the camera to the vanishing point
      const x0 = LW / 2 + off * 3.2, x1 = LW / 2 + off * 0.12;
      const h0 = 90 * rise, h1 = 6 * rise;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(x0, LH); ctx.lineTo(x1, 168); ctx.lineTo(x1, 168 - h1); ctx.lineTo(x0, LH - h0); ctx.closePath();
      const grd = ctx.createLinearGradient(x0, 0, x1, 0);
      grd.addColorStop(0, css(col, 0.95)); grd.addColorStop(1, css(col, 0.35));
      ctx.fillStyle = grd; ctx.fill();
      ctx.restore();
      glowLine(x0, LH - h0, x1, 168 - h1, [Math.min(255, col[0] * 0.4 + 170), Math.min(255, col[1] * 0.4 + 170), Math.min(255, col[2] * 0.4 + 170)], 2, 1);
    }
    streaks(lt, [220, 245, 255], 30, -1);
    // the flash that loops back to the ignition
    if (u > 0.9) rect(0, 0, LW, LH, [255, 255, 255], 0.5 * (u - 0.9) / 0.1);
  }

  // jump-cut flashes and the letterbox
  const cutU = lt % 2;
  if (cutU < 0.07 && lt > 0.5) rect(0, 0, LW, LH, [230, 250, 255], 0.3 * (1 - cutU / 0.07));
  rect(0, 0, LW, 26, [0, 0, 0]); rect(0, LH - 26, LW, 26, [0, 0, 0]);
  // the first half second of a fresh showing opens from black
  if (t < 0.5) rect(0, 0, LW, LH, [0, 0, 0], 1 - t / 0.5);
}
function drawShowcase(t, dt) { drawCinematic(t); }
function stepDemo(S, dt) {
  const P = Sim.player(S);
  if (P.alive && P.p < 0.05 && !P.holding) Sim._ai.think(S, P);
  Sim.step(S, dt);
  for (const e of Sim.takeEvents(S)) if (e.type === 'derez') { const b = S.bikes[e.bike]; const [px, py] = bikePos(b); derezzes.push({ x: px, y: py, level: e.level, dir: (b.d * 2) % 8, key: bikeKey(b), t0: G.t }); }
  if (S.bikes.filter(b => b.alive).length <= 1) { S.bikes.forEach(b => { if (!b.alive) { b.alive = true; b.rezT = 0.6; b.tail = b.dist; b.holding = false; } }); }
}

const SHOWCASE = {
  INTRO: SHOW_INTRO, LOOP: SHOW_LOOP,
  get ready() { return G.ready; },
  preload() { if (!G.ready && !G.loading) loadAssets(); return new Promise(res => { const w = () => (G.ready || G.error ? res(G.ready) : setTimeout(w, 50)); w(); }); },
  background(g, W, H, t, dim) {
    if (!G.ready) { if (!G.loading && !G.error) loadAssets(); g.fillStyle = '#03040b'; g.fillRect(0, 0, W, H); return; }
    showcaseAudio(t);
    softTube(true);
    if (G.active) return;
    const prev = ctx, pt = G.t, pdt = G.dt;
    const dt = G.showLastT == null ? 1 / 60 : clamp(t - G.showLastT, 0, 0.05);
    G.showLastT = t;
    ctx = g; G.t = t; G.dt = dt;
    g.save(); g.imageSmoothingEnabled = false; g.scale(W / LW, H / LH);
    try {
      drawShowcase(t, dt);
      const d = dim == null ? 0.5 : dim;
      const gr = g.createLinearGradient(0, 0, 0, LH);
      gr.addColorStop(0, `rgba(3,4,11,${(d * 0.9).toFixed(2)})`); gr.addColorStop(0.35, `rgba(3,4,11,${(d * 0.15).toFixed(2)})`);
      gr.addColorStop(0.68, `rgba(3,4,11,${(d * 0.2).toFixed(2)})`); gr.addColorStop(1, `rgba(3,4,11,${d.toFixed(2)})`);
      g.fillStyle = gr; g.fillRect(0, 0, LW, LH);
    } catch (e) { if (!SHOWCASE.warned) { SHOWCASE.warned = true; console.error('VECTOR showcase:', e); } }
    finally { g.restore(); ctx = prev; G.t = pt; G.dt = pdt; }
  },
  logo(g, cx, cy, width, t) {
    if (!G.ready || !G.logo) return;
    const e = easeOut(clamp((t - 0.9) / 0.5, 0, 1));
    if (e <= 0) return;
    const sc = width / G.logo.width, w = G.logo.width * sc, h = G.logo.height * sc;
    g.save(); g.imageSmoothingEnabled = false;
    // lines draw on from left to right as it appears
    g.beginPath(); g.rect(cx - w / 2, cy - h / 2 - 10, w * e, h + 20); g.clip();
    g.globalAlpha = 0.5; g.globalCompositeOperation = 'lighter';
    g.drawImage(G.logo, Math.round(cx - w / 2) - 2, Math.round(cy - h / 2), Math.round(w), Math.round(h));
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.drawImage(G.logo, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
    g.restore();
  },
  icon(g, x, y, size, t, focused) {
    if (!G.ready || !G.icon) return;
    const pop = t < 1.1 ? 0 : t < 1.35 ? 1 - Math.pow(1 - (t - 1.1) / 0.25, 3) : 1;
    if (pop <= 0) return;
    const bounce = t < 1.5 ? 1 + Math.sin(clamp((t - 1.1) / 0.4, 0, 1) * Math.PI) * 0.08 : 1;
    const lift = focused ? Math.round(Math.sin(t * 3) * size * 0.02) - size * 0.03 : 0;
    const s = size * bounce;
    const ix = Math.round(x + (size - s) / 2), iy = Math.round(y + (size - s) / 2 + lift);
    g.save(); g.imageSmoothingEnabled = false; g.globalAlpha = focused ? pop : pop * 0.72;
    g.drawImage(G.icon, ix, iy, Math.round(s), Math.round(s));
    if (focused) {
      g.globalAlpha = 0.6 + Math.sin(t * 4) * 0.25; g.strokeStyle = '#28EBFF'; g.lineWidth = Math.max(1, size / 32);
      g.strokeRect(ix - 1, iy - 1, Math.round(s) + 2, Math.round(s) + 2);
    }
    g.restore();
  },
};

// ---------------------------------------------------------------- export
const VECTOR = {
  title: 'VECTOR',
  get state() { return G; },
  get dev() { return { Sim, newRun, startSector, toCompile, setMode, demoSector }; },
  showcase: SHOWCASE,
  audio: Audio,
  enter() {
    G.active = true;
    loadAssets();
    setMode('title');
    G.lastSec = null;
    MUS.play('menu', { now: true, fade: 1 });
  },
  exit() {
    G.active = false;
    stopLoops();
    softTube(false);
    if (typeof window !== 'undefined' && window.TYPEMAXX) window.TYPEMAXX.pixel = null;
    Audio.pause(false);
    Audio.stopAll(0.6);
  },
  draw(g, W, H, seconds, now, input) {
    if (typeof window !== 'undefined' && window.TYPEMAXX) {
      const p = window.TYPEMAXX.pixel;
      if (!p || p.width !== LW || p.height !== LH) window.TYPEMAXX.pixel = { width: LW, height: LH };
      softTube(true);
    }
    const k = input && typeof input.pull === 'function' ? input.pull() : { chars: [], keys: [], back: 0, enter: 0 };
    const sec = typeof seconds === 'number' ? seconds : performance.now() / 1000;
    G.dt = G.lastSec == null ? 0 : clamp(sec - G.lastSec, 0, 0.05);
    G.lastSec = sec;
    G.t += G.dt;
    ctx = g;
    g.save(); g.imageSmoothingEnabled = false; g.scale(W / LW, H / LH);
    try {
      if (!G.ready) { if (!G.loading && !G.error) loadAssets(); drawLoading(); return; }
      handleInput(k);
      if (G.mode === 'play') updatePlay(G.dt);
      switch (G.mode) {
        case 'title': drawTitle(G.dt); break;
        case 'howto': drawHowto(G.dt); break;
        case 'play': drawPlay(G.dt); break;
        case 'pause': drawPause(G.dt); break;
        case 'compile': drawCompile(G.dt); break;
        case 'results': drawResults(G.dt); break;
      }
    } finally { g.restore(); }
  },
};

if (typeof window !== 'undefined') {
  const start = () => { if (!G.ready && !G.loading) loadAssets(); };
  if (document.readyState === 'complete') setTimeout(start, 600);
  else addEventListener('load', () => setTimeout(start, 600), { once: true });
}

export default VECTOR;
export { VECTOR };
