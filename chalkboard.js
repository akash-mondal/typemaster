/*
 * chalkboard.js - the classroom chalkboard the lobby turns to for leaderboards.
 *
 * A built model, not a picture: a green slate in a wooden frame, a chalk tray with
 * sticks and a felt eraser, lit by its own spot so it reads the same in every room.
 *
 * Whatever a painter draws is turned into chalk before it reaches the slate: the
 * strokes are broken up by a grain mask, dragged with dry streaks, and given a
 * faint dust halo. So a painter just draws text and lines in chalk colours.
 *
 *   const cb = createChalkboard(THREE)
 *   scene.add(cb.group)
 *   cb.paint(painter, seconds)   painter(ctx, W, H, seconds, chalk)
 *   cb.size                      { width, height } of the whole model in its own units
 */

import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TW = 2048, TH = 1024;                 // slate texture
const SLATE_W = 2.2, SLATE_H = 1.1;         // slate, model units (2:1 like the texture)
const FRAME = 0.075, FRAME_D = 0.07;

export const CHALK = {
  white: 'rgba(246,244,236,0.94)',
  dim: 'rgba(236,236,226,0.58)',
  yellow: 'rgba(250,228,128,0.95)',
  pink: 'rgba(246,170,190,0.95)',
  blue: 'rgba(160,210,246,0.95)',
};
export const CHALK_FONTS = {
  display: '"TMX Chalk Display", "Fredericka the Great", cursive',
  hand: '"TMX Chalk Hand", "Patrick Hand", "Comic Sans MS", cursive',
};

let fontsLoading = null;
function loadFonts() {
  if (fontsLoading) return fontsLoading;
  const faces = [
    ['TMX Chalk Display', 'FrederickatheGreat-Regular.woff2'],
    ['TMX Chalk Hand', 'PatrickHand-Regular.woff2'],
  ].map(([family, file]) => {
    const url = new URL('./assets/lobby/fonts/' + file, import.meta.url).href;
    const f = new FontFace(family, `url(${url})`);
    document.fonts.add(f);
    return f.load().catch(e => console.warn('chalk font', file, e));
  });
  fontsLoading = Promise.all(faces);
  return fontsLoading;
}

// seeded, so the slate's smudges are the same on every visit
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createChalkboard(THREE) {
  const R = rng(20260914);
  const edgeMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const group = new THREE.Group();
  group.name = 'chalkboard';

  // ---------------------------------------------------------------- slate
  const slateBase = document.createElement('canvas');
  slateBase.width = TW; slateBase.height = TH;
  paintSlate(slateBase.getContext('2d'), R);

  const slate = document.createElement('canvas');
  slate.width = TW; slate.height = TH;
  const slateTex = new THREE.CanvasTexture(slate);
  slateTex.colorSpace = THREE.SRGBColorSpace;
  slateTex.anisotropy = 8;

  const bump = new THREE.CanvasTexture(noiseCanvas(256, R, 60, 196));
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(8, 4);

  const slateMat = new THREE.MeshStandardMaterial({
    map: slateTex, roughness: 0.92, metalness: 0, bumpMap: bump, bumpScale: 0.6,
  });
  const slateMesh = new THREE.Mesh(new THREE.BoxGeometry(SLATE_W, SLATE_H, 0.02), [
    edgeMat(0x1d2b22), edgeMat(0x1d2b22), edgeMat(0x1d2b22), edgeMat(0x1d2b22), slateMat, edgeMat(0x1d2b22),
  ]);
  slateMesh.receiveShadow = true;
  group.add(slateMesh);

  // a thin backing so the frame reads as a solid object from any angle
  const back = new THREE.Mesh(new THREE.BoxGeometry(SLATE_W + FRAME, SLATE_H + FRAME, 0.02), edgeMat(0x3b2716));
  back.position.z = -0.03;
  group.add(back);

  // ---------------------------------------------------------------- frame
  const woodH = woodTexture(THREE, R, false), woodV = woodTexture(THREE, R, true);
  const wood = t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0 });
  const matH = wood(woodH), matV = wood(woodV);
  const fw = SLATE_W + FRAME * 2, fh = SLATE_H + FRAME * 2;
  const bar = (w, h, mat, x, y) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, FRAME_D, 3, 0.012), mat);
    m.position.set(x, y, 0.012);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  };
  bar(fw, FRAME, matH, 0, SLATE_H / 2 + FRAME / 2);
  bar(fw, FRAME, matH, 0, -SLATE_H / 2 - FRAME / 2);
  bar(FRAME, SLATE_H, matV, -SLATE_W / 2 - FRAME / 2, 0);
  bar(FRAME, SLATE_H, matV, SLATE_W / 2 + FRAME / 2, 0);

  // ---------------------------------------------------------------- tray, chalk, eraser
  const trayY = -SLATE_H / 2 - FRAME - 0.012;
  const tray = new THREE.Mesh(new RoundedBoxGeometry(fw * 0.94, 0.024, 0.13, 2, 0.008), matH);
  tray.position.set(0, trayY, 0.07);
  tray.castShadow = true; tray.receiveShadow = true;
  group.add(tray);
  const lip = new THREE.Mesh(new RoundedBoxGeometry(fw * 0.94, 0.02, 0.012, 2, 0.004), matH);
  lip.position.set(0, trayY + 0.012, 0.134);
  group.add(lip);
  // chalk dust along the tray
  const dust = new THREE.Mesh(new THREE.PlaneGeometry(fw * 0.9, 0.11), new THREE.MeshStandardMaterial({
    map: dustTexture(THREE, R), transparent: true, depthWrite: false, roughness: 1,
  }));
  dust.rotation.x = -Math.PI / 2;
  dust.position.set(0, trayY + 0.0125, 0.066);
  group.add(dust);

  const chalkMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0 });
  const sticks = [
    [0xF4F2EA, 0.10, 0.52, 0.0, 0.02],
    [0xF6E07A, 0.075, 0.63, 0.35, 0.05],
    [0xF3A9BC, 0.09, 0.40, -0.25, 0.085],
    [0xF4F2EA, 0.045, 0.70, 0.9, 0.045],
  ];
  for (const [c, len, x, yaw, z] of sticks) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, len, 14), chalkMat(c));
    s.rotation.set(0, yaw, Math.PI / 2);
    s.position.set(x, trayY + 0.012 + 0.0115, z);
    s.castShadow = true;
    group.add(s);
  }
  const eraser = new THREE.Group();
  const eBody = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.03, 0.07, 2, 0.008),
    new THREE.MeshStandardMaterial({ color: 0xA8763F, roughness: 0.6 }));
  const felt = new THREE.Mesh(new THREE.BoxGeometry(0.184, 0.016, 0.064),
    new THREE.MeshStandardMaterial({ color: 0x8E8E8A, roughness: 1 }));
  felt.position.y = -0.022;
  eraser.add(eBody, felt);
  eraser.position.set(-0.62, trayY + 0.012 + 0.03, 0.06);
  eraser.rotation.y = 0.12;
  eraser.traverse(o => { if (o.isMesh) o.castShadow = true; });
  group.add(eraser);

  // ---------------------------------------------------------------- light
  // Its own key light from above and in front, like a classroom ceiling light,
  // so the wood and chalk read the same whatever room the engine is showing.
  const key = new THREE.SpotLight(0xFFF4E2, 0, 0, 0.62, 0.75, 0);
  key.position.set(-0.4, 1.5, 2.4);
  key.target.position.set(0, -0.1, 0);
  group.add(key, key.target);
  const fill = new THREE.HemisphereLight(0xF2F6FF, 0x5A4A3A, 0);
  group.add(fill);

  // ---------------------------------------------------------------- chalk rendering
  const layer = document.createElement('canvas');
  layer.width = TW; layer.height = TH;
  const grain = grainCanvas(R);
  const work = document.createElement('canvas');
  work.width = TW; work.height = TH;

  function paint(painter, seconds) {
    const L = layer.getContext('2d');
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.clearRect(0, 0, TW, TH);
    L.save();
    try { painter(L, TW, TH, seconds || 0, chalkHelpers(L, rng(7))); }
    catch (e) { console.error('chalkboard painter:', e); }
    L.restore();

    const S = slate.getContext('2d');
    S.globalCompositeOperation = 'source-over';
    S.globalAlpha = 1;
    S.drawImage(slateBase, 0, 0);
    // dust halo: the chalk's own powder, smeared a little around every stroke
    S.save();
    S.filter = 'blur(5px)';
    S.globalAlpha = 0.22;
    S.drawImage(layer, 0, 0);
    S.restore();
    // the strokes, broken up by the grain
    const W = work.getContext('2d');
    W.globalCompositeOperation = 'source-over';
    W.clearRect(0, 0, TW, TH);
    W.drawImage(layer, 0, 0);
    W.globalCompositeOperation = 'destination-in';
    W.drawImage(grain, 0, 0);
    W.globalCompositeOperation = 'source-over';
    S.drawImage(work, 0, 0);
    slateTex.needsUpdate = true;
  }

  function setLit(on) {
    key.intensity = on ? 2.6 : 0;
    fill.intensity = on ? 0.55 : 0;
  }

  return {
    group, paint, setLit,
    fontsReady: loadFonts(),
    size: { width: fw, height: fh + 0.06, centreY: -0.03 },
  };
}

// ------------------------------------------------------------------ helpers


function chalkHelpers(g, R) {
  return {
    colours: CHALK,
    fonts: CHALK_FONTS,
    font(kind, px) { g.font = `${px}px ${CHALK_FONTS[kind] || CHALK_FONTS.hand}`; },
    // a hand-drawn line: slight wobble, doubled like a chalk stroke laid twice
    line(x0, y0, x1, y1, width = 5, colour = CHALK.white) {
      g.save();
      g.strokeStyle = colour; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 40));
        const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
        g.beginPath();
        for (let i = 0; i <= n; i++) {
          const t = i / n, j = (R() - 0.5) * width * 0.5 + (pass ? width * 0.25 : 0);
          const x = x0 + (x1 - x0) * t + nx / nl * j, y = y0 + (y1 - y0) * t + ny / nl * j;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.globalAlpha = pass ? 0.55 : 1;
        g.stroke();
      }
      g.restore();
    },
    // a loose hand-drawn ellipse, not quite closed
    ring(cx, cy, rx, ry, width = 5, colour = CHALK.white) {
      g.save();
      g.strokeStyle = colour; g.lineWidth = width; g.lineCap = 'round';
      g.beginPath();
      const start = -0.4, end = Math.PI * 2 + 0.25;
      for (let a = start, i = 0; a <= end; a += 0.12, i++) {
        const w = 1 + (R() - 0.5) * 0.04;
        const x = cx + Math.cos(a) * rx * w, y = cy + Math.sin(a) * ry * w + (a - start) * 1.2;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      g.restore();
    },
    text(str, x, y, colour = CHALK.white) {
      g.save();
      g.fillStyle = colour;
      g.fillText(str, x, y);
      g.restore();
    },
  };
}

function paintSlate(g, R) {
  // the board green, a touch warmer at the top where the light falls
  const base = g.createLinearGradient(0, 0, 0, TH);
  base.addColorStop(0, '#355445');
  base.addColorStop(1, '#2A4538');
  g.fillStyle = base;
  g.fillRect(0, 0, TW, TH);
  // uneven wear
  for (let i = 0; i < 26; i++) {
    const x = R() * TW, y = R() * TH, r = 120 + R() * 380;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const light = R() > 0.45;
    gr.addColorStop(0, light ? 'rgba(190,210,196,0.07)' : 'rgba(10,24,16,0.10)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // eraser swipes: broad arcs of leftover dust
  g.lineCap = 'round';
  g.save();
  g.filter = 'blur(22px)';
  for (let i = 0; i < 16; i++) {
    const x = R() * TW, y = R() * TH, len = 260 + R() * 560, h = 40 + R() * 60;
    g.strokeStyle = `rgba(222,232,224,${0.012 + R() * 0.02})`;
    g.lineWidth = h;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + len * 0.3, y - 40 + R() * 80, x + len * 0.7, y - 40 + R() * 80, x + len, y + (R() - 0.5) * 60);
    g.stroke();
  }
  g.restore();
  // ghosts of old lessons, almost wiped away
  g.strokeStyle = 'rgba(230,236,230,0.035)';
  g.lineWidth = 4;
  for (let i = 0; i < 70; i++) {
    const x = R() * TW, y = R() * TH;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) g.lineTo(x + k * 14 + R() * 10, y + (R() - 0.5) * 26);
    g.stroke();
  }
  // fine surface grain
  const img = g.getImageData(0, 0, TW, TH), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 12;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// alpha mask for chalk: mostly solid, pitted with gaps, dragged in streaks
function grainCanvas(R) {
  const c = document.createElement('canvas');
  c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  const img = g.createImageData(TW, TH), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = R();
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = r < 0.2 ? r * 500 : 190 + R() * 65;
  }
  g.putImageData(img, 0, 0);
  // dry drag: thin slanted streaks where the stick skipped
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 5200; i++) {
    const x = R() * TW, y = R() * TH, len = 6 + R() * 22;
    g.strokeStyle = `rgba(0,0,0,${0.25 + R() * 0.55})`;
    g.lineWidth = 0.8 + R() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y - len * 0.35);
    g.stroke();
  }
  return c;
}

function noiseCanvas(size, R, lo, hi) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = lo + R() * (hi - lo);
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function woodTexture(THREE, R, vertical) {
  const w = 1024, h = 96;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#9A6634'); base.addColorStop(0.5, '#86552A'); base.addColorStop(1, '#6E4420');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  // long grain
  for (let i = 0; i < 90; i++) {
    const y = R() * h, amp = 1 + R() * 4, freq = 0.004 + R() * 0.01, ph = R() * 10;
    g.strokeStyle = R() > 0.5 ? `rgba(60,34,14,${0.12 + R() * 0.25})` : `rgba(190,140,90,${0.06 + R() * 0.12})`;
    g.lineWidth = 0.6 + R() * 1.8;
    g.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const yy = y + Math.sin(x * freq + ph) * amp;
      x ? g.lineTo(x, yy) : g.moveTo(x, yy);
    }
    g.stroke();
  }
  // a couple of knots
  for (let i = 0; i < 3; i++) {
    const x = R() * w, y = h * (0.3 + R() * 0.4);
    for (let r = 14; r > 2; r -= 3) {
      g.strokeStyle = `rgba(50,28,10,${0.18 + (14 - r) * 0.03})`;
      g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(x, y, r * 2.2, r * 0.6, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (vertical) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
  return t;
}

function dustTexture(THREE, R) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 900; i++) {
    const x = R() * 1024, y = 8 + R() * 48, r = 0.6 + R() * 2.4;
    g.fillStyle = `rgba(240,240,232,${0.05 + R() * 0.25})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 8; i++) {
    const x = R() * 1024, y = 32, r = 30 + R() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(236,236,228,0.22)'); gr.addColorStop(1, 'rgba(236,236,228,0)');
    g.fillStyle = gr; g.fillRect(x - r, 0, r * 2, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
