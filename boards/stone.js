// ══════════════════════════════════════════════════════════════ STONE
// hewn rock caps on a rough slab, each one a different shape
//
// A board is plain data: palette, cap profile, row sculpt, case and switch
// sound. It imports nothing, so you can copy this one file into a project and
// edit it on its own. See themes.js for how to swap one in.

export const stone = {
  // quarried rock: big coarse cells, deep relief, no directionality at all
  surface: {
    cap : { octaves:[[22,1.0],[44,0.70],[88,0.45],[176,0.22]], strength:11.0, repeat:2,
            roughBase:0.94, roughVar:0.52, normalScale:1.55, channel:1 },
    case: { octaves:[[16,1.0],[32,0.75],[64,0.48],[128,0.24]], strength:13.0, repeat:2,
            roughBase:0.96, roughVar:0.55, streak:0.0, normalScale:3.10 },
  },
  label: 'STONE AGE',
  audio: 'buckling', rate: 0.55,          // pitched way down — rock, not spring
  // barely tapered lumps: real pebbles aren't moulded
  cap: { sq: 2.6, taper: 0.06, dish: 0.020, grid: 22, wobble: 0.15,
         variants: 9, lumps: 0.055, inset: 0.42 },
  rows: [ {h:1.16,tilt:-8.0},{h:1.08,tilt:-5.0},{h:1.22,tilt:-2.0},
          {h:1.04,tilt: 1.0},{h:1.18,tilt: 4.5},{h:1.10,tilt: 8.0} ],
  jitter: { rot:3.2, pos:0.030 },          // knocked about, nothing seated straight
  colour: { alpha:0x6B6255, mod:0x554D42, accent:0x7A4436,
            legend:'#14120E', legendAccent:'#0E0C09',
            case:0x413A31, tray:0x322C25, screw:0x241F1A },
  legendFont: '900 {S}px Impact, "Arial Black", "Haettenschweiler", sans-serif',
  legendTrack: '1.5px',
  legendStyle: 'engrave',          // a clean cut with a lit upper edge
  legendSize: 0.40, legendSubSize: 0.27,
  // pre-surface behaviour: the shared default grain, driven hard
  surface: {
    cap : { octaves:[[64,1.0],[128,0.55],[256,0.25]], strength:5.5, repeat:3,
            roughBase:0.68, roughVar:0.42, normalScale:2.40, channel:1 },
    case: { octaves:[[96,1.0],[192,0.45]], strength:4.2, repeat:4,
            roughBase:0.46, roughVar:0.34, streak:0.38, normalScale:1.10 },
  },
  capRough: 0.95, capMetal: 0.0,
  caseStyle: { kind:'wedge', hFront:1.85, hBack:5.40, bezel:1.30,
               wood:false, screws:false, pebbles:26, pebbleSize:0.95, pebbleDetail:2,
               rough:0.46, hewEdge:0.22, hewIter:26, hewFreq:0.38, chunk:0.30,
               caseRough:0.97, caseMetal:0.0 },
  env: { exposure:0.82, keyCol:0xFFD9A0, keyInt:2.5, fillCol:0x7E93B4, fillInt:0.55,
         rakeCol:0xFFCF96, rakeInt:2.6, rakeAz:-70, rakeEl:8,
         hemiSky:0x9FB0C8, hemiGround:0x2A2018, hemiInt:0.22, glowCol:0xFF8A3A, glowInt:0.6 },
  page: 'radial-gradient(ellipse 65% 50% at 62% 14%, rgba(255,196,120,.24), transparent 58%),'
      + 'linear-gradient(180deg,#2A2118,#4E3E2C)',
};
