// ══════════════════════════════════════════════════════ drawing on the tube
// Three things about drawing text here are properties of the CRT rather than of
// any game, and each has already cost a debugging round when re-derived by hand:
//
//   Chrome RESETS ctx.letterSpacing whenever ctx.font is assigned. Set them in
//   the wrong order and a line measures narrower than it draws, so it overflows
//   after passing its own fit check.
//
//   A string must be measured with the exact font it will be drawn with. Two
//   passes that set the font independently drift apart, and the symptom is
//   glyphs landing on top of each other.
//
//   The glass curves away at the sides and the bezel crops what is left, so the
//   usable width is well short of the buffer. SAFE is that fraction.
//
// None of this is game logic — it is how this particular screen behaves.

const FAMILY = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const TEXT = {
  // fraction of the buffer width that actually survives the curve and the bezel
  SAFE: 0.84,

  // Always both, always this order. Returns the size so it can be chained.
  font(ctx, size, weight, track){
    ctx.font = `${weight || 600} ${size.toFixed(1)}px ${FAMILY}`;
    ctx.letterSpacing = `${((track || 0) * size).toFixed(2)}px`;
    return size;
  },

  // Measured with the font it is about to be drawn with, by construction.
  width(ctx, text, size, weight, track){
    TEXT.font(ctx, size, weight, track);
    return ctx.measureText(text).width;
  },

  // Shrink until it fits. Letter spacing is a fraction of the size, so it
  // shrinks with it rather than staying behind and overflowing anyway.
  fit(ctx, text, size, weight, track, maxW){
    const limit = maxW || 0;
    for(let i = 0; i < 40; i++){
      TEXT.font(ctx, size, weight, track);
      if(ctx.measureText(text).width <= limit) break;
      size *= 0.96;
    }
    return size;
  },

  // Phosphor: a blooming pass, then the same glyphs re-filled sharp so the
  // stroke cores stay crisp. A single pass reads as flat text on a dark panel.
  glow(ctx, text, x, y, colour, size, halo){
    ctx.shadowColor = halo || 'rgba(28,236,132,0.85)';
    ctx.shadowBlur  = size * 0.42;
    ctx.fillStyle   = colour;
    ctx.fillText(text, x, y);
    ctx.shadowBlur  = 0;
    ctx.fillText(text, x, y);
  },

  // Leave the context as you found it, or the next thing drawn inherits both.
  reset(ctx){
    ctx.letterSpacing = '0px';
    ctx.shadowBlur = 0;
  },
};
