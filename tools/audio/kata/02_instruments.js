
// ---------------------------------------------------------------- instruments
// Each renders a Float32Array at SR, tuned to `base` (a MIDI note).
const INSTR = {
  // koto: bright Karplus-Strong pluck with a wooden body
  koto: { base: 69, render: () => pluck(noteHz(69), 1.8, 0.5, 0.996) },
  // shamisen: a harder attack and the buzzing sawari of its top string
  shamisen: { base: 57, render: () => { const d = pluck(noteHz(57), 1.2, 0.85, 0.992); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 2.2) * 0.8; return d; } },
  // shakuhachi: a breathy flute with a scooped onset and slow vibrato
  shakuhachi: { base: 74, render: () => flute(noteHz(74), 2.4) },
  // FM bass: a Genesis bass, punchy and short
  bass: { base: 38, render: () => fm(noteHz(38), 1.0, { ratio: 1, index: 3.2, indexDecay: 6, attack: 0.004, decay: 0.25, sustain: 0.55, release: 0.12 }) },
  // FM brass: bright, swelling
  brass: { base: 62, render: () => fm(noteHz(62), 1.6, { ratio: 1, index: 2.6, indexAttack: 0.08, attack: 0.03, decay: 0.3, sustain: 0.8, release: 0.2 }) },
  // FM bell: inharmonic, long
  bell: { base: 81, render: () => fm(noteHz(81), 2.2, { ratio: 3.5, index: 4, indexDecay: 2.5, attack: 0.002, decay: 1.8, sustain: 0.0, release: 0.3 }) },
  // FM mallet (harbour marimba)
  mallet: { base: 72, render: () => fm(noteHz(72), 0.8, { ratio: 4, index: 2.2, indexDecay: 18, attack: 0.002, decay: 0.5, sustain: 0.0, release: 0.2 }) },
  // a soft string pad: detuned saws through a low-pass
  pad: { base: 60, render: () => pad(noteHz(60), 2.4) },
  // square lead, a little chorus
  lead: { base: 72, render: () => pulseLead(noteHz(72), 1.6) },
  // drums (base is nominal; drums are played at their own pitch)
  taiko: { base: 36, drum: true, render: () => taiko(62, 0.7, 1) },
  shime: { base: 36, drum: true, render: () => taiko(180, 0.18, 0.4) },
  tsuzumi: { base: 36, drum: true, render: () => tsuzumi() },
  snare: { base: 36, drum: true, render: () => snare() },
  hat: { base: 36, drum: true, render: () => hat(0.05) },
  ohat: { base: 36, drum: true, render: () => hat(0.22) },
  clack: { base: 36, drum: true, render: () => clack() },
  gong: { base: 36, drum: true, render: () => gong(3.0) },
};

function pluck(f, dur, bright, decay) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  const P = Math.max(2, Math.round(SR / f));
  const line = new Float32Array(P);
  for (let i = 0; i < P; i++) line[i] = (rnd() * 2 - 1) * (0.5 + bright * 0.5);
  // pre-filter the excitation: darker strings start duller
  for (let k = 0; k < Math.round((1 - bright) * 6); k++) for (let i = 1; i < P; i++) line[i] = (line[i] + line[i - 1]) * 0.5;
  let idx = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx];
    const nxt = line[(idx + 1) % P];
    const v = decay * (cur * (0.5 + bright * 0.05) + nxt * (0.5 - bright * 0.05));
    line[idx] = v;
    d[i] = cur;
    idx = (idx + 1) % P;
    prev = cur;
  }
  // a short body resonance, and a fade so it never clicks
  const body = bandpass(Float32Array.from(d), f * 2.1, 3);
  for (let i = 0; i < n; i++) d[i] = d[i] * 0.85 + body[i] * 0.35;
  for (let i = n - 800; i < n; i++) d[i] *= (n - i) / 800;
  return finish(d);
}

function fm(f, dur, o) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  const A = o.attack * SR, D = o.decay * SR, R = o.release * SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let I = o.index;
    if (o.indexDecay) I *= Math.exp(-t * o.indexDecay);
    if (o.indexAttack) I *= Math.min(1, t / o.indexAttack);
    const m = Math.sin(TAU * f * o.ratio * t) * I;
    d[i] = Math.sin(TAU * f * t + m) * env(i, n, A, D, o.sustain, R, n);
  }
  return finish(d);
}

function flute(f, dur) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = rnd() * 2 - 1;
  bandpass(noise, f, 8);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const scoop = 1 - 0.03 * Math.exp(-t * 14);            // bends up into the note
    const vib = 1 + 0.006 * Math.sin(TAU * 5.2 * t) * Math.min(1, t * 2);
    ph += TAU * f * scoop * vib / SR;
    const e = Math.min(1, t / 0.07) * (t > dur - 0.25 ? (dur - t) / 0.25 : 1);
    d[i] = (Math.sin(ph) * 0.8 + Math.sin(ph * 2) * 0.12 + noise[i] * 1.6 * (0.35 + 0.65 * Math.exp(-t * 6))) * e;
  }
  return finish(d);
}

function pad(f, dur) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  const dets = [-0.12, 0, 0.11];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const dt of dets) {
      const ff = f * Math.pow(2, dt / 12);
      // a band-limited saw from its first harmonics
      for (let h = 1; h <= 7; h++) v += Math.sin(TAU * ff * h * t) / h;
    }
    d[i] = v * Math.min(1, t / 0.35) * (t > dur - 0.4 ? (dur - t) / 0.4 : 1);
  }
  onePoleLP(d, 1800);
  return finish(d);
}

function pulseLead(f, dur) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = 1 + 0.005 * Math.sin(TAU * 5.5 * t) * Math.min(1, Math.max(0, t - 0.15) * 3);
    const p1 = (f * vib * t) % 1, p2 = (f * 1.004 * vib * t) % 1;
    const sq = (p1 < 0.35 ? 1 : -1) * 0.5 + (p2 < 0.5 ? 1 : -1) * 0.35;
    d[i] = sq * Math.min(1, t / 0.01) * (t > dur - 0.12 ? (dur - t) / 0.12 : 1) * (0.75 + 0.25 * Math.exp(-t * 3));
  }
  onePoleLP(d, 5200);
  return finish(d);
}

function taiko(f0, dur, depth) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f0 * (0.6 + 0.4 * Math.exp(-t * 18));
    ph += TAU * f / SR;
    d[i] = Math.sin(ph) * Math.exp(-t * (6 / dur)) + (rnd() * 2 - 1) * 0.5 * depth * Math.exp(-t * 60);
  }
  onePoleLP(d, 2200);
  return finish(d);
}
function tsuzumi() {
  const n = Math.floor(SR * 0.35), d = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 520 * (0.75 + 0.25 * Math.exp(-t * 30)) * (1 - 0.15 * Math.min(1, t * 6));   // the rising-falling "pon"
    ph += TAU * f / SR;
    d[i] = Math.sin(ph) * Math.exp(-t * 11) + (rnd() * 2 - 1) * 0.3 * Math.exp(-t * 90);
  }
  return finish(d);
}
function snare() {
  const n = Math.floor(SR * 0.25), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * Math.exp(-t * 18) + Math.sin(TAU * 190 * t) * 0.5 * Math.exp(-t * 30); }
  bandpass(d, 2200, 0.8);
  return finish(d);
}
function hat(len) {
  const n = Math.floor(SR * len), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * Math.exp(-t * (4 / len)); }
  onePoleHP(d, 6500);
  return finish(d, 10);
}
function clack() {                      // hyoshigi, two wooden clappers
  const n = Math.floor(SR * 0.12), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * Math.exp(-t * 70) + Math.sin(TAU * 1900 * t) * Math.exp(-t * 55) * 0.6; }
  bandpass(d, 1900, 2.5);
  return finish(d);
}
function gong(dur) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  const parts = [[110, 1], [163, 0.7], [237, 0.55], [331, 0.4], [407, 0.3], [553, 0.2]];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const [f, a] of parts) v += Math.sin(TAU * f * t * (1 + 0.002 * Math.sin(TAU * 0.7 * t))) * a * Math.exp(-t * (0.8 + f / 500));
    d[i] = v * Math.min(1, t / 0.01) + (rnd() * 2 - 1) * 0.3 * Math.exp(-t * 40);
  }
  return finish(d);
}

// ---------------------------------------------------------------- the bank
// Rendering every instrument and effect is a few hundred milliseconds of maths.
// None of it needs the audio context, so it starts as soon as the module loads,
// a few milliseconds at a time in idle moments, and is finished long before
// anyone presses a key. Unlocking then only wraps the finished samples in
// buffers, which is instant.
const BANK = { inst: {}, sfx: {} };
const RAW = { inst: {}, sfx: {} };
let bankBuilt = false, bankDone = false, rawDone = false;
const rawTodo = [];
let rawTimer = null;
function idle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 120 });
  else setTimeout(() => fn({ timeRemaining: () => 8 }), 16);
}
function prerender() {
  if (rawTimer || rawDone) return;
  seed = 1234567;
  for (const [k, v] of Object.entries(INSTR)) rawTodo.push(['inst', k, () => v.render()]);
  for (const [k, f] of Object.entries(SFX_DEF)) rawTodo.push(['sfx', k, f]);
  rawTimer = true;
  const step = (dl) => {
    // at most ~8 ms per slice; after unlock, keep slices short but do not wait for idle
    const until = performance.now() + Math.min(8, dl && dl.timeRemaining ? Math.max(3, dl.timeRemaining()) : 8);
    while (rawTodo.length && performance.now() < until) {
      const [kind, k, f] = rawTodo.shift();
      try { RAW[kind][k] = f(); } catch (e) { console.warn('kata-audio', k, e); }
      if (bankBuilt) wrap(kind, k);
    }
    if (rawTodo.length) { if (bankBuilt) setTimeout(step, 0); else idle(step); }
    else { rawDone = true; if (bankBuilt) bankDone = true; }
  };
  idle(step);
}
function wrap(kind, k) {
  const d = RAW[kind][k];
  if (!d || !AC) return;
  if (kind === 'inst') { const v = INSTR[k]; BANK.inst[k] = { buf: buffer(d), base: v.base, drum: !!v.drum }; }
  else BANK.sfx[k] = buffer(d);
}
function buildBank() {
  if (bankBuilt || !AC) return;
  bankBuilt = true;
  if (!rawTimer) prerender();
  for (const k of Object.keys(RAW.inst)) wrap('inst', k);
  for (const k of Object.keys(RAW.sfx)) wrap('sfx', k);
  if (rawDone) bankDone = true;
  else if (rawTodo.length && rawTodo[0][0] === 'inst') {
    // a key came before the instruments finished: finish them now so music can start
    while (rawTodo.length && rawTodo[0][0] === 'inst') { const [kind, k, f] = rawTodo.shift(); RAW[kind][k] = f(); wrap(kind, k); }
  }
}

function playSample(name, when, midiNote, dur, vol, pan, dest) {
  const I = BANK.inst[name];
  if (!I) return null;
  const src = AC.createBufferSource();
  src.buffer = I.buf;
  if (!I.drum && midiNote != null) src.playbackRate.value = Math.pow(2, (midiNote - I.base) / 12);
  const g = AC.createGain();
  const peak = vol == null ? 0.5 : vol;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.004);
  const stop = when + (I.drum ? I.buf.duration : Math.max(0.05, dur));
  if (!I.drum) {
    g.gain.setValueAtTime(peak, Math.max(when + 0.005, stop - 0.06));
    g.gain.linearRampToValueAtTime(0, stop + 0.08);
  }
  let node = g;
  if (pan && AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
  src.connect(g);
  node.connect(dest || musicBus);
  src.start(when);
  src.stop(stop + 0.12);
  return src;
}
