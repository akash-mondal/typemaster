/*
 * lobby.js - the TYPEMAXX lobby layer.
 *
 * Presentation only. The page decides WHEN things show and WHAT login does;
 * this module draws them and reports what the player clicked.
 *
 *   window.TYPEMAXX_LOBBY
 *     .showLogin(bool)            the floating 3D Commonsmade logo with LOGIN above
 *     .setBoard({ title, body, primary, secondary })   copy for the login board
 *     .openBoard() / .closeBoard()
 *     .setUser(user | null)       { name, handle, avatar } - top-right badge, and
 *                                 the GLOBAL LEADERBOARDS tab on the right edge
 *     .view('home' | 'leaderboard')   turns the camera to the leaderboard board
 *     .setLeaderboardPainter(fn)  fn(ctx, W, H, seconds) paints that board
 *     .on(event, fn)              'login' | 'dismiss' | 'signout' | 'view'
 *     .suspend(bool)              true when a game starts, false when it ends
 *     .busy()                     true while a board or the leaderboard owns input;
 *                                 the page should ignore Escape and menu keys then
 *
 * The logo is the real artwork: its alpha edge traced at sub-pixel accuracy
 * (tools/logo/trace.py) and extruded with a small bevel, so the silhouette is
 * exact and there is no backing plate.
 */

const LOGO_OUTLINE = [[-0.49547,0.30933],[-0.4862,0.31112],[0.21116,0.31068],[0.27952,0.30645],[0.31143,0.30132],[0.3251,0.29725],[0.35245,0.28326],[0.37524,0.26649],[0.39347,0.24821],[0.40866,0.22729],[0.42153,0.19994],[0.42604,0.18627],[0.43119,0.16348],[0.43986,0.09055],[0.44197,0.05865],[0.44452,0.04497],[0.46184,0.02945],[0.49375,0.00911],[0.49948,0.00395],[0.5,-0.00061],[0.48919,-0.01124],[0.44817,-0.03859],[0.44293,-0.04619],[0.43955,-0.09177],[0.43049,-0.16469],[0.4212,-0.20116],[0.41626,-0.21407],[0.40406,-0.23762],[0.39419,-0.25129],[0.3798,-0.26526],[0.36613,-0.27566],[0.34334,-0.28909],[0.32055,-0.29859],[0.30231,-0.30359],[0.27497,-0.30811],[0.22939,-0.3107],[0.16102,-0.30924],[-0.03041,-0.31143],[-0.17171,-0.30976],[-0.43607,-0.3092],[-0.49076,-0.30838],[-0.49532,-0.30688],[-0.49862,-0.30143],[-0.49822,-0.29687],[-0.49532,-0.29309],[-0.46341,-0.27812],[-0.38137,-0.25198],[-0.24008,-0.19982],[-0.15348,-0.1715],[-0.04409,-0.13364],[0.06986,-0.0913],[0.10632,-0.07955],[0.11482,-0.07353],[0.10632,-0.07213],[0.07442,-0.07583],[0.01517,-0.07714],[-0.00762,-0.07986],[-0.23552,-0.09044],[-0.44063,-0.10285],[-0.4862,-0.10351],[-0.49532,-0.1024],[-0.49832,-0.09632],[-0.49856,-0.09177],[-0.49851,0.02674],[-0.5,0.09511],[-0.49899,0.09967],[-0.49532,0.10273],[-0.4862,0.10406],[-0.3996,0.09842],[-0.32668,0.09625],[-0.23096,0.08967],[-0.18082,0.08786],[0.03796,0.07543],[0.10177,0.07322],[0.10632,0.07477],[0.10745,0.07688],[0.09265,0.08415],[0.04707,0.10124],[-0.27654,0.21242],[-0.2811,0.21502],[-0.42695,0.26741],[-0.49076,0.29359],[-0.49827,0.30021],[-0.49881,0.30477]];
const LOGO_ASPECT = 0.62285;

import { createChalkboard } from './chalkboard.js';

const VERSION = '1.30.2';
const CREAM = 0xF3EEDD, CREAM_SIDE = 0xC9BFA4;
const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const FONT = '"Inter","SF Pro Display",system-ui,-apple-system,"Segoe UI",sans-serif';

export function createLobby({ THREE, scene, camera, renderer, controls, ground }) {
  if (!camera.parent) scene.add(camera);        // camera children render only in the graph

  const listeners = { login: [], dismiss: [], signout: [], view: [] };
  const emit = (ev, arg) => (listeners[ev] || []).forEach(fn => { try { fn(arg); } catch (e) { console.error(e); } });

  // ---------------------------------------------------------------- the logo
  const logoPath = (() => {
    const s = new THREE.Shape();
    LOGO_OUTLINE.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
    s.closePath();
    return s;
  })();
  const DEPTH = 0.16;
  const logoGeo = new THREE.ExtrudeGeometry(logoPath, {
    depth: DEPTH, bevelEnabled: true, bevelThickness: 0.028, bevelSize: 0.010,
    bevelSegments: 4, curveSegments: 8,
  });
  logoGeo.translate(0, 0, -DEPTH / 2);
  logoGeo.computeBoundingBox();
  logoGeo.translate(0, -logoGeo.boundingBox.min.y, 0);   // stands on its lowest point
  logoGeo.computeVertexNormals();
  const LOGO_H = LOGO_ASPECT + 0.02;                        // height per unit of width, bevel included
  const logoFace = new THREE.MeshPhysicalMaterial({
    color: CREAM, roughness: 0.32, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.25,
    emissive: new THREE.Color(CREAM), emissiveIntensity: 0.06,
  });
  const logoSide = new THREE.MeshPhysicalMaterial({
    color: CREAM_SIDE, roughness: 0.45, metalness: 0.0, clearcoat: 0.3,
  });
  const logoMesh = new THREE.Mesh(logoGeo, [logoFace, logoSide]);
  logoMesh.name = 'commons-logo';
  logoMesh.castShadow = true;

  const logoPivot = new THREE.Group();       // appear and hover scale, from the ground up
  logoPivot.add(logoMesh);
  const logoRig = new THREE.Group();         // stands on the floor beside the keyboard
  logoRig.add(logoPivot);
  logoRig.visible = false;
  scene.add(logoRig);


  // the LOGIN label, a crisp canvas texture above the mark
  const label = textPlane('LOGIN', { size: 132, weight: 800, spacing: 0.34, colour: '#F3EEDD', shadow: 'rgba(10,12,18,0.55)' });
  logoRig.add(label.mesh);

  const logo = { shown: false, t: 0, hover: 0, want: 0, appear: 0, spin: 1 };
  // A still, invisible box around mark and label answers the pointer, so hover
  // doesn't flicker off while the mark turns edge-on during its hover spin.
  const hitBox = new THREE.Mesh(new THREE.BoxGeometry(1.15, LOGO_H + 0.6, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  hitBox.position.y = (LOGO_H + 0.6) / 2;
  logoRig.add(hitBox);

  // The mark must read on whatever is behind it: the engine's rooms run from a
  // black wall to a near-white one, and a cream logo on a white wall is invisible.
  // afterRender() samples the frame around the mark a couple of times a second
  // and eases between a cream mark (dark backdrop) and an ink one (light backdrop).
  const TONE = {
    face: [new THREE.Color(CREAM), new THREE.Color(0x16191F)],
    side: [new THREE.Color(CREAM_SIDE), new THREE.Color(0x3A3F4A)],
    label: [new THREE.Color(0xFFFFFF), new THREE.Color(0x1E2229)],
  };
  let tone = 0, toneWant = 0, lastSample = -1, lastLum = null;
  const _px = new Uint8Array(4), _p3 = new THREE.Vector3(), _p4 = new THREE.Vector3();
  function applyTone() {
    logoFace.color.copy(TONE.face[0]).lerp(TONE.face[1], tone);
    logoFace.emissive.copy(logoFace.color);
    logoSide.color.copy(TONE.side[0]).lerp(TONE.side[1], tone);
    label.mesh.material.color.copy(TONE.label[0]).lerp(TONE.label[1], tone);
  }
  let pageLum = null, pageLumAt = -10;
  function pageBackdrop() {
    if (seconds - pageLumAt < 3 && pageLum !== null) return pageLum;
    pageLumAt = seconds; pageLum = 0;
    for (let el = renderer.domElement; el; el = el.parentElement) {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (m && (m[3] === undefined || +m[3] > 0.5)) {
        pageLum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
        break;
      }
    }
    return pageLum;
  }
  function sampleBackdrop() {
    const gl = renderer.getContext();
    // centre of the mark, and its on-screen half width, then points just outside it
    _p3.set(0, place.w * LOGO_H * 0.5, 0); logoRig.localToWorld(_p3).project(camera);
    const cx = (_p3.x * 0.5 + 0.5) * gl.drawingBufferWidth;
    const cy = (_p3.y * 0.5 + 0.5) * gl.drawingBufferHeight;
    _p4.set(place.w * 0.5, place.w * LOGO_H * 0.5, 0); logoRig.localToWorld(_p4).project(camera);
    const r = Math.max(6, Math.abs(_p4.x - _p3.x) * 0.5 * gl.drawingBufferWidth);
    const pts = [[-1.3, 0], [1.3, 0], [0, -1.1], [-1, 1.2], [1, 1.2], [-1, -1], [1, -1]];
    let sum = 0, n = 0;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(null);
    for (const [dx, dy] of pts) {
      const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r);
      if (x < 0 || y < 0 || x >= gl.drawingBufferWidth || y >= gl.drawingBufferHeight) continue;
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px);
      // a transparent canvas shows the page behind it, so blend with that colour
      const a = _px[3] / 255, bg = pageBackdrop();
      const lum = (0.2126 * _px[0] + 0.7152 * _px[1] + 0.0722 * _px[2]) / 255;
      sum += lum * a + bg * (1 - a); n++;
    }
    renderer.setRenderTarget(prev);
    if (n) {
      const lum = sum / n;
      // hysteresis, so a mid-grey wall doesn't flicker between the two
      lastLum = lum;
      if (lum > 0.58) toneWant = 1; else if (lum < 0.42) toneWant = 0;
    }
  }

  // ---------------------------------------------------------------- the board
  const boardRig = new THREE.Group();
  boardRig.visible = false;
  camera.add(boardRig);
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: 0x05070C, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  dim.renderOrder = 990;
  boardRig.add(dim);

  const BW = 1280, BH = 720;
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = BW; boardCanvas.height = BH;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 8;
  const boardGroup = new THREE.Group();
  boardRig.add(boardGroup);
  const boardShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(0,0,0,0.55)'), transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  boardShadow.renderOrder = 991;
  const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: boardTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  boardFace.renderOrder = 993;
  boardGroup.add(boardShadow, boardFace);

  const board = {
    open: false, t: 0, want: 0,
    copy: {
      title: 'Login with Commonsmade',
      body: 'Get access to leaderboards and global competitions inside the games.',
      primary: 'LOGIN WITH COMMONSMADE',
      secondary: 'NOT NOW',
    },
    buttons: [], hover: null, dirty: true,
  };

  function paintBoard() {
    const g = boardCanvas.getContext('2d');
    g.clearRect(0, 0, BW, BH);
    const r = 40;
    roundRect(g, 8, 8, BW - 16, BH - 16, r);
    const grad = g.createLinearGradient(0, 0, 0, BH);
    grad.addColorStop(0, '#141925'); grad.addColorStop(1, '#0A0D14');
    g.fillStyle = grad; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(243,238,221,0.22)'; g.stroke();
    roundRect(g, 22, 22, BW - 44, BH - 44, r - 12);
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(243,238,221,0.07)'; g.stroke();

    // the mark, drawn from the same traced outline as the 3D logo
    const lw = 190, lx = BW / 2, ly = 150;
    g.save();
    g.translate(lx, ly); g.scale(lw, -lw);
    g.beginPath();
    LOGO_OUTLINE.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.closePath();
    g.fillStyle = '#F3EEDD'; g.fill();
    g.restore();

    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#F3EEDD';
    g.font = `700 64px ${FONT}`;
    g.fillText(board.copy.title, BW / 2, 330);
    g.fillStyle = 'rgba(243,238,221,0.68)';
    g.font = `400 34px ${FONT}`;
    wrap(g, board.copy.body, BW / 2, 392, 900, 46);

    board.buttons = [];
    const bw1 = 640, bh = 88, by = 520;
    const primary = { id: 'login', x: BW / 2 - bw1 / 2, y: by, w: bw1, h: bh };
    const secondary = { id: 'dismiss', x: BW / 2 - 110, y: by + bh + 18, w: 220, h: 56 };
    board.buttons.push(primary, secondary);
    const hp = board.hover === 'login';
    roundRect(g, primary.x, primary.y, primary.w, primary.h, 44);
    g.fillStyle = hp ? '#FFFFFF' : '#F3EEDD'; g.fill();
    g.fillStyle = '#0A0D14';
    g.font = `800 28px ${FONT}`;
    spaced(g, board.copy.primary, BW / 2, primary.y + 55, 0.12);
    g.fillStyle = board.hover === 'dismiss' ? 'rgba(243,238,221,0.95)' : 'rgba(243,238,221,0.5)';
    g.font = `600 24px ${FONT}`;
    spaced(g, board.copy.secondary, BW / 2, secondary.y + 36, 0.2);
    boardTex.needsUpdate = true;
    board.dirty = false;
  }

  // ---------------------------------------------------------------- leaderboard
  // A classroom chalkboard, built on first visit. Painters draw in chalk colours;
  // chalkboard.js turns every stroke into chalk on the slate.
  let chalkboard = null, lbPainter = null, lbLastPaint = -1;
  function ensureChalkboard() {
    if (chalkboard) return chalkboard;
    chalkboard = createChalkboard(THREE);
    chalkboard.group.visible = false;
    scene.add(chalkboard.group);
    chalkboard.fontsReady.then(() => paintLeaderboard(seconds));
    return chalkboard;
  }

  // Built in idle time after start-up rather than on the first click: adding its
  // lights recompiles the scene's shaders once, which would stall the turn itself.
  (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => ensureChalkboard(), { timeout: 4000 });

  function defaultLeaderboard(g, W, H, sec, chalk) {
    const C = chalk.colours;
    // the date, top right, as a teacher would
    const d = new Date();
    chalk.font('hand', 46);
    g.textAlign = 'right';
    chalk.text(d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), W - 110, 105, C.dim);
    // title
    g.textAlign = 'left';
    chalk.font('display', 128);
    chalk.text('Global Leaderboards', 110, 215);
    chalk.line(116, 248, 1180, 238, 6, C.yellow);
    chalk.font('hand', 44);
    chalk.text('every Commonsmade player, every game', 118, 312, C.dim);
    // tabs: the current one circled
    chalk.font('hand', 64);
    chalk.text('KATA', 150, 425);
    chalk.ring(212, 405, 100, 50, 5, C.pink);
    chalk.text('All games', 372, 425, C.dim);
    // the table header
    const cols = [[130, 'Rank'], [330, 'Player'], [1240, 'Score'], [1520, 'WPM'], [1760, 'Acc']];
    chalk.font('hand', 58);
    for (const [x, t] of cols) chalk.text(t, x, 540);
    chalk.line(120, 568, W - 120, 574, 5);
    for (const [x] of cols.slice(1)) chalk.line(x - 34, 492, x - 32, 596, 3, 'rgba(236,236,226,0.3)');
    // nothing to rank yet
    g.textAlign = 'center';
    chalk.font('display', 92);
    chalk.text('No runs yet', W / 2, 850);
    chalk.font('hand', 52);
    chalk.text('global competitions open soon', W / 2, 925, C.dim);
    // a little trophy doodle
    const tx = W / 2, ty = 690;
    chalk.line(tx - 50, ty - 60, tx + 50, ty - 60, 5, C.yellow);
    chalk.line(tx - 50, ty - 60, tx - 38, ty + 10, 5, C.yellow);
    chalk.line(tx + 50, ty - 60, tx + 38, ty + 10, 5, C.yellow);
    chalk.line(tx - 38, ty + 10, tx + 38, ty + 10, 5, C.yellow);
    chalk.line(tx, ty + 10, tx, ty + 52, 5, C.yellow);
    chalk.line(tx - 34, ty + 56, tx + 34, ty + 56, 6, C.yellow);
    chalk.ring(tx - 64, ty - 36, 18, 22, 4, C.yellow);
    chalk.ring(tx + 64, ty - 36, 18, 22, 4, C.yellow);
  }

  function paintLeaderboard(sec) {
    if (!chalkboard) return;
    chalkboard.paint((g, W, H, s, chalk) => {
      try { (lbPainter || defaultLeaderboard)(g, W, H, s, chalk); }
      catch (e) { console.error('leaderboard painter:', e); defaultLeaderboard(g, W, H, s, chalk); }
    }, sec);
  }

  const view = { name: 'home', from: null, to: null, t: 1, dur: 1.2, homeQ: new THREE.Quaternion(), turnQ: new THREE.Quaternion(), owns: false };
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  function setView(name) {
    if (name === view.name && view.t >= 1) return;
    if (name === 'leaderboard') {
      const cb = ensureChalkboard();
      if (view.name === 'home' && view.t >= 1) {
        view.homeQ.copy(camera.quaternion);
        // Turn right a quarter and level out, so the board is seen square-on
        // like a wall in a classroom, not looked down at.
        const fwd = _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
        const yaw = Math.atan2(-fwd.x, -fwd.z) - Math.PI / 2;
        view.turnQ.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
        const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const dist = Math.max(6, camera.position.distanceTo(controls.target) * 0.85);
        const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const visH = 2 * dist * tanV, visW = visH * camera.aspect;
        const s = Math.min(visW * 0.86 / cb.size.width, visH * 0.84 / cb.size.height);
        cb.group.scale.setScalar(s);
        cb.group.position.copy(camera.position).addScaledVector(dir, dist);
        cb.group.position.y = camera.position.y - cb.size.centreY * s;
        cb.group.rotation.set(0, yaw, 0);
        paintLeaderboard(0);
      }
      cb.group.visible = true;
      cb.setLit(true);
    }
    // reversing mid-turn continues from where the camera is, it does not jump
    const k = view.from + (view.to - view.from) * easeInOut(view.t);
    view.from = view.owns ? k : 0;
    view.to = name === 'leaderboard' ? 1 : 0;
    view.name = name;
    view.t = 0;
    view.owns = true;
    board.want = 0;
    renderTabs();
    emit('view', name);
  }

  // ---------------------------------------------------------------- DOM: badge and tab
  const css = document.createElement('style');
  css.textContent = `
  .tmx-lobby{position:fixed;inset:0;pointer-events:none;z-index:30;font-family:${FONT}}
  .tmx-badge{position:absolute;top:18px;right:20px;display:flex;align-items:center;gap:10px;
    padding:6px 14px 6px 6px;border-radius:999px;background:rgba(12,15,22,.72);
    border:1px solid rgba(243,238,221,.16);color:#F3EEDD;backdrop-filter:blur(14px);
    -webkit-backdrop-filter:blur(14px);box-shadow:0 8px 28px rgba(0,0,0,.28);
    pointer-events:auto;cursor:default;opacity:0;transform:translateY(-8px);
    transition:opacity .35s ease,transform .35s ease}
  .tmx-badge.on{opacity:1;transform:none}
  .tmx-av{width:34px;height:34px;border-radius:50%;background:#F3EEDD;color:#0A0D14;
    display:grid;place-items:center;font-weight:800;font-size:14px;overflow:hidden;flex:none}
  .tmx-av img{width:100%;height:100%;object-fit:cover}
  .tmx-who{display:flex;flex-direction:column;line-height:1.15;min-width:0}
  .tmx-name{font-size:13px;font-weight:700;letter-spacing:.01em;white-space:nowrap;
    max-width:180px;overflow:hidden;text-overflow:ellipsis}
  .tmx-handle{font-size:11px;color:rgba(243,238,221,.55);white-space:nowrap}
  .tmx-out{margin-left:6px;font-size:10px;font-weight:700;letter-spacing:.14em;
    color:rgba(243,238,221,.5);background:none;border:0;cursor:pointer;padding:6px 0 6px 10px;
    border-left:1px solid rgba(243,238,221,.14);font-family:inherit}
  .tmx-out:hover{color:#F3EEDD}
  .tmx-tab{position:absolute;right:0;top:50%;transform:translate(8px,-50%);
    display:flex;flex-direction:column;align-items:center;gap:12px;padding:18px 11px 18px 13px;
    border-radius:16px 0 0 16px;background:rgba(12,15,22,.72);border:1px solid rgba(243,238,221,.16);
    border-right:0;color:#F3EEDD;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    pointer-events:auto;cursor:pointer;opacity:0;transition:opacity .35s ease,transform .25s ease,background .2s}
  .tmx-tab.on{opacity:1;transform:translate(0,-50%)}
  .tmx-back{position:absolute;left:22px;top:50%;transform:translate(-14px,-50%);display:flex;flex-direction:column;
    align-items:center;gap:8px;pointer-events:none;opacity:0;cursor:pointer;background:none;border:0;padding:0;
    font-family:inherit;color:#F3EEDD;transition:opacity .35s ease,transform .35s ease}
  .tmx-back.on{opacity:1;transform:translate(0,-50%);pointer-events:auto}
  .tmx-back i{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:rgba(12,15,22,.72);
    border:1px solid rgba(243,238,221,.18);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    box-shadow:0 10px 30px rgba(0,0,0,.28);transition:transform .2s ease,background .2s ease}
  .tmx-back:hover i{transform:translateX(-4px);background:rgba(22,27,38,.9)}
  .tmx-back svg{width:26px;height:26px}
  .tmx-back b{font-size:10px;font-weight:800;letter-spacing:.22em;padding:4px 8px;border-radius:999px;
    background:rgba(12,15,22,.6);white-space:nowrap}
  .tmx-tab:hover{background:rgba(22,27,38,.86)}
  .tmx-tab svg{width:18px;height:18px;flex:none}
  .tmx-tab span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;font-weight:800;
    letter-spacing:.24em;white-space:nowrap}
  `;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.className = 'tmx-lobby';
  root.innerHTML = `
    <div class="tmx-badge" aria-live="polite">
      <div class="tmx-av"></div>
      <div class="tmx-who"><div class="tmx-name"></div><div class="tmx-handle"></div></div>
      <button class="tmx-out" type="button">SIGN OUT</button>
    </div>
    <button class="tmx-back" type="button" aria-label="Back to the games">
      <i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></i>
      <b>BACK</b>
    </button>
    <div class="tmx-tab" role="button" tabindex="0" aria-label="Global leaderboards">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>
      <span>GLOBAL LEADERBOARDS</span>
    </div>`;
  document.body.appendChild(root);
  // badge and tab clicks are the lobby's; they must not bubble on to the page's handlers
  for (const type of ['click', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend'])
    root.addEventListener(type, e => e.stopPropagation());
  const badge = root.querySelector('.tmx-badge');
  const tab = root.querySelector('.tmx-tab');
  const tabText = tab.querySelector('span');
  const backBtn = root.querySelector('.tmx-back');
  backBtn.addEventListener('click', () => setView('home'));
  root.querySelector('.tmx-out').addEventListener('click', () => emit('signout'));
  const toggleView = () => setView(view.name === 'leaderboard' ? 'home' : 'leaderboard');
  tab.addEventListener('click', toggleView);
  tab.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleView(); } });

  let user = null, suspended = false;
  function renderTabs() {
    badge.classList.toggle('on', !!user && !suspended);
    // home: the leaderboards tab on the right. leaderboard: a back arrow on the
    // left, pointing the way the camera turns to get back to the computer.
    const onBoard = view.name === 'leaderboard';
    tab.classList.toggle('on', !!user && !suspended && !onBoard);
    backBtn.classList.toggle('on', !suspended && onBoard);
    tabText.textContent = 'GLOBAL LEADERBOARDS';
  }

  // ---------------------------------------------------------------- pointer
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointerIn = false;
  const toNdc = e => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  function hitBoardButton() {
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(boardFace, false)[0];
    if (!hit || !hit.uv) return null;
    const px = hit.uv.x * BW, py = (1 - hit.uv.y) * BH;
    const b = board.buttons.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
    return { onBoard: true, id: b ? b.id : null };
  }
  // What the lobby answers is decided here, in the CAPTURE phase on window, so it
  // runs before any page or engine handler. Anything the lobby takes is stopped
  // dead: on the host page a click on the logo also reached the menu's own click
  // handler, which reset the screen before the board could open.
  const inLobbyDom = e => e.target instanceof Node && root.contains(e.target);
  const overLogo = () => {
    if (suspended || !logoRig.visible || logo.appear < 0.8 || view.name !== 'home') return false;
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(hitBox, false).length > 0;
  };
  const onCanvas = e => {
    const r = renderer.domElement.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  // true when this pointer event belongs to the lobby
  const claims = e => {
    if (suspended || inLobbyDom(e) || !onCanvas(e)) return false;
    toNdc(e);
    return (board.open && board.t > 0.05) || overLogo();
  };
  const swallow = e => { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); };

  addEventListener('pointermove', e => {
    if (inLobbyDom(e) || !onCanvas(e)) { logo.want = 0; return; }
    toNdc(e); pointerIn = true;
    let cursor = '';
    if (board.open && board.t > 0.6) {
      const h = hitBoardButton();
      const id = h && h.id;
      if (id !== board.hover) { board.hover = id; board.dirty = true; }
      if (id) cursor = 'pointer';
    } else {
      const over = overLogo();
      if (over && !logo.want && logo.spin >= 1) logo.spin = 0;     // pointer arrived: one turn
      logo.want = over ? 1 : 0;
      if (over) cursor = 'pointer';
    }
    renderer.domElement.style.cursor = cursor;
    document.documentElement.style.cursor = cursor;
  }, true);

  let pressClaimed = false;
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
    addEventListener(type, e => {
      const p = e.touches ? e.touches[0] : e;
      if (type === 'pointerdown') pressClaimed = !!p && claims(p);
      if (pressClaimed) swallow(e);
    }, { capture: true, passive: false });
  }
  for (const type of ['pointerup', 'mouseup', 'touchend']) {
    addEventListener(type, e => { if (pressClaimed) swallow(e); }, { capture: true, passive: false });
  }
  addEventListener('click', e => {
    const mine = pressClaimed || claims(e);
    pressClaimed = false;
    if (!mine) return;
    swallow(e);
    toNdc(e);
    if (board.open) {
      if (board.t < 0.6) return;
      const h = hitBoardButton();
      if (h && h.id === 'login') { emit('login'); return; }
      if (!h || h.id === 'dismiss') { closeBoard(); emit('dismiss'); }
      return;
    }
    if (overLogo()) openBoard();
  }, true);

  // While the board or the leaderboard is up, the keyboard belongs to the lobby:
  // Escape closes it and nothing else reaches the menu (typing START included).
  addEventListener('keydown', e => {
    if (suspended) return;
    const boardUp = board.open && board.want === 1;
    const lbUp = view.name === 'leaderboard';
    if (!boardUp && !lbUp) return;
    if (inLobbyDom(e)) return;                  // the tab's own Enter/Space
    swallow(e);
    if (e.key !== 'Escape') return;
    if (boardUp) { closeBoard(); emit('dismiss'); }
    else setView('home');
  }, true);
  addEventListener('keyup', e => {
    if (!suspended && ((board.open && board.want === 1) || view.name === 'leaderboard') && !inLobbyDom(e)) swallow(e);
  }, true);

  function openBoard() { board.open = true; board.want = 1; board.dirty = true; boardRig.visible = true; }
  function closeBoard() { board.want = 0; }

  // Where the mark stands. Measured from the keyboard's bounds once they exist,
  // like the monitor: placed once and left alone, so a board sliding in or out
  // doesn't drag it along. Re-fitted only when the window's shape changes.
  const place = { ok: false, box: null, aspect: 0, w: 1 };
  const RAISE = 0.45;                          // height above the floor, in mark widths
  const _q2 = new THREE.Vector3();
  function placeLogo() {
    if (place.ok && Math.abs(camera.aspect - place.aspect) < 0.01) return;
    if (!place.box) {
      const b = ground && ground();
      if (!b || b.isEmpty()) return;
      place.box = b.clone();
    }
    const bb = place.box;
    const bw = bb.max.x - bb.min.x, bd = bb.max.z - bb.min.z;
    const z = bb.min.z + bd * 0.08;            // back corner, beside the monitor's foot
    // the keyboard's nearest right corner, on screen: the mark must clear it
    const corner = _q2.set(bb.max.x, bb.max.y, bb.max.z).project(camera).x;
    const ndcAt = (x, w, lx, ly) => {
      _q2.set(x + lx * w, (ly + RAISE) * w, z).project(camera);
      return _q2.x;
    };
    let w = bw * 0.16, x = bb.max.x + w * 0.6;
    for (let i = 0; i < 80; i++) {
      const left = ndcAt(x, w, -0.5, 0), right = ndcAt(x, w, 0.55, LOGO_H + 0.45);
      if (left < corner + 0.03) { x += bw * 0.01; continue; }     // still behind the keyboard: step right
      if (right > 0.95 && w > bw * 0.07) { w *= 0.92; x = bb.max.x + w * 0.6; continue; }   // off frame: smaller
      break;
    }
    place.w = w;
    logoRig.position.set(x, RAISE * w, z);  // held a little above the floor
    logoRig.rotation.set(0, 0, 0);             // square to the room, like the other props
    place.aspect = camera.aspect;
    place.ok = true;
  }

  // ---------------------------------------------------------------- per frame
  let seconds = 0, steps = 0, renders = 0;
  function step(dt) {
    seconds += dt; steps++;
    if (dbg.on) dbgFrame();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const dist = camera.position.distanceTo(controls.target) || 10;

    // --- logo: a still object standing on the floor to the right of the keyboard
    logo.appear += ((logo.shown && !suspended && view.name === 'home' ? 1 : 0) - logo.appear) * Math.min(1, dt * 6);
    if (logo.appear < 0.01 && (!logo.shown || suspended)) logoRig.visible = false;
    if (logoRig.visible) {
      placeLogo();
      logo.hover += (logo.want - logo.hover) * Math.min(1, dt * 10);
      const pop = easeOutBack(clamp01(logo.appear));
      const k = 1 + logo.hover * 0.06;
      logoPivot.scale.setScalar(place.w * pop * k);
      hitBox.scale.setScalar(place.w);
      // still at rest; on hover it hops, turns once, then breathes while the pointer stays
      let lift = 0, turn = 0;
      if (logo.spin < 1) {
        logo.spin = Math.min(1, logo.spin + dt / 0.9);
        turn = easeInOut(logo.spin) * Math.PI * 2;
        lift = Math.sin(Math.PI * logo.spin) * 0.22;
      }
      lift += Math.sin(seconds * 3.2) * 0.03 * logo.hover;
      logoPivot.rotation.set(0, turn, 0);
      logoPivot.position.y = lift * place.w;
      logoRig.visible = place.ok;
      tone += (toneWant - tone) * Math.min(1, dt * 4);
      applyTone();
      logoFace.emissiveIntensity = (0.06 + logo.hover * 0.22) * (1 - tone);
      const lh = place.w * 0.24 * pop;
      label.mesh.scale.set(lh * label.aspect, lh, 1);
      label.mesh.position.set(0, place.w * (LOGO_H * pop * k + lift) + lh * 0.75, 0);
      label.mesh.material.opacity = clamp01(logo.appear) * (0.85 + logo.hover * 0.15);
    }

    // --- board: centred in camera space, rises into place
    board.t += (board.want - board.t) * Math.min(1, dt * 7);
    if (board.open && board.want === 0 && board.t < 0.02) { board.open = false; boardRig.visible = false; board.hover = null; }
    if (boardRig.visible) {
      if (board.dirty) paintBoard();
      const D = camera.near * 1.2;
      const hh = D * tanV, hw = hh * camera.aspect;
      let w = Math.min(hw * 1.25, hh * 2 * 0.78 * (BW / BH)), h = w * (BH / BW);
      const e = easeInOut(clamp01(board.t));
      boardRig.position.set(0, 0, -D);
      dim.scale.set(hw * 2.2, hh * 2.2, 1);
      dim.material.opacity = 0.5 * e;
      boardGroup.position.y = (1 - e) * -hh * 1.5;
      boardGroup.rotation.x = (1 - e) * 0.35;
      boardFace.scale.set(w, h, 1);
      boardShadow.scale.set(w * 1.25, h * 1.35, 1);
      boardShadow.position.y = -h * 0.04;
      boardFace.material.opacity = e;
      boardShadow.material.opacity = e;
    }

    // --- the camera turn
    if (view.owns) {
      view.t = Math.min(1, view.t + dt / view.dur);
      const u = easeInOut(view.t);
      const k = view.from + (view.to - view.from) * u;
      camera.quaternion.slerpQuaternions(view.homeQ, view.turnQ, k);
      if (view.name === 'leaderboard' && lbPainter && seconds - lbLastPaint > 0.5) { lbLastPaint = seconds; paintLeaderboard(seconds); }
      if (view.name === 'home' && view.t >= 1) {
        view.owns = false;
        if (chalkboard) { chalkboard.group.visible = false; chalkboard.setLit(false); }
        camera.quaternion.copy(view.homeQ);
      }
    }
  }

  // ---------------------------------------------------------------- api
  const api = {
    version: VERSION,
    debug(on) { setDebug(on === undefined ? true : !!on); return api.state(); },
    state: () => dbgState(),
    // Idempotent: hosts call this from their per-frame screen code. Re-applying the
    // same value must not touch the board, or a board that just opened is shut again.
    showLogin(on) {
      on = !!on;
      if (on === logo.shown) return;
      logo.shown = on;
      if (on && !suspended) logoRig.visible = true;
      if (!on) closeBoard();
    },
    setBoard(copy) { Object.assign(board.copy, copy || {}); board.dirty = true; },
    openBoard, closeBoard,
    setUser(u) {
      user = u || null;
      if (user) {
        const name = String(user.name || user.handle || 'Player');
        badge.querySelector('.tmx-name').textContent = name;
        badge.querySelector('.tmx-handle').textContent = user.handle ? '@' + String(user.handle).replace(/^@/, '') : 'Commonsmade';
        const av = badge.querySelector('.tmx-av');
        av.textContent = '';
        if (user.avatar) { const img = new Image(); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = user.avatar; av.appendChild(img); }
        else av.textContent = name.trim().charAt(0).toUpperCase();
        logo.shown = false;
        closeBoard();
      } else if (view.name === 'leaderboard') {
        setView('home');
      }
      renderTabs();
    },
    view: setView,
    get currentView() { return view.name; },
    // fn(ctx, W, H, seconds, chalk): draw in chalk colours (chalk.colours, chalk.font,
    // chalk.line, chalk.ring, chalk.text); it is rendered as chalk on the slate
    setLeaderboardPainter(fn) { lbPainter = typeof fn === 'function' ? fn : null; if (chalkboard && chalkboard.group.visible) paintLeaderboard(seconds); },
    on(ev, fn) { if (listeners[ev] && typeof fn === 'function') listeners[ev].push(fn); return api; },
    // while a game is running: nothing from the lobby is visible or clickable
    suspend(on) {
      if (!!on === suspended) return;
      suspended = !!on;
      root.style.display = suspended ? 'none' : '';
      if (suspended) { closeBoard(); if (view.name !== 'home') setView('home'); }
      logoRig.visible = !suspended && (logo.shown || logo.appear > 0.01);
      renderTabs();
    },
    get suspended() { return suspended; },
    busy() { return !suspended && (board.open || view.name === 'leaderboard' || view.owns); },
  };

  // call straight after the frame is rendered, while its pixels are still readable
  function afterRender() {
    renders++;
    if (!logoRig.visible || suspended) return;
    if (seconds - lastSample < 0.5 && lastSample >= 0) return;
    lastSample = seconds;
    try { sampleBackdrop(); } catch (e) { /* a lost context just keeps the last tone */ }
  }

  // ---------------------------------------------------------------- debug
  // TYPEMAXX_LOBBY.debug() in the console, or localStorage['typemaxx.lobby.debug']='1'
  // to have it on from the first frame. Shows a live panel, paints the mark magenta
  // over everything, and logs every call the host makes with where it came from.
  const dbg = { on: false, panel: null, log: [], mat: null, saved: null, last: 0 };
  for (const name of ['showLogin', 'setUser', 'suspend', 'view', 'openBoard', 'closeBoard']) {
    const fn = api[name];
    api[name] = function (...args) {
      const from = (new Error().stack || '').split('\n').slice(2, 4).map(l => l.trim().replace(/^at /, '')).join(' <- ');
      const arg = args.length ? JSON.stringify(args[0]) : '';
      const call = `${name}(${arg && arg.length > 60 ? arg.slice(0, 60) + '…' : arg})`;
      const prev = dbg.log[dbg.log.length - 1];
      if (prev && prev.call === call && prev.from === from) { prev.times = (prev.times || 1) + 1; prev.t = +seconds.toFixed(2); }
      else {
        dbg.log.push({ t: +seconds.toFixed(2), call, from });
        if (dbg.log.length > 40) dbg.log.shift();
        if (dbg.on) console.log('[lobby]', name, ...args, '\n  from', from);
      }
      return fn.apply(this, args);
    };
  }
  function dbgState() {
    const p = new THREE.Vector3();
    logoRig.getWorldPosition(p).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return {
      version: VERSION,
      loopRunning: { steps, renders, seconds: +seconds.toFixed(1) },
      logo: {
        showLoginRequested: logo.shown, suspended, rigVisible: logoRig.visible,
        appear: +logo.appear.toFixed(2), tone: +tone.toFixed(2), backdropLum: lastLum === null ? null : +lastLum.toFixed(2),
        screenPx: [Math.round(r.left + (p.x * 0.5 + 0.5) * r.width), Math.round(r.top + (-p.y * 0.5 + 0.5) * r.height)],
        onScreen: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1,
        inScene: (() => { let o = logoRig; while (o.parent) o = o.parent; return o === scene; })(),
      },
      camera: { near: camera.near, far: camera.far, fov: camera.fov, aspect: +camera.aspect.toFixed(3), layers: camera.layers.mask },
      canvas: [Math.round(r.width), Math.round(r.height)],
      user: user ? (user.handle || user.name) : null,
      view: view.name, boardOpen: board.open, busy: api.busy(),
      calls: dbg.log.slice(-12),
    };
  }
  function setDebug(on) {
    dbg.on = on;
    try { on ? localStorage.setItem('typemaxx.lobby.debug', '1') : localStorage.removeItem('typemaxx.lobby.debug'); } catch (e) {}
    if (on && !dbg.panel) {
      dbg.panel = document.createElement('pre');
      dbg.panel.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483647;margin:0;max-width:46vw;max-height:60vh;overflow:auto;' +
        'padding:10px 12px;background:rgba(0,0,0,.85);color:#9BF7B7;font:11px/1.35 ui-monospace,Menlo,monospace;border:1px solid #f0f;border-radius:8px;pointer-events:none;white-space:pre-wrap';
      document.body.appendChild(dbg.panel);
      dbg.mat = new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false, depthWrite: false, toneMapped: false });
    }
    if (dbg.panel) dbg.panel.style.display = on ? '' : 'none';
    if (on) { dbg.saved = logoMesh.material; logoMesh.material = dbg.mat; logoMesh.renderOrder = 999; }
    else if (dbg.saved) { logoMesh.material = dbg.saved; logoMesh.renderOrder = 0; }
    console.log('[lobby] debug', on ? 'on' : 'off', api.state());
  }
  function dbgFrame() {
    if (seconds - dbg.last < 0.25) return;
    dbg.last = seconds;
    const st = dbgState();
    const calls = st.calls.map(c => `  ${c.t}s ${c.call}${c.times ? '  x' + c.times : ''}\n      ${c.from}`).join('\n');
    delete st.calls;
    dbg.panel.textContent = 'TYPEMAXX LOBBY DEBUG  (TYPEMAXX_LOBBY.debug(false) to close)\n' +
      Object.entries(st).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n') +
      '\n\nlast calls from the host page:\n' + (calls || '  (none - the page never called the lobby)');
  }
  try { if (localStorage.getItem('typemaxx.lobby.debug') === '1') setTimeout(() => setDebug(true), 0); } catch (e) {}

  return { api, step, afterRender, ownsCamera: () => view.owns };

  // ---------------------------------------------------------------- helpers
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function wrap(g, text, cx, y, maxW, lh) {
    const words = String(text).split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { g.fillText(line, cx, y); line = w; y += lh; }
      else line = t;
    }
    if (line) g.fillText(line, cx, y);
  }
  function spaced(g, text, x, y, em, align) {
    const size = parseFloat(g.font.match(/(\d+(?:\.\d+)?)px/)[1]);
    const gap = size * em;
    const chars = String(text).split('');
    const total = chars.reduce((s, c) => s + g.measureText(c).width, 0) + gap * (chars.length - 1);
    let pen = align === 'left' ? x : x - total / 2;
    const prev = g.textAlign;
    g.textAlign = 'left';
    for (const c of chars) { g.fillText(c, pen, y); pen += g.measureText(c).width + gap; }
    g.textAlign = prev;
  }
  function radialTexture(inner) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, inner || 'rgba(243,238,221,0.9)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function textPlane(text, o) {
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = `${o.weight} ${o.size}px ${FONT}`;
    const gap = o.size * o.spacing;
    const glyphs = text.split('').map(ch => g.measureText(ch).width);
    const w = Math.ceil(glyphs.reduce((a, b) => a + b, 0) + gap * (glyphs.length - 1) + o.size * 0.8);
    const h = Math.ceil(o.size * 1.5);
    c.width = w; c.height = h;
    const g2 = c.getContext('2d');
    g2.font = `${o.weight} ${o.size}px ${FONT}`;
    g2.textBaseline = 'middle';
    let pen = o.size * 0.4;
    text.split('').forEach((ch, i) => {
      if (o.shadow) { g2.fillStyle = o.shadow; g2.fillText(ch, pen + o.size * 0.03, h / 2 + o.size * 0.05); }
      g2.fillStyle = o.colour; g2.fillText(ch, pen, h / 2);
      pen += glyphs[i] + gap;
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: t, transparent: true, depthWrite: false, toneMapped: false,
    }));
    return { mesh, aspect: w / h };
  }
}
