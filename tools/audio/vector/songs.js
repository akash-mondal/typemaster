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
