// ---------------------------------------------------------------- VECTOR's instruments
// An orchestra and an analog rack on a 16-bit chip, after tools/audio/vector/STYLE.md:
// band-limited detuned saws through resonant filters for the pulse bass, arps,
// lead, brass and strings; a braam low hit and timpani for the big moments; a
// filter-house kit. Every patch is rendered once at its base note and played at
// any pitch by playback rate, so filter envelopes track the key as they would on
// a sampler. There is no sidechain in the shared engine: the pumping pad has the
// duck baked into its attack, and is retriggered on every beat.

// polyBLEP: rounds off a saw's reset so high notes do not alias into grit
function vBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
// `voices` saws spread evenly across ±`spread` cents, summed; o.bend(t) is a pitch factor
function vSaws(f, dur, voices, spread, o) {
  o = o || {};
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  for (let v = 0; v < voices; v++) {
    const c = voices === 1 ? 0 : -spread + 2 * spread * v / (voices - 1);
    const fv = f * Math.pow(2, c / 1200);
    let ph = rnd();
    for (let i = 0; i < n; i++) {
      const dt = fv * (o.bend ? o.bend(i / SR) : 1) / SR;
      ph += dt; if (ph >= 1) ph -= 1;
      d[i] += (2 * ph - 1 - vBlep(ph, dt)) / voices;
    }
  }
  return d;
}
// a band-limited pulse; width may be a function of time (pulse-width modulation)
function vPulse(f, dur, width, o) {
  o = o || {};
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  let ph = rnd();
  for (let i = 0; i < n; i++) {
    const t = i / SR, dt = f * (o.bend ? o.bend(t) : 1) / SR;
    ph += dt; if (ph >= 1) ph -= 1;
    let p2 = ph + (typeof width === 'function' ? width(t) : width); if (p2 >= 1) p2 -= 1;
    d[i] = ((2 * ph - 1 - vBlep(ph, dt)) - (2 * p2 - 1 - vBlep(p2, dt))) * 0.5;
  }
  return onePoleHP(d, 15);
}
// a resonant state-variable filter (TPT form, stable under fast sweeps);
// cut is Hz or a function of time; mode lp | bp | hp
function vSVF(d, cut, q, mode) {
  const k = 1 / Math.max(0.3, q), fixed = typeof cut !== 'function';
  let ic1 = 0, ic2 = 0, g = 0;
  if (fixed) g = Math.tan(Math.PI * Math.min(cut, SR * 0.45) / SR);
  for (let i = 0; i < d.length; i++) {
    if (!fixed) g = Math.tan(Math.PI * Math.max(20, Math.min(cut(i / SR), SR * 0.45)) / SR);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v0 = d[i], v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    d[i] = mode === 'hp' ? v0 - k * v1 - v2 : mode === 'bp' ? v1 : v2;
  }
  return d;
}
// a short fade at the end of a rendered note, so a sample never clicks off
const vTail = (t, dur, r) => (t > dur - r ? Math.max(0, (dur - t) / r) : 1);
function vMix(d, src, g) { for (let i = 0; i < d.length && i < src.length; i++) d[i] += src[i] * g; return d; }
// four swept allpass stages: the lead's phaser
function vPhaser(d, rate, lo, hi) {
  const x1 = [0, 0, 0, 0], y1 = [0, 0, 0, 0];
  for (let i = 0; i < d.length; i++) {
    const fc = lo * Math.pow(hi / lo, 0.5 + 0.5 * Math.sin(TAU * rate * i / SR));
    const tn = Math.tan(Math.PI * fc / SR), a = (tn - 1) / (tn + 1);
    let x = d[i];
    for (let s = 0; s < 4; s++) { const y = a * x + x1[s] - a * y1[s]; x1[s] = x; y1[s] = y; x = y; }
    d[i] = (d[i] + x) * 0.5;
  }
  return d;
}
// a cheap hall: three feedback combs, mixed under the dry signal
function vHall(d, mix, fb) {
  const out = Float32Array.from(d);
  for (const ms of [37, 43, 53]) {
    const L = Math.floor(SR * ms / 1000), buf = new Float32Array(L);
    let w = 0, lp = 0;
    for (let i = 0; i < d.length; i++) { const y = buf[w]; lp = lp * 0.4 + y * 0.6; buf[w] = d[i] + lp * fb; w = (w + 1) % L; out[i] += y * mix / 3; }
  }
  return out;
}

// pulse bass: two saws ±6 cents and a square an octave down at 30%, through two
// cascaded low-passes with a snappy filter envelope
function vBass(f, dur, cut, oct, q) {
  const d = vSaws(f, dur, 2, 6);
  vMix(d, vPulse(f / 2, dur, 0.5), 0.3);
  const env = t => Math.pow(2, oct * Math.exp(-t / 0.05));
  vSVF(d, t => cut * env(t), q, 'lp');
  vSVF(d, t => cut * 1.6 * env(t), 0.8, 'lp');
  for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= Math.min(1, t / 0.002) * (0.3 + 0.7 * Math.exp(-t / 0.05)) * vTail(t, dur, 0.03); }
  return finish(d);
}
// arp pluck: a unison of saws, a low filter that the envelope throws wide open
function vArp(f, dur, voices, cut, oct, q, decay) {
  const d = vSaws(f, dur, voices, 7);
  vSVF(d, t => cut * Math.pow(2, oct * Math.exp(-t / 0.07)), q, 'lp');
  for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= Math.min(1, t / 0.002) * Math.exp(-t / decay) * vTail(t, dur, 0.02); }
  onePoleHP(d, 120);
  return finish(d);
}
// distorted lead: saw, saw an octave up, a pulse sub and some noise, driven, then a
// resonant low-pass, a phaser and a 1/32 slapback; notes scoop up into pitch as
// a stand-in for legato glide (every note is its own sample)
function vLead(f, dur) {
  const bend = t => Math.pow(2, -40 * Math.exp(-t / 0.025) / 1200) * (1 + 0.005 * Math.sin(TAU * 5.5 * t) * Math.min(1, Math.max(0, t - 0.25) * 3));
  const d = vSaws(f * Math.pow(2, 3 / 1200), dur, 1, 0, { bend });
  vMix(d, vSaws(f * 2 * Math.pow(2, -5 / 1200), dur, 1, 0, { bend }), 0.5);
  vMix(d, vPulse(f / 2, dur, 0.35, { bend }), 0.2);
  vMix(d, onePoleLP(noise(dur), 4000), 0.2);
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 2.0) * 0.8;
  vSVF(d, t => 1500 + 1600 * Math.exp(-t / 0.25), 2.6, 'lp');
  vPhaser(d, 0.4, 300, 2400);
  const slap = Math.floor(SR * 0.0625), out = Float32Array.from(d);
  for (let i = slap; i < d.length; i++) out[i] += d[i - slap] * 0.28;
  for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] *= Math.min(1, t / 0.006) * vTail(t, dur, 0.1); }
  return finish(out);
}
// brass stab: six saws and pulses ±10 cents with slow PWM, a filter that jumps up
// 1.5 octaves and falls back
function vStab(f, dur) {
  const d = vSaws(f, dur, 3, 10);
  for (const c of [-9, 2, 10]) vMix(d, vPulse(f * Math.pow(2, c / 1200), dur, t => 0.3 + 0.15 * Math.sin(TAU * 0.7 * t + c)), 0.28);
  vSVF(d, t => 1000 * Math.pow(2, 1.5 * Math.min(1, t / 0.01) * Math.exp(-Math.max(0, t - 0.01) / 0.083)), 1.5, 'lp');
  for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = Math.tanh(d[i] * 1.5 * Math.min(1, t / 0.005) * (0.4 + 0.6 * Math.exp(-t / 0.1)) * vTail(t, dur, 0.15)); }
  return finish(d);
}
// low brass for held themes: seven saws, a filter that opens slowly
function vBrass(f, dur) {
  const bend = t => 1 + 0.004 * Math.sin(TAU * 4.8 * t) * Math.min(1, Math.max(0, t - 0.7));
  const d = vSaws(f, dur, 7, 12, { bend });
  vSVF(d, t => 220 + 1500 * (1 - Math.exp(-t / 0.35)) * (1 + 0.06 * Math.sin(TAU * 3 * t)), 0.9, 'lp');
  onePoleLP(d, 3000);
  for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = Math.tanh(d[i] * 1.4 * Math.min(1, t / 0.12) * vTail(t, dur, 0.35)); }
  return finish(d);
}
// low strings for 16th ostinatos: saws with a short decay, high-passed at 80 Hz
function vString(f, dur) {
  const d = vSaws(f, dur, 4, 8);
  vMix(d, vSaws(f * 2, dur, 1, 0), 0.2);
  vSVF(d, t => 2600 * (0.6 + 0.4 * Math.exp(-t / 0.1)), 0.8, 'lp');
  for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= Math.min(1, t / 0.006) * (0.35 + 0.65 * Math.exp(-t / 0.06)) * vTail(t, dur, 0.05); }
  onePoleHP(onePoleHP(d, 80), 80);
  return finish(d);
}
// high strings: a long swell with late vibrato
function vSwell(f, dur) {
  const bend = t => 1 + 0.005 * Math.sin(TAU * 5 * t) * Math.min(1, Math.max(0, t - 0.6));
  const d = vSaws(f, dur, 6, 9, { bend });
  vSVF(d, 3200, 0.7, 'lp');
  onePoleHP(d, 250);
  for (let i = 0; i < d.length; i++) { const t = i / SR, u = Math.min(1, t / 1.4); d[i] *= u * u * (3 - 2 * u) * vTail(t, dur, 0.6); }
  return finish(d);
}
// a Vangelis pad: saws and PWM pulses, a slowly breathing filter.
// `pump` gives the sidechain shape: it starts at 30% and recovers in ~200 ms
function vPad(f, dur, attack, cut, pump) {
  const d = vSaws(f, dur, 4, 10);
  vMix(d, vPulse(f * 1.003, dur, t => 0.5 + 0.2 * Math.sin(TAU * 0.3 * t)), 0.35);
  vMix(d, vPulse(f * 0.997, dur, t => 0.5 + 0.2 * Math.sin(TAU * 0.23 * t + 1)), 0.35);
  vSVF(d, t => cut * (1 + 0.35 * Math.sin(TAU * 0.25 * t)), 1.1, 'lp');
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const a = pump ? Math.min(1, t / 0.003) * (0.3 + 0.7 * (1 - Math.exp(-t / 0.07))) : Math.min(1, t / attack);
    d[i] *= a * vTail(t, dur, pump ? 0.08 : 0.5);
  }
  return finish(d);
}
// a low drone: saws and a sine sub, dark and slowly moving; quick to speak so
// retriggered notes join without a dip
function vDrone(f, dur) {
  const d = vSaws(f, dur, 3, 5);
  for (let i = 0; i < d.length; i++) d[i] += Math.sin(TAU * f / 2 * i / SR) * 0.6;
  vSVF(d, t => 480 * (1 + 0.25 * Math.sin(TAU * 0.5 * t)), 1.4, 'lp');
  for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= Math.min(1, t / 0.04) * vTail(t, dur, 0.12); }
  return finish(d);
}
// low hit (braam): saws one and two octaves under the played root that start 40
// cents flat, a filter that bursts open and slowly closes, a sine sub, a noise
// thump at 300 Hz and a drum under it, driven into a hall and crushed to 10 bits
function vBraam(f, dur) {
  const bend = t => Math.pow(2, -40 * Math.exp(-t / 0.05) / 1200);
  const d = vSaws(f, dur, 5, 15, { bend });
  vMix(d, vSaws(f / 2, dur, 4, 15, { bend }), 0.9);
  vSVF(d, t => (t < 0.3 ? 200 * Math.pow(10, t / 0.3) : 2000 * Math.pow(150 / 2000, Math.min(1, (t - 0.3) / 2.5))), 1.2, 'lp');
  const nz = vSVF(noise(dur), 300, 1, 'bp');
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    ph += TAU * (40 + 35 * Math.exp(-t * 20)) / SR;
    const drum = Math.sin(ph) * Math.exp(-t / 0.25);
    d[i] = Math.tanh((d[i] * Math.exp(-t / 1.6) + Math.sin(TAU * f / 2 * t) * 0.5 * Math.exp(-t / 1.2) + nz[i] * 1.2 * Math.exp(-t / 0.06) + drum * 0.7) * 2) * Math.min(1, t / 0.004);
  }
  const out = vHall(d, 0.5, 0.72);
  for (let i = 0; i < out.length; i++) out[i] *= vTail(i / SR, dur, 0.4);
  return finish(out, 10);
}
// timpani: a membrane's inharmonic modes, a pitch that sags as the head settles
function vTimp(f, dur) {
  const n = Math.floor(SR * dur), d = new Float32Array(n);
  const modes = [[1, 1], [1.504, 0.5], [1.742, 0.3], [2.0, 0.22], [2.245, 0.14]];
  const ph = modes.map(() => 0);
  const mallet = onePoleLP(noise(dur), 600);
  for (let i = 0; i < n; i++) {
    const t = i / SR, b = 1 + 0.05 * Math.exp(-t / 0.03);
    let v = 0;
    modes.forEach(([m, a], k) => { ph[k] += TAU * f * m * b / SR; v += Math.sin(ph[k]) * a * Math.exp(-t * (1.4 + m * 0.9)); });
    d[i] = (v + mallet[i] * 1.4 * Math.exp(-t / 0.015)) * Math.min(1, t / 0.002) * vTail(t, dur, 0.2);
  }
  return finish(d);
}
// kick: a sine from 150 Hz to 45 Hz over 80 ms, a 2 ms click, soft-clipped
function vKick() {
  const dur = 0.42, n = Math.floor(SR * dur), d = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += TAU * (45 + 105 * Math.exp(-t / 0.027)) / SR;
    d[i] = Math.tanh((Math.sin(ph) * Math.exp(-t / 0.09) + (t < 0.002 ? (rnd() * 2 - 1) * 0.6 : 0)) * 1.6) * vTail(t, dur, 0.05);
  }
  return finish(d);
}
// clap: three bursts of band-passed noise 10 ms apart, a short plate, gated at 150 ms
function vClap() {
  const dur = 0.17, d = noise(dur);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    let e = 0;
    for (const s of [0, 0.01, 0.02]) if (t >= s) e = Math.max(e, Math.exp(-(t - s) / 0.006));
    e = Math.max(e, 0.45 * Math.exp(-Math.max(0, t - 0.02) / 0.05) * Math.min(1, t / 0.02));
    d[i] *= e * (t > 0.15 ? Math.max(0, 1 - (t - 0.15) / 0.02) : 1);
  }
  vSVF(d, 1250, 1.1, 'bp');
  return finish(d, 10);
}
// hats: noise above 7 kHz, softened on top so they never fizz over the keyboard
function vHat(decay, len) {
  const d = noise(len);
  for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= Math.exp(-t / decay) * Math.min(1, t / 0.001) * vTail(t, len, 0.01); }
  vSVF(vSVF(d, 7000, 0.7, 'hp'), 11000, 0.7, 'lp');
  return finish(d, 10);
}
// a big low drum for phrase downbeats
function vBoom() {
  const dur = 1.4, n = Math.floor(SR * dur), d = new Float32Array(n);
  const nz = onePoleLP(noise(dur), 400);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += TAU * (38 + 55 * Math.exp(-t / 0.07)) / SR;
    d[i] = Math.tanh((Math.sin(ph) * Math.exp(-t / 0.45) + nz[i] * 2.5 * Math.exp(-t / 0.04)) * 1.4) * vTail(t, dur, 0.1);
  }
  return finish(vHall(d, 0.35, 0.6));
}
// riser: noise through a band-pass swept up, a rising tone under it, growing
// to its end and stopping dead (the hard cut is the point)
function vRiser(dur) {
  const d = noise(dur);
  vSVF(d, t => 250 * Math.pow(4500 / 250, t / dur), 1.4, 'bp');
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR, u = t / dur;
    ph += TAU * 110 * Math.pow(4, u) / SR;
    d[i] = (d[i] + Math.sin(ph) * 0.12) * Math.pow(u, 2.2) * vTail(t, dur, 0.004);
  }
  onePoleHP(d, 100);
  return finish(d, 10);
}
// a soft crash for cuts: noise above 3.5 kHz, a slow decay
function vCrash() {
  const dur = 1.8, d = noise(dur);
  for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] *= Math.min(1, t / 0.001) * Math.exp(-t / 0.5) * vTail(t, dur, 0.2); }
  vSVF(vSVF(d, 3500, 0.7, 'hp'), 9000, 0.7, 'lp');
  return finish(d, 10);
}

const INSTR = {
  // synths
  pulse: { base: 36, render: () => vBass(noteHz(36), 0.6, 320, 1.75, 4) },
  pulseb: { base: 36, render: () => vBass(noteHz(36), 0.6, 900, 1.5, 3) },
  arp: { base: 72, render: () => vArp(noteHz(72), 0.6, 5, 450, 3.2, 1.2, 0.08) },
  arpb: { base: 72, render: () => vArp(noteHz(72), 0.7, 6, 1400, 2.2, 1.6, 0.1) },
  lead: { base: 72, render: () => vLead(noteHz(72), 2.0) },
  pad: { base: 60, render: () => vPad(noteHz(60), 5.0, 0.5, 1200, false) },
  pump: { base: 60, render: () => vPad(noteHz(60), 1.4, 0, 1500, true) },
  drone: { base: 36, render: () => vDrone(noteHz(36), 3.0) },
  // the orchestra
  stab: { base: 60, render: () => vStab(noteHz(60), 1.2) },
  brass: { base: 48, render: () => vBrass(noteHz(48), 5.0) },
  strings: { base: 48, render: () => vString(noteHz(48), 0.7) },
  swell: { base: 84, render: () => vSwell(noteHz(84), 6.0) },
  hit: { base: 36, render: () => vBraam(noteHz(36), 3.5) },
  timp: { base: 45, render: () => vTimp(noteHz(45), 2.2) },
  // drums (played at their own pitch)
  kick: { base: 36, drum: true, render: () => vKick() },
  clap: { base: 36, drum: true, render: () => vClap() },
  hat: { base: 36, drum: true, render: () => vHat(0.03 / 3, 0.06) },
  ohat: { base: 36, drum: true, render: () => vHat(0.05, 0.13) },
  boom: { base: 36, drum: true, render: () => vBoom() },
  crash: { base: 36, drum: true, render: () => vCrash() },
  riser: { base: 36, drum: true, render: () => vRiser(1.5) },
  uplift: { base: 36, drum: true, render: () => vRiser(3.0) },
};
