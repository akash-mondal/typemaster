/*
 * wagonheart-audio.js - WAGONHEART's sound engine (built by tools/audio/build.py).
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
const PREFS_KEY = 'typemaxx.wagonheart.audio';
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
// WAGONHEART's trailer: exactly 10 s at 120 bpm, 5 bars; the shots cut on every
// bar line (2, 4, 6, 8 s), so every cut lands on a downbeat
const INTRO_CUTS = [16, 32, 48, 64];

// ---------------------------------------------------------------- songs
// layer: from which intensity the track plays (the game drives intensity with
// the typing pace: easy 0, steady 1, hard 2, driven 3).
// tags: 'storm' adds rolling drums, 'danger' a heartbeat when someone is dying
const arp = (chords, per) => chords.map(c => rep(c, per)).join(' ');
const roll = (a, b, c) => [a, b, c, b].map(n => n + ':1').join(' ');       // a banjo roll, four sixteenths
const SONGS = {
  intro: { bpm: 120, bars: 5, tracks: [
    { inst: 'stomp', vol: 0.9, layer: 0, hits: hitsAt(80, [0].concat(INTRO_CUTS), [8, 24, 40, 56, 72, 76, 78]) },
    { inst: 'clap', vol: 0.3, layer: 0, hits: hitsAt(80, [], [4, 12, 20, 28, 36, 44, 52, 60, 68]) },
    { inst: 'shaker', vol: 0.22, layer: 0, hits: hitsAt(80, [], Array.from({ length: 40 }, (_, i) => i * 2 + 1)) },
    { inst: 'ubass', vol: 0.55, layer: 0, notes: 'G1:4 D2:4 G1:4 D2:4 | C2:4 G2:4 C2:4 G2:4 | G1:4 D2:4 E2:4 B1:4 | D2:4 A1:4 D2:4 F#2:4 | G1:8 G1:8' },
    { inst: 'banjo', vol: 0.32, layer: 0, notes: rep(roll('G4', 'B4', 'D5'), 4) + ' ' + rep(roll('C5', 'E5', 'G5'), 4) + ' ' + rep(roll('G4', 'B4', 'D5'), 2) + ' ' + rep(roll('E4', 'G4', 'B4'), 2) + ' ' + rep(roll('D4', 'F#4', 'A4'), 4) + ' ' + rep(roll('G4', 'B4', 'D5'), 4) },
    { inst: 'fiddle', vol: 0.34, layer: 0, notes: 'r:8 D5:4 E5:4 | G5:8 E5:4 D5:4 | B4:6 D5:2 E5:4 G5:4 | A5:8 F#5:8 | G5:16' },
    { inst: 'bell', vol: 0.18, layer: 0, notes: 'G5:16 r:48 G5:16' },
  ] },
  // title and menus: dawn at the trailhead
  menu: { bpm: 88, bars: 8, tracks: [
    { inst: 'guitar', vol: 0.36, layer: 0, notes: arp(['G3:2 D4:2 G4:2 B4:2', 'C4:2 G4:2 C5:2 E5:2', 'E3:2 B3:2 E4:2 G4:2', 'D3:2 A3:2 D4:2 F#4:2'], 4) },
    { inst: 'harmonica', vol: 0.3, layer: 0, notes: 'D5:12 B4:4 | G4:16 | E5:12 D5:4 | C5:16 | B4:12 G4:4 | E4:16 | F#4:8 A4:8 | G4:16' },
    { inst: 'ubass', vol: 0.4, layer: 0, notes: 'G1:16 C2:16 E2:16 D2:16 G1:16 C2:16 E2:16 D2:16' },
    { inst: 'shaker', vol: 0.12, layer: 0, hits: rep('..x...x...x...x.', 8) },
  ] },
  // ---- the seven lands; every song has the same four layers
  meadow: { bpm: 104, bars: 4, tracks: [
    { inst: 'ubass', vol: 0.5, layer: 0, notes: 'G1:4 D2:4 G1:4 D2:4 | C2:4 G1:4 C2:4 G1:4 | G1:4 D2:4 E2:4 B1:4 | D2:4 A1:4 D2:4 A1:4' },
    { inst: 'guitar', vol: 0.3, layer: 0, notes: rep('G3+B3+D4:2 r:2', 4) + ' ' + rep('C4+E4+G4:2 r:2', 4) + ' ' + rep('G3+B3+D4:2 r:2', 2) + ' ' + rep('E3+G3+B3:2 r:2', 2) + ' ' + rep('D3+F#3+A3:2 r:2', 4) },
    { inst: 'banjo', vol: 0.28, layer: 1, notes: rep(roll('G4', 'B4', 'D5'), 4) + ' ' + rep(roll('C5', 'E5', 'G5'), 4) + ' ' + rep(roll('G4', 'B4', 'D5'), 2) + ' ' + rep(roll('E4', 'G4', 'B4'), 2) + ' ' + rep(roll('D4', 'F#4', 'A4'), 4) },
    { inst: 'stomp', vol: 0.55, layer: 1, hits: rep('X.......x.......', 4) },
    { inst: 'fiddle', vol: 0.34, layer: 2, notes: 'D5:4 B4:2 G4:2 B4:4 D5:4 | E5:6 D5:2 C5:8 | B4:4 D5:4 E5:2 D5:2 B4:4 | A4:12 r:4' },
    { inst: 'shaker', vol: 0.18, layer: 2, hits: rep('..x...x...x...x.', 4) },
    { inst: 'harmonica', vol: 0.26, layer: 3, notes: 'G5:8 E5:8 | G5:4 A5:4 G5:8 | D5:8 E5:8 | F#5:16' },
    { inst: 'clap', vol: 0.28, layer: 3, hits: rep('....X.......X...', 4) },
    { inst: 'drum', vol: 0.5, layer: 99, tag: 'storm', hits: rep('x..x..x.x..x.xxx', 4) },
    { inst: 'ubass', vol: 0.45, layer: 99, tag: 'danger', notes: rep('G1:1 r:2 G1:1 r:12', 4) },
  ] },
  river: { bpm: 96, bars: 4, tracks: [
    { inst: 'guitar', vol: 0.34, layer: 0, notes: arp(['D4:2 A4:2 D5:2 A4:2', 'G3:2 D4:2 G4:2 D4:2', 'B3:2 F#4:2 B4:2 F#4:2', 'A3:2 E4:2 A4:2 E4:2'], 2) },
    { inst: 'ubass', vol: 0.45, layer: 0, notes: 'D2:8 A1:8 | G1:8 D2:8 | B1:8 F#2:8 | A1:8 E2:8' },
    { inst: 'shaker', vol: 0.16, layer: 1, hits: rep('x.x.x.x.x.x.x.x.', 4) },
    { inst: 'brush', vol: 0.3, layer: 1, hits: rep('....x.......x...', 4) },
    { inst: 'harmonica', vol: 0.32, layer: 2, notes: 'F#5:6 E5:2 D5:8 | B4:6 D5:2 G5:8 | F#5:4 E5:4 D5:4 B4:4 | A4:16' },
    { inst: 'banjo', vol: 0.22, layer: 3, notes: rep(roll('D5', 'F#5', 'A5'), 4) + ' ' + rep(roll('G4', 'B4', 'D5'), 4) + ' ' + rep(roll('B4', 'D5', 'F#5'), 4) + ' ' + rep(roll('A4', 'C#5', 'E5'), 4) },
    { inst: 'stomp', vol: 0.5, layer: 3, hits: rep('X.......X.......', 4) },
    { inst: 'drum', vol: 0.5, layer: 99, tag: 'storm', hits: rep('x...x.x.x...xxx.', 4) },
    { inst: 'ubass', vol: 0.45, layer: 99, tag: 'danger', notes: rep('D2:1 r:2 D2:1 r:12', 4) },
  ] },
  barrens: { bpm: 84, bars: 4, tracks: [
    { inst: 'pad', vol: 0.2, layer: 0, notes: 'E3+B3:16 D3+A3:16 C3+G3:16 D3+A3:16' },
    { inst: 'ubass', vol: 0.45, layer: 0, notes: 'E2:12 E2:4 | D2:12 D2:4 | C2:12 C2:4 | D2:12 B1:4' },
    { inst: 'guitar', vol: 0.28, layer: 1, notes: rep('E3:2 r:2 B3:2 r:2', 2) + ' ' + rep('D3:2 r:2 A3:2 r:2', 2) + ' ' + rep('C3:2 r:2 G3:2 r:2', 2) + ' ' + rep('D3:2 r:2 A3:2 r:2', 2) },
    { inst: 'drum', vol: 0.45, layer: 1, hits: rep('X.......x.......', 4) },
    { inst: 'fiddle', vol: 0.34, layer: 2, notes: 'B4:8 D5:4 E5:4 | F#5:12 E5:4 | G5:8 F#5:4 E5:4 | E5:16' },
    { inst: 'harmonica', vol: 0.24, layer: 3, notes: 'E5:4 r:4 G5:4 r:4 | A5:4 r:4 G5:8 | E5:4 r:4 D5:4 r:4 | E5:16' },
    { inst: 'shaker', vol: 0.18, layer: 3, hits: rep('x..x..x.x..x..x.', 4) },
    { inst: 'drum', vol: 0.55, layer: 99, tag: 'storm', hits: rep('xx.x.xx.xx.x.xxx', 4) },
    { inst: 'ubass', vol: 0.45, layer: 99, tag: 'danger', notes: rep('E2:1 r:2 E2:1 r:12', 4) },
  ] },
  highwood: { bpm: 92, bars: 4, tracks: [
    { inst: 'guitar', vol: 0.34, layer: 0, notes: arp(['A3:2 E4:2 A4:2 C5:2', 'F3:2 C4:2 F4:2 A4:2', 'C4:2 G4:2 C5:2 E5:2', 'G3:2 D4:2 G4:2 B4:2'], 2) },
    { inst: 'ubass', vol: 0.42, layer: 0, notes: 'A1:8 E2:8 | F1:8 C2:8 | C2:8 G2:8 | G1:8 D2:8' },
    { inst: 'brush', vol: 0.3, layer: 1, hits: rep('x...x...x...x...', 4) },
    { inst: 'bell', vol: 0.14, layer: 1, notes: 'A5:16 F5:16 C6:16 B5:16' },
    { inst: 'fiddle', vol: 0.32, layer: 2, notes: 'C5:6 B4:2 A4:8 | A4:4 C5:4 F5:8 | E5:6 D5:2 C5:8 | B4:12 r:4' },
    { inst: 'accordion', vol: 0.2, layer: 3, notes: 'A3+C4+E4:16 F3+A3+C4:16 C4+E4+G4:16 G3+B3+D4:16' },
    { inst: 'stomp', vol: 0.5, layer: 3, hits: rep('X.....x.X.......', 4) },
    { inst: 'drum', vol: 0.5, layer: 99, tag: 'storm', hits: rep('x..x..x.x..x.xxx', 4) },
    { inst: 'ubass', vol: 0.45, layer: 99, tag: 'danger', notes: rep('A1:1 r:2 A1:1 r:12', 4) },
  ] },
  pass: { bpm: 76, bars: 4, tracks: [
    { inst: 'pad', vol: 0.24, layer: 0, notes: 'D3+A3+D4:16 Bb2+F3+D4:16 C3+G3+E4:16 A2+E3+C#4:16' },
    { inst: 'bell', vol: 0.18, layer: 0, notes: 'D6:8 A5:8 | F5:16 | E5:8 G5:8 | A5:16' },
    { inst: 'ubass', vol: 0.4, layer: 1, notes: 'D2:16 Bb1:16 C2:16 A1:16' },
    { inst: 'drum', vol: 0.42, layer: 1, hits: rep('X...............', 4) },
    { inst: 'fiddle', vol: 0.36, layer: 2, notes: 'A4:8 D5:8 | F5:12 E5:4 | E5:8 G5:8 | C#5:16' },
    { inst: 'guitar', vol: 0.24, layer: 3, notes: arp(['D4:2 A4:2', 'Bb3:2 F4:2', 'C4:2 G4:2', 'A3:2 E4:2'], 4) },
    { inst: 'drum', vol: 0.55, layer: 99, tag: 'storm', hits: rep('x.xx.x.xx.x.xxxx', 4) },
    { inst: 'ubass', vol: 0.45, layer: 99, tag: 'danger', notes: rep('D2:1 r:2 D2:1 r:12', 4) },
  ] },
  saltmere: { bpm: 88, bars: 4, tracks: [
    { inst: 'pad', vol: 0.18, layer: 0, notes: 'E3+B3:32 F3+C4:16 E3+B3:16' },
    { inst: 'ubass', vol: 0.42, layer: 0, notes: rep('E2:4 r:4', 4) + ' ' + rep('F2:4 r:4', 2) + ' ' + rep('E2:4 r:4', 2) },
    { inst: 'shaker', vol: 0.2, layer: 1, hits: rep('x..x..x...x..x..', 4) },
    { inst: 'guitar', vol: 0.26, layer: 1, notes: rep('E4:1 F4:1 E4:2 r:4', 4) + ' ' + rep('F4:1 G4:1 F4:2 r:4', 2) + ' ' + rep('E4:1 F4:1 E4:2 r:4', 2) },
    { inst: 'harmonica', vol: 0.32, layer: 2, notes: 'B4:8 C5:4 B4:4 | A4:8 G#4:8 | A4:6 B4:2 C5:8 | B4:16' },
    { inst: 'fiddle', vol: 0.24, layer: 3, notes: 'E5:16 | F5:16 | G5:8 F5:8 | E5:16' },
    { inst: 'drum', vol: 0.45, layer: 3, hits: rep('X.....x.....x...', 4) },
    { inst: 'drum', vol: 0.55, layer: 99, tag: 'storm', hits: rep('x.x.xx.xx.x.xxxx', 4) },
    { inst: 'ubass', vol: 0.45, layer: 99, tag: 'danger', notes: rep('E2:1 r:2 E2:1 r:12', 4) },
  ] },
  coast: { bpm: 112, bars: 4, tracks: [
    { inst: 'accordion', vol: 0.28, layer: 0, notes: rep('C4+E4+G4:2 r:2', 4) + ' ' + rep('F4+A4+C5:2 r:2', 4) + ' ' + rep('G3+B3+D4:2 r:2', 4) + ' ' + rep('C4+E4+G4:2 r:2', 4) },
    { inst: 'ubass', vol: 0.48, layer: 0, notes: 'C2:4 G1:4 C2:4 G1:4 | F1:4 C2:4 F1:4 C2:4 | G1:4 D2:4 G1:4 D2:4 | C2:4 G1:4 C2:8' },
    { inst: 'stomp', vol: 0.55, layer: 1, hits: rep('X...x...X...x...', 4) },
    { inst: 'clap', vol: 0.26, layer: 1, hits: rep('....X.......X...', 4) },
    { inst: 'fiddle', vol: 0.34, layer: 2, notes: 'E5:4 G5:4 C6:4 G5:4 | A5:4 F5:4 C5:8 | B4:4 D5:4 G5:4 F5:4 | E5:12 r:4' },
    { inst: 'banjo', vol: 0.24, layer: 3, notes: rep(roll('C5', 'E5', 'G5'), 4) + ' ' + rep(roll('F4', 'A4', 'C5'), 4) + ' ' + rep(roll('G4', 'B4', 'D5'), 4) + ' ' + rep(roll('C5', 'E5', 'G5'), 4) },
    { inst: 'harmonica', vol: 0.22, layer: 3, notes: 'G5:16 | A5:16 | G5:16 | E5:16' },
    { inst: 'drum', vol: 0.5, layer: 99, tag: 'storm', hits: rep('x..x..x.x..x.xxx', 4) },
    { inst: 'ubass', vol: 0.45, layer: 99, tag: 'danger', notes: rep('C2:1 r:2 C2:1 r:12', 4) },
  ] },
  // ---- moments
  camp: { bpm: 72, bars: 4, tracks: [
    { inst: 'guitar', vol: 0.38, layer: 0, notes: arp(['G3:2 B3:2 D4:2 B3:2', 'E3:2 G3:2 B3:2 G3:2', 'C3:2 E3:2 G3:2 E3:2', 'D3:2 F#3:2 A3:2 F#3:2'], 2) },
    { inst: 'harmonica', vol: 0.3, layer: 0, notes: 'B4:8 D5:8 | E5:12 D5:4 | C5:8 B4:4 A4:4 | A4:16' },
    { inst: 'ubass', vol: 0.34, layer: 0, notes: 'G1:16 E2:16 C2:16 D2:16' },
  ] },
  hunt: { bpm: 126, bars: 2, tracks: [
    { inst: 'drum', vol: 0.6, layer: 0, hits: rep('X..x..x.X..x.x..', 2) },
    { inst: 'shaker', vol: 0.2, layer: 0, hits: rep('x.x.x.x.x.x.x.x.', 2) },
    { inst: 'ubass', vol: 0.45, layer: 0, notes: rep('E2:2 E2:1 G2:1 E2:2 B1:2', 4) },
    { inst: 'fiddle', vol: 0.28, layer: 0, notes: 'E5:3 G5:3 B5:2 A5:4 G5:4 | E5:3 D5:3 B4:2 E5:8' },
  ] },
  crossing: { bpm: 132, bars: 2, tracks: [
    { inst: 'drum', vol: 0.6, layer: 0, hits: rep('X.x.X.x.X.x.XXxx', 2) },
    { inst: 'ubass', vol: 0.5, layer: 0, notes: rep('D2:1 D2:1 A1:1 D2:1', 8) },
    { inst: 'fiddle', vol: 0.3, layer: 0, notes: 'D5:2 F5:2 A5:2 F5:2 D5:2 F5:2 A5:4 | C5:2 E5:2 G5:2 E5:2 C#5:4 A4:4' },
  ] },
  lament: { bpm: 60, bars: 2, tracks: [
    { inst: 'fiddle', vol: 0.38, layer: 0, notes: 'D5:8 C5:4 A4:4 | Bb4:8 A4:8' },
    { inst: 'pad', vol: 0.2, layer: 0, notes: 'D3+F3+A3:16 Bb2+D3+F3:8 A2+C#3+E3:8' },
    { inst: 'bell', vol: 0.14, layer: 0, notes: 'D5:16 A4:16' },
  ] },
  results: { bpm: 80, bars: 4, tracks: [
    { inst: 'guitar', vol: 0.34, layer: 0, notes: arp(['C4:2 G4:2 C5:2 G4:2', 'A3:2 E4:2 A4:2 E4:2', 'F3:2 C4:2 F4:2 C4:2', 'G3:2 D4:2 G4:2 D4:2'], 2) },
    { inst: 'harmonica', vol: 0.3, layer: 0, notes: 'E5:8 G5:8 | A5:12 G5:4 | F5:8 E5:4 D5:4 | D5:16' },
    { inst: 'accordion', vol: 0.18, layer: 0, notes: 'C4+E4+G4:16 A3+C4+E4:16 F3+A3+C4:16 G3+B3+D4:16' },
    { inst: 'ubass', vol: 0.36, layer: 0, notes: 'C2:16 A1:16 F1:16 G1:16' },
  ] },
};

// short cues over the music
const STINGS = {
  landmark: { bpm: 120, tracks: [
    { inst: 'banjo', vol: 0.45, notes: 'G4:1 B4:1 D5:1 G5:5' },
    { inst: 'bell', vol: 0.3, notes: 'r:2 G5:6' },
  ] },
  fort: { bpm: 120, tracks: [
    { inst: 'fiddle', vol: 0.4, notes: 'D5:2 G5:2 B5:4' },
    { inst: 'stomp', vol: 0.6, hits: 'X.X.X' },
  ] },
  region: { bpm: 100, tracks: [
    { inst: 'harmonica', vol: 0.4, notes: 'G4:2 B4:2 D5:2 G5:6' },
    { inst: 'drum', vol: 0.6, hits: 'X.......X' },
    { inst: 'bell', vol: 0.3, notes: 'r:6 G5:6' },
  ] },
  death: { bpm: 70, tracks: [
    { inst: 'fiddle', vol: 0.45, notes: 'A4:4 G4:2 F4:2 D4:8' },
    { inst: 'bell', vol: 0.3, notes: 'r:8 D4:8' },
  ] },
  verse: { bpm: 90, tracks: [
    { inst: 'bell', vol: 0.4, notes: 'G5:2 D6:2 B5:2 G6:6' },
    { inst: 'pad', vol: 0.25, notes: 'G3+D4+B4:12' },
  ] },
  crossing_done: { bpm: 120, tracks: [
    { inst: 'fiddle', vol: 0.45, notes: 'G4:1 B4:1 D5:1 G5:1 B5:1 D6:5' },
    { inst: 'banjo', vol: 0.35, notes: rep(roll('G4', 'B4', 'D5'), 2) },
    { inst: 'stomp', vol: 0.7, hits: 'X...X...X' },
  ] },
  success: { bpm: 140, tracks: [
    { inst: 'banjo', vol: 0.45, notes: 'D5:1 G5:1 B5:4' },
  ] },
  fail: { bpm: 90, tracks: [
    { inst: 'guitar', vol: 0.45, notes: 'E4:2 C4:2 A3:6' },
  ] },
  dawn: { bpm: 100, tracks: [
    { inst: 'bell', vol: 0.22, notes: 'D6:2 G6:6' },
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
// Nothing fires ON a keystroke: the stone keyboard clicks. A mistake's creak is
// delayed by the game and low enough to sit under the click.
mix('ui',     'ui_move ui_back',                          0.45, 1, 0.04, 1);
mix('ui',     'ui_select coin',                           0.55, 1, 0.08, 2);
mix('ui',     'store_bell',                               0.5, 1, 1.0, 2);
mix('type',   'creak',                                    0.28, 1, 0.18, 0);
mix('type',   'jolt',                                     0.3, 1, 0.15, 0);
mix('foley',  'whip hooves rope mud',                     0.45, 1, 0.2, 1);
mix('foley',  'hammer',                                   0.55, 1, 0.3, 1);
mix('world',  'wheels_break',                             0.75, 1, 0.8, 3, 0.3);
mix('world',  'moo',                                      0.5, 1, 2.5, 1);
mix('world',  'oxbell',                                   0.35, 1, 0.6, 0);
mix('combat', 'shot',                                     0.55, 3, 0.05, 1);
mix('combat', 'shot_miss animal_fall bolt',               0.5, 2, 0.08, 1);
mix('world',  'stag',                                     0.6, 1, 3.0, 3);
mix('world',  'splash',                                   0.6, 2, 0.15, 2);
mix('big',    'thunder',                                  0.8, 1, 2.0, 3, 0.4);
mix('world',  'river_loop rain_loop wind_loop crickets_loop fire_loop surf_loop', 0.3, 1, 0, 0);
mix('world',  'birds owl gull',                           0.35, 1, 1.5, 0);
mix('world',  'howl rattle',                              0.55, 1, 1.5, 2);
mix('big',    'stampede',                                 0.8, 1, 3.0, 3, 0.3);
mix('combat', 'cough hurt',                               0.55, 1, 0.4, 2);
mix('world',  'heal pickup cheer',                        0.55, 1, 0.3, 2);
mix('big',    'shovel',                                   0.6, 1, 2.0, 3, 0.2);
mix('type',   'carve',                                    0.3, 2, 0.06, 0);
mix('big',    'stone_wake',                               0.8, 1, 2.0, 3, 0.5);
mix('big',    'arrive',                                   0.6, 1, 1.5, 3);
mix('big',    'fire_whoosh',                              0.7, 1, 2.0, 3, 0.3);
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

const WagonheartAudio = {
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

export default WagonheartAudio;
export { WagonheartAudio };
