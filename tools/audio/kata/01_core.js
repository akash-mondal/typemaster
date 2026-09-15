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
