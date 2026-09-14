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

const CREAM = 0xF3EEDD, CREAM_SIDE = 0xC9BFA4;
const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const FONT = '"Inter","SF Pro Display",system-ui,-apple-system,"Segoe UI",sans-serif';

export function createLobby({ THREE, scene, camera, renderer, controls }) {
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
  logoGeo.computeVertexNormals();
  const logoFace = new THREE.MeshPhysicalMaterial({
    color: CREAM, roughness: 0.32, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.25,
    emissive: new THREE.Color(CREAM), emissiveIntensity: 0.06,
  });
  const logoSide = new THREE.MeshPhysicalMaterial({
    color: CREAM_SIDE, roughness: 0.45, metalness: 0.0, clearcoat: 0.3,
  });
  const logoMesh = new THREE.Mesh(logoGeo, [logoFace, logoSide]);
  logoMesh.name = 'commons-logo';

  const logoPivot = new THREE.Group();       // animated: bob, sway, hover scale
  logoPivot.add(logoMesh);
  const logoRig = new THREE.Group();         // placed in camera space each frame
  logoRig.add(logoPivot);
  logoRig.visible = false;
  camera.add(logoRig);

  // a soft halo behind the mark, so it reads on both the white room and a night sky
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: radialTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.0,
  }));
  halo.position.z = -0.02;
  halo.visible = false;               // kept for hover glow experiments; the mark reads cleaner bare
  logoRig.add(halo);

  // the LOGIN label, a crisp canvas texture above the mark
  const label = textPlane('LOGIN', { size: 132, weight: 800, spacing: 0.34, colour: '#F3EEDD', shadow: 'rgba(10,12,18,0.55)' });
  logoRig.add(label.mesh);

  const logo = { shown: false, t: 0, hover: 0, want: 0, appear: 0 };

  // The mark must read on whatever is behind it: the engine's rooms run from a
  // black wall to a near-white one, and a cream logo on a white wall is invisible.
  // afterRender() samples the frame around the mark a couple of times a second
  // and eases between a cream mark (dark backdrop) and an ink one (light backdrop).
  const TONE = {
    face: [new THREE.Color(CREAM), new THREE.Color(0x16191F)],
    side: [new THREE.Color(CREAM_SIDE), new THREE.Color(0x3A3F4A)],
    label: [new THREE.Color(0xFFFFFF), new THREE.Color(0x1E2229)],
  };
  let tone = 0, toneWant = 0, lastSample = -1;
  const _px = new Uint8Array(4), _p3 = new THREE.Vector3();
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
    logoRig.getWorldPosition(_p3).project(camera);
    const cx = (_p3.x * 0.5 + 0.5) * gl.drawingBufferWidth;
    const cy = (_p3.y * 0.5 + 0.5) * gl.drawingBufferHeight;
    // the mark's rough on-screen half size, then points just outside it
    const r = gl.drawingBufferHeight * 0.13;
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
  const LW = 1600, LH = 1000;
  const lbCanvas = document.createElement('canvas');
  lbCanvas.width = LW; lbCanvas.height = LH;
  const lbTex = new THREE.CanvasTexture(lbCanvas);
  lbTex.colorSpace = THREE.SRGBColorSpace;
  lbTex.anisotropy = 8;
  const lbMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: lbTex, transparent: true, toneMapped: false,
  }));
  lbMesh.visible = false;
  scene.add(lbMesh);
  let lbPainter = null, lbLastPaint = -1;

  function defaultLeaderboard(g, W, H) {
    g.clearRect(0, 0, W, H);
    roundRect(g, 10, 10, W - 20, H - 20, 48);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#131824'); grad.addColorStop(1, '#090C13');
    g.fillStyle = grad; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(243,238,221,0.2)'; g.stroke();
    g.textAlign = 'left'; g.fillStyle = '#F3EEDD';
    g.font = `800 30px ${FONT}`;
    spaced(g, 'GLOBAL', 90, 120, 0.3, 'left');
    g.font = `800 96px ${FONT}`;
    g.fillText('Leaderboards', 84, 222);
    g.fillStyle = 'rgba(243,238,221,0.55)';
    g.font = `400 34px ${FONT}`;
    g.fillText('Every Commonsmade player, every game.', 90, 280);
    // tabs
    const tabs = ['KATA', 'ALL GAMES'];
    let tx = 90;
    g.font = `700 26px ${FONT}`;
    tabs.forEach((t, i) => {
      const w = g.measureText(t).width + 64;
      roundRect(g, tx, 330, w, 60, 30);
      g.fillStyle = i === 0 ? '#F3EEDD' : 'rgba(243,238,221,0.08)'; g.fill();
      g.fillStyle = i === 0 ? '#0A0D14' : 'rgba(243,238,221,0.7)';
      g.fillText(t, tx + 32, 370);
      tx += w + 16;
    });
    // header row
    const cols = [[90, 'RANK'], [260, 'PLAYER'], [980, 'SCORE'], [1200, 'WPM'], [1370, 'ACC']];
    g.fillStyle = 'rgba(243,238,221,0.4)'; g.font = `700 22px ${FONT}`;
    cols.forEach(([x, t]) => spaced(g, t, x, 460, 0.18, 'left'));
    g.fillStyle = 'rgba(243,238,221,0.1)'; g.fillRect(90, 482, W - 180, 2);
    // empty state, in a quiet dashed well where the rows will go
    g.save();
    roundRect(g, 90, 510, W - 180, 400, 24);
    g.setLineDash([10, 10]); g.lineWidth = 2; g.strokeStyle = 'rgba(243,238,221,0.14)'; g.stroke();
    g.restore();
    g.textAlign = 'center';
    g.fillStyle = 'rgba(243,238,221,0.8)'; g.font = `700 48px ${FONT}`;
    g.fillText('No runs yet', W / 2, 700);
    g.fillStyle = 'rgba(243,238,221,0.45)'; g.font = `400 30px ${FONT}`;
    g.fillText('Global competitions open soon.', W / 2, 752);
  }

  function paintLeaderboard(sec) {
    const g = lbCanvas.getContext('2d');
    try { (lbPainter || defaultLeaderboard)(g, LW, LH, sec); }
    catch (e) { console.error('leaderboard painter:', e); defaultLeaderboard(g, LW, LH, sec); }
    lbTex.needsUpdate = true;
  }

  const view = { name: 'home', from: null, to: null, t: 1, dur: 1.15, homeQ: new THREE.Quaternion(), turnQ: new THREE.Quaternion(), owns: false };
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  function setView(name) {
    if (name === view.name && view.t >= 1) return;
    if (name === 'leaderboard') {
      if (view.name === 'home' && view.t >= 1) {
        view.homeQ.copy(camera.quaternion);
        // turn to the right, about the world up axis
        _q.setFromAxisAngle(_up, -Math.PI / 2);
        view.turnQ.copy(_q).multiply(camera.quaternion);
        // stand the board where the turned camera will look
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0; right.normalize();
        const dist = Math.max(6, camera.position.distanceTo(controls.target) * 0.85);
        lbMesh.position.copy(camera.position).addScaledVector(right, dist);
        lbMesh.position.y = camera.position.y + (new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).y) * dist * 0.2;
        const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        let h = 2 * dist * tanV * 0.74, w = h * (LW / LH);
        const maxW = 2 * dist * tanV * camera.aspect * 0.8;
        if (w > maxW) { w = maxW; h = w * (LH / LW); }
        lbMesh.scale.set(w, h, 1);
        lbMesh.lookAt(camera.position);
        paintLeaderboard(0);
      }
      lbMesh.visible = true;
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
  root.querySelector('.tmx-out').addEventListener('click', () => emit('signout'));
  const toggleView = () => setView(view.name === 'leaderboard' ? 'home' : 'leaderboard');
  tab.addEventListener('click', toggleView);
  tab.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleView(); } });

  let user = null, suspended = false;
  function renderTabs() {
    badge.classList.toggle('on', !!user && !suspended);
    tab.classList.toggle('on', !!user && !suspended);
    tabText.textContent = view.name === 'leaderboard' ? 'BACK TO GAMES' : 'GLOBAL LEADERBOARDS';
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
    return ray.intersectObjects([logoMesh, label.mesh], false).length > 0;
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

  // ---------------------------------------------------------------- per frame
  let seconds = 0;
  function step(dt) {
    seconds += dt;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const dist = camera.position.distanceTo(controls.target) || 10;

    // --- logo: camera space, right of centre, in front of the machine
    logo.appear += ((logo.shown && !suspended && view.name === 'home' ? 1 : 0) - logo.appear) * Math.min(1, dt * 6);
    if (logo.appear < 0.01 && (!logo.shown || suspended)) logoRig.visible = false;
    if (logoRig.visible) {
      // just past the near plane, so no prop can ever stand in front of it
      const D = camera.near * 1.35;
      const hh = D * tanV, hw = hh * camera.aspect;
      const size = Math.min(hh * 0.30, hw * 0.16);
      logoRig.position.set(hw - size * 0.62 - hw * 0.08, hh * 0.28, -D);
      logo.hover += (logo.want - logo.hover) * Math.min(1, dt * 10);
      const pop = easeOutBack(clamp01(logo.appear));
      const s = size * pop * (1 + logo.hover * 0.1);
      logoPivot.scale.setScalar(s);
      logoPivot.position.y = Math.sin(seconds * 1.6) * hh * 0.025;
      logoPivot.rotation.y = Math.sin(seconds * 0.9) * 0.26 + logo.hover * Math.sin(seconds * 3) * 0.1;
      logoPivot.rotation.x = -0.12 + Math.sin(seconds * 1.3) * 0.05;
      tone += (toneWant - tone) * Math.min(1, dt * 4);
      applyTone();
      logoFace.emissiveIntensity = (0.06 + logo.hover * 0.22) * (1 - tone);
      halo.scale.set(size * 2.6 * pop, size * 2.0 * pop, 1);
      halo.position.y = logoPivot.position.y;
      halo.material.opacity = (0.10 + logo.hover * 0.18) * clamp01(logo.appear);
      label.mesh.scale.set(size * 0.95 * label.aspect * 0.34 * pop, size * 0.34 * pop, 1);
      label.mesh.position.set(0, size * 0.62 + logoPivot.position.y, 0.05);
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
      if (view.name === 'leaderboard' && lbPainter && seconds - lbLastPaint > 0.25) { lbLastPaint = seconds; paintLeaderboard(seconds); }
      if (view.name === 'home' && view.t >= 1) {
        view.owns = false;
        lbMesh.visible = false;
        camera.quaternion.copy(view.homeQ);
      }
    }
  }

  // ---------------------------------------------------------------- api
  const api = {
    showLogin(on) { logo.shown = !!on; if (on && !suspended) logoRig.visible = true; if (!on) closeBoard(); },
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
    setLeaderboardPainter(fn) { lbPainter = typeof fn === 'function' ? fn : null; if (lbMesh.visible) paintLeaderboard(seconds); },
    on(ev, fn) { if (listeners[ev] && typeof fn === 'function') listeners[ev].push(fn); return api; },
    // while a game is running: nothing from the lobby is visible or clickable
    suspend(on) {
      suspended = !!on;
      root.style.display = suspended ? 'none' : '';
      if (suspended) { closeBoard(); if (view.name !== 'home') setView('home'); }
      logoRig.visible = !suspended && (logo.shown || logo.appear > 0.01);
      renderTabs();
    },
    busy() { return !suspended && (board.open || view.name === 'leaderboard' || view.owns); },
  };

  // call straight after the frame is rendered, while its pixels are still readable
  function afterRender() {
    if (!logoRig.visible || suspended) return;
    if (seconds - lastSample < 0.5 && lastSample >= 0) return;
    lastSample = seconds;
    try { sampleBackdrop(); } catch (e) { /* a lost context just keeps the last tone */ }
  }

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
