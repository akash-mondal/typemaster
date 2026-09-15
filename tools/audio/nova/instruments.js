// ---------------------------------------------------------------- NOVA's instruments
// A 16-bit synth rack: FM bass, pulse arpeggio and lead, a string pad, glassy
// FM bells, and an electronic kit. Rendered once, played at any pitch.
function kick(dur) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 48 + 150 * Math.exp(-t * 32);
    ph += TAU * f / SR;
    d[i] = Math.sin(ph) * Math.exp(-t * 7) + (rnd() * 2 - 1) * 0.25 * Math.exp(-t * 120);
  }
  return finish(d);
}
function clap() {
  const n = Math.floor(SR * 0.3), d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // three quick slaps, then the room
    const burst = t < 0.03 ? (Math.floor(t / 0.01) % 2 === 0 ? 1 : 0.3) : Math.exp(-(t - 0.03) * 14);
    d[i] = (rnd() * 2 - 1) * burst;
  }
  bandpass(d, 1400, 0.9);
  return finish(d);
}
function crash(dur) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * Math.exp(-t * 2.2) * Math.min(1, t / 0.003); }
  onePoleHP(d, 4200);
  return finish(d, 10);
}
function tom(f0) {
  const n = Math.floor(SR * 0.4), d = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * f0 * (0.7 + 0.3 * Math.exp(-t * 20)) / SR; d[i] = Math.sin(ph) * Math.exp(-t * 9); }
  return finish(d);
}
// a plucked square: short, bright, the arpeggio's voice
function arpPluck(f, dur) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, p = (f * t) % 1;
    d[i] = (p < 0.25 ? 1 : -1) * Math.exp(-t * 9) + (p < 0.5 ? 0.3 : -0.3) * Math.exp(-t * 4);
  }
  onePoleLP(d, 4200);
  return finish(d);
}
function sub(f, dur) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (Math.sin(TAU * f * t) + Math.sin(TAU * f * 2 * t) * 0.18) * Math.min(1, t / 0.005) * (t > dur - 0.08 ? (dur - t) / 0.08 : 1); }
  return finish(d);
}

const INSTR = {
  bass: { base: 38, render: () => fm(noteHz(38), 1.0, { ratio: 1, index: 3.4, indexDecay: 7, attack: 0.003, decay: 0.2, sustain: 0.6, release: 0.1 }) },
  sub: { base: 33, render: () => sub(noteHz(33), 1.2) },
  arp: { base: 72, render: () => arpPluck(noteHz(72), 0.6) },
  lead: { base: 72, render: () => pulseLead(noteHz(72), 1.6) },
  pad: { base: 60, render: () => pad(noteHz(60), 2.4) },
  bell: { base: 81, render: () => fm(noteHz(81), 2.0, { ratio: 3.5, index: 3.2, indexDecay: 2.5, attack: 0.002, decay: 1.6, sustain: 0.0, release: 0.3 }) },
  brass: { base: 62, render: () => fm(noteHz(62), 1.6, { ratio: 1, index: 2.4, indexAttack: 0.06, attack: 0.02, decay: 0.3, sustain: 0.8, release: 0.2 }) },
  kick: { base: 36, drum: true, render: () => kick(0.5) },
  snare: { base: 36, drum: true, render: () => snare() },
  clap: { base: 36, drum: true, render: () => clap() },
  hat: { base: 36, drum: true, render: () => hat(0.04) },
  ohat: { base: 36, drum: true, render: () => hat(0.2) },
  crash: { base: 36, drum: true, render: () => crash(1.6) },
  tom: { base: 36, drum: true, render: () => tom(110) },
};
