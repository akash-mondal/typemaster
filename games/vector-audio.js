/*
 * vector-audio.js - VECTOR's sound engine (built by tools/audio/build.py).
 *
 * A 16-bit console, rebuilt on the Web Audio API with no files and no
 * dependencies. It works the way a Super Famicom sound program did:
 *
 *   - Instruments are SAMPLES, rendered once at load: plucked strings
 *     (Karplus-Strong koto and shamisen), two-operator FM (bass, brass, bells),
 *     breath and noise (shakuhachi, wind), and a drum kit (taiko, tsuzumi,
 *     snare, hats, gong). Each is quantised to 12 bits, then played back at any
 *     pitch by changing its playback rate, as the SPC700 did.
 *   - Everything goes through an echo like the SNES's (a feedback delay with a
 *     low-pass in the loop) and a soft output filter, so it sounds like a
 *     cartridge rather than a browser.
 *   - Music is a tracker: songs are patterns of notes on tracks, scheduled
 *     against the audio clock a moment ahead. Every track has an intensity
 *     LAYER. The game sets the intensity, and layers fade in or out on the
 *     beat. Changing song waits for the bar line and crossfades.
 *   - Sound effects are rendered once and fired with a little pitch variety.
 *
 * Browsers only allow audio after a user gesture; the engine unlocks itself on
 * the first key or pointer press.
 *
 * Informed by ZzFX / ZzFXM (Frank Force, Keith Clark, MIT) and sfxr: sound as
 * code rather than files. No code is copied from them.
 */

const SR = 32000;                       // the SNES sample rate
const TAU = Math.PI * 2;

let AC = null, master = null, musicBus = null, sfxBus = null, musicFilter = null, echoIn = null, duckGain = null, pauseGain = null;
const GROUPS = {};                       // sfx sub-mixes: ui, type, foley, combat, world, big
const GROUP_LEVEL = { ui: 0.55, type: 0.42, foley: 0.5, combat: 0.9, world: 0.8, big: 1.0 };
const MUSIC_LEVEL = 0.28;              // music sits under the action: its peaks meet a sword hit's, not exceed them
const PREFS_KEY = 'typemaxx.vector.audio';
const prefs = (() => { try { return Object.assign({ master: 0.8, music: 1, sfx: 1, muted: false }, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch (e) { return { master: 0.8, music: 1, sfx: 1, muted: false }; } })();
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} };
let unlocked = false, userPaused = false;
const listeners = [];

function makeContext() {
  if (AC) return AC;
  const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctor) return null;
  AC = new Ctor();
  // output: a soft DAC filter and a limiter
  const dac = AC.createBiquadFilter(); dac.type = 'lowpass'; dac.frequency.value = 12500; dac.Q.value = 0.4;
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  master = AC.createGain(); master.gain.value = prefs.muted ? 0 : prefs.master;
  // pause sits after everything, so a pause or a hidden tab fades the whole mix
  pauseGain = AC.createGain(); pauseGain.gain.value = 1;
  master.connect(dac); dac.connect(comp); comp.connect(pauseGain); pauseGain.connect(AC.destination);
  // music: volume, then a filter the game can close, then its own duck stage
  musicBus = AC.createGain(); musicBus.gain.value = MUSIC_LEVEL * prefs.music;
  musicFilter = AC.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 16000; musicFilter.Q.value = 0.7;
  duckGain = AC.createGain(); duckGain.gain.value = 1;
  musicBus.connect(musicFilter); musicFilter.connect(duckGain); duckGain.connect(master);
  sfxBus = AC.createGain(); sfxBus.gain.value = 0.85 * prefs.sfx; sfxBus.connect(master);
  for (const [k, v] of Object.entries(GROUP_LEVEL)) { const g = AC.createGain(); g.gain.value = v; g.connect(sfxBus); GROUPS[k] = g; }
  // footsteps and grips are soft thuds: keep them below the keyboard's click band
  const foleyLP = AC.createBiquadFilter(); foleyLP.type = 'lowpass'; foleyLP.frequency.value = 2400; foleyLP.Q.value = 0.5;
  GROUPS.foley.disconnect(); GROUPS.foley.connect(foleyLP); foleyLP.connect(sfxBus);
  // the SNES echo: delay, a low-pass in the feedback loop
  echoIn = AC.createGain(); echoIn.gain.value = 0.3;
  const dly = AC.createDelay(1.0); dly.delayTime.value = 0.23;
  const fb = AC.createGain(); fb.gain.value = 0.38;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  echoIn.connect(dly); dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(master);
  duckGain.connect(echoIn);
  GROUPS.combat.connect(echoIn); GROUPS.world.connect(echoIn); GROUPS.big.connect(echoIn);   // footsteps and keys stay dry
  // a hidden tab: fade out and suspend; coming back: resume, resync, fade in
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!AC) return;
      const now = AC.currentTime;
      pauseGain.gain.cancelScheduledValues(now);
      pauseGain.gain.setValueAtTime(pauseGain.gain.value, now);
      if (document.hidden) {
        pauseGain.gain.linearRampToValueAtTime(0, now + 0.12);
        setTimeout(() => { if (document.hidden && AC.state === 'running') AC.suspend(); }, 160);
      } else {
        AC.resume().then(() => {
          resyncTransport();
          const t = AC.currentTime;
          pauseGain.gain.cancelScheduledValues(t);
          pauseGain.gain.setValueAtTime(0, t);
          pauseGain.gain.linearRampToValueAtTime(userPaused ? 0.25 : 1, t + 0.3);
        });
      }
    });
  }
  return AC;
}

function unlock() {
  if (!makeContext()) return;
  if (AC.state === 'suspended') AC.resume();
  if (!unlocked) {
    unlocked = true;
    // the mix rises in; it never snaps on
    const t = AC.currentTime;
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(prefs.muted ? 0 : prefs.master, t + 0.6);
    buildBank();
    for (const f of listeners.splice(0)) try { f(); } catch (e) {}
  }
}
if (typeof window !== 'undefined') {
  const once = () => unlock();
  window.addEventListener('keydown', once, true);
  window.addEventListener('pointerdown', once, true);
}

// ---------------------------------------------------------------- rendering helpers
const noteHz = n => 440 * Math.pow(2, (n - 69) / 12);
const NOTE_IX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function midi(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return 12 * (+m[2] + 1) + NOTE_IX[m[1]];
}

let seed = 1234567;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function buffer(data) {
  const b = AC.createBuffer(1, data.length, SR);
  b.copyToChannel(data, 0);
  return b;
}
// 12-bit crunch and a soft knee, applied to every rendered sample
function finish(d, bits) {
  const q = Math.pow(2, (bits || 12) - 1);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 0 ? 0.95 / peak : 1;
  for (let i = 0; i < d.length; i++) d[i] = Math.round(Math.tanh(d[i] * k * 1.1) * q) / q;
  return d;
}
function env(i, n, a, d, s, r, len) {
  // attack / decay to sustain / release at the end, in samples
  const t = i;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * (t - a) / d;
  if (t > len - r) return s * Math.max(0, (len - t) / r);
  return s;
}
function onePoleLP(d, cutHz) {
  const a = Math.exp(-TAU * cutHz / SR);
  let y = 0;
  for (let i = 0; i < d.length; i++) { y = (1 - a) * d[i] + a * y; d[i] = y; }
  return d;
}
function onePoleHP(d, cutHz) {
  const a = Math.exp(-TAU * cutHz / SR);
  let y = 0, xp = 0;
  for (let i = 0; i < d.length; i++) { const x = d[i]; y = a * (y + x - xp); xp = x; d[i] = y; }
  return d;
}
function bandpass(d, f, q) {
  // RBJ biquad band-pass, constant peak gain
  const w = TAU * f / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w);
  const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i], y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] = y;
  }
  return d;
}

// ---------------------------------------------------------------- instruments
// Each renders a Float32Array at SR, tuned to `base` (a MIDI note).
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

// ---------------------------------------------------------------- notation
// Melody: "D5:4 F5:2 r:2 D4+A4:16" - notes (or chords joined by +) with
// lengths in sixteenths; r is a rest. Drums: "X...x..." one char a sixteenth,
// X accent, x hit, . rest.
function parseNotes(str) {
  const out = [];
  let step = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [pitch, lenS] = tok.split(':');
    const len = +(lenS || 1);
    if (pitch !== 'r') out.push({ step, len, notes: pitch.split('+').map(midi) });
    step += len;
  }
  return { events: out, length: step };
}
function parseHits(str) {
  const s = str.replace(/[\s|]/g, '');
  const out = [];
  for (let i = 0; i < s.length; i++) if (s[i] !== '.') out.push({ step: i, len: 1, accent: s[i] === 'X' });
  return { events: out, length: s.length };
}
const rep = (s, n) => Array(n).fill(s).join(' ');
// a drum line of `len` sixteenths: accents X at some steps, hits x at others
function hitsAt(len, accents, hits) {
  const a = Array(len).fill('.');
  for (const h of hits || []) if (h < len) a[h] = 'x';
  for (const h of accents || []) if (h < len) a[h] = 'X';
  return a.join('');
}
// VECTOR's trailer: exactly 10 s at 120 bpm, 5 bars; the shots cut on every bar
// line (2, 4, 6, 8 s), so every cut lands on a downbeat. The last half-beat is
// silence after a riser, and the loop comes back in on the braam.
const INTRO_CUTS = [16, 32, 48, 64];

// ---------------------------------------------------------------- writing helpers
// All music here is original: minor keys, pedal roots, ostinatos and pumping in
// the manner of the style guide, with our own motifs and progressions.
const NN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nname = m => NN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
// intervals for a cell: r root, n 2nd, m min 3rd, M maj 3rd, s 4th, f 5th, x min 6th,
// b min 7th, o octave, u octave + min 3rd, q octave + 5th, l octave down
const IV = { r: 0, n: 2, m: 3, M: 4, s: 5, f: 7, x: 8, b: 10, o: 12, u: 15, q: 19, l: -12 };
// one bar (or more) of sixteenths on a root: an interval letter, '.' a rest, '-' holds
function cells(root, cell) {
  const r = midi(root), toks = [];
  for (const ch of cell.replace(/\s/g, '')) {
    if (ch === '-' && toks.length) { toks[toks.length - 1].len++; continue; }
    if (ch === '.') { toks.push({ n: 'r', len: 1 }); continue; }
    if (!(ch in IV)) throw new Error('bad cell ' + ch);
    toks.push({ n: nname(r + IV[ch]), len: 1 });
  }
  return toks.map(t => t.n + ':' + t.len).join(' ');
}
const bars = list => list.map(([root, cell]) => cells(root, cell)).join(' | ');
// an arpeggio over a chord 'F4 Ab4 C5 Eb5 F5': digits index the chord, '.' rests, '-' holds
function arpOver(chord, pat) {
  const tones = chord.split(' '), toks = [];
  for (const ch of pat.replace(/\s/g, '')) {
    if (ch === '-' && toks.length) { toks[toks.length - 1].len++; continue; }
    toks.push({ n: ch === '.' ? 'r' : tones[+ch], len: 1 });
  }
  return toks.map(t => t.n + ':' + t.len).join(' ');
}
const arps = (chords, pat) => chords.map(c => arpOver(c, pat)).join(' | ');
// the pumping pad: a chord retriggered on every beat of every bar
const pumpBars = chords => chords.map(c => rep(c + ':4', 4)).join(' | ');
// a stab rhythm 'x:2 r:2 x:1 ...' with x replaced by each bar's chord
const stabBars = (chords, rhythm) => chords.map(c => rhythm.replace(/x/g, c)).join(' | ');
const steps = (len, fn) => Array.from({ length: len }, (_, i) => i).filter(fn);

// ---------------------------------------------------------------- songs
// layer: the intensity from which the track plays (the game drives it with speed
// and streak): 0 bass and pad, 1 drums, 2 arpeggio, 3 lead and stabs.
// tags: 'danger' a tension layer (the last core), 'boost' a brighter filter
// (a surge or a long streak)
const SONGS = {
  // ---- the select screen: F minor, a braam on the first frame
  intro: { bpm: 120, bars: 5, tracks: [
    { inst: 'hit', vol: 0.5, layer: 0, notes: 'F2:16 | r:16 | Bb1:16 | r:16 | C2:12 r:4' },
    { inst: 'boom', vol: 0.75, layer: 0, hits: hitsAt(80, [0].concat(INTRO_CUTS), [40, 72]) },
    { inst: 'crash', vol: 0.26, layer: 0, hits: hitsAt(80, [0, 32, 64]) },
    { inst: 'kick', vol: 0.72, layer: 0, hits: hitsAt(80, [16, 32, 48, 64], [8, 12, 20, 24, 28, 36, 40, 44, 52, 56, 60, 68, 72]) },
    { inst: 'clap', vol: 0.28, layer: 0, hits: hitsAt(80, [], [36, 44, 52, 60, 68]) },
    { inst: 'hat', vol: 0.12, layer: 0, hits: hitsAt(80, steps(80, s => s >= 16 && s < 76 && s % 4 === 3), steps(80, s => s >= 16 && s < 76 && s % 4 < 2)) },
    { inst: 'ohat', vol: 0.1, layer: 0, hits: hitsAt(80, [], steps(80, s => s >= 32 && s < 64 && s % 4 === 2)) },
    { inst: 'pulse', vol: 0.5, layer: 0, notes: bars([['F1', 'rrorrrorrrorrrfo'], ['Db2', 'rrorrrorrrorrrfo'], ['Bb1', 'rrorrrorrrorrrfo'], ['Eb2', 'rrorrrorrrororfo'], ['C2', 'rrorrrorrror....']]) },
    { inst: 'pump', vol: 0.2, layer: 0, notes: pumpBars(['F3+Ab3+C4', 'F3+Ab3+Db4', 'F3+Bb3+Db4', 'G3+Bb3+Eb4']) + ' | ' + rep('G3+C4+E4:4', 3) + ' r:4' },
    { inst: 'arp', vol: 0.22, layer: 0, pan: 0.2, notes: 'r:16 | ' + arps(['Db5 F5 Ab5 C6 Db6', 'Bb4 Db5 F5 Ab5 Bb5', 'Eb5 G5 Bb5 Db6 Eb6'], '0243 1243 0243 1432') + ' | ' + arpOver('C5 E5 G5 Bb5 C6', '0243 1243 0243 ....') },
    { inst: 'stab', vol: 0.26, layer: 0, notes: 'F3+C4+F4:2 r:14 | Db3+Ab3+Db4:2 r:6 Db3+Ab3+Db4:1 r:1 Db3+Ab3+Db4:2 r:4 | Bb2+F3+Bb3:2 r:14 | Eb3+Bb3+Eb4:2 r:2 Eb3+Bb3+Eb4:2 r:10 | C3+G3+C4:2 r:2 C3+G3+C4:2 r:2 C3+E4+G4:2 r:6' },
    { inst: 'brass', vol: 0.3, layer: 0, notes: 'r:16 | r:16 | F3+F4:8 Db3+Db4:4 F3+F4:4 | G3+G4:6 Ab3+Ab4:2 Bb3+Bb4:8 | C4+C5:12 r:4' },
    { inst: 'timp', vol: 0.45, layer: 0, notes: 'F2:4 r:12 | r:16 | F2:4 r:4 F2:2 F2:2 r:4 | r:16 | ' + rep('C2:1', 12) + ' r:4' },
    { inst: 'riser', vol: 0.3, layer: 0, hits: hitsAt(80, [64]) },
  ] },

  // ---- title and menus: a pedal F, a slow arpeggio, strings far off
  menu: { bpm: 90, bars: 8, tracks: [
    { inst: 'drone', vol: 0.34, layer: 0, notes: rep('F1+C2:8', 16) },
    { inst: 'drone', vol: 0.12, layer: 0, notes: 'r:4 ' + rep('F2:8', 15) + ' F2:4' },
    { inst: 'pad', vol: 0.18, layer: 0, notes: 'F3+Ab3+C4+G4:16 F3+Ab3+C4:16 Db3+F3+Ab3+C4:16 Db3+F3+Ab3:16 Bb2+Db3+F3+C4:16 Bb2+Db3+F3:16 C3+F3+G3:16 C3+F3+G3:16' },
    { inst: 'arp', vol: 0.22, layer: 0, pan: -0.2, notes: arps(['F4 Ab4 C5 Eb5 G5', 'F4 Ab4 C5 Eb5 F5', 'Db4 F4 Ab4 C5 F5', 'Db4 F4 Ab4 C5 Db5', 'Bb3 Db4 F4 Ab4 C5', 'Bb3 Db4 F4 Ab4 Bb4', 'C4 F4 G4 Bb4 C5', 'C4 F4 G4 C5 F5'], '0-2-1-3-2-4-3-2-') },
    { inst: 'swell', vol: 0.13, layer: 0, notes: 'r:32 C6:32 r:32 G5:32' },
    { inst: 'timp', vol: 0.22, layer: 0, notes: 'F2:16 r:48 F2:16 r:48' },
  ] },

  // ---- the sector start count: drone, then the pulse builds into a hard cut
  boot: { bpm: 120, bars: 4, tracks: [
    { inst: 'hit', vol: 0.34, layer: 0, notes: 'F2:16 r:48' },
    { inst: 'drone', vol: 0.26, layer: 0, notes: rep('F1+C2:8', 8) },
    { inst: 'pulse', vol: 0.48, layer: 0, notes: bars([['F1', '................'], ['F1', 'r...r...r...r.o.'], ['F1', 'r.orr.orr.orr.or'], ['F1', 'rrorrrorrrorrror']]) },
    { inst: 'pump', vol: 0.14, layer: 0, notes: 'r:32 ' + rep('F3+Ab3+C4:4', 8) },
    { inst: 'kick', vol: 0.7, layer: 0, hits: hitsAt(64, [32, 48], [36, 40, 44, 52, 56, 60, 62, 63]) },
    { inst: 'timp', vol: 0.4, layer: 0, notes: 'r:32 F2:4 r:4 F2:4 r:4 ' + rep('F2:1', 16) },
    { inst: 'arp', vol: 0.2, layer: 0, pan: 0.2, notes: 'r:48 ' + arpOver('F4 Ab4 C5 Eb5 F5', '0123 1234 2341 34..') },
    { inst: 'riser', vol: 0.3, layer: 0, hits: hitsAt(64, [52]) },
  ] },

  // ---- sector A: F minor filter-house, 120 bpm
  sector: { bpm: 120, bars: 8, tracks: [
    // 0: bass and pad
    { inst: 'pulse', vol: 0.5, layer: 0, notes: bars([['F1', 'rrorrrorrrorrror'], ['F1', 'rrorrrorrorrfrbo'], ['Db2', 'rrorrrorrrorrror'], ['Eb2', 'rrorrrorrorrorfo'], ['F1', 'rrorrrorrrorrror'], ['F1', 'rrorrrorrorrfrbo'], ['Bb1', 'rrorrrorrrorrror'], ['C2', 'rrorrrorroroMofo']]) },
    { inst: 'pump', vol: 0.2, layer: 0, notes: pumpBars(['F3+Ab3+C4', 'F3+Ab3+C4', 'F3+Ab3+Db4', 'G3+Bb3+Eb4', 'F3+Ab3+C4', 'F3+Ab3+C4', 'F3+Bb3+Db4', 'E3+G3+C4']) },
    // 1: the kit
    { inst: 'kick', vol: 0.75, layer: 1, hits: rep('X...x...x...x...', 8) },
    { inst: 'clap', vol: 0.3, layer: 1, hits: rep('....X.......X...', 8) },
    { inst: 'hat', vol: 0.12, layer: 1, hits: rep('xx.Xxx.Xxx.Xxx.X', 8) },
    { inst: 'ohat', vol: 0.09, layer: 1, hits: rep('..x...x...x...x.', 8) },
    // 2: the arpeggio and the fill into the top
    { inst: 'arp', vol: 0.22, layer: 2, pan: 0.2, notes: arps(['F4 Ab4 C5 Eb5 F5', 'F4 Ab4 C5 Eb5 F5', 'Ab4 C5 Db5 F5 Ab5', 'G4 Bb4 Db5 Eb5 G5', 'F4 Ab4 C5 Eb5 F5', 'F4 Ab4 C5 Eb5 F5', 'F4 Bb4 Db5 F5 Ab5', 'E4 G4 Bb4 C5 E5'], '0214 3214 0214 3241') },
    { inst: 'riser', vol: 0.24, layer: 2, hits: hitsAt(128, [116]) },
    // 3: the lead, stabs, and a braam on each four-bar phrase
    { inst: 'lead', vol: 0.24, layer: 3, notes: 'C5:3 Ab4:3 F4:2 C5:4 Eb5:4 | Db5:6 C5:2 Ab4:8 | F5:3 Db5:3 Ab4:2 F5:4 Ab5:4 | G5:6 F5:2 Eb5:4 Bb4:4 | C5:3 Ab4:3 F4:2 C5:4 F5:4 | G5:4 Ab5:4 G5:4 Eb5:4 | F5:6 Db5:2 Bb4:8 | C5:4 E5:4 G5:4 Bb5:4' },
    { inst: 'stab', vol: 0.22, layer: 3, notes: stabBars(['F3+C4+F4', 'F3+C4+Ab4', 'Db3+Ab3+F4', 'Eb3+Bb3+G4', 'F3+C4+F4', 'F3+C4+Ab4', 'Bb2+F3+Db4', 'C3+G3+E4'], 'x:2 r:1 x:1 r:4 x:2 r:2 x:2 r:2') },
    { inst: 'hit', vol: 0.28, layer: 3, notes: 'F2:16 r:48 F2:16 r:48' },
    { inst: 'crash', vol: 0.2, layer: 3, hits: hitsAt(128, [0, 64]) },
    // tags
    { inst: 'strings', vol: 0.12, layer: 99, tag: 'danger', notes: rep('C5:1 Db5:1', 64) },
    { inst: 'timp', vol: 0.34, layer: 99, tag: 'danger', notes: rep('F2:1 r:2 F2:1 r:12', 8) },
    { inst: 'arpb', vol: 0.13, layer: 99, tag: 'boost', pan: -0.3, notes: arps(['F5 Ab5 C6 Eb6 F6', 'F5 Ab5 C6 Eb6 F6', 'Ab5 C6 Db6 F6 Ab6', 'G5 Bb5 Db6 Eb6 G6', 'F5 Ab5 C6 Eb6 F6', 'F5 Ab5 C6 Eb6 F6', 'F5 Bb5 Db6 F6 Ab6', 'E5 G5 Bb5 C6 E6'], '0-2-4-2-1-3-4-3-') },
    { inst: 'pulseb', vol: 0.2, layer: 99, tag: 'boost', notes: bars([['F1', 'rrorrrorrrorrror'], ['F1', 'rrorrrorrorrfrbo'], ['Db2', 'rrorrrorrrorrror'], ['Eb2', 'rrorrrorrorrorfo'], ['F1', 'rrorrrorrrorrror'], ['F1', 'rrorrrorrorrfrbo'], ['Bb1', 'rrorrrorrrorrror'], ['C2', 'rrorrrorroroMofo']]) },
  ] },

  // ---- sector B: C minor at 124, a galloping bass, a half-time clap, a phrygian Db
  sector2: { bpm: 124, bars: 8, tracks: [
    { inst: 'pulse', vol: 0.5, layer: 0, notes: bars([['C2', 'r.orr.orr.orr.fo'], ['C2', 'r.orr.orr.orb.fo'], ['Db2', 'r.orr.orr.orr.fo'], ['C2', 'r.orr.orr.orb.fo'], ['Ab1', 'r.orr.orr.orr.fo'], ['Bb1', 'r.orr.orr.orr.fo'], ['Db2', 'r.orr.orr.orr.fo'], ['G1', 'r.orr.orr.oMrfo.']]) },
    { inst: 'pad', vol: 0.17, layer: 0, notes: 'C4+Eb4+G4:16 C4+Eb4+Bb4:16 Db4+F4+Ab4:16 C4+Eb4+G4:16 C4+Eb4+Ab4:16 D4+F4+Bb4:16 Db4+F4+Ab4:16 D4+G4+B4:16' },
    { inst: 'kick', vol: 0.75, layer: 1, hits: rep('X...x...x...x..x', 8) },
    { inst: 'clap', vol: 0.32, layer: 1, hits: rep('........X.......', 8) },
    { inst: 'hat', vol: 0.12, layer: 1, hits: rep('.xX.', 32) },
    { inst: 'boom', vol: 0.45, layer: 1, hits: hitsAt(128, [0, 64]) },
    { inst: 'arp', vol: 0.22, layer: 2, pan: -0.2, notes: arps(['C5 Eb5 G5 Bb5 C6', 'C5 Eb5 G5 Bb5 C6', 'Db5 F5 Ab5 C6 Db6', 'C5 Eb5 G5 Bb5 C6', 'Ab4 C5 Eb5 G5 Ab5', 'Bb4 D5 F5 Ab5 Bb5', 'Db5 F5 Ab5 C6 Db6', 'G4 B4 D5 F5 G5'], '024 024 024 024 024 3') },
    { inst: 'riser', vol: 0.24, layer: 2, hits: hitsAt(128, [116]) },
    { inst: 'lead', vol: 0.24, layer: 3, notes: 'G5:2 r:2 G5:2 Ab5:2 G5:4 Eb5:4 | D5:4 Eb5:4 C5:8 | F5:2 r:2 F5:2 Gb5:2 F5:4 Db5:4 | C5:4 D5:4 Eb5:8 | Eb5:2 r:2 Eb5:2 F5:2 Eb5:4 C5:4 | D5:4 F5:4 Bb5:8 | Ab5:6 F5:2 Db5:8 | B4:4 D5:4 F5:4 G5:4' },
    { inst: 'stab', vol: 0.22, layer: 3, notes: stabBars(['Eb4+G4+C5', 'Eb4+G4+C5', 'F4+Ab4+Db5', 'Eb4+G4+C5', 'Eb4+Ab4+C5', 'F4+Bb4+D5', 'F4+Ab4+Db5', 'D4+G4+B4'], 'r:2 x:2 r:4 r:2 x:2 r:2 x:2') },
    { inst: 'hit', vol: 0.28, layer: 3, notes: 'C2:16 r:48 C2:16 r:48' },
    { inst: 'strings', vol: 0.12, layer: 99, tag: 'danger', notes: rep('G4:1 Ab4:1', 64) },
    { inst: 'timp', vol: 0.34, layer: 99, tag: 'danger', notes: rep('C2:1 r:2 C2:1 r:12', 8) },
    { inst: 'arpb', vol: 0.13, layer: 99, tag: 'boost', pan: 0.3, notes: arps(['C6 Eb6 G6 Bb6 C7', 'C6 Eb6 G6 Bb6 C7', 'Db6 F6 Ab6 C7 Db7', 'C6 Eb6 G6 Bb6 C7', 'Ab5 C6 Eb6 G6 Ab6', 'Bb5 D6 F6 Ab6 Bb6', 'Db6 F6 Ab6 C7 Db7', 'G5 B5 D6 F6 G6'], '0-.-2-.-1-.-3-2-') },
    { inst: 'pulseb', vol: 0.2, layer: 99, tag: 'boost', notes: bars([['C2', 'r.orr.orr.orr.fo'], ['C2', 'r.orr.orr.orb.fo'], ['Db2', 'r.orr.orr.orr.fo'], ['C2', 'r.orr.orr.orb.fo'], ['Ab1', 'r.orr.orr.orr.fo'], ['Bb1', 'r.orr.orr.orr.fo'], ['Db2', 'r.orr.orr.orr.fo'], ['G1', 'r.orr.orr.oMrfo.']]) },
  ] },

  // ---- the Overseer: D minor at 100, string ostinato, timpani, brass
  boss: { bpm: 100, bars: 8, tracks: [
    // 0: strings, the pedal braam and the timpani on the phrases
    { inst: 'strings', vol: 0.3, layer: 0, notes: bars([['D3', 'rrfrorfrrrfrorfo'], ['D3', 'rrfrorfrrrfrofrm'], ['Bb2', 'rrfrorfrrrfrorfo'], ['C3', 'rrfrorfrrrfrofof'], ['D3', 'rrfrorfrrrfrorfo'], ['Eb3', 'rrfrorfrrrfrofrf'], ['Bb2', 'rrfrorfrrrfrorfo'], ['A2', 'rrfrorfrrMfrofoM']]) },
    { inst: 'hit', vol: 0.38, layer: 0, notes: 'D2:16 r:48 D2:16 r:48' },
    { inst: 'timp', vol: 0.42, layer: 0, notes: 'D2:4 r:60 D2:4 r:44 ' + rep('A2:1', 16) },
    // 1: pulse bass, big drums, a soft kit
    { inst: 'pulse', vol: 0.44, layer: 1, notes: bars([['D2', 'rrorrrorrrorrror'], ['D2', 'rrorrrorrorrorfo'], ['Bb1', 'rrorrrorrrorrror'], ['C2', 'rrorrrorrorrorfo'], ['D2', 'rrorrrorrrorrror'], ['Eb2', 'rrorrrorrorrorfo'], ['Bb1', 'rrorrrorrrorrror'], ['A1', 'rrorrrorroroMofo']]) },
    { inst: 'boom', vol: 0.42, layer: 1, hits: rep('X.....x...x.....', 8) },
    { inst: 'kick', vol: 0.55, layer: 1, hits: rep('X.......x.......', 8) },
    { inst: 'hat', vol: 0.1, layer: 1, hits: rep('..x.', 32) },
    // 2: the brass theme, octave-doubled, and high strings over it
    { inst: 'brass', vol: 0.3, layer: 2, notes: 'D3+D4:12 E3+E4:4 | F3+F4:16 | D3+D4:8 C3+C4:8 | E3+E4:12 G3+G4:4 | A3+A4:16 | G3+G4:8 Bb3+Bb4:8 | F3+F4:12 D3+D4:4 | C#3+C#4:8 E3+E4:8' },
    { inst: 'swell', vol: 0.13, layer: 2, notes: 'A5:32 Bb5:32 A5:16 G5:16 E5:32' },
    // 3: stabs, the lead doubling the theme, claps, timpani drive, the build
    { inst: 'stab', vol: 0.22, layer: 3, notes: stabBars(['D4+F4+A4', 'D4+F4+A4', 'D4+F4+Bb4', 'E4+G4+C5', 'D4+F4+A4', 'Eb4+G4+Bb4', 'D4+F4+Bb4', 'C#4+E4+A4'], 'x:2 r:2 x:2 r:2 x:1 r:1 x:1 r:1 x:2 r:2') },
    { inst: 'lead', vol: 0.18, layer: 3, notes: 'D5:12 E5:4 | F5:16 | D5:8 C5:8 | E5:12 G5:4 | A5:16 | G5:8 Bb5:8 | F5:12 D5:4 | C#5:8 E5:8' },
    { inst: 'clap', vol: 0.26, layer: 3, hits: rep('....X.......X...', 8) },
    { inst: 'timp', vol: 0.3, layer: 3, notes: rep('D2:2 D2:2 r:4 A1:2 r:2 D2:2 D2:2', 7) + ' ' + rep('A2:1', 16) },
    { inst: 'riser', vol: 0.24, layer: 3, hits: hitsAt(128, [118]) },
    // tags
    { inst: 'strings', vol: 0.1, layer: 99, tag: 'danger', notes: rep('D5:1 Eb5:1', 64) },
    { inst: 'timp', vol: 0.3, layer: 99, tag: 'danger', notes: rep('D2:1 r:2 D2:1 r:12', 8) },
    { inst: 'arpb', vol: 0.12, layer: 99, tag: 'boost', pan: 0.3, notes: arps(['D5 F5 A5 D6 F6', 'D5 F5 A5 D6 F6', 'D5 F5 Bb5 D6 F6', 'E5 G5 C6 E6 G6', 'D5 F5 A5 D6 F6', 'Eb5 G5 Bb5 Eb6 G6', 'D5 F5 Bb5 D6 F6', 'C#5 E5 A5 C#6 E6'], '0-2-4-3-1-2-4-2-') },
  ] },

  // ---- compile (upgrades): Bb minor into Db, arp and pad, thinking music
  compile: { bpm: 104, bars: 4, tracks: [
    { inst: 'pad', vol: 0.3, layer: 0, notes: 'Bb3+Db4+F4+C5:16 Gb3+Bb3+Db4+F4:16 Db4+F4+Ab4+Eb5:16 C4+Eb4+Ab4:16' },
    { inst: 'arp', vol: 0.34, layer: 0, pan: 0.15, notes: arps(['Bb4 Db5 F5 Ab5 C6', 'Gb4 Bb4 Db5 F5 Gb5', 'Db5 F5 Ab5 C6 Eb6', 'C5 Eb5 Ab5 C6 Eb6'], '0123 4321 0213 4231') },
    { inst: 'arpb', vol: 0.12, layer: 0, pan: -0.3, notes: arps(['F5 Bb5 C6 F6 Db6', 'F5 Gb5 Bb5 Db6 F6', 'Ab5 Db6 Eb6 F6 Ab6', 'Ab5 C6 Eb6 Ab6 C7'], '0---2---1---3---') },
    { inst: 'drone', vol: 0.3, layer: 0, notes: rep('Bb1:8', 4) + ' ' + rep('Gb1:8', 2) + ' ' + rep('Db2:8', 2) },
    { inst: 'hat', vol: 0.07, layer: 0, hits: rep('..x.', 16) },
  ] },

  // ---- results: a slow brass swell over the F pedal
  results: { bpm: 72, bars: 4, tracks: [
    { inst: 'brass', vol: 0.38, layer: 0, notes: 'F2+C3+Ab3:16 Db3+F3+Ab3:16 Bb2+F3+Db4:16 C3+F3+G3:8 C3+E3+G3:8' },
    { inst: 'swell', vol: 0.19, layer: 0, notes: 'C6:16 Ab5:16 F5:16 E5:16' },
    { inst: 'drone', vol: 0.28, layer: 0, notes: rep('F1+C2:8', 6) + ' ' + rep('C2+G2:8', 2) },
    { inst: 'timp', vol: 0.3, layer: 0, notes: 'F2:8 r:40 C2:4 C2:4 C2:8' },
    { inst: 'hit', vol: 0.24, layer: 0, notes: 'F2:16 r:48' },
  ] },
};

// short cues, played over the music
const STINGS = {
  sector_clear: { bpm: 132, tracks: [
    { inst: 'stab', vol: 0.24, notes: 'F4+C5:2 Ab4+Eb5:2 C5+F5+Ab5:8' },
    { inst: 'arp', vol: 0.35, notes: 'r:4 F5:1 Ab5:1 C6:1 F6:5' },
    { inst: 'boom', vol: 0.7, hits: 'X' },
    { inst: 'crash', vol: 0.3, hits: '....X' },
  ] },
  seal: { bpm: 140, tracks: [
    { inst: 'arpb', vol: 0.35, notes: 'C5:1 F5:1 G5:1 C6:1 F6:1 G6:3' },
    { inst: 'pad', vol: 0.2, notes: 'F3+C4+G4:8' },
    { inst: 'stab', vol: 0.22, notes: 'r:5 F4+C5+G5:3' },
  ] },
  derez_rival: { bpm: 150, tracks: [
    { inst: 'stab', vol: 0.28, notes: 'F4+C5:2 r:1 Eb4+Bb4:3' },
    { inst: 'kick', vol: 0.6, hits: 'X..X' },
  ] },
  core_lost: { bpm: 90, tracks: [
    { inst: 'hit', vol: 0.5, notes: 'F2:12' },
    { inst: 'brass', vol: 0.22, notes: 'C4+Ab4:4 Bb3+G4:4 F3+F4:8' },
    { inst: 'boom', vol: 0.6, hits: 'X' },
  ] },
  boss_warn: { bpm: 110, tracks: [
    { inst: 'brass', vol: 0.17, notes: 'D3+Eb3:4 r:2 D3+Eb3:4 r:2 D3+Eb3:8' },
    { inst: 'timp', vol: 0.32, notes: rep('D2:1', 16) + ' D2:4' },
    { inst: 'hit', vol: 0.34, notes: 'r:12 D2:8' },
  ] },
  boss_down: { bpm: 120, tracks: [
    { inst: 'hit', vol: 0.5, notes: 'D2:16' },
    { inst: 'boom', vol: 0.8, hits: 'X' },
    { inst: 'crash', vol: 0.35, hits: 'X' },
    { inst: 'stab', vol: 0.24, notes: 'D4+A4+D5:2 r:2 D4+F#4+A4+D5:12' },
    { inst: 'arpb', vol: 0.3, notes: 'r:4 D5:1 F#5:1 A5:1 D6:1 F#6:1 A6:1 D7:6' },
  ] },
  upgrade: { bpm: 140, tracks: [
    { inst: 'arp', vol: 0.4, notes: 'Bb4:1 Db5:1 F5:1 Ab5:1 C6:4' },
    { inst: 'arpb', vol: 0.25, notes: 'r:4 F6:4' },
  ] },
  streak: { bpm: 160, tracks: [
    { inst: 'arpb', vol: 0.32, notes: 'C5:1 Eb5:1 G5:1 C6:3' },
  ] },
  gameover: { bpm: 80, tracks: [
    { inst: 'brass', vol: 0.22, notes: 'Ab3+C4:4 G3+Bb3:4 F3+Ab3:12' },
    { inst: 'hit', vol: 0.45, notes: 'r:8 F2:12' },
    { inst: 'timp', vol: 0.4, notes: 'r:8 F2:4' },
    { inst: 'swell', vol: 0.12, notes: 'C5:20' },
  ] },
};
const compiled = new Map();
function compile(def) {
  if (compiled.has(def)) return compiled.get(def);
  const tracks = def.tracks.map(t => {
    const p = t.hits ? parseHits(t.hits) : parseNotes(t.notes);
    return Object.assign({}, t, p);
  });
  const c = { def, tracks, length: def.bars ? def.bars * 16 : Math.max(...tracks.map(t => t.length)) };
  compiled.set(def, c);
  return c;
}

// ---------------------------------------------------------------- the transport
const SEQ = {
  cur: null,               // { name, song, gains[], startStep, stepDur }
  pending: null,
  step: 0, nextTime: 0, timer: null,
  intensity: 0, tags: new Set(), volume: 1,
};

function trackOn(t) {
  if (t.tag) return SEQ.tags.has(t.tag);
  return t.layer <= SEQ.intensity;
}

function startSong(name, when, fadeIn) {
  const song = compile(SONGS[name]);
  const stepDur = 60 / song.def.bpm / 4;
  const out = AC.createGain(); out.gain.value = 1; out.connect(musicBus);
  const gains = song.tracks.map(t => {
    const g = AC.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(trackOn(t) ? t.vol : 0, when + (fadeIn || 0.02));
    g.connect(out);
    return g;
  });
  return { name, song, gains, out, stepDur, origin: 0 };
}

function applyLayers(ramp) {
  const c = SEQ.cur;
  if (!c) return;
  const now = AC.currentTime;
  c.song.tracks.forEach((t, i) => {
    const g = c.gains[i].gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(trackOn(t) ? t.vol : 0, now + (ramp == null ? 0.9 : ramp));
  });
}

function scheduleStep(c, localStep, time) {
  const L = c.song.length;
  for (let i = 0; i < c.song.tracks.length; i++) {
    const t = c.song.tracks[i];
    const pos = localStep % t.length;
    for (const ev of t.events) {
      if (ev.step !== pos) continue;
      if (t.hits) playSample(t.inst, time, null, 0, ev.accent ? 1 : 0.62, t.pan || 0, c.gains[i]);
      else for (const n of ev.notes) playSample(t.inst, time, n + (t.oct || 0) * 12, ev.len * c.stepDur * 0.95, 0.9 / Math.sqrt(ev.notes.length), t.pan || 0, c.gains[i]);
    }
  }
  void L;
}

// after a stall (a throttled timer, a suspended context) never play the missed
// notes all at once: jump the clock forward to the next step on the grid
function resyncTransport() {
  if (!AC || !SEQ.cur) return;
  const late = AC.currentTime - SEQ.nextTime;
  if (late > 0.1) {
    const skip = Math.ceil(late / SEQ.cur.stepDur);
    SEQ.step += skip;
    SEQ.nextTime += skip * SEQ.cur.stepDur;
  }
}
function tick() {
  if (!AC || !SEQ.cur || AC.state !== 'running') return;
  resyncTransport();
  const ahead = AC.currentTime + 0.14;
  while (SEQ.nextTime < ahead) {
    const c = SEQ.cur;
    const local = SEQ.step - c.origin;
    // a waiting song takes over on a bar line
    if (SEQ.pending && local % 16 === 0) {
      const p = SEQ.pending;
      SEQ.pending = null;
      const old = c;
      old.out.gain.setValueAtTime(old.out.gain.value, SEQ.nextTime);
      old.out.gain.linearRampToValueAtTime(0, SEQ.nextTime + p.fade);
      setTimeout(() => { try { old.out.disconnect(); } catch (e) {} }, (p.fade + 2) * 1000);
      if (p.sting) playSting(p.sting, SEQ.nextTime);          // the sting lands on the new downbeat
      if (p.name) {
        SEQ.cur = startSong(p.name, SEQ.nextTime, p.fade);
        SEQ.cur.origin = SEQ.step;
      } else { SEQ.cur = null; return; }
      continue;
    }
    scheduleStep(c, local, SEQ.nextTime);
    SEQ.nextTime += c.stepDur;
    SEQ.step++;
  }
}

function play(name, opts) {
  opts = opts || {};
  if (!SONGS[name]) return;
  const go = () => {
    if (SEQ.cur && SEQ.cur.name === name && !opts.restart) { SEQ.pending = null; return; }
    if (SEQ.pending && SEQ.pending.name === name && !opts.now) return;          // already on its way
    if (!SEQ.cur || opts.now) {
      if (SEQ.cur) { const o = SEQ.cur.out; o.gain.setValueAtTime(o.gain.value, AC.currentTime); o.gain.linearRampToValueAtTime(0, AC.currentTime + 0.3); setTimeout(() => { try { o.disconnect(); } catch (e) {} }, 2500); }
      // `at`: join the song part-way through, on its grid, as if it had been playing
      // all along (a select screen switching titles keeps its trailer in time)
      const stepDur = 60 / SONGS[name].bpm / 4;
      const loopLen = compile(SONGS[name]).length * stepDur;
      const at = opts.at > 0 && isFinite(opts.at) ? opts.at % loopLen : 0;
      const k = Math.ceil(at / stepDur - 1e-6);
      const t0 = AC.currentTime + 0.04;
      SEQ.step = k;
      SEQ.nextTime = t0 + (k * stepDur - at);
      SEQ.cur = startSong(name, t0, opts.fade || 0.4);
      SEQ.cur.origin = 0;
      SEQ.pending = null;
    } else {
      SEQ.pending = { name, fade: opts.fade || 1.2, sting: opts.sting || null };
    }
    if (!SEQ.timer) SEQ.timer = setInterval(tick, 25);
    tick();
  };
  if (unlocked) go(); else listeners.push(go);
}
function stopMusic(fade) {
  if (!AC || !SEQ.cur) return;
  const o = SEQ.cur.out;
  o.gain.setValueAtTime(o.gain.value, AC.currentTime);
  o.gain.linearRampToValueAtTime(0, AC.currentTime + (fade || 0.6));
  setTimeout(() => { try { o.disconnect(); } catch (e) {} }, ((fade || 0.6) + 1) * 1000);
  SEQ.cur = null; SEQ.pending = null;
}

const stingLast = {};
function playSting(name, when) {
  if (!AC || !unlocked || !STINGS[name]) return;
  const nowT = AC.currentTime;
  if (stingLast[name] && nowT - stingLast[name] < 1.2) return;
  stingLast[name] = nowT;
  const s = compile(STINGS[name]);
  duck(0.45, (s.length * 60 / s.def.bpm / 4) + 0.3);
  const stepDur = 60 / s.def.bpm / 4;
  const t0 = Math.max(AC.currentTime + 0.01, when || 0);
  const out = AC.createGain(); out.gain.value = 0.9; out.connect(GROUPS.big);
  for (const t of s.tracks) {
    for (const ev of t.events) {
      const time = t0 + ev.step * stepDur;
      if (t.hits) playSample(t.inst, time, null, 0, (ev.accent ? 1 : 0.62) * t.vol, 0, out);
      else for (const n of ev.notes) playSample(t.inst, time, n, ev.len * stepDur * 0.95, t.vol, 0, out);
    }
  }
  setTimeout(() => { try { out.disconnect(); } catch (e) {} }, 6000);
}

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

// crossfade the ends so a buffer loops without a click
function loopable(d) {
  const x = Math.floor(SR * 0.2);
  for (let i = 0; i < x; i++) { const a = i / x; d[i] = d[i] * a + d[d.length - x + i] * (1 - a); }
  return d.subarray(0, d.length - x);
}

// ---------------------------------------------------------------- the mix
// Every sound has a place in the mix. Call sites say WHAT happened; this table
// says how loud, how often, and what it may push aside.
//   group  sub-mix it plays through
//   vol    default level (a call can override)
//   max    voices of this sound at once; the oldest is faded to make room
//   gap    seconds before the same sound may fire again
//   prio   0 footstep .. 3 must be heard; the global cap drops low priority first
//   duck   how far the music dips under it (0..1)
// Nothing here fires on a keystroke: the keyboard already makes its own clicks.
const MIX = {};
const mix = (group, names, vol, max, gap, prio, duck) => { for (const n of names.split(' ')) MIX[n] = { group, vol, max, gap, prio, duck: duck || 0 }; };
// Nothing fires ON a keystroke: the RGB keyboard clicks. The engine, grind and
// brake beds run through foley (dry, low-passed at 2.4 kHz) at low levels so they
// sit under the click band and never tire the ear; the game crossfades the three
// engine loops with set(). A typo's sputter is delayed by the game and kept soft.
mix('ui',     'ui_move ui_back',                          0.45, 1, 0.04, 1);
mix('ui',     'ui_select',                                0.55, 1, 0.08, 2);
mix('ui',     'count',                                    0.5, 1, 0.3, 2);
mix('ui',     'go',                                       0.65, 1, 0.5, 3);
mix('foley',  'engine_low engine_mid engine_high',        0.2, 1, 0, 0);
mix('foley',  'grind_loop',                               0.22, 1, 0, 1);
mix('foley',  'brake_loop',                               0.22, 1, 0, 1);
mix('foley',  'turn',                                     0.28, 1, 0.06, 0);
mix('type',   'sputter',                                  0.3, 1, 0.25, 1);
mix('type',   'wall_cut',                                 0.34, 1, 0.2, 1);
mix('combat', 'word_pulse',                               0.32, 1, 0.12, 1);
mix('combat', 'pickup',                                   0.5, 1, 0.15, 2);
mix('combat', 'cell_fire',                                0.55, 1, 0.2, 2);
mix('combat', 'shield_break lance spike phase surge reset', 0.6, 1, 0.2, 2);
mix('combat', 'derez',                                    0.75, 2, 0.08, 3, 0.3);
mix('combat', 'pulse_ring',                               0.7, 1, 0.4, 3, 0.3);
mix('world',  'seal_close',                               0.65, 1, 0.5, 3, 0.3);
mix('world',  'portal',                                   0.45, 2, 0.12, 2);
mix('world',  'fault_warn',                               0.3, 3, 0.1, 1);
mix('world',  'fault_fall',                               0.45, 2, 0.15, 2);
mix('world',  'gate_move',                                0.35, 2, 0.5, 1);
mix('big',    'rez_in',                                   0.5, 2, 0.1, 2);
mix('big',    'boss_sweep_warn boss_drop_warn',           0.55, 1, 0.3, 3);
mix('big',    'boss_sweep',                               0.7, 1, 0.3, 3, 0.3);
mix('big',    'boss_drop',                                0.8, 1, 0.3, 3, 0.35);
mix('big',    'anchor_break',                             0.9, 1, 1.0, 3, 0.5);
const MIX_DEFAULT = { group: 'world', vol: 0.6, max: 2, gap: 0.05, prio: 1, duck: 0 };

const MAX_VOICES = 20;
const voices = [];                      // { name, src, g, prio, start, end }
const lastFired = {}, recent = {};
const loops = new Map();
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function fadeOut(g, src, fade, at) {
  const t = Math.max(AC.currentTime, at || 0);
  try {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + fade);
    src.stop(t + fade + 0.02);
  } catch (e) {}
}
function dropVoice(v, fade) {
  const i = voices.indexOf(v);
  if (i >= 0) voices.splice(i, 1);
  fadeOut(v.g, v.src, fade == null ? 0.04 : fade);
}

function sfx(name, o) {
  if (!unlocked || !AC || !BANK.sfx[name]) return null;
  o = o || {};
  const m = MIX[name] || MIX_DEFAULT;
  const now = AC.currentTime;
  const delay = clamp(num(o.delay, 0), 0, 5);
  const at = now + delay;
  // too soon after the last one: skip it, a double hit only sounds like a glitch
  if (!o.force && lastFired[name] != null && at - lastFired[name] < m.gap) return null;
  lastFired[name] = at;
  // the same sound over and over gets gently quieter, so it never nags
  const r = (recent[name] || []).filter(x => now - x < 1.2);
  r.push(now); recent[name] = r;
  const fatigue = Math.max(0.55, 1 / (1 + 0.12 * (r.length - 1)));
  // make room: this sound's own limit first, then the global cap
  const mine = voices.filter(v => v.name === name);
  if (mine.length >= m.max) dropVoice(mine[0], 0.05);
  if (voices.length >= MAX_VOICES) {
    let low = null;
    for (const v of voices) if (!v.loop && (!low || v.prio < low.prio || (v.prio === low.prio && v.start < low.start))) low = v;
    if (!low || low.prio > m.prio) return null;
    dropVoice(low, 0.05);
  }
  const src = AC.createBufferSource();
  src.buffer = BANK.sfx[name];
  const vary = clamp(num(o.vary, 0.05), 0, 0.5);
  const rate = clamp(num(o.pitch, 1), 0.25, 4) * (1 + (Math.random() * 2 - 1) * vary);
  src.playbackRate.setValueAtTime(rate, at);
  if (o.pitchTo != null) src.playbackRate.linearRampToValueAtTime(clamp(num(o.pitchTo, 1), 0.25, 4) * rate / clamp(num(o.pitch, 1), 0.25, 4), at + Math.max(0.05, num(o.pitchTime, 0.5)));
  if (o.loop) src.loop = true;
  const vol = clamp(num(o.vol, m.vol), 0, 1.5) * fatigue;
  const g = AC.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + (o.loop ? Math.max(0.03, num(o.fade, 0.05)) : 0.003));
  // left and right follow the screen: pan, or x on the 320-wide screen
  let pan = o.pan != null ? num(o.pan, 0) : o.x != null ? (num(o.x, 160) / 320 * 2 - 1) * 0.4 : 0;
  let node = g;
  if (pan && AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); node = p; }
  src.connect(g);
  node.connect(GROUPS[m.group] || sfxBus);
  src.start(at);
  // a safety net for loops tied to something that may vanish without saying so
  if (o.maxDur != null) { const end = at + clamp(num(o.maxDur, 2), 0.05, 30); g.gain.setValueAtTime(vol, end); g.gain.linearRampToValueAtTime(0, end + 0.08); src.stop(end + 0.1); }
  const v = { name, src, g, prio: m.prio, start: at, loop: !!o.loop };
  voices.push(v);
  src.onended = () => { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); try { node.disconnect(); } catch (e) {} };
  const dk = o.duck != null ? num(o.duck, 0) : m.duck;
  if (dk > 0) duck(dk, src.buffer.duration * 0.7, delay);
  // a handle: stop it (with a fade), cancel it if it has not started, or reshape it
  return {
    get pending() { return AC.currentTime < at; },
    stop(fade) { dropVoice(v, num(fade, 0.08)); },
    cancel() { if (AC.currentTime < at) dropVoice(v, 0); },
    set(vv, ramp) { const t = AC.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(clamp(num(vv, 0), 0, 1.5), t + num(ramp, 0.2)); },
  };
}

// a named bed that keeps going until it is stopped: one per id, fades both ways
function loop(name, o) {
  o = o || {};
  const id = o.id || name;
  const prev = loops.get(id);
  if (prev) { prev.set(num(o.vol, (MIX[name] || MIX_DEFAULT).vol), 0.3); return prev; }
  const h = sfx(name, { vol: o.vol, fade: num(o.fade, 0.6), loop: true, vary: 0, force: true, pan: o.pan });
  if (!h) return { stop() {}, set() {}, cancel() {} };
  const w = { set: h.set, cancel: h.cancel, stop(fade) { if (loops.get(id) === w) loops.delete(id); h.stop(num(fade, 0.6)); } };
  loops.set(id, w);
  return w;
}

// the music dips under a big sound and comes back; overlapping dips take the
// deepest and the longest, never a tug of war
const DUCK = { depth: 0, until: 0 };
function duck(amount, dur, delay) {
  if (!AC || !duckGain) return;
  const now = AC.currentTime + num(delay, 0);
  if (AC.currentTime > DUCK.until) DUCK.depth = 0;
  const depth = clamp(Math.max(DUCK.depth, num(amount, 0)), 0, 0.9);
  const until = Math.max(DUCK.until, now + clamp(num(dur, 0.3), 0.05, 4));
  DUCK.depth = depth; DUCK.until = until;
  const g = duckGain.gain, t = AC.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(1 - depth, Math.max(t + 0.04, now + 0.03));
  g.setValueAtTime(1 - depth, until);
  g.linearRampToValueAtTime(1, until + 0.45);
}

// everything out, gently: leaving the game, a hard reset
function stopAll(fade) {
  fade = num(fade, 0.5);
  stopMusic(fade);
  for (const w of [...loops.values()]) w.stop(fade);
  for (const v of [...voices]) dropVoice(v, Math.min(fade, 0.25));
}

function ramp(param, v) { param.cancelScheduledValues(AC.currentTime); param.setTargetAtTime(v, AC.currentTime, 0.06); }

// start the heavy lifting as soon as there is a page to do it in
if (typeof window !== 'undefined') prerender();

const VectorAudio = {
  get ready() { return unlocked && bankBuilt && Object.keys(BANK.inst).length === Object.keys(INSTR).length; },
  get prepared() { return rawDone; },
  get loaded() { return bankDone; },
  unlock,
  onReady(fn) { if (unlocked) fn(); else listeners.push(fn); },
  songs: Object.keys(SONGS),
  stings: Object.keys(STINGS),
  sounds: Object.keys(SFX_DEF),
  mix: MIX,
  music: {
    play,
    stop: stopMusic,
    get current() { return SEQ.cur ? SEQ.cur.name : null; },
    get pending() { return SEQ.pending ? SEQ.pending.name : null; },
    get intensity() { return SEQ.intensity; },
    // 0 calm .. 3 full battle; layers fade in or out over about a bar
    setIntensity(n) { n = clamp(Math.round(num(n, 0)), 0, 3); if (n === SEQ.intensity) return; SEQ.intensity = n; if (AC) applyLayers(); },
    setTag(tag, on) { const had = SEQ.tags.has(tag); if (on) SEQ.tags.add(tag); else SEQ.tags.delete(tag); if (had !== !!on && AC) applyLayers(0.5); },
    // 0 clear .. 1 muffled (last heart, paused, underwater)
    setMuffle(x) { if (!AC) return; const f = 16000 * Math.pow(900 / 16000, clamp(num(x, 0), 0, 1)); musicFilter.frequency.cancelScheduledValues(AC.currentTime); musicFilter.frequency.setTargetAtTime(f, AC.currentTime, 0.15); },
    get position() { return SEQ.cur && AC ? { step: SEQ.step - SEQ.cur.origin, bpm: SONGS[SEQ.cur.name].bpm } : null; },
  },
  sting: playSting,
  sfx,
  loop,
  duck,
  stopAll,
  // a paused game: everything sinks to a murmur; resume brings it back
  pause(on) {
    userPaused = !!on;
    if (!AC || !pauseGain) return;
    ramp(pauseGain.gain, on ? 0.25 : 1);
  },
  // levels are 0..1 and remembered between visits
  get volume() { return { master: prefs.master, music: prefs.music, sfx: prefs.sfx, muted: prefs.muted }; },
  setVolume(masterV, musicV, sfxV) {
    if (masterV != null) prefs.master = clamp(num(masterV, prefs.master), 0, 1);
    if (musicV != null) prefs.music = clamp(num(musicV, prefs.music), 0, 1);
    if (sfxV != null) prefs.sfx = clamp(num(sfxV, prefs.sfx), 0, 1);
    savePrefs();
    if (!AC) return;
    ramp(master.gain, prefs.muted ? 0 : prefs.master);
    ramp(musicBus.gain, MUSIC_LEVEL * prefs.music);
    ramp(sfxBus.gain, 0.85 * prefs.sfx);
  },
  mute(on) {
    prefs.muted = !!on; savePrefs();
    if (AC) ramp(master.gain, prefs.muted ? 0 : prefs.master);
  },
  // for tooling
  _debug: { SONGS, STINGS, MIX, compile, parseNotes, parseHits, get ctx() { return AC; }, get master() { return master; }, get voices() { return voices.length; }, get loops() { return [...loops.keys()]; }, BANK },
};

export default VectorAudio;
export { VectorAudio };
