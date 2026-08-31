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
// TO MOVE A PROP: edit its numbers below. Nothing else.
// TO ADD A PROP:  copy a block, give it a new key and a model URL.
// TO HIDE A PROP on some boards: list their theme keys in `hideOn`.
// TO CHANGE WHAT IS ON THE CRT: set `screen`. Writing a new one is a single
//   canvas-2D function — see screens.js, which has a worked game to copy.
// ─────────────────────────────────────────────────────────────────────────────
//
// Theme keys, for `hideOn`: walnut (MOCHA), oldmac (PLATINUM), stone (STONE
// AGE), gamer (RGB), typewriter (TYPEWRITER).

export const PROPS = {
  crt: {
    model: 'https://cdn.jsdelivr.net/gh/akash-mondal/typemaster@v1.1.0/crt.glb',

    screen: 'typing',   // what runs on the tube — see screens.js for the list
                        //   'terminal' = ThreeUI's Zion boot log
                        //   'typing'   = the typing game
    anchor: 'behind',   // behind | infront | left | right — where it sits
    widthFrac: 0.68,    // its width as a fraction of the board's width
    gap: 0.34,          // space between it and the board, as a fraction of
                        //   board depth (behind/infront) or width (left/right)
    lift: 0,            // raise it off the ground; 0 sits it on the same
                        //   surface as the board
    hideOn: ['typewriter'],
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
