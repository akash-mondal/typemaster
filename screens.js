// ══════════════════════════════════════════════════════ things on the CRT
// A "screen" is one function. It gets a 2D canvas context and draws a frame:
//
//     function myScreen(ctx, width, height, seconds, now){ ... }
//
// Whatever it draws is pushed through the CRT shader — curvature, scanlines,
// aperture grille, halation, vignette — so it comes out looking like a tube
// rather than a flat canvas. You never touch WebGL or three.js.
//
// This is the same contract ThreeUI's own non-terminal variants use, so a
// screen written here is a legitimate CRT variant, not a bolt-on.
//
// TO USE ONE: set `screen` in props.js to its name.
// TO WRITE ONE: copy `typingGame` below. Draw with plain canvas 2D calls.
//   - Keep to the green/amber palette and it will read as a period machine.
//   - `INPUT` gives you the keyboard. Never add your own key listeners: the
//     boards already own those, and two sets fight each other.
//   - You are called once per frame. Keep per-frame work modest; the canvas is
//     re-uploaded to the GPU every time it changes.

// ── keyboard, for screens that need it ───────────────────────────────────────
// app.js fills this from the same keydown that drives the 3D keycaps, so a game
// and the board stay in step. `pull()` hands you everything typed since the
// last frame and clears it, which keeps a game independent of frame rate.
export const INPUT = {
  _chars: [],
  _back: 0,
  _enter: 0,
  down: new Set(),
  push(ch){ if(this._chars.length < 64) this._chars.push(ch); },
  backspace(){ this._back++; },
  enter(){ this._enter++; },
  pull(){
    const out = { chars: this._chars, back: this._back, enter: this._enter };
    this._chars = []; this._back = 0; this._enter = 0;
    return out;
  },
};

const GREEN = '#8df0b4', DIM = '#4f9a76', AMBER = '#ffba5e',
      HOT = '#eafff3', BAD = '#ff6b6b', BG = '#03100a';

// draw text with the phosphor bloom the tube expects: a glowing pass, then the
// same glyphs re-filled sharp so the stroke cores stay crisp
function glow(ctx, text, x, y, fill, size, halo){
  ctx.shadowColor = halo || 'rgba(28,236,132,0.85)';
  ctx.shadowBlur = size * 0.42;
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;   ctx.fillText(text, x, y);
}

// ══════════════════════════════════════════════════════════════ typing game
const WORDS = ('the quick brown fox jumps over lazy dog matrix zion oracle '
  + 'construct neural jack hardline operator sentinel nebuchadnezzar redpill '
  + 'kernel buffer syntax pointer compile runtime shader vertex render loop '
  + 'keyboard switch keycap platen carriage ribbon phosphor scanline').split(' ');

const game = {
  word: '', typed: '', ok: 0, miss: 0, done: 0, started: 0, best: 0,
};
function nextWord(){
  game.word = WORDS[(Math.random()*WORDS.length)|0];
  game.typed = '';
}
nextWord();

export function typingGame(ctx, W, H, seconds){
  const k = INPUT.pull();
  if(!game.started && (k.chars.length || k.back)) game.started = performance.now();

  for(const ch of k.chars){
    if(ch === ' '){                       // space commits the word
      if(game.typed === game.word){ game.done++; nextWord(); }
      continue;
    }
    const expected = game.word[game.typed.length];
    if(ch.toLowerCase() === expected){ game.typed += expected; game.ok++; }
    else game.miss++;
    if(game.typed === game.word){ game.done++; nextWord(); }
  }
  if(k.back) game.typed = game.typed.slice(0, Math.max(0, game.typed.length - k.back));

  const mins = game.started ? (performance.now() - game.started)/60000 : 0;
  const wpm  = mins > 0.002 ? Math.round((game.ok/5)/mins) : 0;
  game.best  = Math.max(game.best, wpm);
  const acc  = game.ok + game.miss ? Math.round(100*game.ok/(game.ok+game.miss)) : 100;

  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = BG; ctx.fillRect(0,0,W,H);
  ctx.textBaseline = 'top';

  const mono = s => `600 ${s.toFixed(1)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  const head = H*0.055, big = H*0.155, small = H*0.05;

  ctx.textAlign = 'left';
  ctx.font = mono(head);
  glow(ctx, 'TYPEMAXX', W*0.08, H*0.10, GREEN, head);
  ctx.textAlign = 'right';
  glow(ctx, `WPM ${String(wpm).padStart(3)}`, W*0.92, H*0.10, AMBER, head,
       'rgba(255,150,52,0.9)');

  // the word, with what you have typed already burned in brighter
  ctx.textAlign = 'center';
  ctx.font = mono(big);
  const full = ctx.measureText(game.word).width;
  let x = W/2 - full/2;
  ctx.textAlign = 'left';
  for(let i=0;i<game.word.length;i++){
    const ch = game.word[i];
    const wch = ctx.measureText(ch).width;
    glow(ctx, ch, x, H*0.36, i < game.typed.length ? HOT : DIM, big);
    x += wch;
  }

  // caret under the next letter
  ctx.textAlign = 'left';
  ctx.font = mono(big);
  let cx = W/2 - full/2;
  for(let i=0;i<game.typed.length;i++) cx += ctx.measureText(game.word[i]).width;
  if(Math.floor(seconds*2) % 2 === 0){
    ctx.fillStyle = GREEN;
    ctx.fillRect(cx, H*0.36 + big*1.02, Math.max(4, big*0.5), big*0.08);
  }

  ctx.textAlign = 'center';
  ctx.font = mono(small);
  glow(ctx, game.started ? `${game.done} words · ${acc}% accurate · best ${game.best}`
                         : 'type the word to begin',
       W/2, H*0.70, game.started ? DIM : GREEN, small);

  if(game.miss && Math.floor(seconds*6) % 2 === 0 && k.chars.length){
    ctx.font = mono(small);
    glow(ctx, 'MISS', W/2, H*0.80, BAD, small, 'rgba(255,80,80,0.9)');
  }
}

// ══════════════════════════════════════════════════════════════════ blank
// A tube that is on but showing nothing. Not simply black: the shader's
// curvature, scanlines, grille and vignette still run over it, so it reads as
// live glass rather than a hole. This is the one to start a new game from.
export function blankScreen(ctx, W, H){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = BG; ctx.fillRect(0,0,W,H);
  const g = ctx.createRadialGradient(W/2,H*0.52,H*0.05, W/2,H*0.52,W*0.62);
  g.addColorStop(0,   'rgba(70,150,110,0.14)');
  g.addColorStop(0.55,'rgba(40,110,80,0.06)');
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
}

// ── the registry props.js chooses from ───────────────────────────────────────
// 'terminal' is ThreeUI's authored boot log and is handled inside the renderer,
// so it is a string here rather than a function.
export const SCREENS = {
  blank: blankScreen,       // an empty tube — start here
  terminal: 'terminal',     // ThreeUI's Zion boot log
  typing: typingGame,       // the worked typing game
};
