// ══════════════════════════════════════════════════════════ theme definitions
// Each theme owns its palette, cap profile, row sculpt, case builder and switch
// sound. Everything else in the scene is shared.

export const THEMES = {

  walnut: {
    label: 'MOCHA',
    audio: 'boxnavy', rate: 1.0,
    cap: { sq: 5, taper: 0.11, dish: 0.055, grid: 10, wobble: 0 },
    rows: [ {h:1.02,tilt:-8.0},{h:1.00,tilt:-5.5},{h:0.92,tilt:-2.0},
            {h:0.88,tilt: 0.5},{h:0.94,tilt: 4.0},{h:1.00,tilt: 7.0} ],
    jitter: { rot:0.35, pos:0.005 },
    // AULA F75 mocha: cream alphas, tan modifiers, dark-cocoa Esc/Enter/Space
    colour: { alpha:0xF2ECE0, mod:0xC6A67F, accent:0x5A3E2E,
              legend:'#3A2A1E', legendAccent:'#F2ECE0',
              case:0x5E4031, tray:0x271A11, screw:0x171009 },
    envCase: 0.55, envCap: 0.85,
    floor: { colour:0xEFEDE9, rough:0.26, metal:0.06, env:1.0 },
    legendFont: '600 {S}px Arial, Helvetica, "Helvetica Neue", sans-serif',   // Gorton Modified proxy
    legendTrack: '1px',
    legendSize: 0.36, legendSubSize: 0.24, legendModLeft: true,
    // moulded PBT: a fine pebbled tooth. case is a warm satin-finish shell.
    // smooth satin, as on the reference photo — not heavily toothed
    surface: {
      cap : { octaves:[[140,1.0],[280,0.30]], strength:2.2, repeat:4,
              roughBase:0.62, roughVar:0.16, normalScale:0.30, channel:1 },
      case: { octaves:[[160,1.0],[320,0.25]], strength:1.8, repeat:5,
              roughBase:0.34, roughVar:0.12, streak:0.20, normalScale:0.26 },
    },
    capRough: 0.66, capMetal: 0.0,
    // thin bezels — the reference board is nearly edge to edge
    // thin front lip and thin bezels — nearly edge to edge, as on the reference
    caseStyle: { kind:'wedge', hFront:0.78, hBack:4.05, bezel:0.16,
                 slot: { col:1.55, row:0, w:0.16, d:0.66, colour:0x1C130C },
                 wood:false, screws:false,
                 knob: { r:0.80, h:0.74, rise:0.58, col:15.18, row:0, env:1.5,
                         colour:0xD7DBDF, top:0xB4BAC1 },
                 caseRough:0.40, caseMetal:0.38, side:0.18 },
    env: { exposure:1.02, keyCol:0xFFFFFF, keyInt:3.2, fillCol:0xFFFFFF, fillInt:1.9,
           rakeCol:0xFFFFFF, rakeInt:0.7, rakeAz:-64, rakeEl:14,
           hemiSky:0xFFFFFF, hemiGround:0xD8D4CE, hemiInt:1.1, glowCol:0xFFFFFF, glowInt:0.2 },
    page: 'linear-gradient(180deg,#F7F6F3 0%,#EAE7E2 62%,#DAD6D0 100%)',
  },

  oldmac: {
    label: 'PLATINUM',
    audio: 'bluealps', rate: 1.0,
    // M0110A caps are boxy with big flat tops — barely sculpted, barely dished
    cap: { sq: 9, taper: 0.07, dish: 0.022, grid: 10, wobble: 0 },
    rows: [ {h:1.10,tilt:-6.0},{h:1.08,tilt:-4.0},{h:1.04,tilt:-1.5},
            {h:1.02,tilt: 0.5},{h:1.06,tilt: 3.0},{h:1.10,tilt: 5.5} ],
    jitter: { rot:0.16, pos:0.003 },
    // every cap on that board is the same beige — no darker modifiers
    colour: { alpha:0xB9AF97, mod:0xB9AF97, accent:0xB2A88F,
              legend:'#232019', legendAccent:'#232019',
              case:0xD2C7AC, tray:0x9E9682, screw:0x7A7263 },
    legendFont: '500 {S}px "Helvetica Neue", Helvetica, Arial, sans-serif',   // Apple used Univers
    legendTrack: '0.5px',
    legendAlign: 'topleft',
    legendSize: 0.27, legendSubSize: 0.225,
    // 1990s ABS: smoother and waxier than PBT. case is coarse moulded plastic.
    surface: {
      cap : { octaves:[[110,1.0],[220,0.35]], strength:3.0, repeat:4,
              roughBase:0.80, roughVar:0.22, normalScale:0.62, channel:1 },
      case: { octaves:[[52,1.0],[104,0.60],[208,0.30]], strength:6.4, repeat:3,
              roughBase:0.86, roughVar:0.38, streak:0.0, normalScale:1.45 },
    },
    capRough: 0.82, capMetal: 0.0,
    // thick chunky bezel, generous margin, modest wedge, raised lip round the well
    caseStyle: { kind:'wedge', hFront:1.55, hBack:4.10, bezel:1.55,
                 wood:false, screws:false, rim:0.42,
                 caseRough:0.88, caseMetal:0.0 },
    env: { exposure:0.76, keyCol:0xFFEBCE, keyInt:2.1, fillCol:0xB6C6E6, fillInt:0.55,
           rakeCol:0xFFF0DC, rakeInt:1.2, rakeAz:-58, rakeEl:12,
           hemiSky:0xB4C2D8, hemiGround:0x38342C, hemiInt:0.30, glowCol:0xFFD9A0, glowInt:0.25 },
    page: 'radial-gradient(ellipse 60% 45% at 60% 18%, rgba(255,236,200,.14), transparent 58%),'
        + 'linear-gradient(180deg,#232326,#3E3B36)',
  },

  stone: {
    // quarried rock: big coarse cells, deep relief, no directionality at all
    surface: {
      cap : { octaves:[[22,1.0],[44,0.70],[88,0.45],[176,0.22]], strength:11.0, repeat:2,
              roughBase:0.94, roughVar:0.52, normalScale:2.60, channel:1 },
      case: { octaves:[[16,1.0],[32,0.75],[64,0.48],[128,0.24]], strength:13.0, repeat:2,
              roughBase:0.96, roughVar:0.55, streak:0.0, normalScale:3.10 },
    },
    label: 'STONE AGE',
    audio: 'buckling', rate: 0.55,          // pitched way down — rock, not spring
    // barely tapered lumps: real pebbles aren't moulded
    cap: { sq: 2.6, taper: 0.06, dish: 0.020, grid: 16, wobble: 0.20, variants: 9, lumps: 0.085 },
    rows: [ {h:1.16,tilt:-8.0},{h:1.08,tilt:-5.0},{h:1.22,tilt:-2.0},
            {h:1.04,tilt: 1.0},{h:1.18,tilt: 4.5},{h:1.10,tilt: 8.0} ],
    jitter: { rot:3.2, pos:0.055 },          // knocked about, nothing seated straight
    colour: { alpha:0x6B6255, mod:0x554D42, accent:0x9C4B2A,
              legend:'#14120E', legendAccent:'#0E0C09',
              case:0x413A31, tray:0x322C25, screw:0x241F1A },
    legendFont: '900 {S}px Impact, "Arial Black", sans-serif',
    legendTrack: '3px',
    legendStyle: 'chisel',
    legendSize: 0.38, legendSubSize: 0.26,
    // pre-surface behaviour: the shared default grain, driven hard
    surface: {
      cap : { octaves:[[64,1.0],[128,0.55],[256,0.25]], strength:5.5, repeat:3,
              roughBase:0.68, roughVar:0.42, normalScale:2.40, channel:1 },
      case: { octaves:[[96,1.0],[192,0.45]], strength:4.2, repeat:4,
              roughBase:0.46, roughVar:0.34, streak:0.38, normalScale:1.10 },
    },
    capRough: 0.95, capMetal: 0.0,
    caseStyle: { kind:'wedge', hFront:1.85, hBack:5.40, bezel:1.30,
                 wood:false, screws:false, pebbles:16,
                 rough:0.46, hewEdge:0.42, hewFreq:0.38, chunk:0.30,
                 caseRough:0.97, caseMetal:0.0 },
    env: { exposure:0.82, keyCol:0xFFD9A0, keyInt:2.5, fillCol:0x7E93B4, fillInt:0.55,
           rakeCol:0xFFCF96, rakeInt:2.6, rakeAz:-70, rakeEl:8,
           hemiSky:0x9FB0C8, hemiGround:0x2A2018, hemiInt:0.22, glowCol:0xFF8A3A, glowInt:0.6 },
    page: 'radial-gradient(ellipse 65% 50% at 62% 14%, rgba(255,196,120,.24), transparent 58%),'
        + 'linear-gradient(180deg,#2A2118,#4E3E2C)',
  },
  gamer: {
    // shot-blast black plastic: very fine, tight. case is smooth anodised.
    surface: {
      cap : { octaves:[[150,1.0],[300,0.45]], strength:3.4, repeat:5,
              roughBase:0.48, roughVar:0.30, normalScale:0.80, channel:1 },
      case: { octaves:[[130,1.0],[260,0.35]], strength:3.0, repeat:6,
              roughBase:0.32, roughVar:0.20, streak:0.62, normalScale:0.72 },
    },
    label: 'RGB',
    audio: 'redink', rate: 1.0,             // linear switches — no click, just thock
    cap: { sq: 6, taper: 0.13, dish: 0.060, grid: 10, wobble: 0 },
    rows: [ {h:1.00,tilt:-8.5},{h:0.98,tilt:-5.5},{h:0.92,tilt:-2.0},
            {h:0.88,tilt: 0.5},{h:0.94,tilt: 4.0},{h:1.00,tilt: 7.5} ],
    jitter: { rot:0.18, pos:0.003 },        // machine-built, nothing out of line
    colour: { alpha:0x101216, mod:0x0B0D10, accent:0x14171B,
              legend:'#0A0B0E', legendAccent:'#0A0B0E',
              case:0x0A0C10, tray:0x050609, screw:0x2A2E36 },
    legendFont: '700 {S}px "Arial Narrow", "Helvetica Neue Condensed", Impact, sans-serif',
    legendTrack: '2.5px',                    // wide tracking reads as gaming techno
    legendSize: 0.34, legendSubSize: 0.24,
    backlit: true,
    fx: 'rgb',
    bloom: { strength: 0.78, radius: 0.58, threshold: 0.70 },
    grain: 0.55,                            // shot-blast black, subtle
    capRough: 0.44, capMetal: 0.05,
    caseStyle: { kind:'wedge', hFront:1.00, hBack:4.20, bezel:0.70,
                 wood:false, screws:false,
                 caseRough:0.34, caseMetal:0.78 },
    env: { exposure:0.70, keyCol:0x9FB4E0, keyInt:0.55, fillCol:0x5A6FE0, fillInt:0.28,
           rakeCol:0x9FB6FF, rakeInt:0.5, rakeAz:-66, rakeEl:9,
           hemiSky:0x1A2340, hemiGround:0x04050A, hemiInt:0.08, glowCol:0xFF2DD4, glowInt:0.5 },
    page: 'radial-gradient(ellipse 55% 40% at 72% 12%, rgba(255,45,212,.18), transparent 55%),'
        + 'radial-gradient(ellipse 55% 45% at 22% 88%, rgba(34,232,255,.16), transparent 60%),'
        + 'linear-gradient(180deg,#05060B,#0E1020)',
  },

  // ── the one machine that is not built from primitives ────────────────────
  // A Smith Corona from BlendSwap, converted to glTF and re-rigged so each key
  // lever, type bar and the carriage move on their real hinges. See
  // typewriter.js for the naming contract the conversion had to satisfy.
  typewriter: {
    label: 'TYPEWRITER',
    model: './typewriter.glb',
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
  },

};
