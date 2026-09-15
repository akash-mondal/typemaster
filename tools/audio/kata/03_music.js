
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
