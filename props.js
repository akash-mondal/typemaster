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
  // Every board uses this unless it has its own entry in `poses`. Boards swap
  // under a menu now, and a camera that re-framed on each swap would lurch.
  pose: { position:[13.36, 19.28, 71.1], target:[14.46, 13.24, -21.14] },
  poses: {},

  // used for any board without a pose above
  focus: 'crt',      // which prop to frame. null = fit the whole scene instead
  elevation: 4,      // degrees above the desk. 0 is dead level with the tube
  fill: 0.62,        // how much of the frame's height the focus should occupy
  aim: 0.52,         // where on the focus to point (0 its base, 1 its top)
  lift: 0.06,        // nudge the whole shot up, as a fraction of frame height
};

// ── the scene itself ─────────────────────────────────────────────────────────
export const SCENE = {
  picker: false,      // the row of board buttons. Off: a menu drives this now.
  floor: true,        // the ground plane under the keyboard
  // A floor that shows NOTHING but the shadow the board and set drop on it.
  // With a backdrop that has its own ground — a landscape rather than a night
  // sky — this is what stops them looking pasted on top of it.
  shadowFloor: false,
  shadowOpacity: 0.34,

  // Match the lighting to whatever backdrop is behind. az is degrees clockwise
  // from straight ahead, el is degrees above the horizon. Leave null to keep the
  // board's own rig.
  //   sun: { az: 62, el: 14, colour: 0xFFD2A1, intensity: 1.5 },
  //   sky: { top: 0xE8D6B4, bottom: 0x6E6A4E, intensity: 0.9 },
  //   exposure: 0.95,
  sun: null,
  sky: null,
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
  // What runs on the CRT. Either the name of a built-in screen, or your own
  // painter function. A page usually sets this via window.TYPEMAXX instead:
  //   window.TYPEMAXX = { screen(ctx, w, h, seconds, now, input){ ... } }
  // See screens.js for the contract and a worked example.
  screen: null,

  background: null,
  // background: { module: '/temple/templeNightRenderer.js',
  //               export: 'createTempleNightRenderer',
  //               brightness: 1.4 },   // 1 = as the renderer graded it
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
  // Per-board overrides of `offset`, same units. The typewriter is wider on its
  // right than its left, so centring on its bounds pushes it visually right.
  offsetFor: { typewriter: [-0.10, 0, 0] },
  rotate: 0,           // degrees, flat on the desk. 0 faces the camera
  scale: 1,            // 1 is its natural size
  // Per-board overrides, for a machine that wants tuning on its own. Boards are
  // normalised to a common width first, so these are adjustments to that.
  scaleFor: { typewriter: 0.8 },
};

export const PROPS = {
  crt: {
    model: 'https://cdn.jsdelivr.net/gh/akash-mondal/typemaster@v1.4.0/crt.glb',

    screen: 'title',    // what runs on the tube — see screens.js
                        //   'title' | 'blank' | 'terminal' | 'typing'
    anchor: 'behind',   // behind | infront | left | right — where it sits
    widthFrac: 1.14,    // its width as a fraction of the board's width (+30%)
    gap: 0.55,          // space between it and the board, as a fraction of
                        //   board depth (behind/infront) or width (left/right)
    lift: 0,            // raise it off the ground; 0 sits it on the same
                        //   surface as the board
    hideOn: [],         // the tube is the menu now, so it is always present

    // The cabinet colour, per board. Anything not listed uses `body`.
    body: 0x141416,
    bodyFade: 0.6,      // seconds to ease between cabinet skins
    // A skin is a colour, or { colour, metalness, roughness, env } for a finish.
    bodyFor: {
      platinum: 0xF1F0EA,            // matches the M0110A's case
      stone:    0x413A31,            // matches the stone slab
      // Worn steel beside the Corona: fully metal, but rough enough to scatter
      // rather than mirror. A polished cabinet next to a matte machine reads as
      // chrome trim, which is not what a typewriter's era looked like.
      typewriter: { colour: 0x9BA1A6, metalness: 0.92, roughness: 0.46, env: 1.05 },
    },
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
