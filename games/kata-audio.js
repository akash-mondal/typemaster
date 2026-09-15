/*
 * kata-audio.js - KATA's sound engine.
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
const PREFS_KEY = 'typemaxx.kata.audio';
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
// the trailer's cuts, in sixteenths at 144 bpm (a sixteenth is 0.104 s):
// 1.7 s, 2.5, 4.1, 4.9, 6.6, 7.7, 8.9 and the ink wipe at 9.55
const INTRO_CUTS = [16, 24, 40, 48, 64, 74, 86];

// ---------------------------------------------------------------- songs
// layer: the intensity from which the track plays. tag: only while that state is on.
const SONGS = {
  // the select screen: exactly 10 s at 144 bpm (24 beats), accents on the trailer's cuts
  intro: { bpm: 144, bars: 6, tracks: [
    { inst: 'taiko', vol: 0.9, layer: 0, hits: hitsAt(96, [0].concat(INTRO_CUTS), [8, 12, 20, 28, 32, 36, 44, 52, 56, 60, 68, 78, 80, 82, 88, 90, 92, 93, 94, 95]) },
    { inst: 'gong', vol: 0.7, layer: 0, hits: hitsAt(96, [0, 64, 92]) },
    { inst: 'bass', vol: 0.5, layer: 0, notes: 'D2:4 D2:4 D2:4 A1:4 | Bb1:4 Bb1:4 Bb1:4 A1:4 | G1:4 G1:4 A1:4 A1:4 | D2:4 D2:4 D2:4 Eb2:4 | Bb1:4 Bb1:4 A1:4 A1:4 | D2:4 A1:4 D2:8' },
    { inst: 'shamisen', vol: 0.32, layer: 0, notes: rep('D4:2 A4:2 D5:2 A4:2 Eb5:2 D5:2 A4:2 G4:2', 6) },
    { inst: 'shakuhachi', vol: 0.4, layer: 0, notes: 'D5:12 Eb5:4 | G5:8 A5:8 | Bb5:6 A5:2 G5:8 | A5:16 | D6:8 C6:4 Bb5:4 | A5:16' },
    { inst: 'brass', vol: 0.28, layer: 0, notes: 'r:16 | r:16 | D4+A4:8 r:8 | D4+A4:8 Eb4+Bb4:8 | D4+A4:16 | D4+A4+D5:16' },
    { inst: 'shime', vol: 0.4, layer: 0, hits: hitsAt(96, [], [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95]) },
  ] },
  // KATA's title and menus: calm, 8 bars
  menu: { bpm: 92, bars: 8, tracks: [
    { inst: 'koto', vol: 0.4, layer: 0, notes: rep('D4:2 A4:2 D5:2 Eb5:2 A5:4 Eb5:2 D5:2', 2) + ' ' + rep('Bb3:2 G4:2 D5:2 Eb5:2 G5:4 Eb5:2 D5:2', 2) + ' ' + rep('G3:2 D4:2 G4:2 A4:2 D5:4 A4:2 G4:2', 2) + ' ' + rep('A3:2 Eb4:2 A4:2 Bb4:2 D5:4 A4:2 Eb4:2', 2) },
    { inst: 'pad', vol: 0.22, layer: 0, notes: 'D3+A3+D4:32 Bb2+F3+D4:32 G2+D3+Bb3:32 A2+Eb3+A3:32' },
    { inst: 'shakuhachi', vol: 0.38, layer: 0, notes: 'r:16 A5:8 G5:4 Eb5:4 | D5:16 r:16 | r:16 Bb5:8 A5:4 G5:4 | A5:24 r:8' },
    { inst: 'clack', vol: 0.25, layer: 0, hits: rep('x...............x.......x.......', 4) },
    { inst: 'bell', vol: 0.18, layer: 0, notes: 'D6:32 r:32 G6:32 r:32' },
  ] },
  // ---- the five worlds. Every world theme has the same layer plan:
  //   0 base groove   1 more drive   2 the melody   3 full battle
  //   tag climb: an ostinato while on a tower   tag danger: a heartbeat on the last heart
  city: { bpm: 132, bars: 4, tracks: [
    { inst: 'taiko', vol: 0.8, layer: 0, hits: 'X.......x.x.....X.......x...x.x.' },
    { inst: 'bass', vol: 0.5, layer: 0, notes: 'D2:2 D2:2 r:2 D2:2 A1:2 D2:2 r:2 D2:2 | Bb1:2 Bb1:2 r:2 Bb1:2 F2:2 Bb1:2 r:2 Bb1:2 | G1:2 G1:2 r:2 G1:2 D2:2 G1:2 r:2 G1:2 | A1:2 A1:2 r:2 A1:2 Eb2:2 A1:2 r:2 A1:2' },
    { inst: 'pad', vol: 0.18, layer: 0, notes: 'D3+A3+D4:16 Bb2+F3+D4:16 G2+D3+Bb3:16 A2+Eb3+A3:16' },
    { inst: 'shamisen', vol: 0.3, layer: 1, notes: 'D4:2 A4:2 D5:2 A4:2 Eb5:2 D5:2 A4:2 G4:2 | Bb3:2 F4:2 Bb4:2 F4:2 D5:2 Bb4:2 F4:2 D4:2 | G3:2 D4:2 G4:2 D4:2 Bb4:2 G4:2 D4:2 Bb3:2 | A3:2 Eb4:2 A4:2 Eb4:2 Bb4:2 A4:2 Eb4:2 D4:2' },
    { inst: 'shime', vol: 0.3, layer: 1, hits: rep('..x...x...x...x.', 4) },
    { inst: 'shakuhachi', vol: 0.42, layer: 2, notes: 'D5:6 Eb5:2 G5:4 A5:4 | Bb5:6 A5:2 G5:4 Eb5:4 | D5:8 G5:4 A5:4 | A5:12 r:4' },
    { inst: 'snare', vol: 0.32, layer: 2, hits: rep('....X.......X...', 4) },
    { inst: 'brass', vol: 0.3, layer: 3, notes: 'A4+D5:4 r:4 A4+D5:2 A4+D5:2 Bb4+Eb5:4 | Bb4+F5:4 r:4 Bb4+F5:2 Bb4+F5:2 A4+D5:4 | G4+D5:4 r:4 G4+D5:2 G4+D5:2 A4+Eb5:4 | A4+Eb5:16' },
    { inst: 'taiko', vol: 0.6, layer: 3, hits: '................................................x.x.x.x.X.X.XXXX' },
    { inst: 'koto', vol: 0.34, layer: 99, tag: 'climb', notes: rep('D5:1 A5:1 D6:1 A5:1', 16) },
    { inst: 'taiko', vol: 0.5, layer: 99, tag: 'danger', hits: rep('x..x............', 4) },
  ] },
  grove: { bpm: 108, bars: 4, tracks: [
    { inst: 'koto', vol: 0.42, layer: 0, notes: 'G3:2 D4:2 G4:2 A4:2 D5:2 A4:2 G4:2 D4:2 | C4:2 G4:2 C5:2 D5:2 E5:2 D5:2 C5:2 G4:2 | A3:2 E4:2 A4:2 C5:2 E5:2 C5:2 A4:2 E4:2 | D4:2 A4:2 D5:2 E5:2 G5:2 E5:2 D5:2 A4:2' },
    { inst: 'clack', vol: 0.28, layer: 0, hits: rep('x......x..x.....', 4) },
    { inst: 'pad', vol: 0.14, layer: 0, notes: 'G3+D4:16 C3+G3:16 A2+E3:16 D3+A3:16' },
    { inst: 'tsuzumi', vol: 0.45, layer: 1, hits: rep('....x.......x.x.', 4) },
    { inst: 'bass', vol: 0.34, layer: 1, notes: 'G1:6 G1:2 D2:8 | C2:6 C2:2 G1:8 | A1:6 A1:2 E2:8 | D2:6 D2:2 A1:8' },
    { inst: 'shakuhachi', vol: 0.44, layer: 2, notes: 'D5:6 E5:2 G5:8 | A5:4 G5:4 E5:4 D5:4 | C5:6 D5:2 E5:8 | D5:16' },
    { inst: 'shime', vol: 0.3, layer: 3, hits: rep('x.x.x.x.x.x.xxx.', 4) },
    { inst: 'bell', vol: 0.18, layer: 3, notes: 'G6:8 D6:8 | E6:8 C6:8 | A6:8 E6:8 | D6:16' },
    { inst: 'koto', vol: 0.3, layer: 99, tag: 'climb', notes: rep('G5:1 D6:1 G6:1 D6:1', 16) },
    { inst: 'taiko', vol: 0.5, layer: 99, tag: 'danger', hits: rep('x..x............', 4) },
  ] },
  snow: { bpm: 88, bars: 4, tracks: [
    { inst: 'pad', vol: 0.24, layer: 0, notes: 'E3+B3+E4:16 C3+G3+E4:16 A2+E3+C4:16 B2+F#3+B3:16' },
    { inst: 'bell', vol: 0.26, layer: 0, notes: 'E6:6 B5:2 G5:8 | r:8 C6:4 B5:4 | A5:6 E5:2 C6:8 | B5:16' },
    { inst: 'taiko', vol: 0.5, layer: 1, hits: rep('x.......x.......', 4) },
    { inst: 'koto', vol: 0.3, layer: 1, notes: rep('E4:4 B4:4 G4:4 B4:4', 2) + ' ' + rep('A3:4 E4:4 C4:4 E4:4', 1) + ' ' + rep('B3:4 F#4:4 B4:4 F#4:4', 1) },
    { inst: 'shakuhachi', vol: 0.42, layer: 2, notes: 'B5:8 C6:4 B5:4 | G5:12 F#5:4 | E5:8 G5:4 A5:4 | B5:16' },
    { inst: 'bass', vol: 0.36, layer: 2, notes: 'E2:8 E2:8 | C2:8 C2:8 | A1:8 A1:8 | B1:8 B1:8' },
    { inst: 'shime', vol: 0.28, layer: 3, hits: rep('x...x.x.x...x.xx', 4) },
    { inst: 'bell', vol: 0.2, layer: 99, tag: 'climb', notes: rep('E6:2 B6:2', 16) },
    { inst: 'taiko', vol: 0.5, layer: 99, tag: 'danger', hits: rep('x..x............', 4) },
  ] },
  castle: { bpm: 140, bars: 4, tracks: [
    { inst: 'taiko', vol: 0.85, layer: 0, hits: rep('X...X...X.X.X...', 4) },
    { inst: 'bass', vol: 0.5, layer: 0, notes: rep('C2:2 C2:2 C2:2 C2:2 G1:2 G1:2 C2:2 C2:2', 2) + ' ' + rep('Ab1:2 Ab1:2 Ab1:2 Ab1:2 Bb1:2 Bb1:2 G1:2 G1:2', 2) },
    { inst: 'brass', vol: 0.26, layer: 0, notes: 'C4+G4:2 r:6 C4+G4:2 r:6 | C4+G4:2 r:6 Bb3+F4:2 r:6 | Ab3+Eb4:2 r:6 Ab3+Eb4:2 r:6 | Bb3+F4:2 r:6 G3+D4:8' },
    { inst: 'snare', vol: 0.34, layer: 1, hits: rep('..X..X..X.X..XX.', 4) },
    { inst: 'shamisen', vol: 0.26, layer: 1, notes: rep('C5:2 G4:2 Eb5:2 G4:2', 4) + ' ' + rep('Ab4:2 Eb4:2 C5:2 Eb4:2', 2) + ' ' + rep('Bb4:2 F4:2 D5:2 F4:2', 2) },
    { inst: 'brass', vol: 0.4, layer: 2, notes: 'C5:4 Eb5:4 G5:6 F5:2 | Eb5:4 D5:4 C5:8 | Ab4:4 Bb4:4 C5:4 D5:4 | G4:16' },
    { inst: 'gong', vol: 0.45, layer: 3, hits: 'X...............................................................' },
    { inst: 'lead', vol: 0.22, layer: 3, notes: 'G5:4 Ab5:4 Bb5:6 C6:2 | Bb5:4 Ab5:4 G5:8 | Eb5:4 F5:4 G5:4 Ab5:4 | D5:16' },
    { inst: 'shime', vol: 0.3, layer: 99, tag: 'climb', notes: 'r:1', hits: rep('xxxxxxxxxxxxxxxx', 4) },
    { inst: 'taiko', vol: 0.5, layer: 99, tag: 'danger', hits: rep('x..x............', 4) },
  ] },
  harbour: { bpm: 120, bars: 4, tracks: [
    { inst: 'mallet', vol: 0.36, layer: 0, notes: 'A4:3 E5:3 A5:2 G5:3 E5:3 D5:2 | C5:3 G5:3 C6:2 A5:3 G5:3 E5:2 | D5:3 A5:3 D6:2 C6:3 A5:3 G5:2 | E5:3 B5:3 E6:2 D6:3 B5:3 G5:2' },
    { inst: 'bass', vol: 0.44, layer: 0, notes: 'A1:6 A1:2 E2:8 | C2:6 C2:2 G2:8 | D2:6 D2:2 A1:8 | E2:6 E2:2 B1:8' },
    { inst: 'ohat', vol: 0.18, layer: 0, hits: rep('..x.....x.....x.', 4) },
    { inst: 'koto', vol: 0.28, layer: 1, notes: rep('A3:2 E4:2 A4:2 C5:2', 4) + ' ' + rep('D4:2 A4:2 D5:2 E5:2', 2) + ' ' + rep('E4:2 B4:2 E5:2 G5:2', 2) },
    { inst: 'tsuzumi', vol: 0.4, layer: 1, hits: rep('x.....x...x.....', 4) },
    { inst: 'lead', vol: 0.26, layer: 2, notes: 'E5:6 G5:2 A5:8 | G5:4 E5:4 D5:4 C5:4 | D5:6 E5:2 G5:8 | E5:16' },
    { inst: 'taiko', vol: 0.6, layer: 3, hits: rep('X.....X...X.X...', 4) },
    { inst: 'snare', vol: 0.3, layer: 3, hits: rep('....X.......X..X', 4) },
    { inst: 'mallet', vol: 0.28, layer: 99, tag: 'climb', notes: rep('A5:1 E6:1 A6:1 E6:1', 16) },
    { inst: 'taiko', vol: 0.5, layer: 99, tag: 'danger', hits: rep('x..x............', 4) },
  ] },
  // results, over a dimmed menu
  results: { bpm: 72, bars: 4, tracks: [
    { inst: 'koto', vol: 0.36, layer: 0, notes: 'D4:4 A4:4 D5:8 | Bb3:4 F4:4 D5:8 | G3:4 D4:4 Bb4:8 | A3:4 Eb4:4 A4:8' },
    { inst: 'pad', vol: 0.2, layer: 0, notes: 'D3+A3:16 Bb2+F3:16 G2+D3:16 A2+Eb3:16' },
    { inst: 'shakuhachi', vol: 0.34, layer: 0, notes: 'A5:16 | F5:16 | G5:12 r:4 | A5:16' },
  ] },
};

// short cues, played over the music
const STINGS = {
  stage: { bpm: 160, tracks: [
    { inst: 'brass', vol: 0.5, notes: 'D5:2 A5:2 D6:8' },
    { inst: 'taiko', vol: 0.8, hits: 'X.X.X...' },
  ] },
  gate: { bpm: 160, tracks: [
    { inst: 'shime', vol: 0.5, hits: 'x.x.xxxxXXXXXXXX' },
    { inst: 'gong', vol: 0.8, hits: '................X' },
    { inst: 'taiko', vol: 0.9, hits: '................X' },
  ] },
  death: { bpm: 100, tracks: [
    { inst: 'koto', vol: 0.5, notes: 'A4:2 G4:2 Eb4:2 D4:10' },
    { inst: 'gong', vol: 0.5, hits: '......X' },
    { inst: 'bass', vol: 0.5, notes: 'r:6 D1:10' },
  ] },
  rank: { bpm: 120, tracks: [
    { inst: 'bell', vol: 0.4, notes: 'D6:2 A6:2 D7:4' },
    { inst: 'koto', vol: 0.4, notes: 'D5:2 A5:2 D6:4' },
  ] },
  tower: { bpm: 150, tracks: [
    { inst: 'taiko', vol: 0.8, hits: 'X..X..X.XXXX' },
    { inst: 'brass', vol: 0.4, notes: 'D4+A4:6 Eb4+Bb4:6' },
  ] },
  summit: { bpm: 150, tracks: [
    { inst: 'brass', vol: 0.45, notes: 'A4+D5:2 D5+A5:2 D5+A5+D6:8' },
    { inst: 'gong', vol: 0.5, hits: '....X' },
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
mix('ui',     'ui_move ui_back',                          0.5, 1, 0.04, 1);
mix('ui',     'ui_select card_stamp',                     0.6, 1, 0.08, 2);
mix('ui',     'count_tick',                               0.6, 1, 0.3, 2);
mix('ui',     'count_go',                                 0.7, 1, 0.5, 3);
mix('type',   'key key_wrong',                            0.2, 1, 0.06, 0);
mix('foley',  'step_tile step_wood step_bamboo step_snow step_plaster', 0.3, 1, 0.14, 0);
mix('foley',  'climb_grip climb_metal',                   0.35, 1, 0.12, 0);
mix('foley',  'jump hook_throw',                          0.5, 1, 0.12, 1);
mix('foley',  'land mantle hook_catch slip',              0.55, 1, 0.15, 1);
mix('foley',  'glide rope_swing swing',                   0.45, 1, 0.3, 1);
mix('foley',  'body_fall',                                0.8, 1, 0.4, 2);
mix('combat', 'slash_hit enemy_die',                      0.7, 2, 0.05, 2);
mix('combat', 'clash deflect parry catch',                0.75, 2, 0.06, 2);
mix('combat', 'throw arrow_draw arrow_loose',             0.6, 2, 0.06, 1);
mix('combat', 'shuriken_whirr',                           0.3, 2, 0, 1);
mix('combat', 'crack snuff shutter ronin_draw',           0.6, 2, 0.08, 1);
mix('combat', 'power_word tier_up heart_pick',            0.5, 1, 0.2, 2);
mix('combat', 'kill_word',                                0.7, 1, 0.12, 3, 0.3);
mix('combat', 'duel_start',                               0.8, 1, 0.6, 3, 0.4);
mix('combat', 'hurt',                                     0.8, 1, 0.25, 3, 0.4);
mix('combat', 'heart_lost',                               0.7, 1, 0.3, 3);
mix('world',  'icicle_crack icicle_shatter crate_creak',  0.6, 2, 0.1, 1);
mix('world',  'thunder wave blizzard petals mist tower_enter', 0.6, 1, 0.8, 2);
mix('world',  'threat_smoke threat_mist threat_avalanche threat_guards threat_tide', 0.05, 1, 0, 1);
mix('world',  'roof_break',                               0.8, 1, 0.3, 3, 0.35);
mix('big',    'building_fall',                            0.9, 1, 1.0, 3, 0.5);
mix('big',    'gate_boom',                                0.85, 1, 1.0, 3, 0.4);
mix('big',    'stage_up',                                 0.7, 1, 1.0, 3);
mix('big',    'kata_tiger kata_still kata_shadow kata_crane', 0.8, 1, 0.3, 3, 0.35);
mix('big',    'kata_menu',                                0.6, 1, 0.3, 2);
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

const KataAudio = {
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

export default KataAudio;
export { KataAudio };
