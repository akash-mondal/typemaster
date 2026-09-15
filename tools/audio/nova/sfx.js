const SFX_DEF = {
  // ---- menus
  ui_move: () => finish(shape(osc(0.05, 1320, 1500, 'square'), 0.002, 50), 8),
  ui_select: () => finish(add(shape(osc(0.07, 880, 880, 'square'), 0.002, 30), delayed(shape(osc(0.12, 1320, 1320, 'square'), 0.002, 24), 0.06)), 8),
  ui_back: () => finish(add(shape(osc(0.07, 990, 990, 'square'), 0.002, 30), delayed(shape(osc(0.12, 660, 660, 'square'), 0.002, 24), 0.06)), 8),
  launch: () => finish(add(whoosh(1.0, 200, 2400, 0.8), shape(osc(1.0, 80, 240, 'saw', 0.6), 0.2, 2.5), 0.3)),

  // ---- the player's gun. Soft and low, never a click: the keyboard already clicks
  shot: () => finish(add(shape(onePoleLP(osc(0.12, 1400, 520, 'square', 0.4), 2600), 0.004, 34), shape(onePoleLP(noise(0.05), 3000), 0.002, 80), 0.15), 10),
  lock: () => finish(add(shape(osc(0.09, 740, 1480, 'tri', 0.5), 0.003, 30), delayed(shape(osc(0.06, 1480, 1480, 'sine'), 0.002, 50), 0.05), 0.5)),
  release: () => finish(shape(osc(0.12, 1200, 500, 'tri', 0.6), 0.004, 26)),
  miss: () => finish(shape(onePoleLP(osc(0.14, 160, 110, 'square'), 900), 0.004, 22), 10),
  denied: () => finish(add(shape(osc(0.08, 220, 220, 'square'), 0.002, 30), delayed(shape(osc(0.1, 180, 180, 'square'), 0.002, 30), 0.09)), 8),
  hit: () => finish(add(shape(bandpass(noise(0.1), 2600, 1.2), 0.001, 45), shape(osc(0.08, 700, 300, 'square', 0.5), 0.001, 50), 0.25), 10),
  mult_up: () => { let d = secs(0.35); [[0, 880], [0.06, 1109], [0.12, 1319]].forEach(([t, f]) => { d = add(d, delayed(shape(osc(0.12, f, f, 'square'), 0.002, 26), t), 0.35); }); return finish(d, 10); },
  nova_ready: () => { let d = secs(0.6); [[0, 1319], [0.08, 1760], [0.16, 2637]].forEach(([t, f]) => { d = add(d, delayed(fm(f, 0.4, { ratio: 3.5, index: 2, indexDecay: 5, attack: 0.002, decay: 0.3, sustain: 0, release: 0.1 }), t), 0.5); }); return finish(d); },

  // ---- enemies
  explode_s: () => finish(add(shape(onePoleLP(noise(0.35), 2400), 0.001, 12), shape(osc(0.25, 180, 50, 'sine'), 0.001, 14), 0.6)),
  explode_m: () => finish(add(add(shape(onePoleLP(noise(0.7), 1600), 0.001, 6), shape(osc(0.5, 120, 36, 'sine'), 0.001, 7), 0.8), delayed(shape(onePoleLP(noise(0.4), 900), 0.02, 8), 0.08), 0.5)),
  explode_l: () => finish(add(add(shape(onePoleLP(noise(1.4), 1100), 0.002, 2.6), shape(osc(1.0, 90, 28, 'sine'), 0.002, 3.2), 0.9), delayed(shape(onePoleLP(noise(0.9), 600), 0.05, 3.5), 0.15), 0.6)),
  missile: () => finish(add(whoosh(0.5, 900, 3000, 1.2), shape(osc(0.4, 300, 900, 'saw', 0.6), 0.01, 8), 0.2)),
  orb_fan: () => { let d = secs(0.5); for (let k = 0; k < 5; k++) d = add(d, delayed(shape(osc(0.12, 520 + k * 90, 900 + k * 90, 'sine'), 0.002, 30), k * 0.05), 0.5); return finish(d); },
  split: () => finish(add(shape(osc(0.3, 900, 200, 'tri', 0.5), 0.002, 12), shape(bandpass(noise(0.2), 3000, 1), 0.001, 20), 0.4)),
  turret_die: () => finish(add(shape(onePoleLP(noise(0.5), 2000), 0.001, 8), shape(ring(0.5, 520, METAL, 6), 0.001, 7), 0.5)),
  core_open: () => finish(add(shape(osc(0.8, 60, 240, 'saw', 0.7), 0.05, 4), shape(ring(0.9, 330, METAL, 3), 0.01, 4), 0.4)),
  boss_die: () => finish(add(add(shape(onePoleLP(noise(3.0), 900), 0.002, 1.2), shape(osc(2.2, 70, 20, 'sine'), 0.002, 1.5), 0.9), delayed(shape(onePoleLP(noise(1.5), 400), 0.1, 2), 0.4), 0.7)),

  // ---- the nova
  nova: () => { const d = add(add(shape(osc(1.4, 50, 900, 'saw', 0.35), 0.01, 2.6), whoosh(1.4, 300, 6000, 0.7), 0.6), shape(osc(1.2, 110, 30, 'sine'), 0.001, 3), 0.9); return finish(d); },

  // ---- capsules
  pickup_nova: () => { let d = secs(0.5); [[0, 1047], [0.05, 1568], [0.1, 2093]].forEach(([t, f]) => { d = add(d, delayed(shape(osc(0.15, f, f, 'square'), 0.002, 24), t), 0.35); }); return finish(d, 10); },
  pickup_repair: () => { let d = secs(0.6); [[0, 523], [0.07, 659], [0.14, 784], [0.21, 1047]].forEach(([t, f]) => { d = add(d, delayed(shape(osc(0.16, f, f, 'tri'), 0.002, 18), t), 0.5); }); return finish(d); },
  pickup_stasis: () => finish(add(shape(osc(1.0, 1400, 300, 'sine', 0.4), 0.01, 3), whoosh(1.0, 4000, 500, 2), 0.25)),

  // ---- the ship
  hurt: () => finish(add(add(shape(onePoleLP(noise(0.5), 1800), 0.001, 9), shape(osc(0.4, 240, 60, 'square', 0.5), 0.001, 9), 0.4), shape(ring(0.5, 180, METAL, 7), 0.001, 8), 0.4)),
  player_die: () => finish(add(add(shape(onePoleLP(noise(2.2), 1400), 0.002, 1.8), shape(osc(1.6, 400, 30, 'saw', 0.4), 0.002, 2.2), 0.5), shape(osc(1.8, 60, 22, 'sine'), 0.002, 2), 0.9)),
  warp: () => finish(add(add(shape(osc(2.4, 60, 1200, 'saw', 0.5), 0.3, 1.2), whoosh(2.4, 200, 5000, 0.6), 0.7), delayed(shape(onePoleLP(noise(0.6), 800), 0.001, 5), 1.9), 0.6)),
};
