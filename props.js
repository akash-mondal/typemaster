// ══════════════════════════════════════════════════════════════ scene props
// Everything an agent needs to move things around lives in this one file.
//
// A "prop" is an object that stands in the scene next to whichever keyboard is
// showing. You do NOT need to know the size of any board, or any three.js
// maths: give a prop an anchor and a couple of fractions and it is measured and
// placed against the current board automatically. Boards differ a lot — the 60%
// Platinum is half the size of the typewriter — so everything here is relative,
// never absolute.
//
// ─────────────────────────────────────────────────────────────────────────────
// TO MOVE THE KEYBOARD: edit BOARD below.
// TO MOVE A PROP: edit its numbers below. Nothing else.
// TO ADD A PROP:  copy a block, give it a new key and a model URL.
// TO HIDE A PROP on some boards: list their theme keys in `hideOn`.
// TO CHANGE WHAT IS ON THE CRT: set `screen`. Writing a new one is a single
//   canvas-2D function — see screens.js, which has a worked game to copy.
// ─────────────────────────────────────────────────────────────────────────────
//
// Board keys, for `hideOn` and `poses`:
//   mocha  platinum  stone  rgb  typewriter

// ── the shot ─────────────────────────────────────────────────────────────────
// The camera is composed, not auto-fitted. It frames ONE thing; anything nearer
// the lens (the keyboard) is deliberately allowed to run past the edges, which
// is what gives the close-up-board / dead-on-tube look.
export const SHOT = {
  // ── SETTING THE ANGLE ──────────────────────────────────────────────────────
  // free: true   -> drag to look around. The exact camera is printed top-left
  //                 and copied to the clipboard when you click it.
  // pose: {...}  -> paste that block here and the shot is locked to it.
  //                 A pose always wins over the framing numbers below.
  free: false,       // true = drag to re-compose, and the pose prints top-left

  // One pose per board, since a shot is composed against a particular board's
  // size. A board with no entry here is framed automatically by the numbers
  // below, so you only need to hand-set the ones you care about.
  poses: {
    // Mocha: tube dead-on (polar 86.3, azimuth -0.7) with the board close to
    // the lens and deliberately cropped by the bottom edge.
    mocha: { position:[13.36, 19.28, 71.1], target:[14.46, 13.24, -21.14] },
  },

  // used for any board without a pose above
  focus: 'crt',      // which prop to frame. null = fit the whole scene instead
  elevation: 4,      // degrees above the desk. 0 is dead level with the tube
  fill: 0.62,        // how much of the frame's height the focus should occupy
  aim: 0.52,         // where on the focus to point (0 its base, 1 its top)
  lift: 0.06,        // nudge the whole shot up, as a fraction of frame height
};

// ── the scene itself ─────────────────────────────────────────────────────────
export const SCENE = {
  floor: true,        // the ground plane under the keyboard
  fog: true,          // the distance haze that hides the floor's far edge

  // A LIVE BACKGROUND behind everything. Point `module` at a file that exports
  // a factory taking a canvas and returning { render, resize, dispose } — the
  // shape ThreeUI's renderers already have — and it is drawn as the scene's
  // backdrop.
  //
  // It becomes the scene BACKGROUND rather than a second canvas layered
  // underneath, which matters: UnrealBloomPass writes opaque alpha, so a
  // transparent canvas stacked over another one comes out as a black rectangle.
  // As a background it goes through the bloom with everything else.
  //
  // Set floor and fog to false as well, or the ground plane hides it.
  background: null,
  // background: { module: '/temple/templeNightRenderer.js',
  //               export: 'createTempleNightRenderer' },
};

// ── the keyboard ─────────────────────────────────────────────────────────────
// The board is built at the origin and this moves the finished thing. Offsets
// are in BOARD WIDTHS, not world units, because the boards differ enormously —
// a number that reads well against the Mocha would fling the 60% Platinum off
// the screen. 0.5 is half a keyboard's width.
//
// Which keyboard is on screen is chosen in themes.js.
export const BOARD = {
  offset: [0, 0, 0],   // [x, y, z] in board widths: +x right, +y up, +z toward you
  rotate: 0,           // degrees, flat on the desk. 0 faces the camera
  scale: 1,            // 1 is its natural size
};

export const PROPS = {
  crt: {
    model: 'https://cdn.jsdelivr.net/gh/akash-mondal/typemaster@v1.4.0/crt.glb',

    screen: 'title',    // what runs on the tube — see screens.js
                        //   'title' | 'blank' | 'terminal' | 'typing'
    anchor: 'behind',   // behind | infront | left | right — where it sits
    widthFrac: 0.88,    // its width as a fraction of the board's width
    gap: 0.55,          // space between it and the board, as a fraction of
                        //   board depth (behind/infront) or width (left/right)
    lift: 0,            // raise it off the ground; 0 sits it on the same
                        //   surface as the board
    hideOn: ['typewriter'],   // its own complete machine; a monitor behind it makes no sense
  },
};

// ── the maths, so a prop's config never has to contain any ───────────────────
// Scales the prop to `widthFrac` of the board, then butts it up against the
// chosen side with `gap` between. Measured from real bounds every time a board
// is built, which is why a prop follows a theme change without being told.
export function placeProp(THREE, group, inner, boardBox, spec = {}){
  const anchor    = spec.anchor    ?? 'behind';
  const widthFrac = spec.widthFrac ?? 0.6;
  const gap       = spec.gap       ?? 0.3;
  const lift      = spec.lift      ?? 0;

  group.scale.setScalar(1);
  group.position.set(0, 0, 0);
  group.updateMatrixWorld(true);

  const size  = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
  const bs    = boardBox.getSize(new THREE.Vector3());
  const ctr   = boardBox.getCenter(new THREE.Vector3());
  if(!(size.x > 0)) return group;

  group.scale.setScalar((bs.x * widthFrac) / size.x);
  group.updateMatrixWorld(true);

  const b = new THREE.Box3().setFromObject(inner);
  const c = b.getCenter(new THREE.Vector3());
  const onGround = boardBox.min.y - b.min.y + lift;

  switch(anchor){
    case 'infront':
      group.position.set(ctr.x - c.x, onGround, boardBox.max.z - b.min.z + bs.z*gap);
      break;
    case 'left':
      group.position.set(boardBox.min.x - b.max.x - bs.x*gap, onGround, ctr.z - c.z);
      break;
    case 'right':
      group.position.set(boardBox.max.x - b.min.x + bs.x*gap, onGround, ctr.z - c.z);
      break;
    case 'behind':
    default:
      group.position.set(ctr.x - c.x, onGround, boardBox.min.z - b.max.z - bs.z*gap);
      break;
  }
  return group;
}
