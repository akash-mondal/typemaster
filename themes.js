// A key spec, matching what app.js builds internally:
//   label, shifted label, width in units, KeyboardEvent.code, style, leading gap
// Styles: 'a' alpha, 'm' modifier, 'x' accent.
const K = (l,s,w,c,st,gap) => ({l,s,w:w||1,c,st:st||'a',gap:gap||0});

// A 60%: no function row and no right-hand column, so the F-keys live on the
// number row and Del sits inline. Approximated from the reference photo — the
// widths are standard 60% ANSI, which is the most defensible reading of a
// tilted shot. Every row totals 15u.
const LAYOUT_60 = [
 [ K('Esc',null,1,'Escape','m'),
   K('1','!',1,'Digit1'),K('2','@',1,'Digit2'),K('3','#',1,'Digit3'),K('4','$',1,'Digit4'),
   K('5','%',1,'Digit5'),K('6','^',1,'Digit6'),K('7','&',1,'Digit7'),K('8','*',1,'Digit8'),
   K('9','(',1,'Digit9'),K('0',')',1,'Digit0'),K('-','_',1,'Minus'),K('=','+',1,'Equal'),
   K('Backspace',null,2,'Backspace','m') ],
 [ K('Tab',null,1.5,'Tab','m'),
   K('Q',null,1,'KeyQ'),K('W',null,1,'KeyW'),K('E',null,1,'KeyE'),K('R',null,1,'KeyR'),
   K('T',null,1,'KeyT'),K('Y',null,1,'KeyY'),K('U',null,1,'KeyU'),K('I',null,1,'KeyI'),
   K('O',null,1,'KeyO'),K('P',null,1,'KeyP'),
   K('[','{',1,'BracketLeft'),K(']','}',1,'BracketRight'),K('\\','|',1.5,'Backslash') ],
 [ K('Caps Lock',null,1.75,'CapsLock','m'),
   K('A',null,1,'KeyA'),K('S',null,1,'KeyS'),K('D',null,1,'KeyD'),K('F',null,1,'KeyF'),
   K('G',null,1,'KeyG'),K('H',null,1,'KeyH'),K('J',null,1,'KeyJ'),K('K',null,1,'KeyK'),
   K('L',null,1,'KeyL'),K(';',':',1,'Semicolon'),K("'",'"',1,'Quote'),
   K('Enter',null,2.25,'Enter','m') ],
 [ K('Shift',null,2.25,'ShiftLeft','m'),
   K('Z',null,1,'KeyZ'),K('X',null,1,'KeyX'),K('C',null,1,'KeyC'),K('V',null,1,'KeyV'),
   K('B',null,1,'KeyB'),K('N',null,1,'KeyN'),K('M',null,1,'KeyM'),
   K(',','<',1,'Comma'),K('.','>',1,'Period'),K('/','?',1,'Slash'),
   K('Shift',null,2.75,'ShiftRight','m') ],
 [ K('Ctrl',null,1.25,'ControlLeft','m'),K('Code',null,1.25,'MetaLeft','m'),
   K('Alt',null,1.25,'AltLeft','m'),K('',null,6.25,'Space','a'),
   K('Alt',null,1.25,'AltRight','m'),K('\u2318',null,1.25,'MetaRight','m'),
   K('Code',null,1.25,'ContextMenu','m'),K('Fn',null,1.25,'Fn','m') ],
];

// ══════════════════════════════════════════════════════════ theme definitions
// Each theme owns its palette, cap profile, row sculpt, case builder and switch
// sound. Everything else in the scene is shared.

export const THEMES = {

  walnut: {
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
  },

};
