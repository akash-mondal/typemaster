/*
 * xcube.js - the X cube on the desk floor, beside the keyboard.
 *
 * A dark rounded cube with the X mark on every face, sitting on the floor to the
 * left of the keyboard. Clicking it opens the X profile. The engine owns it, so
 * it is always the same cube in the same place, and it shows only where it
 * belongs: on the launch screen, never on game select or inside a game.
 *
 *   window.TYPEMAXX_XCUBE
 *     .show(bool)        page switch; true by default
 *     .setUrl(url)       where a click goes (default https://x.com/akshmnd)
 *     .object            the THREE.Group, for tooling
 *
 * Whether it is visible follows the lobby: shown && area 'launch' && not
 * suspended. It fades rather than pops.
 */

// the X mark, 24x24 units
const X_PATH = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';

export function createXCube({ THREE, RoundedBoxGeometry, scene, ground, lobby, addObject, setVisible }) {
  // ---------------------------------------------------------------- the face
  const face = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#46474b');
    grad.addColorStop(1, '#333438');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    g.save();
    g.translate(256, 256);
    g.scale(12.5, 12.5);
    g.translate(-12, -12);
    g.fillStyle = '#E9E9E7';
    g.fill(new Path2D(X_PATH));
    g.restore();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  })();
  const mat = new THREE.MeshStandardMaterial({ map: face, color: 0x8c8c8c, roughness: 0.58, metalness: 0.05 });
  const geo = RoundedBoxGeometry ? new RoundedBoxGeometry(1, 1, 1, 5, 0.1) : new THREE.BoxGeometry(1, 1, 1);
  const cube = new THREE.Mesh(geo, mat);
  cube.castShadow = cube.receiveShadow = true;
  const group = new THREE.Group();
  group.name = 'typemaxx-xcube';
  group.add(cube);
  group.visible = false;

  const state = { shown: true, url: 'https://x.com/akshmnd', placed: null, hover: 0, wantHover: false, visible: false, size: 1 };

  addObject(group, {
    onClick() {
      if (!group.visible) return;
      const a = document.createElement('a');
      a.href = state.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      document.body.appendChild(a); a.click(); a.remove();
    },
    onHover(on) { state.wantHover = on; },
  });

  // ---------------------------------------------------------------- placement
  // on the floor, off the keyboard's front-left corner, turned so two X faces
  // and the top read at once
  function place() {
    const b = ground();
    if (!b || b.isEmpty()) return false;
    const key = [b.min.x, b.max.x, b.min.z, b.max.z].map(v => v.toFixed(3)).join();
    if (key === state.placed) return true;
    const bw = b.max.x - b.min.x;
    const s = bw * 0.12;
    state.size = s;
    group.scale.setScalar(s);
    group.position.set(b.min.x - s * 0.75, s * 0.5, b.max.z - s * 0.5);   // its turned corner just clears the keyboard
    group.rotation.set(0, 0.55, 0);
    state.placed = key;
    return true;
  }

  // ---------------------------------------------------------------- per frame
  let t = 0, sinceCheck = 1;
  function step(dt) {
    t += dt;
    sinceCheck += dt;
    if (sinceCheck > 1) { sinceCheck = 0; place(); }
    const want = state.shown && !!state.placed && !lobby.suspended && lobby.area === 'launch';
    if (want !== state.visible) { state.visible = want; setVisible(group, want, want ? 0.45 : 0.3); }
    // hover: it lifts a little and turns a touch toward you
    state.hover += ((state.wantHover && want ? 1 : 0) - state.hover) * Math.min(1, dt * 10);
    const h = state.hover;
    cube.position.y = h * 0.12;
    cube.rotation.y = h * 0.12;
    mat.emissive.setScalar(h * 0.06);
  }

  const api = {
    show(on) { state.shown = !!on; },
    setUrl(url) { if (typeof url === 'string' && url) state.url = url; },
    get object() { return group; },
    get visible() { return state.visible; },
  };
  return { api, step };
}
