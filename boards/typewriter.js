// ══════════════════════════════════════════════════════════════ TYPEWRITER
// a Smith Corona: type bars, carriage, margin bell, carriage return
//
// A board is plain data: palette, cap profile, row sculpt, case and switch
// sound. It imports nothing, so you can copy this one file into a project and
// edit it on its own. See themes.js for how to swap one in.

export const typewriter = {
  label: 'TYPEWRITER',
  // served from a CDN so a Commonsmade project is pure code with no asset to
  // place by hand. Draco-compressed: 0.56 MB, full geometry.
  model: 'https://cdn.jsdelivr.net/gh/akash-mondal/typemaster@v1.5.0/typewriter.glb',
  // black crinkle enamel eats light, so the key is hot and the rim does the
  // work of separating the machine from the backdrop
  // a dark studio, not a bright one: the machine is black enamel and only
  // reads as black if the room around it is dim and the rim does the shaping
  env: { exposure:0.80, keyCol:0xFFF4E6, keyInt:1.7, fillCol:0xBFD2E8, fillInt:0.38,
         rakeCol:0xFFFFFF, rakeInt:1.05,
         hemiSky:0xA8B4C2, hemiGround:0x18181B, hemiInt:0.22 },
  floor: { colour:0x232426, rough:0.30, metal:0.12, env:0.8, y:-1.372 },
  // the environment map lights cavities that should be in shadow
  ao: { intensity:1.0, radius:0.42, scale:1.5 },
  page: 'radial-gradient(120% 90% at 50% 32%,#6E7276 0%,#44484C 40%,#25282B 72%,#141517 100%)',
};
