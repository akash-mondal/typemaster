// ══════════════════════════════════════════════════════════════ PLATINUM
// Apple M0110A — 60%, beige, boxy, barely-sculpted caps
//
// A board is plain data: palette, cap profile, row sculpt, case and switch
// sound. It imports nothing, so you can copy this one file into a project and
// edit it on its own. See themes.js for how to swap one in.

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

export const platinum = {
  label: 'PLATINUM',
  audio: 'bluealps', rate: 1.0,
  // M0110A caps are boxy with big flat tops — barely sculpted, barely dished
  cap: { sq: 9, taper: 0.07, dish: 0.022, grid: 22, wobble: 0 },
  layout: LAYOUT_60,                       // this board is a 60%, not a 75%
  rows: [ {h:1.10,tilt:-6.5},{h:1.06,tilt:-3.0},{h:1.02,tilt: 0.0},
          {h:1.06,tilt: 3.5},{h:1.10,tilt: 6.5} ],
  jitter: { rot:0.16, pos:0.003 },
  // Two-tone, and the case is NOT the same colour as the caps: the shell is a
  // bright cool platinum white while the caps are warm — only the letters and
  // the spacebar are pale, every number, symbol and modifier is beige.
  colour: { alpha:0xEDE9DD, mod:0xC7BCA2, accent:0xC7BCA2,
            legend:'#2C2A26', legendAccent:'#2C2A26',
            case:0xF1F0EA, tray:0xB9AF97, screw:0x8E8677 },
  lettersOnlyAlpha: true,
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
};
