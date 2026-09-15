
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
