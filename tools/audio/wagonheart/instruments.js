// ---------------------------------------------------------------- WAGONHEART's instruments
// A folk band on a 16-bit chip: banjo and guitar plucked with Karplus-Strong,
// a bowed fiddle, a reedy harmonica, an accordion, upright bass, a stompbox,
// shaker and brushes, and the ox bell. Rendered once, played at any pitch.
function banjo(f, dur) {
  // bright pluck, a hard twang at the start, and a little drum-head ring
  const d = pluck(f, dur, 0.95, 0.9935);
  for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = d[i] * (1 + 0.6 * Math.exp(-t * 40)) + Math.sin(TAU * f * 2.01 * t) * 0.12 * Math.exp(-t * 18); }
  onePoleHP(d, 180);
  return finish(d);
}
function guitar(f, dur) {
  const d = pluck(f, dur, 0.55, 0.9972);
  onePoleLP(d, 3200);
  return finish(d);
}
function uprightBass(f, dur) {
  const d = pluck(f, dur, 0.35, 0.9982);
  for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] += Math.sin(TAU * f * t) * 0.6 * Math.exp(-t * 3.5); }
  onePoleLP(d, 900);
  return finish(d);
}
function fiddle(f, dur) {
  // a bowed saw: slow bow attack, vibrato that arrives late, body resonance
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = 1 + 0.009 * Math.sin(TAU * 5.6 * t) * Math.min(1, Math.max(0, t - 0.18) * 2.5);
    ph = (ph + f * vib / SR) % 1;
    const bow = 0.85 + 0.15 * Math.sin(TAU * 2.3 * t) + (rnd() * 2 - 1) * 0.04;
    d[i] = (ph * 2 - 1) * bow * Math.min(1, t / 0.08) * (t > dur - 0.18 ? (dur - t) / 0.18 : 1);
  }
  bandpass(d, f * 2.2, 0.7);
  const body = new Float32Array(d);
  onePoleLP(body, 2600);
  for (let i = 0; i < n; i++) d[i] = d[i] * 0.6 + body[i] * 0.7;
  return finish(d);
}
function harmonica(f, dur) {
  // two reeds slightly apart, a breathy edge, a gentle hand tremolo
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const trem = 0.8 + 0.2 * Math.sin(TAU * 6.2 * t) * Math.min(1, t * 2);
    p1 = (p1 + f / SR) % 1; p2 = (p2 + f * 1.006 / SR) % 1;
    const reed = (p1 < 0.3 ? 1 : -1) * 0.5 + (p2 < 0.3 ? 1 : -1) * 0.45;
    d[i] = (reed + (rnd() * 2 - 1) * 0.12) * trem * Math.min(1, t / 0.03) * (t > dur - 0.1 ? (dur - t) / 0.1 : 1);
  }
  onePoleLP(d, 2800);
  return finish(d);
}
function accordion(f, dur) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  const dets = [0.996, 1, 1.004];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const k of dets) { const p = (f * k * t) % 1; v += (p < 0.45 ? 1 : -1) * 0.33; }
    d[i] = v * Math.min(1, t / 0.06) * (t > dur - 0.15 ? (dur - t) / 0.15 : 1) * (0.9 + 0.1 * Math.sin(TAU * 4 * t));
  }
  onePoleLP(d, 2200);
  return finish(d);
}
function stomp() {
  const n = Math.floor(SR * 0.3), d = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * (70 + 60 * Math.exp(-t * 30)) / SR; d[i] = Math.sin(ph) * Math.exp(-t * 14) + (rnd() * 2 - 1) * 0.35 * Math.exp(-t * 90); }
  onePoleLP(d, 1400);
  return finish(d);
}
function shaker() {
  const n = Math.floor(SR * 0.1), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * Math.min(1, t / 0.02) * Math.exp(-t * 40); }
  bandpass(d, 6000, 1);
  return finish(d, 10);
}
function brush() {
  const n = Math.floor(SR * 0.22), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * Math.exp(-t * 16); }
  bandpass(d, 2800, 0.6);
  return finish(d);
}
function oxbell() {
  return fm(noteHz(76), 1.6, { ratio: 2.76, index: 2.4, indexDecay: 3, attack: 0.001, decay: 1.4, sustain: 0, release: 0.2 });
}

const INSTR = {
  banjo: { base: 67, render: () => banjo(noteHz(67), 1.4) },
  guitar: { base: 55, render: () => guitar(noteHz(55), 2.0) },
  ubass: { base: 36, render: () => uprightBass(noteHz(36), 1.6) },
  fiddle: { base: 69, render: () => fiddle(noteHz(69), 1.8) },
  harmonica: { base: 72, render: () => harmonica(noteHz(72), 1.6) },
  accordion: { base: 60, render: () => accordion(noteHz(60), 2.0) },
  pad: { base: 60, render: () => pad(noteHz(60), 2.4) },
  bell: { base: 76, drum: false, render: () => oxbell() },
  stomp: { base: 36, drum: true, render: () => stomp() },
  shaker: { base: 36, drum: true, render: () => shaker() },
  brush: { base: 36, drum: true, render: () => brush() },
  clap: { base: 36, drum: true, render: () => clack() },
  drum: { base: 36, drum: true, render: () => taiko(90, 0.5, 0.6) },
};
