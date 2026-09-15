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
const HX = 24, HY = 12;         // half a cell diamond
const WALL_H = 22, DECK_H = 20;
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
function iso(x, y, level) { return [LW / 2 + (x + y) * HX - G.cam.x, LH / 2 + (x - y) * HY - (level || 0) * DECK_H - G.cam.y]; }
function bikePos(b) {
  if (b.laid) return [b.x - DX[b.d] * (1 - b.p), b.y - DY[b.d] * (1 - b.p)];
  return [b.x + DX[b.d] * b.p, b.y + DY[b.d] * b.p];
}
function bikeLevel(b) {
  // a ramp climb shows as a smooth lift
  if (b.laid && b.fromLevel !== b.level) return lerp(b.fromLevel, b.level, clamp((b.p - 0.5) * 2, 0, 1));
  return b.level;
}
function bikeKey(b) { return b.kind === 'player' ? 'player' : b.kind; }

// a wall tile per colour: a lit face under a bright crest, faint scan columns
function wallTile(key) {
  if (G.wallTiles[key]) return G.wallTiles[key];
  const col = COL[key] || COL.player;
  const c = canvas(HX, WALL_H + 2), g = c.getContext('2d');
  for (let y = 0; y < WALL_H; y++) {
    const u = y / WALL_H;
    const a = 0.18 + 0.72 * Math.pow(1 - u, 2.3);
    g.fillStyle = css([col[0] * 0.3 + col[0] * 0.7 * (1 - u), col[1] * 0.3 + col[1] * 0.7 * (1 - u), col[2] * 0.3 + col[2] * 0.7 * (1 - u)], a);
    g.fillRect(0, y + 1, HX, 1);
  }
  g.fillStyle = 'rgba(255,255,255,0.10)'; for (let x = 3; x < HX; x += 6) g.fillRect(x, 3, 1, WALL_H - 3);
  g.fillStyle = css([Math.min(255, col[0] * 0.4 + 170), Math.min(255, col[1] * 0.4 + 170), Math.min(255, col[2] * 0.4 + 170)]); g.fillRect(0, 0, HX, 2);
  g.fillStyle = css(col, 0.9); g.fillRect(0, WALL_H, HX, 2);
  const glowTile = canvas(HX, WALL_H + 2), gg = glowTile.getContext('2d');
  gg.fillStyle = css(col); gg.fillRect(0, 0, HX, 3); gg.fillStyle = css(col, 0.35); gg.fillRect(0, 3, HX, WALL_H - 3); gg.fillStyle = css(col, 0.7); gg.fillRect(0, WALL_H, HX, 2);
  return (G.wallTiles[key] = { face: c, glow: glowTile });
}
function wallSegment(ax, ay, bx, by, level, key, alpha) {
  const [x0, y0] = iso(ax, ay, level), [x1, y1] = iso(bx, by, level);
  const sdx = x1 - x0, sdy = y1 - y0;
  if (Math.abs(sdx) < 0.5) return;
  const T = wallTile(key);
  ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.transform(sdx / HX, sdy / HX, 0, 1, x0, y0 - WALL_H);
  ctx.drawImage(T.face, 0, 0);
  ctx.restore();
  if (glowCtx) {
    glowCtx.save(); glowCtx.globalAlpha = (alpha == null ? 1 : alpha) * 0.85;
    glowCtx.transform(sdx / HX / 2, sdy / HX / 2, 0, 0.5, x0 / 2, (y0 - WALL_H) / 2);
    glowCtx.drawImage(T.glow, 0, 0);
    glowCtx.restore();
  }
}

// ---------------------------------------------------------------- the floor (pre-rendered per sector)
function buildFloor(S) {
  const A = S.A, n = A.n;
  const w = (n * 2) * HX + 80, h = n * 2 * HY + 120;
  const c = canvas(w, h), g = c.getContext('2d');
  const ox = 40 + n * HX - HX, oy = 60 + n * HY;   // screen position of cell (0, 0) inside the canvas... centred
  const P = (x, y) => [ox + (x + y) * HX - (n - 1) * HX, oy + (x - y) * HY];
  // plate
  g.fillStyle = '#04060e';
  g.beginPath(); const c0 = P(-0.5, -0.5), c1 = P(n - 0.5, -0.5), c2 = P(n - 0.5, n - 0.5), c3 = P(-0.5, n - 0.5);
  g.moveTo(...c0); g.lineTo(...c1); g.lineTo(...c2); g.lineTo(...c3); g.closePath(); g.fill();
  // a faint centre bloom under the grid
  const [mx, my] = P(n / 2 - 0.5, n / 2 - 0.5);
  const rg = g.createRadialGradient(mx, my, 10, mx, my, n * HX);
  rg.addColorStop(0, 'rgba(40,120,190,0.42)'); rg.addColorStop(1, 'rgba(30,90,140,0)');
  g.fillStyle = rg; g.fill();
  // strips
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = y * n + x, mod = A.mod[i];
    if (mod === 1) continue;
    const [cx, cy] = P(x, y);
    g.fillStyle = mod > 1 ? 'rgba(60,255,200,0.26)' : 'rgba(255,90,60,0.24)';
    g.beginPath(); g.moveTo(cx, cy - HY); g.lineTo(cx + HX, cy); g.lineTo(cx, cy + HY); g.lineTo(cx - HX, cy); g.closePath(); g.fill();
  }
  // grid lines on cell edges
  for (let k = 0; k <= n; k++) {
    const major = k % 4 === 0 || k === 0 || k === n;
    g.strokeStyle = major ? 'rgba(90,210,255,0.85)' : 'rgba(60,160,230,0.38)';
    g.lineWidth = major ? 2 : 1;
    let a = P(k - 0.5, -0.5), b = P(k - 0.5, n - 0.5);
    g.beginPath(); g.moveTo(Math.round(a[0]) + 0.5, Math.round(a[1]) + 0.5); g.lineTo(Math.round(b[0]) + 0.5, Math.round(b[1]) + 0.5); g.stroke();
    a = P(-0.5, k - 0.5); b = P(n - 0.5, k - 0.5);
    g.beginPath(); g.moveTo(Math.round(a[0]) + 0.5, Math.round(a[1]) + 0.5); g.lineTo(Math.round(b[0]) + 0.5, Math.round(b[1]) + 0.5); g.stroke();
  }
  // grid crossings get a brighter dot
  for (let y = 0; y <= n; y += 2) for (let x = 0; x <= n; x += 2) {
    const [px, py] = P(x - 0.5, y - 0.5);
    const big = x % 4 === 0 && y % 4 === 0;
    g.fillStyle = big ? 'rgba(210,250,255,0.95)' : 'rgba(140,220,255,0.55)';
    g.fillRect(Math.round(px) - (big ? 1 : 0), Math.round(py) - (big ? 1 : 0), big ? 3 : 2, big ? 3 : 2);
  }
  G.floor = { c, ox: (n - 1) * HX - ox + 0, oy: -oy, P };
  G.floorOrigin = P(0, 0);
}
function drawFloor(S) {
  const f = G.floor; if (!f) return;
  const [sx, sy] = iso(0, 0, 0);
  ctx.drawImage(f.c, Math.round(sx - G.floorOrigin[0]), Math.round(sy - G.floorOrigin[1]));
}

// the arena rim: a low wall of light round the edge
function drawRim(S, near) {
  const n = S.A.n;
  const key = 'drone';
  const edges = [
    [[0, 0], [n - 1, 0], 'far'], [[0, 0], [0, n - 1], 'far'],
    [[n - 1, 0], [n - 1, n - 1], 'near'], [[0, n - 1], [n - 1, n - 1], 'near'],
  ];
  for (const [a, b, side] of edges) {
    if ((side === 'near') !== near) continue;
    const [x0, y0] = iso(a[0], a[1], 0), [x1, y1] = iso(b[0], b[1], 0);
    ctx.strokeStyle = 'rgba(170,230,255,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0 - 10); ctx.lineTo(x1, y1 - 10); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,200,255,0.5)';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.lineWidth = 1;
    if (glowCtx) { glowCtx.strokeStyle = 'rgba(80,170,255,0.9)'; glowCtx.lineWidth = 2; glowCtx.beginPath(); glowCtx.moveTo(x0 / 2, (y0 - 10) / 2); glowCtx.lineTo(x1 / 2, (y1 - 10) / 2); glowCtx.stroke(); glowCtx.lineWidth = 1; }
  }
  if (S.exitOpen && !near) {
    const ex = S.A.exit % n, ey = Math.floor(S.A.exit / n);
    const [gx, gy] = iso(ex, ey, 0);
    const pulse = 0.6 + 0.4 * Math.sin(G.t * 8);
    ctx.fillStyle = `rgba(255,255,255,${0.35 * pulse})`; ctx.fillRect(gx - 10, gy - 40, 20, 40);
    if (glowCtx) { glowCtx.fillStyle = `rgba(120,255,255,${pulse})`; glowCtx.fillRect(gx / 2 - 6, gy / 2 - 22, 12, 22); }
  }
}

// animated features: strips' chevrons, portals, faults, gates, decks
function drawFeatures(S, layer) {
  const A = S.A, n = A.n;
  if (layer === 'floor') {
    for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
      const i = y * n + x;
      if (A.mod[i] > 1 && ((x + y + Math.floor(G.t * 6)) % 3 === 0)) {
        const [cx, cy] = iso(x, y, 0);
        ctx.fillStyle = 'rgba(80,255,210,0.35)'; ctx.fillRect(cx - 3, cy - 1, 6, 2);
      }
      if (A.portal[i] >= 0) {
        const [cx, cy] = iso(x, y, 0);
        for (let k = 0; k < 3; k++) {
          const r = 6 + ((G.t * 10 + k * 5) % 15);
          ctx.strokeStyle = `rgba(200,140,255,${0.7 * (1 - r / 21)})`; ctx.beginPath(); ctx.ellipse(cx, cy, r, r / 2, 0, 0, TAU); ctx.stroke();
        }
        if (glowCtx) { glowCtx.fillStyle = 'rgba(190,120,255,0.8)'; glowCtx.beginPath(); glowCtx.ellipse(cx / 2, cy / 2, 8, 4, 0, 0, TAU); glowCtx.fill(); }
      }
    }
    for (const f of A.fault) {
      const x = f.i % n, y = Math.floor(f.i / n);
      const [cx, cy] = iso(x, y, 0);
      if (f.state === 'warn') {
        const a = 0.25 + 0.35 * (Math.sin(G.t * 30) > 0 ? 1 : 0);
        ctx.fillStyle = `rgba(255,80,60,${a})`; diamond(cx, cy, 1);
      } else if (f.state === 'gone') {
        ctx.fillStyle = '#000'; diamond(cx, cy, 0.96);
        ctx.fillStyle = 'rgba(255,80,60,0.25)'; ctx.fillRect(cx - HX + 2, cy, HX * 2 - 4, 1);
      }
    }
  }
  if (layer === 'deck') {
    for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
      const i = y * n + x;
      if (A.deck[i]) {
        const [cx, cy] = iso(x, y, 1);
        ctx.fillStyle = 'rgba(20,40,70,0.55)'; diamond(cx, cy, 1);
        ctx.strokeStyle = 'rgba(90,200,255,0.45)'; ctx.beginPath(); ctx.moveTo(cx - HX, cy); ctx.lineTo(cx, cy - HY); ctx.lineTo(cx + HX, cy); ctx.stroke();
        // edges that drop off get a side face
        if (!A.deck[i + 1]) { ctx.fillStyle = 'rgba(40,90,140,0.35)'; ctx.beginPath(); ctx.moveTo(cx + HX, cy); ctx.lineTo(cx, cy + HY); ctx.lineTo(cx, cy + HY + DECK_H); ctx.lineTo(cx + HX, cy + DECK_H); ctx.fill(); }
        if (!A.deck[i - n]) { ctx.fillStyle = 'rgba(30,70,120,0.35)'; ctx.beginPath(); ctx.moveTo(cx - HX, cy); ctx.lineTo(cx, cy + HY); ctx.lineTo(cx, cy + HY + DECK_H); ctx.lineTo(cx - HX, cy + DECK_H); ctx.fill(); }
      }
      if (A.ramp[i] >= 0) {
        const [cx, cy] = iso(x, y, 0.5);
        ctx.fillStyle = 'rgba(60,160,220,0.35)'; diamond(cx, cy, 1);
        for (let k = 0; k < 3; k++) { const u = ((G.t * 1.5 + k / 3) % 1); ctx.fillStyle = `rgba(140,230,255,${0.6 * (1 - u)})`; const [px, py] = iso(x + DX[A.ramp[i]] * (u - 0.5), y + DY[A.ramp[i]] * (u - 0.5), u); ctx.fillRect(px - 2, py - 1, 4, 2); }
      }
    }
    for (const gt of A.gates) {
      for (const i of gt.open === 'a' ? gt.b : gt.a) {
        const x = i % n, y = Math.floor(i / n);
        const [cx, cy] = iso(x, y, 0);
        ctx.fillStyle = 'rgba(255,200,60,0.55)'; ctx.fillRect(cx - 3, cy - 26, 6, 26);
        if (glowCtx) { glowCtx.fillStyle = 'rgba(255,190,40,0.9)'; glowCtx.fillRect(cx / 2 - 2, cy / 2 - 13, 4, 13); }
      }
    }
  }
}
function diamond(cx, cy, s) { ctx.beginPath(); ctx.moveTo(cx, cy - HY * s); ctx.lineTo(cx + HX * s, cy); ctx.lineTo(cx, cy + HY * s); ctx.lineTo(cx - HX * s, cy); ctx.closePath(); ctx.fill(); }

// ---------------------------------------------------------------- walls, bikes, pickups: depth-sorted
function collectWalls(S, list) {
  const n = S.A.n;
  for (let lv = 0; lv < 2; lv++) {
    const own = S.wallOwner[lv], stamp = S.wallStamp[lv];
    for (let i = 0; i < own.length; i++) {
      const o = own[i];
      if (o === -1 || !Sim.wallAlive(S, lv, i)) continue;
      const x = i % n, y = (i / n) | 0;
      if (o === -2) { list.push({ k: x - y + lv * 100, f: () => pillar(x, y) }); continue; }
      const b = S.bikes[o];
      const key = b ? bikeKey(b) : 'drone';
      const fade = b && !b.alive ? clamp(1 - (S.t - b.deadAt) / 0.6, 0, 1) : 1;
      const s = stamp[i];
      // connect to the previous cell of the same trail
      for (let d = 0; d < 4; d++) {
        const px = x + DX[d], py = y + DY[d];
        if (px < 0 || py < 0 || px >= n || py >= n) continue;
        const j = py * n + px;
        if (own[j] !== o) continue;
        const ds = s - stamp[j];
        if (ds > 0.5 && ds < 1.6 && Sim.wallAlive(S, lv, j)) {
          list.push({ k: (x + px) / 2 - (y + py) / 2 + lv * 100 - 0.02, f: () => wallSegment(px, py, x, y, lv, key, fade) });
        }
      }
    }
  }
  // the live head of each trail, from its last wall cell to the bike
  for (const b of S.bikes) {
    if (!b.alive || b.lastWall < 0 || b.rezT > 0) continue;
    const lx = b.lastWall % n, ly = (b.lastWall / n) | 0;
    if (!Sim.wallAlive(S, b.lastWallLevel, b.lastWall)) continue;
    const [px, py] = bikePos(b);
    const pts = [[lx, ly]];
    if (!b.laid && (lx !== b.x || ly !== b.y)) pts.push([b.x, b.y]);
    pts.push([px, py]);
    const key = bikeKey(b), lv = b.lastWallLevel;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      if (Math.abs(ax - bx) + Math.abs(ay - by) < 0.02) continue;
      list.push({ k: (ax + bx) / 2 - (ay + by) / 2 + lv * 100 - 0.02, f: () => wallSegment(ax, ay, bx, by, lv, key, 1) });
    }
  }
}
function pillar(x, y) {
  const [cx, cy] = iso(x, y, 0);
  const h = 34;
  ctx.fillStyle = 'rgba(255,60,90,0.35)'; ctx.fillRect(cx - 10, cy - h, 20, h);
  ctx.fillStyle = 'rgba(255,200,210,0.9)'; ctx.fillRect(cx - 10, cy - h, 20, 2);
  if (glowCtx) { glowCtx.fillStyle = 'rgba(255,50,90,0.8)'; glowCtx.fillRect(cx / 2 - 5, (cy - h) / 2, 10, h / 2); }
}
function drawBike(S, b) {
  const [px, py] = bikePos(b);
  const lv = bikeLevel(b);
  let [sx, sy] = iso(px, py, lv);
  const key = bikeKey(b);
  // the drawn heading eases round a turn over a few frames
  const target = b.d * 4;
  let a = G.angle[b.id];
  if (a == null) a = target;
  let diff = ((target - a + 24) % 16) - 8;
  a = (a + diff * Math.min(1, G.dt * 16) + 16) % 16;
  if (Math.abs(diff) < 0.05) a = target;
  G.angle[b.id] = a;
  const dir = Math.round(a) % 16;
  const leanI = b.leanT > 0 ? (b.lean < 0 ? 1 : 2) : 0;
  const spin = Math.floor(b.dist * 6) % 3;
  const family = b.kind === 'warden' && b.armour > 0 ? 'warden' : 'rider';
  // a pool of the bike's light on the floor
  const col = COL[key];
  ctx.fillStyle = css(col, 0.10); ctx.beginPath(); ctx.ellipse(sx, sy + 2, 30, 11, 0, 0, TAU); ctx.fill();
  if (glowCtx) { glowCtx.fillStyle = css(col, 0.12); glowCtx.beginPath(); glowCtx.ellipse(sx / 2, sy / 2 + 1, 14, 5, 0, 0, TAU); glowCtx.fill(); }
  const rez = b.rezT > 0 ? 1 - b.rezT / 0.6 : 1;
  if (rez < 1) {
    // rez in: a scan line sweeps up and leaves the bike behind it
    const s = G.M.sprites[`${family}_${String(dir).padStart(2, '0')}_0_0`];
    if (s) {
      const [sxa, sya, w, h, ox, oy] = s;
      const shown = Math.round(h * rez);
      ctx.drawImage(atlasFor(key), sxa, sya + h - shown, w, shown, Math.round(sx - ox), Math.round(sy - oy + h - shown), w, shown);
      rect(sx - ox - 4, sy - oy + h - shown, w + 8, 1, COL.white, 0.9);
    }
    return;
  }
  const flick = b.kind === 'glitch' && Math.sin(G.t * 40 + b.id) > 0.85;
  const shield = b.shield > 0;
  if (b.phase > 0 || flick) ctx.globalAlpha = 0.55;
  sprite(`${family}_${String(dir).padStart(2, '0')}_${leanI}_${spin}`, key, sx, sy, b.phase > 0 || flick ? 0.55 : 1, 0.45);
  ctx.globalAlpha = 1;
  if (shield) {
    const r = 26 + Math.sin(G.t * 10) * 1.5;
    ctx.strokeStyle = css(COL.shield, 0.55); ctx.beginPath(); ctx.ellipse(sx, sy - 12, r, r * 0.62, 0, 0, TAU); ctx.stroke();
    if (glowCtx) { glowCtx.strokeStyle = css(COL.shield, 0.8); glowCtx.beginPath(); glowCtx.ellipse(sx / 2, sy / 2 - 6, r / 2, r * 0.31, 0, 0, TAU); glowCtx.stroke(); }
  }
  if (b.sealed && b.kind !== 'player') {
    const u = (G.t * 3) % 1;
    ctx.strokeStyle = css(COL.gold, 0.8 * (1 - u)); ctx.beginPath(); ctx.ellipse(sx, sy, 14 + u * 30, (14 + u * 30) / 2, 0, 0, TAU); ctx.stroke();
  }
  // grind sparks
  if (b.grindSide && b.speed > 1) {
    const side = b.grindSide < 0 ? (b.d + 3) % 4 : (b.d + 1) % 4;
    const [gx, gy] = iso(px + DX[side] * 0.45, py + DY[side] * 0.45, lv);
    for (let k = 0; k < 2; k++) spark(gx, gy - 4, key);
  }
}
function drawCell(S, c) {
  const [sx, sy] = iso(c.x, c.y, 0);
  const f = Math.floor(G.t * 10 + c.x) % 8;
  const bob = Math.sin(G.t * 3 + c.x) * 2;
  ctx.fillStyle = css(COL[c.kind], 0.18); ctx.beginPath(); ctx.ellipse(sx, sy, 12, 5, 0, 0, TAU); ctx.fill();
  sprite(`cell_${String(f).padStart(2, '0')}`, c.kind, sx, sy + bob);
  text(c.kind[0].toUpperCase(), sx - 2, sy - 30 + bob, COL[c.kind]);
}
function drawPylon(S, py) {
  if (!py.alive) return;
  const [sx, sy] = iso(py.x, py.y, 0);
  sprite('pylon', 'boss', sx, sy);
  // the tether up to the Overseer
  const B = S.boss;
  if (B && !B.down) {
    const [bx, by] = iso(B.x, B.y, 0);
    const top = [sx, sy - 70], end = [bx, by - 88];
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
    // it falls and breaks: sink, flicker, flash
    ctx.globalAlpha = 1 - u;
    sprite(`boss_1_${String(Math.floor(G.t * 20) % 12).padStart(2, '0')}`, 'boss', sx + Math.sin(G.t * 60) * 3 * u, sy + u * 50, 1 - u);
    ctx.globalAlpha = 1;
    return;
  }
  // its shadow on the floor
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(sx, sy, 90, 38, 0, 0, TAU); ctx.fill();
  const charged = B.attacks.some(a => !a.fired) ? 1 : 0;
  const f = Math.floor(G.t * 6) % 12;
  const hover = Math.sin(G.t * 1.6) * 4;
  sprite(`boss_${charged}_${String(f).padStart(2, '0')}`, 'boss', sx, sy + hover);
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
        const [cx, cy] = iso(x, y, 0);
        ctx.fillStyle = live ? `rgba(255,230,240,${warnA})` : `rgba(255,50,90,${warnA})`;
        diamond(cx, cy, live ? 0.7 : 0.9);
        if (live && glowCtx) { glowCtx.fillStyle = 'rgba(255,60,110,0.9)'; glowCtx.fillRect(cx / 2 - 6, cy / 2 - 3, 12, 6); }
      }
    } else if (a.kind === 'drop' && !a.fired) {
      const u = clamp(a.t / a.warn, 0, 1);
      for (const i of a.cells) {
        const [cx, cy] = iso(i % n, (i / n) | 0, 0);
        ctx.fillStyle = `rgba(0,0,0,${0.3 + 0.4 * u})`; ctx.beginPath(); ctx.ellipse(cx, cy, 6 + 14 * u, (6 + 14 * u) / 2, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,60,90,${0.4 + 0.5 * u})`; ctx.stroke();
      }
    }
  }
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
    rect(p.x - G.cam.dx, p.y - G.cam.dy, p.size, p.size, p.col, a);
    if (glowCtx) { glowCtx.fillStyle = css(p.col, a); glowCtx.fillRect((p.x - G.cam.dx) / 2, (p.y - G.cam.dy) / 2, 1, 1); }
  }
  G.particles = G.particles.filter(p => p.t < p.life);
  for (const r of G.rings) {
    r.t += dt;
    const u = r.t / r.life; if (u >= 1) continue;
    const rr = r.r * easeOut(u);
    ctx.strokeStyle = css(r.col, 1 - u); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(r.x - G.cam.dx, r.y - G.cam.dy, rr, rr / 2, 0, 0, TAU); ctx.stroke(); ctx.lineWidth = 1;
    if (glowCtx) { glowCtx.strokeStyle = css(r.col, 1 - u); glowCtx.beginPath(); glowCtx.ellipse((r.x - G.cam.dx) / 2, (r.y - G.cam.dy) / 2, rr / 2, rr / 4, 0, 0, TAU); glowCtx.stroke(); }
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
    sprite(`derez_${String(z.dir).padStart(2, '0')}_${String(f).padStart(2, '0')}`, z.key, sx, sy);
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
  ctx.globalAlpha = 0.32 * strength; ctx.drawImage(glow, 0, 0, LW, LH);
  ctx.globalAlpha = 0.42 * strength; ctx.drawImage(bloom2, 0, 0, LW, LH);
  ctx.globalAlpha = 0.5 * strength; ctx.drawImage(bloom3, 0, 0, LW, LH);
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
}

// ---------------------------------------------------------------- the scene
function updateCamera(S, dt, lead) {
  const P = Sim.player(S);
  let tx, ty;
  if (G.camTarget) [tx, ty] = G.camTarget;
  else {
    const [px, py] = P.alive ? bikePos(P) : [G.lastPX || S.A.n / 2, G.lastPY || S.A.n / 2];
    if (P.alive) { G.lastPX = px; G.lastPY = py; }
    const la = lead == null ? 1.4 : lead;
    const lx = px + DX[P.d] * la, ly = py + DY[P.d] * la;
    tx = (lx + ly) * HX; ty = (lx - ly) * HY - 16;
  }
  G.cam.fx = G.cam.fx == null ? tx : lerp(G.cam.fx, tx, Math.min(1, dt * 4));
  G.cam.fy = G.cam.fy == null ? ty : lerp(G.cam.fy, ty, Math.min(1, dt * 4));
  G.cam.shake = Math.max(0, G.cam.shake - dt * 18);
  const sh = G.cam.shake;
  const nx = Math.round(G.cam.fx + (Math.random() - 0.5) * sh), ny = Math.round(G.cam.fy + (Math.random() - 0.5) * sh);
  G.cam.dx = nx - G.cam.x; G.cam.dy = ny - G.cam.y;
  G.cam.x = nx; G.cam.y = ny;
}
function drawScene(S, dt, opts) {
  opts = opts || {};
  setupGlow();
  rect(0, 0, LW, LH, [3, 4, 11]);
  // stars far below the grid
  for (let i = 0; i < 70; i++) {
    const x = (hash(i, 1) * 900 - G.cam.x * 0.15) % LW, y = (hash(i, 2) * 700 - G.cam.y * 0.15) % LH;
    rect((x + LW) % LW, (y + LH) % LH, 1, 1, [120, 170, 230], 0.25 + 0.5 * hash(i, 3));
  }
  const key = `${S.run.seed}_${S.sector}`;
  if (G.floorKey !== key) { buildFloor(S); G.floorKey = key; }
  drawFloor(S);
  drawRim(S, false);
  drawFeatures(S, 'floor');
  drawAttacks(S);
  const list = [];
  collectWalls(S, list);
  for (const b of S.bikes) if (b.alive) { const [px, py] = bikePos(b); list.push({ k: px - py + bikeLevel(b) * 100 + 0.05, f: () => drawBike(S, b) }); }
  for (const c of S.cells) list.push({ k: c.x - c.y + 0.03, f: () => drawCell(S, c) });
  for (const py of S.A.pylons) list.push({ k: py.x - py.y + 0.04, f: () => drawPylon(S, py) });
  list.sort((a, b) => a.k - b.k);
  let deckDrawn = false;
  for (const it of list) {
    if (!deckDrawn && it.k >= 50) { drawFeatures(S, 'deck'); deckDrawn = true; }
    it.f();
  }
  if (!deckDrawn) drawFeatures(S, 'deck');
  drawDerezzes(S);
  drawRim(S, true);
  drawBoss(S);
  drawParticles(dt);
  applyBloom(opts.bloom == null ? 1 : opts.bloom);
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
  const [px, py] = bikePos(P);
  const [sx, sy] = iso(px, py, bikeLevel(P));
  // steer keys sit to the bike's left and right, in the direction a turn would go
  const L = (P.d + 3) % 4, R = (P.d + 1) % 4;
  const [lx, ly] = iso(px + DX[L] * 1.5, py + DY[L] * 1.5, bikeLevel(P));
  const [rx, ry] = iso(px + DX[R] * 1.5, py + DY[R] * 1.5, bikeLevel(P));
  const pendL = P.queue[0] === 'L', pendR = P.queue[0] === 'R';
  keycap(lx, ly - 22, ty.L, pendL, COL.player, ty.lT);
  keycap(rx, ry - 22, ty.R, pendR, COL.player, ty.rT);
  chevron(lx, ly - 6, L); chevron(rx, ry - 6, R);
  // the word rides above the bike
  const w = ty.word, total = textW(w, 2) + 14;
  const wx = Math.round(clamp(sx - total / 2, 4, LW - total - 4)), wy = Math.round(clamp(sy - 82, 24, LH - 60));
  const gold = ty.ability;
  panel(wx, wy, total, 24, 0.92, gold ? COL.gold : COL.player);
  let pen = wx + 7;
  const shake = G.t - (G.typoT || -9) < 0.15 ? Math.round(Math.sin(G.t * 90) * 2) : 0;
  for (let i = 0; i < w.length; i++) {
    const c = i < ty.typed ? (gold ? COL.gold : COL.player) : i === ty.typed ? COL.white : COL.dim;
    if (i === ty.typed) rect(pen, wy + 20, textW(w[i], 2) - 2, 2, G.t - (G.typoT || -9) < 0.25 ? COL.red : COL.white);
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
      case 'count': SND('count'); toast(String(e.n), { dur: 0.9, scale: 5, y: 120, col: COL.player }); break;
      case 'go': SND('go'); toast('GO', { dur: 0.7, scale: 5, y: 120, col: COL.white }); if (S.A.boss) MUS.play('boss', { now: true, fade: 0.2 }); else MUS.play(S.sector % 2 ? 'sector' : 'sector2', { now: true, fade: 0.2 }); break;
      case 'turn': if (e.bike === 0) SND('turn', { vol: 0.5 }); break;
      case 'word': {
        SND('word_pulse', { vol: 0.35 });
        const [x, y] = iso(...bikePos(P), bikeLevel(P));
        ring(x + G.cam.x, y + G.cam.y, e.ability ? 'gold' : 'player', 26, 0.35);
        break;
      }
      case 'streak': Audio.sting('streak'); toast('STREAK ' + e.streak, { dur: 1.0, scale: 2, y: 64, col: COL.gold }); break;
      case 'typo': {
        G.typoT = G.t;
        if (e.free) { toast('CLEAN CODE', { dur: 0.8, scale: 1, y: 60, col: COL.player }); break; }
        SND('wall_cut', { delay: AFTER_KEY, vol: 0.5 }); SND('sputter', { delay: AFTER_KEY + 0.05, vol: 0.35 });
        const [x, y] = iso(...bikePos(P), bikeLevel(P));
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
  G.angle = {}; G.particles = []; G.rings = []; derezzes.length = 0; G.cam.fx = null; G.camTarget = null; G.floorKey = '';
  setMode('play');
  MUS.play('boot', { now: true, fade: 0.3 });
  toast(G.S.A.boss ? 'OVERSEER' : 'SECTOR ' + String(G.S.sector).padStart(2, '0'), { dur: 2.6, scale: 3, y: 70, col: G.S.A.boss ? COL.boss : COL.player, sub: sectorHint(G.S) });
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
  updateCamera(S, dt);
  drawScene(S, dt);
  drawLances();
  drawTyping(S);
  drawHud(S);
  drawToasts();
  if (S.countdown > 0 && S.countdown < 3.2) textC('steer keys pick your line', LW / 2, LH - 58, COL.white, 2, 0.9);
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
    ['BOSS', 'circle its pylons'],
  ];
  rows.forEach(([a, b], i) => { textR(a, 128, 54 + i * 34, COL.player, 2); text(b, 140, 54 + i * 34, COL.white, 2); });
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
  if (!showWatch) showWatch = setInterval(() => { if (performance.now() - showLast > 250) { if (MUS.current === 'intro') MUS.stop(0.3); clearInterval(showWatch); showWatch = null; } }, 100);
}
if (typeof window !== 'undefined') {
  window.addEventListener('typemaxx:showcase', e => { if (e.detail === 'vector' || G.active) return; if (MUS.current === 'intro') MUS.stop(0.3); });
}
function drawShowcase(t, dt) {
  const lt = ((t % SHOW_LOOP) + SHOW_LOOP) % SHOW_LOOP;
  // restart the match at each loop so the trailer repeats
  if (!showSim || lt < showT - 1) { showSim = demoSector(23); for (let k = 0; k < 90; k++) { stepDemo(showSim, 1 / 30); } }
  showT = lt;
  stepDemo(showSim, dt);
  const S = showSim;
  const shot = Math.min(4, Math.floor(lt / 2));
  const alive = S.bikes.filter(b => b.alive);
  const focus = alive.length ? alive[shot % alive.length] : S.bikes[0];
  const [fx, fy] = bikePos(focus);
  const lx = fx + DX[focus.d] * 1.2, ly = fy + DY[focus.d] * 1.2;
  G.camTarget = [(lx + ly) * HX, (lx - ly) * HY - 14];   // the rider sits just below centre: the clear band under the logo
  if (lt % 2 < dt * 1.5 || G.cam.fx == null) { G.cam.fx = G.camTarget[0]; G.cam.fy = G.camTarget[1]; }
  updateCamera(S, dt);
  drawScene(S, dt);
  if (lt % 2 < 0.1 && lt > 1) rect(0, 0, LW, LH, COL.white, 0.5 * (1 - (lt % 2) / 0.1));
  if (t < SHOW_INTRO) {
    // the intro: the grid draws itself outward from a point of light
    const u = t / SHOW_INTRO;
    const r = easeOut(clamp(u * 1.2, 0, 1)) * 420;
    ctx.save();
    ctx.fillStyle = '#03040b';
    ctx.beginPath(); ctx.rect(0, 0, LW, LH); ctx.ellipse(LW / 2, LH / 2 + 10, r, r * 0.5, 0, 0, TAU); ctx.fill('evenodd');
    ctx.restore();
    const core = clamp(1 - u * 1.5, 0, 1);
    rect(LW / 2 - 60 * (1 - core), LH / 2 + 10, 120 * (1 - core) + 2, 1, COL.player, core + 0.2);
  }
}
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
    if (typeof window !== 'undefined' && window.TYPEMAXX) window.TYPEMAXX.pixel = null;
    Audio.pause(false);
    Audio.stopAll(0.6);
  },
  draw(g, W, H, seconds, now, input) {
    if (typeof window !== 'undefined' && window.TYPEMAXX) {
      const p = window.TYPEMAXX.pixel;
      if (!p || p.width !== LW || p.height !== LH) window.TYPEMAXX.pixel = { width: LW, height: LH };
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
