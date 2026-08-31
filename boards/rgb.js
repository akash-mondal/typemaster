// ══════════════════════════════════════════════════════════════ RGB
// per-key chroma, with a wavefront that ripples out from each keystroke
//
// A board is plain data: palette, cap profile, row sculpt, case and switch
// sound. It imports nothing, so you can copy this one file into a project and
// edit it on its own. See themes.js for how to swap one in.

export const rgb = {
  // shot-blast black plastic: very fine, tight. case is smooth anodised.
  surface: {
    cap : { octaves:[[150,1.0],[300,0.45]], strength:3.4, repeat:5,
            roughBase:0.48, roughVar:0.30, normalScale:0.80, channel:1 },
    case: { octaves:[[130,1.0],[260,0.35]], strength:3.0, repeat:6,
            roughBase:0.32, roughVar:0.20, streak:0.62, normalScale:0.72 },
  },
  label: 'RGB',
  audio: 'redink', rate: 1.0,             // linear switches — no click, just thock
  cap: { sq: 6, taper: 0.13, dish: 0.060, grid: 24, wobble: 0 },
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
};
