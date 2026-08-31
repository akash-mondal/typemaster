// ══════════════════════════════════════════════════════════════ MOCHA
// AULA F75 — 75%, walnut case, tan and cream caps, metal volume knob
//
// A board is plain data: palette, cap profile, row sculpt, case and switch
// sound. It imports nothing, so you can copy this one file into a project and
// edit it on its own. See themes.js for how to swap one in.

export const mocha = {
  label: 'MOCHA',
  audio: 'boxnavy', rate: 1.0,
  cap: { sq: 5, taper: 0.11, dish: 0.055, grid: 24, wobble: 0 },
  rows: [ {h:1.02,tilt:-8.0},{h:1.00,tilt:-5.5},{h:0.92,tilt:-2.0},
          {h:0.88,tilt: 0.5},{h:0.94,tilt: 4.0},{h:1.00,tilt: 7.0} ],
  jitter: { rot:0.35, pos:0.005 },
  // AULA F75 mocha: cream alphas, tan modifiers, dark-cocoa Esc/Enter/Space
  colour: { alpha:0xF2ECE0, mod:0xC6A67F, accent:0x5A3E2E,
            legend:'#3A2A1E', legendAccent:'#F2ECE0',
            case:0x5E4031, tray:0x271A11, screw:0x171009 },
  envCase: 0.55, envCap: 0.85,
  floor: { colour:0x8E8E8E, rough:0.42, metal:0.04, env:0.75 },
  fog:   { colour:0x8A8A8A, near:70, far:190 },   // hides the floor's far edge
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
  page: 'linear-gradient(180deg,#9C9C9C 0%,#8A8A8A 55%,#767676 100%)',
};
