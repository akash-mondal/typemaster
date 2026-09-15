// ---------------------------------------------------------------- VECTOR's sounds
// Nothing here plays on a keystroke: the game fires a sound for what the key
// caused (a turn at the cell centre, a sputter after a typo), never the key.
//
// The engine hum is three loops, low, mid and high, tuned to 55, 82 and 123 Hz
// (roughly fifths). A loop's handle can change only its volume, not its pitch,
// so the game crossfades the three with `set()` as speed rises. Each loop body is
// exactly 2.0 s and every tone and wobble in it completes whole cycles, so the
// wrap is seamless.
function vHum(f, cut) {
  const len = 2.2, n = Math.floor(SR * len), d = new Float32Array(n);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const wob = 1 + 0.003 * Math.sin(TAU * 2 * t);
    const dt = f * wob / SR;
    p1 += dt; if (p1 >= 1) p1 -= 1;
    p2 += dt / 2; if (p2 >= 1) p2 -= 1;
    const saw = 2 * p1 - 1 - vBlep(p1, dt);
    const sub = p2 < 0.5 ? 0.4 : -0.4;
    d[i] = (saw * 0.7 + sub + Math.sin(TAU * 2 * f * t) * 0.25) * (0.86 + 0.14 * Math.sin(TAU * 8 * t));
  }
  vMix(d, onePoleLP(noise(len), 1200), 0.06);
  vSVF(d, t => cut * (1 + 0.1 * Math.sin(TAU * 1 * t)), 1.3, 'lp');
  onePoleHP(d, 30);
  return finish(loopable(d), 10);
}
// a handful of glassy partials at random pitches, each a short ring
function vShards(len, count, lo, hi, spread) {
  let d = secs(len);
  for (let k = 0; k < count; k++) d = add(d, delayed(shape(ring(0.3, lo + rnd() * (hi - lo), [[1, 1], [2.32, 0.4], [4.1, 0.15]], 14), 0.0005, 18), rnd() * spread), 0.35);
  return d.subarray(0, Math.floor(SR * len));
}
// short spark crackles scattered over a stretch of time
function vSparks(len, count, cut) {
  const d = secs(len);
  for (let k = 0; k < count; k++) vMix(d.subarray(Math.floor(rnd() * (len - 0.02) * SR)), shape(onePoleHP(noise(0.015), cut), 0.0005, 220), 0.5 + rnd() * 0.5);
  return d;
}
// a sweep of a saw through a resonant low-pass
function vZap(len, f0, f1, cut0, cut1, q) {
  const d = osc(len, f0, f1, 'saw', 0.5);
  return vSVF(d, t => cut0 * Math.pow(cut1 / cut0, Math.min(1, t / len)), q, 'lp');
}

const SFX_DEF = {
  // ---- the engine and the bike
  engine_low: () => vHum(55, 420),
  engine_mid: () => vHum(82, 620),
  engine_high: () => vHum(123, 900),
  // the turn: a small rising chirp, soft and below the keyboard's click
  turn: () => finish(add(shape(vSVF(osc(0.08, 700, 1400, 'tri', 0.6), 2200, 0.7, 'lp'), 0.002, 40), shape(onePoleLP(noise(0.02), 1500), 0.0005, 200), 0.25), 10),
  // riding along a wall: a band of hiss, crackling sparks and a low scrape
  grind_loop: () => {
    const d = vSVF(noise(2.2), t => 1800 * (1 + 0.2 * Math.sin(TAU * 3 * t)), 1.2, 'bp');
    vMix(d, vSparks(2.2, 70, 2500), 0.6);
    const scrape = osc(2.2, 180, 180, 'saw');
    for (let i = 0; i < scrape.length; i++) scrape[i] *= 0.5 + 0.5 * Math.sin(TAU * 11 * i / SR);
    vMix(d, vSVF(scrape, 700, 1, 'lp'), 0.25);
    return finish(loopable(d), 10);
  },
  // the brake: a low rubbing band and a strained tone, with a 6 Hz judder
  brake_loop: () => {
    const d = vSVF(noise(2.2), 650, 3, 'bp');
    vMix(d, vSVF(osc(2.2, 90, 90, 'saw'), 500, 1, 'lp'), 0.35);
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.5) * (0.75 + 0.25 * Math.sin(TAU * 6 * i / SR));
    return finish(loopable(d), 10);
  },
  // the engine coughs three times after a typo
  sputter: () => {
    let d = secs(0.45);
    [[0, 1], [0.12, 0.75], [0.27, 0.5]].forEach(([t, g]) => { d = add(d, delayed(add(shape(vSVF(osc(0.1, 80, 50, 'saw'), 600, 1.5, 'lp'), 0.003, 28), shape(onePoleLP(noise(0.05), 900), 0.001, 60), 0.5), t), g); });
    return finish(d.subarray(0, Math.floor(SR * 0.45)), 10);
  },
  // the wall is cut: a falling zap with a flicker, and sparks
  wall_cut: () => {
    const z = vZap(0.45, 900, 120, 3000, 300, 3);
    for (let i = 0; i < z.length; i++) { const t = i / SR; z[i] *= Math.exp(-t * 6) * (0.6 + 0.4 * Math.sign(Math.sin(TAU * 28 * t))); }
    return finish(add(z, vSparks(0.45, 10, 3000), 0.4), 10);
  },

  // ---- words, pulse and cells
  // a finished word: a soft push of air and a low lift (it fires often: keep it modest)
  word_pulse: () => finish(add(shape(osc(0.35, 90, 180, 'sine', 0.5), 0.004, 9), whoosh(0.35, 300, 1800, 1.2), 0.35)),
  // the Pulse: a sub drop, a resonant sweep down, a shimmering ring going out
  pulse_ring: () => {
    const sub = shape(osc(1.2, 80, 36, 'sine', 0.4), 0.003, 3.5);
    const sw = vSVF(add(osc(1.2, 110, 110, 'saw'), osc(1.2, 165, 165, 'saw'), 0.7), t => 2400 * Math.pow(200 / 2400, Math.min(1, t / 0.8)), 4, 'lp');
    shape(sw, 0.005, 3);
    const shim = ring(1.2, 660, [[1, 1], [1.5, 0.5], [2.01, 0.3]], 2.2);
    for (let i = 0; i < shim.length; i++) shim[i] *= 0.6 + 0.4 * Math.sin(TAU * 7 * i / SR);
    return finish(add(add(add(sub, sw, 0.6), shim, 0.3), whoosh(1.0, 3000, 400, 1), 0.3));
  },
  pickup: () => finish(add(vArp(noteHz(84), 0.3, 3, 1400, 2, 1.2, 0.08), delayed(vArp(noteHz(91), 0.35, 3, 1400, 2, 1.2, 0.1), 0.06), 0.8)),
  cell_fire: () => finish(add(add(shape(osc(0.3, 150, 50, 'sine', 0.5), 0.002, 14), shape(vSVF(osc(0.3, 300, 900, 'square', 0.5), 1200, 2, 'bp'), 0.003, 12), 0.5), shape(onePoleLP(noise(0.1), 2500), 0.001, 40), 0.3)),
  // the shield takes the wall: glass breaks, a low knock
  shield_break: () => finish(add(add(vShards(0.8, 14, 2200, 5500, 0.12), shape(onePoleHP(noise(0.2), 2500), 0.0005, 30), 0.5), shape(osc(0.4, 200, 80, 'sine'), 0.002, 10), 0.6)),
  // the lance: a bolt leaving fast and falling in pitch as it goes
  lance: () => finish(add(add(shape(vZap(0.6, 2200, 250, 6000, 500, 5), 0.002, 5), whoosh(0.5, 3000, 700, 2), 0.5), shape(osc(0.15, 160, 60, 'sine'), 0.001, 25), 0.6)),
  // spikes rise: three metal zaps climbing
  spike: () => { let d = secs(0.5); [[0, 700], [0.07, 950], [0.14, 1300]].forEach(([t, f]) => { d = add(d, delayed(add(shape(ring(0.25, f, METAL, 10), 0.0005, 14), shape(vSVF(noise(0.08), f * 2, 3, 'bp'), 0.001, 40), 0.4), t), 0.6); }); return finish(d); },
  // phase: a detuned chord that beats and wobbles, out of step with the world
  phase: () => {
    const d = secs(1.0);
    for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = (Math.sin(TAU * 440 * t) + Math.sin(TAU * 443.5 * t) + 0.7 * Math.sin(TAU * 660 * t) + 0.7 * Math.sin(TAU * 665 * t)) * (0.6 + 0.4 * Math.sin(TAU * 12 * t)) * Math.sin(Math.PI * t); }
    return finish(add(d, whoosh(1.0, 800, 3000, 1.5), 0.3));
  },
  // surge: everything speeds up, a rise that ends in a bright blip
  surge: () => {
    const r = vSVF(osc(0.9, 110, 880, 'saw', 1.4), t => 400 * Math.pow(12, t / 0.9), 2.5, 'lp');
    for (let i = 0; i < r.length; i++) r[i] *= Math.pow(i / r.length, 1.5);
    return finish(add(add(r, whoosh(0.9, 400, 4000, 1), 0.4), delayed(shape(osc(0.15, 1760, 1760, 'tri'), 0.001, 25), 0.85), 0.4));
  },
  // reset: every wall fades, a long fall and a fizz
  reset: () => finish(add(shape(vSVF(osc(1.0, 1600, 60, 'saw', 0.6), t => 3000 * Math.pow(0.05, t), 2, 'lp'), 0.003, 3), shape(onePoleHP(noise(1.0), 5000), 0.01, 4), 0.2)),

  // ---- derez and seal
  // derez: a glassy shatter, a low thump, and a crushed arpeggio falling apart
  derez: () => {
    let d = add(vShards(1.3, 26, 1800, 6000, 0.45), shape(osc(0.6, 110, 38, 'sine', 0.5), 0.002, 6), 0.8);
    d = add(d, shape(onePoleLP(noise(0.3), 1600), 0.001, 16), 0.5);
    [1200, 900, 640, 450, 320].forEach((f, k) => { d = add(d, delayed(shape(vSVF(osc(0.07, f, f, 'square'), 2500, 0.7, 'lp'), 0.001, 30), 0.03 + k * 0.05), 0.2); });
    return finish(d, 9);
  },
  // the box closes: a lock click, then a suspended chord that swells and settles
  seal_close: () => {
    const chord = add(add(vSaws(noteHz(65), 1.4, 3, 8), vSaws(noteHz(72), 1.4, 3, 8), 0.8), vSaws(noteHz(79), 1.4, 3, 8), 0.6);
    vSVF(chord, t => 600 + 2200 * Math.exp(-t / 0.4), 1, 'lp');
    for (let i = 0; i < chord.length; i++) { const t = i / SR; chord[i] *= Math.min(1, t / 0.03) * Math.exp(-t * 1.8); }
    const click = shape(ring(0.08, 1800, METAL, 30), 0.0005, 60);
    return finish(add(add(chord, click, 0.5), shape(osc(0.5, 87, 87, 'sine'), 0.01, 5), 0.4));
  },

  // ---- portals and the arena
  portal: () => finish(add(add(whoosh(0.7, 3000, 250, 2), shape(osc(0.7, 600, 150, 'sine', 0.5), 0.02, 4), 0.4), delayed(shape(ring(0.5, 990, [[1, 1], [1.5, 0.4]], 5), 0.01, 6), 0.3), 0.25)),
  // a fault tile flickers for a second before it drops
  fault_warn: () => {
    const d = vSVF(osc(1.0, 700, 700, 'square'), 1400, 0.8, 'lp');
    for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= (Math.sin(TAU * 8 * t) > 0.2 ? 1 : 0.08) * (0.4 + 0.6 * t) * vTail(t, 1.0, 0.03); }
    return finish(add(d, vSparks(1.0, 12, 3000), 0.3), 10);
  },
  fault_fall: () => {
    const d = vSVF(noise(1.0), t => 2000 * Math.pow(0.05, t), 1, 'lp');
    shape(d, 0.01, 3);
    return finish(add(add(d, shape(osc(1.0, 70, 30, 'sine'), 0.02, 3), 0.8), vSparks(0.5, 10, 1500), 0.3));
  },
  // a gate bar turns: a servo whine, then a clunk
  gate_move: () => {
    const w = vSVF(osc(0.6, 110, 165, 'saw'), 800, 1.2, 'lp');
    for (let i = 0; i < w.length; i++) { const t = i / SR; w[i] *= Math.sin(Math.PI * t / 0.6) * (0.8 + 0.2 * Math.sin(TAU * 30 * t)); }
    return finish(add(w, delayed(add(shape(osc(0.2, 120, 60, 'sine'), 0.001, 20), shape(ring(0.2, 400, METAL, 14), 0.001, 18), 0.4), 0.55), 0.8));
  },

  // ---- the Overseer
  boss_sweep_warn: () => {
    const d = vSVF(osc(0.8, 200, 1200, 'saw', 1.2), t => 900 * Math.pow(4, t / 0.8), 3, 'bp');
    for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= (0.5 + 0.5 * Math.sin(TAU * (10 + 20 * t) * t)) * Math.min(1, t / 0.1) * vTail(t, 0.8, 0.04); }
    return finish(d);
  },
  boss_sweep: () => {
    const beam = add(osc(0.7, 80, 80, 'saw'), osc(0.7, 80.7, 80.7, 'saw'), 0.8);
    vSVF(beam, 900, 1.5, 'lp');
    const air = vSVF(noise(0.7), t => 500 * Math.pow(8, t / 0.7), 2, 'bp');
    const d = add(beam, air, 0.8);
    for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= Math.sin(Math.PI * Math.min(1, t / 0.7)) ** 0.5; }
    return finish(d);
  },
  boss_drop_warn: () => {
    const d = add(shape(osc(0.8, 2000, 500, 'sine', 0.8), 0.02, 1.5), osc(0.8, 60, 60, 'sine'), 0.5);
    for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= Math.min(1, t / 0.05) * vTail(t, 0.8, 0.05); }
    return finish(d);
  },
  boss_drop: () => finish(add(add(add(shape(osc(1.2, 90, 30, 'sine', 0.4), 0.001, 3), shape(onePoleLP(noise(0.3), 1800), 0.0005, 14), 0.7), shape(ring(1.0, 180, [[1, 1], [2.76, 0.5], [5.4, 0.25]], 2.5), 0.001, 3), 0.35), shape(vZap(0.25, 1200, 200, 4000, 400, 3), 0.001, 12), 0.25)),
  anchor_break: () => {
    let d = add(shape(onePoleHP(noise(0.15), 2000), 0.0005, 30), shape(osc(1.6, 110, 40, 'sine', 0.4), 0.002, 2.5), 0.9);
    d = add(d, vBraam(55, 1.8), 0.6);
    d = add(d, vShards(1.0, 16, 1500, 4500, 0.2), 0.4);
    return finish(add(d, shape(ring(1.8, 220, [[1, 1], [2.76, 0.5], [5.4, 0.3]], 1.6), 0.001, 2), 0.3));
  },

  // ---- flow and menus
  // bikes rez in with a vertical scan: a rising glassy sweep and a stair of blips
  rez_in: () => {
    let d = shape(osc(0.9, 300, 2400, 'tri', 1.2), 0.2, 2);
    for (let k = 0; k < 8; k++) d = add(d, delayed(shape(osc(0.05, 600 * Math.pow(2, k / 4), 600 * Math.pow(2, k / 4), 'square'), 0.001, 50), k * 0.08), 0.12);
    return finish(vSVF(add(d, whoosh(0.9, 500, 5000, 1.5), 0.3), 4000, 0.7, 'lp'));
  },
  count: () => finish(add(shape(osc(0.12, 880, 880, 'tri'), 0.001, 30), shape(osc(0.12, 1760, 1760, 'sine'), 0.001, 45), 0.25), 10),
  go: () => finish(add(add(vArp(noteHz(77), 0.5, 4, 1600, 2, 1.2, 0.12), vArp(noteHz(84), 0.5, 4, 1600, 2, 1.2, 0.12), 0.8), whoosh(0.5, 400, 3000, 1), 0.3)),
  ui_move: () => finish(shape(osc(0.05, 1200, 1250, 'tri'), 0.001, 60), 10),
  ui_select: () => finish(add(shape(osc(0.08, 880, 880, 'tri'), 0.001, 30), delayed(shape(osc(0.14, 1320, 1320, 'tri'), 0.001, 22), 0.06)), 10),
  ui_back: () => finish(add(shape(osc(0.08, 990, 990, 'tri'), 0.001, 30), delayed(shape(osc(0.12, 660, 660, 'tri'), 0.001, 25), 0.06)), 10),
};
