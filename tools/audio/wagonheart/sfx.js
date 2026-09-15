const SFX_DEF = {
  // ---- menus and store
  ui_move: () => finish(shape(ring(0.08, 1320, [[1, 1], [2.3, 0.3]], 30), 0.001, 40), 10),
  ui_select: () => finish(add(shape(ring(0.25, 880, [[1, 1], [2.76, 0.4]], 10), 0.001, 12), delayed(shape(ring(0.3, 1320, [[1, 1], [2.76, 0.4]], 10), 0.001, 10), 0.07), 0.8)),
  ui_back: () => finish(add(shape(ring(0.2, 990, [[1, 1], [2.76, 0.4]], 12), 0.001, 14), delayed(shape(ring(0.25, 660, [[1, 1], [2.76, 0.4]], 12), 0.001, 12), 0.07), 0.8)),
  coin: () => finish(add(shape(ring(0.3, 2400, [[1, 1], [1.5, 0.5], [2.8, 0.3]], 12), 0.001, 14), delayed(shape(ring(0.3, 3200, [[1, 1], [1.5, 0.5]], 12), 0.001, 14), 0.05), 0.6)),
  store_bell: () => finish(shape(ring(1.2, 1560, [[1, 1], [2.4, 0.5], [3.9, 0.25]], 2.5), 0.001, 3)),

  // ---- the wagon
  creak: () => { const d = secs(0.35); let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / SR; const f = 180 + 90 * Math.sin(TAU * 7 * t) + 40 * rnd(); ph += f / SR; d[i] = ((ph % 1) * 2 - 1) * Math.sin(Math.PI * t / 0.35); } bandpass(d, 900, 2); return finish(d, 10); },
  jolt: () => finish(add(shape(onePoleLP(noise(0.2), 700), 0.001, 20), shape(osc(0.15, 120, 60, 'sine'), 0.001, 25), 0.8)),
  whip: () => finish(add(shape(onePoleHP(noise(0.08), 3000), 0.0005, 70), delayed(shape(bandpass(noise(0.05), 5000, 2), 0.0005, 90), 0.03), 0.9)),
  wheels_break: () => finish(add(add(shape(onePoleLP(noise(0.6), 1800), 0.001, 6), shape(osc(0.4, 300, 80, 'saw', 0.4), 0.001, 8), 0.4), delayed(shape(bandpass(noise(0.3), 1200, 1), 0.001, 10), 0.12), 0.6)),
  hammer: () => { let d = secs(0.9); for (let k = 0; k < 3; k++) d = add(d, delayed(shape(ring(0.25, 1900, METAL, 18), 0.0005, 24), k * 0.26), 0.8); return finish(d); },
  rope: () => finish(whoosh(0.45, 800, 2400, 2)),
  mud: () => { const d = secs(0.6); for (let k = 0; k < 5; k++) { const b = delayed(shape(osc(0.1, 180 + rnd() * 80, 60, 'sine'), 0.002, 30), k * 0.1 + rnd() * 0.04); for (let i = 0; i < b.length && i < d.length; i++) d[i] += b[i]; } return finish(add(d, shape(onePoleLP(noise(0.6), 500), 0.05, 4), 0.5)); },

  // ---- the oxen
  moo: () => { const d = secs(1.1); let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / SR; const f = 110 + 25 * Math.sin(Math.PI * t / 1.1) - 20 * t; ph += f / SR; const v = ((ph % 1) * 2 - 1); d[i] = v * Math.min(1, t / 0.15) * (t > 0.8 ? (1.1 - t) / 0.3 : 1); } bandpass(d, 500, 1.2); return finish(d); },
  oxbell: () => finish(ring(1.2, 740, [[1, 1], [2.76, 0.45], [5.4, 0.2]], 2.4)),
  hooves: () => { let d = secs(0.6); for (let k = 0; k < 4; k++) d = add(d, delayed(shape(bandpass(noise(0.06), 600, 1.5), 0.001, 50), k * 0.15), 0.7); return finish(d, 10); },

  // ---- hunting
  shot: () => finish(add(add(shape(onePoleLP(noise(0.5), 3000), 0.0005, 14), shape(osc(0.2, 160, 50, 'sine'), 0.0005, 18), 0.8), delayed(shape(onePoleLP(noise(0.5), 700), 0.02, 6), 0.05), 0.4)),
  shot_miss: () => finish(whoosh(0.25, 2400, 600, 3)),
  animal_fall: () => finish(add(shape(onePoleLP(noise(0.3), 500), 0.002, 12), shape(osc(0.25, 90, 40, 'sine'), 0.002, 14), 0.8)),
  bolt: () => finish(add(whoosh(0.35, 400, 1600, 1), shape(bandpass(noise(0.2), 800, 1), 0.01, 10), 0.4)),
  stag: () => finish(add(shape(ring(1.4, 988, [[1, 1], [2, 0.3], [3, 0.15]], 1.8), 0.05, 2), delayed(shape(ring(1.2, 1480, [[1, 1], [2, 0.3]], 2), 0.05, 2), 0.25), 0.6)),

  // ---- water and weather
  splash: () => finish(add(shape(bandpass(noise(0.6), 1400, 0.7), 0.002, 7), shape(onePoleLP(noise(0.3), 500), 0.002, 10), 0.6)),
  thunder: () => finish(add(shape(onePoleLP(noise(3.0), 400), 0.02, 0.9), delayed(shape(onePoleLP(noise(0.5), 1500), 0.001, 8), 0.05), 0.7)),
  river_loop: () => finish(loopable(add(bandpass(noise(2.4), 700, 0.5), onePoleHP(noise(2.4), 3000), 0.12))),
  rain_loop: () => { const d = onePoleHP(noise(2.4), 2500); for (let k = 0; k < 160; k++) { const dr = delayed(shape(bandpass(noise(0.02), 4000, 2), 0.0005, 200), rnd() * 2.35); for (let i = 0; i < dr.length && i < d.length; i++) d[i] += dr[i] * 0.8; } return finish(loopable(d)); },
  wind_loop: () => { const d = noise(2.6), out = secs(2.6); const bl = Math.ceil(d.length / 26); for (let b = 0; b < 26; b++) { const seg = d.slice(b * bl, (b + 1) * bl); bandpass(seg, 300 + 250 * Math.sin(b / 26 * TAU * 2), 1.2); out.set(seg, b * bl); } return finish(loopable(out)); },
  crickets_loop: () => { const d = secs(2.4); for (let k = 0; k < 18; k++) { const at = rnd() * 2.2, f = 4200 + rnd() * 600; for (let c = 0; c < 4; c++) { const ch = delayed(shape(osc(0.018, f, f, 'sine'), 0.002, 120), at + c * 0.035); for (let i = 0; i < ch.length && i < d.length; i++) d[i] += ch[i] * 0.4; } } return finish(loopable(d), 10); },
  fire_loop: () => { const d = onePoleLP(noise(2.4), 600); for (let k = 0; k < 70; k++) { const p = delayed(shape(onePoleHP(noise(0.015), 2000), 0.0005, 180), rnd() * 2.35); for (let i = 0; i < p.length && i < d.length; i++) d[i] += p[i] * 1.2; } return finish(loopable(d)); },
  surf_loop: () => { const d = onePoleLP(noise(2.8), 900); for (let i = 0; i < d.length; i++) d[i] *= 0.45 + 0.55 * Math.pow(Math.sin(Math.PI * i / d.length), 2); return finish(loopable(d)); },

  // ---- creatures
  birds: () => { let d = secs(0.8); for (let k = 0; k < 3; k++) d = add(d, delayed(shape(osc(0.09, 2600 + rnd() * 800, 3400 + rnd() * 600, 'sine', 0.5), 0.004, 30), k * 0.18 + rnd() * 0.05), 0.5); return finish(d); },
  owl: () => { let d = secs(1.0); for (const [t, f] of [[0, 380], [0.35, 360]]) d = add(d, delayed(shape(osc(0.3, f, f * 0.94, 'sine'), 0.04, 5), t), 0.8); return finish(d); },
  howl: () => finish(shape(onePoleLP(osc(2.2, 380, 520, 'tri', 0.3), 1800), 0.25, 1.1)),
  gull: () => finish(shape(osc(0.5, 1400, 900, 'tri', 0.6), 0.01, 6)),
  rattle: () => { const d = noise(0.9); for (let i = 0; i < d.length; i++) d[i] *= 0.5 + 0.5 * Math.sin(TAU * 38 * i / SR); bandpass(d, 5000, 1.5); return finish(shape(d, 0.01, 2.5), 10); },
  stampede: () => finish(add(shape(onePoleLP(noise(2.5), 250), 0.4, 0.8), shape(osc(2.5, 45, 40, 'sine'), 0.4, 0.9), 0.6)),

  // ---- people
  cough: () => { let d = secs(0.6); for (let k = 0; k < 2; k++) d = add(d, delayed(shape(bandpass(noise(0.14), 700 + k * 100, 1.2), 0.004, 22), k * 0.22), 0.8); return finish(d); },
  heal: () => { let d = secs(0.9); [[0, 784], [0.08, 988], [0.16, 1175], [0.24, 1568]].forEach(([t, f]) => { d = add(d, delayed(shape(ring(0.5, f, [[1, 1], [2, 0.2]], 5), 0.002, 6), t), 0.4); }); return finish(d); },
  cheer: () => { let d = secs(0.8); for (let k = 0; k < 4; k++) d = add(d, delayed(shape(bandpass(osc(0.35, 300 + k * 60, 420 + k * 60, 'saw', 0.5), 900, 1), 0.02, 6), k * 0.05), 0.45); return finish(d); },
  hurt: () => finish(add(shape(onePoleLP(noise(0.25), 1200), 0.002, 14), shape(osc(0.2, 260, 140, 'saw', 0.5), 0.004, 14), 0.4)),

  // ---- graves and stones
  shovel: () => { let d = secs(1.0); for (let k = 0; k < 3; k++) d = add(d, delayed(add(shape(bandpass(noise(0.12), 1600, 1), 0.001, 25), shape(onePoleLP(noise(0.2), 400), 0.02, 12), 0.7), k * 0.32), 0.8); return finish(d); },
  carve: () => finish(add(shape(bandpass(noise(0.08), 3800, 3), 0.001, 40), shape(ring(0.08, 2200, METAL, 30), 0.001, 40), 0.3), 10),
  stone_wake: () => finish(add(add(shape(osc(2.0, 60, 90, 'sine'), 0.2, 1.4), shape(ring(2.0, 523, [[1, 1], [2.01, 0.5], [3.98, 0.25]], 1.2), 0.1, 1.2), 0.5), whoosh(1.8, 200, 3000, 0.7), 0.25)),

  // ---- journey beats
  arrive: () => finish(add(shape(ring(1.0, 988, [[1, 1], [2.76, 0.3]], 2.5), 0.001, 3), delayed(shape(ring(1.0, 1319, [[1, 1], [2.76, 0.3]], 2.5), 0.001, 3), 0.12), 0.7)),
  pickup: () => finish(add(shape(ring(0.2, 1760, [[1, 1], [2, 0.2]], 14), 0.001, 16), delayed(shape(ring(0.2, 2349, [[1, 1], [2, 0.2]], 14), 0.001, 16), 0.06), 0.7)),
  fire_whoosh: () => finish(add(whoosh(1.2, 150, 1200, 0.6), shape(onePoleLP(noise(1.2), 800), 0.2, 2), 0.6)),
};
