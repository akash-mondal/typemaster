
// ---------------------------------------------------------------- sound effects
// A small toolkit, then every sound the game makes. All rendered once at unlock.
const secs = s => new Float32Array(Math.floor(SR * s));
function noise(s) { const d = secs(s); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; return d; }
function add(a, b, gb) { const n = Math.max(a.length, b.length), d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = (a[i] || 0) + (b[i] || 0) * (gb == null ? 1 : gb); return d; }
function delayed(a, s) { const off = Math.floor(s * SR), d = new Float32Array(a.length + off); d.set(a, off); return d; }
function shape(d, attack, decayRate) { for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= Math.min(1, t / Math.max(1e-4, attack)) * Math.exp(-t * decayRate); } return d; }
// an oscillator with a pitch glide: type sine | square | saw | tri
function osc(s, f0, f1, type, curve) {
  const d = secs(s); let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const u = i / d.length, f = f0 * Math.pow(f1 / f0, curve ? Math.pow(u, curve) : u);
    ph = (ph + f / SR) % 1;
    d[i] = type === 'square' ? (ph < 0.5 ? 1 : -1) : type === 'saw' ? ph * 2 - 1 : type === 'tri' ? 1 - 4 * Math.abs(ph - 0.5) : Math.sin(ph * TAU);
  }
  return d;
}
function ring(s, f, parts, decay) {   // struck metal: inharmonic partials
  const d = secs(s);
  for (let i = 0; i < d.length; i++) { const t = i / SR; let v = 0; for (const [m, a] of parts) v += Math.sin(TAU * f * m * t) * a * Math.exp(-t * decay * m); d[i] = v; }
  return d;
}
const METAL = [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2]];
function footstep(cut, q, bodyHz, len) {
  const d = shape(bandpass(noise(len), cut, q), 0.002, 40);
  return finish(add(d, shape(osc(len, bodyHz, bodyHz * 0.6, 'sine'), 0.001, 50), 0.6), 10);
}
function whoosh(s, f0, f1, q) {
  const d = noise(s), out = secs(s);
  // a band-pass swept across the noise, fading in and out
  const blocks = 24, bl = Math.ceil(d.length / blocks);
  for (let b = 0; b < blocks; b++) {
    const seg = d.slice(b * bl, (b + 1) * bl);
    bandpass(seg, f0 * Math.pow(f1 / f0, b / blocks), q);
    out.set(seg, b * bl);
  }
  for (let i = 0; i < out.length; i++) out[i] *= Math.sin(Math.PI * i / out.length);
  return out;
}

const SFX_DEF = {
  // ---- menus
  ui_move: () => finish(shape(add(osc(0.06, 880, 880, 'square'), osc(0.06, 1320, 1320, 'square'), 0.3), 0.002, 40), 8),
  ui_select: () => finish(add(shape(osc(0.08, 660, 660, 'square'), 0.002, 30), delayed(shape(osc(0.14, 990, 990, 'square'), 0.002, 22), 0.07)), 8),
  ui_back: () => finish(add(shape(osc(0.08, 660, 660, 'square'), 0.002, 30), delayed(shape(osc(0.12, 440, 440, 'square'), 0.002, 25), 0.06)), 8),
  count_tick: () => INSTR.clack.render(),
  count_go: () => add(INSTR.taiko.render(), gong(1.4), 0.5),

  // ---- typing
  key: () => finish(add(shape(bandpass(noise(0.05), 3200, 2), 0.001, 90), shape(osc(0.05, 1200, 900, 'sine'), 0.001, 70), 0.4), 10),
  key_wrong: () => finish(add(shape(osc(0.18, 180, 90, 'square'), 0.002, 22), shape(bandpass(noise(0.12), 900, 1.5), 0.001, 35), 0.8), 8),
  crack: () => finish(add(shape(onePoleHP(noise(0.2), 1500), 0.001, 25), delayed(shape(onePoleHP(noise(0.08), 2500), 0.001, 60), 0.05), 0.7)),
  tier_up: () => { let d = secs(0.6); [0, 0.06, 0.12].forEach((t, k) => { d = add(d, delayed(shape(ring(0.4, [880, 1175, 1760][k], [[1, 1], [2, 0.3]], 5), 0.001, 6), t)); }); return finish(d); },
  power_word: () => finish(add(shape(osc(0.08, 988, 988, 'square'), 0.001, 20), delayed(shape(osc(0.3, 1319, 1319, 'square'), 0.001, 10), 0.07)), 8),
  snuff: () => finish(add(whoosh(0.35, 2000, 400, 1.2), shape(onePoleHP(noise(0.5), 4000), 0.05, 6), 0.3)),

  // ---- feet and bodies
  step_tile: () => footstep(2400, 3, 180, 0.08),
  step_wood: () => footstep(900, 2, 140, 0.09),
  step_bamboo: () => footstep(1400, 6, 320, 0.08),
  step_snow: () => finish(shape(onePoleLP(noise(0.14), 1800), 0.01, 18), 10),
  step_plaster: () => footstep(1800, 1.5, 150, 0.07),
  jump: () => finish(add(whoosh(0.2, 600, 2400, 1.5), shape(osc(0.12, 220, 440, 'tri'), 0.002, 20), 0.25)),
  land: () => finish(add(shape(onePoleLP(noise(0.12), 700), 0.001, 30), shape(osc(0.12, 110, 60, 'sine'), 0.001, 26))),
  glide: () => finish(whoosh(1.0, 300, 900, 0.8)),
  climb_grip: () => finish(add(shape(bandpass(noise(0.1), 1200, 1.2), 0.004, 28), delayed(shape(bandpass(noise(0.06), 600, 2), 0.002, 50), 0.04), 0.6), 10),
  climb_metal: () => finish(add(shape(ring(0.18, 2200, METAL, 18), 0.001, 20), shape(bandpass(noise(0.08), 3000, 2), 0.001, 50), 0.5), 10),
  mantle: () => finish(add(whoosh(0.3, 500, 1500, 1), delayed(SFX_DEF.land(), 0.2), 0.8)),

  // ---- blades
  swing: () => finish(whoosh(0.22, 800, 4200, 2.2)),
  slash_hit: () => finish(add(add(whoosh(0.12, 3000, 1200, 2), shape(onePoleLP(noise(0.18), 900), 0.001, 20), 0.8), shape(osc(0.2, 140, 50, 'sine'), 0.001, 16), 0.7)),
  clash: () => finish(add(shape(ring(0.6, 1650, METAL, 5), 0.0005, 6), shape(onePoleHP(noise(0.08), 3000), 0.0005, 60), 0.8)),
  deflect: () => finish(add(SFX_DEF.clash(), delayed(shape(osc(0.35, 2600, 900, 'tri', 0.6), 0.002, 8), 0.05), 0.35)),
  parry: () => finish(add(shape(ring(0.9, 2090, METAL, 3.5), 0.0005, 4), shape(ring(0.9, 3135, METAL, 4), 0.0005, 5), 0.5)),
  catch: () => finish(add(shape(onePoleHP(noise(0.05), 2500), 0.0005, 80), delayed(shape(ring(0.25, 2800, METAL, 12), 0.0005, 14), 0.02), 0.6)),
  kill_word: () => finish(add(add(SFX_DEF.slash_hit(), shape(ring(1.2, 180, [[1, 1], [1.5, 0.6], [2.2, 0.4]], 1.5), 0.001, 2), 0.5), whoosh(0.3, 5000, 1500, 3), 0.6)),
  duel_start: () => finish(add(INSTR.taiko.render(), delayed(shape(ring(1.0, 1760, [[1, 1], [2.01, 0.4]], 2.5), 0.001, 2.5), 0.05), 0.4)),
  ronin_draw: () => finish(add(shape(bandpass(noise(0.45), 5000, 3), 0.1, 4), delayed(shape(ring(0.5, 2400, METAL, 7), 0.001, 8), 0.42), 0.5)),

  // ---- enemies
  throw: () => finish(whoosh(0.18, 1800, 600, 2)),
  // loops for as long as the star is in the air
  shuriken_whirr: () => { const d = secs(0.84); for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = Math.sin(TAU * 2400 * t) * (0.55 + 0.45 * Math.sin(TAU * 25 * t)); } return finish(loopable(add(d, bandpass(noise(0.84), 3000, 3), 0.35)), 10); },
  arrow_draw: () => { const d = secs(0.5); for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * (0.5 + 0.5 * Math.sin(TAU * (30 + t * 60) * t)) * Math.min(1, t * 6); } return finish(bandpass(d, 700, 4)); },
  arrow_loose: () => finish(add(shape(osc(0.3, 220, 200, 'saw'), 0.001, 14), whoosh(0.25, 3000, 1000, 2), 0.6)),
  enemy_die: () => finish(add(shape(bandpass(osc(0.35, 220, 90, 'saw'), 700, 1.2), 0.005, 7), delayed(SFX_DEF.land(), 0.25), 0.8)),
  shutter: () => finish(add(shape(onePoleLP(noise(0.1), 1200), 0.001, 40), shape(osc(0.1, 300, 200, 'square'), 0.001, 40), 0.3), 8),

  // ---- the player's fortunes
  hurt: () => finish(add(shape(osc(0.3, 440, 110, 'square'), 0.002, 9), shape(onePoleLP(noise(0.15), 1200), 0.001, 30), 0.7), 8),
  heart_pick: () => { let d = secs(0.5); [0, 0.05, 0.1, 0.15].forEach((t, k) => { d = add(d, delayed(shape(osc(0.12, [988, 1319, 1568, 1976][k], [988, 1319, 1568, 1976][k], 'square'), 0.001, 20), t), 0.5); }); return finish(d, 8); },
  heart_lost: () => { let d = secs(0.5); [0, 0.08, 0.16].forEach((t, k) => { d = add(d, delayed(shape(osc(0.14, [660, 494, 330][k], [640, 480, 300][k], 'square'), 0.001, 16), t), 0.5); }); return finish(d, 8); },
  body_fall: () => finish(add(whoosh(0.6, 1500, 300, 1), delayed(SFX_DEF.land(), 0.55))),

  // ---- the roof and the building
  roof_break: () => {
    let d = add(shape(onePoleLP(noise(1.3), 400), 0.02, 2.5), shape(osc(1.3, 70, 35, 'sine'), 0.01, 2.2), 0.8);
    for (let k = 0; k < 14; k++) d = add(d, delayed(shape(bandpass(noise(0.06), 1200 + rnd() * 2500, 3), 0.001, 55), 0.05 + rnd() * 1.0), 0.5);
    return finish(d);
  },
  building_fall: () => {
    let d = add(shape(onePoleLP(noise(2.6), 260), 0.3, 1.1), shape(osc(2.6, 55, 28, 'sine'), 0.2, 1.0));
    for (let k = 0; k < 30; k++) d = add(d, delayed(shape(bandpass(noise(0.08), 800 + rnd() * 3000, 2.5), 0.001, 40), rnd() * 2.2), 0.45);
    return finish(d);
  },

  // ---- the hook
  hook_throw: () => { const d = secs(0.5); for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * (0.5 + 0.5 * Math.sin(TAU * (9 + t * 22) * t)); } return finish(add(bandpass(d, 1100, 2.5), delayed(SFX_DEF.throw(), 0.3), 0.8)); },
  hook_catch: () => finish(add(shape(ring(0.4, 1250, METAL, 9), 0.0005, 10), shape(onePoleLP(noise(0.05), 2000), 0.0005, 60), 0.6)),
  rope_swing: () => finish(add(whoosh(0.7, 400, 1400, 1), shape(bandpass(noise(0.7), 500, 6), 0.05, 3), 0.25)),
  slip: () => finish(add(shape(osc(0.5, 900, 200, 'square'), 0.002, 4), whoosh(0.5, 2000, 500, 1), 0.5), 8),

  // ---- hazards of the worlds
  icicle_crack: () => finish(add(shape(onePoleHP(noise(0.1), 3500), 0.001, 50), shape(ring(0.3, 3200, [[1, 1], [1.7, 0.5]], 12), 0.001, 14), 0.4)),
  icicle_shatter: () => { let d = secs(0.6); for (let k = 0; k < 10; k++) d = add(d, delayed(shape(ring(0.25, 2500 + rnd() * 3000, [[1, 1], [2.3, 0.4]], 16), 0.0005, 20), rnd() * 0.25), 0.35); return finish(add(d, shape(onePoleHP(noise(0.15), 4000), 0.001, 30), 0.6)); },
  crate_creak: () => { const d = secs(0.6); for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * (0.5 + 0.5 * Math.sin(TAU * 45 * t)); } return finish(bandpass(d, 400 + 0, 8)); },
  thunder: () => finish(add(shape(onePoleLP(noise(2.4), 500), 0.005, 1.6), delayed(shape(onePoleLP(noise(1.8), 180), 0.05, 1.2), 0.2))),
  wave: () => finish(add(whoosh(2.0, 250, 2000, 0.6), delayed(shape(onePoleLP(noise(1.6), 1500), 0.3, 2.2), 0.5), 0.8)),
  blizzard: () => finish(whoosh(1.8, 600, 3000, 0.5)),
  petals: () => finish(add(whoosh(1.4, 1200, 5000, 1.2), shape(onePoleHP(noise(1.4), 6000), 0.3, 1.8), 0.3)),
  mist: () => finish(whoosh(1.6, 200, 900, 0.7)),
  // the shock under the torii: a sub drop and a rush of air (the gong belongs to the gate sting)
  gate_boom: () => finish(add(add(shape(osc(1.0, 95, 30, 'sine'), 0.002, 3.5), whoosh(0.7, 3000, 400, 1), 0.5), shape(onePoleLP(noise(0.25), 700), 0.001, 14), 0.6)),
  card_stamp: () => finish(add(INSTR.taiko.render(), shape(onePoleLP(noise(0.08), 900), 0.0005, 60), 0.6)),
  stage_up: () => { let d = secs(0.9); [[0, 587], [0.09, 880], [0.18, 1175]].forEach(([t, f]) => { d = add(d, delayed(fm(f, 0.6, { ratio: 1, index: 2, indexDecay: 4, attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.2 }), t), 0.5); }); return finish(d); },

  // ---- kata
  kata_tiger: () => finish(add(add(shape(bandpass(osc(1.0, 160, 70, 'saw'), 500, 0.8), 0.04, 2.8), shape(onePoleLP(noise(1.0), 900), 0.02, 3.5), 0.7), INSTR.taiko.render(), 0.9)),
  kata_still: () => { const d = osc(1.6, 60, 55, 'sine'); const rev = shape(onePoleHP(noise(1.0), 3000), 0.9, 0.2); for (let i = 0; i < d.length; i++) d[i] *= 0.6; return finish(add(d, rev, 0.35)); },
  kata_shadow: () => finish(add(whoosh(0.8, 3000, 300, 2), shape(osc(0.8, 440, 110, 'tri', 0.5), 0.02, 3), 0.25)),
  kata_crane: () => { let d = secs(1.0); for (let k = 0; k < 4; k++) d = add(d, delayed(whoosh(0.18, 500, 1400, 1.5), k * 0.16)); return finish(add(d, delayed(shape(ring(0.8, 1760, [[1, 1], [2, 0.3]], 3), 0.001, 3), 0.5), 0.5)); },
  kata_menu: () => finish(add(shape(ring(0.8, 440, [[1, 1], [2.4, 0.5], [3.9, 0.2]], 2), 0.001, 2.5), whoosh(0.6, 3000, 800, 1.5), 0.3)),

  // ---- the tower
  tower_enter: () => finish(add(INSTR.taiko.render(), delayed(whoosh(0.8, 300, 1500, 0.8), 0.1), 0.5)),
  threat_smoke: () => { const d = shape(onePoleLP(noise(2.0), 500), 0.5, 0); for (let k = 0; k < 40; k++) { const c = delayed(shape(onePoleHP(noise(0.02), 2000), 0.0005, 150), rnd() * 1.95); for (let i = 0; i < c.length && i < d.length; i++) d[i] += c[i] * 0.4; } return finish(loopable(d)); },
  threat_mist: () => finish(loopable(onePoleLP(noise(2.0), 700))),
  threat_avalanche: () => finish(loopable(add(onePoleLP(noise(2.0), 350), onePoleHP(noise(2.0), 5000), 0.15))),
  threat_guards: () => { const d = secs(2.0); for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = Math.sin(TAU * 73 * t) * 0.5 + Math.sin(TAU * 110.5 * t) * 0.35 + Math.sin(TAU * 146 * t) * 0.2 * (0.5 + 0.5 * Math.sin(TAU * 0.5 * t)); } return finish(loopable(add(d, onePoleLP(noise(2.0), 300), 0.5))); },
  threat_tide: () => { const d = onePoleLP(noise(2.0), 900); for (let i = 0; i < d.length; i++) d[i] *= 0.5 + 0.5 * Math.sin(Math.PI * i / d.length * 2); return finish(loopable(d)); },
};

// crossfade the ends so a buffer loops without a click
function loopable(d) {
  const x = Math.floor(SR * 0.2);
  for (let i = 0; i < x; i++) { const a = i / x; d[i] = d[i] * a + d[d.length - x + i] * (1 - a); }
  return d.subarray(0, d.length - x);
}
