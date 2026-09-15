// NOVA's trailer cuts, in sixteenths at 120 bpm (a sixteenth is 0.125 s):
// the shots change at 3.5 s and 6.5 s; the novas go off at 5.75 s and 8.5 s
const INTRO_CUTS = [28, 52];
const INTRO_NOVAS = [46, 68];

// ---------------------------------------------------------------- songs
// layer: the intensity from which the track plays. tag: only while that state is on.
//   0 base groove   1 more drive   2 the melody   3 full battle
//   tag boss: the mothership is up   tag danger: one hull point left
const arp = (chords, per) => chords.map(c => rep(c, per)).join(' ');
const SONGS = {
  // the select screen: exactly 10 s (5 bars at 120), accents on the trailer's cuts
  intro: { bpm: 120, bars: 5, tracks: [
    { inst: 'kick', vol: 0.85, layer: 0, hits: hitsAt(80, [0, 28, 52].concat(INTRO_NOVAS), [8, 16, 24, 32, 40, 44, 56, 60, 64, 72, 76]) },
    { inst: 'crash', vol: 0.5, layer: 0, hits: hitsAt(80, [0, 28, 52, 68]) },
    { inst: 'clap', vol: 0.4, layer: 0, hits: hitsAt(80, [], [4, 12, 20, 36, 44, 60, 76, 78]) },
    { inst: 'hat', vol: 0.25, layer: 0, hits: hitsAt(80, [], Array.from({ length: 40 }, (_, i) => i * 2 + 1)) },
    { inst: 'bass', vol: 0.5, layer: 0, notes: 'A1:2 A1:2 A2:2 A1:2 A1:2 A2:2 G1:2 G2:2 | F1:2 F1:2 F2:2 F1:2 F1:2 F2:2 G1:2 G2:2 | A1:2 A1:2 A2:2 A1:2 C2:2 C3:2 D2:2 D3:2 | F1:2 F1:2 F2:2 F1:2 G1:2 G2:2 G1:2 G2:2 | A1:4 A2:4 A1:8' },
    { inst: 'arp', vol: 0.3, layer: 0, notes: rep('A4:1 C5:1 E5:1 A5:1', 4) + ' ' + rep('F4:1 A4:1 C5:1 F5:1', 4) + ' ' + rep('A4:1 C5:1 E5:1 A5:1', 2) + ' ' + rep('C5:1 E5:1 G5:1 C6:1', 1) + ' ' + rep('D5:1 F5:1 A5:1 D6:1', 1) + ' ' + rep('F4:1 A4:1 C5:1 F5:1', 2) + ' ' + rep('G4:1 B4:1 D5:1 G5:1', 2) + ' ' + rep('A4:1 C5:1 E5:1 A5:1', 4) },
    { inst: 'lead', vol: 0.3, layer: 0, notes: 'r:16 | r:12 E5:4 | A5:8 G5:4 E5:4 | F5:8 G5:8 | A5:16' },
    { inst: 'pad', vol: 0.18, layer: 0, notes: 'A3+C4+E4:16 F3+A3+C4:16 A3+C4+E4:16 F3+A3+C4:8 G3+B3+D4:8 A3+C4+E4:16' },
    { inst: 'bell', vol: 0.2, layer: 0, notes: 'r:46 A6:2 r:20 E7:12' },
  ] },
  // title and menus: slow and wide, 8 bars
  menu: { bpm: 96, bars: 8, tracks: [
    { inst: 'pad', vol: 0.24, layer: 0, notes: 'A3+C4+E4:32 F3+A3+C4:32 C4+E4+G4:32 G3+B3+D4:32' },
    { inst: 'arp', vol: 0.26, layer: 0, notes: arp(['A4:2 E5:2 C5:2 E5:2', 'F4:2 C5:2 A4:2 C5:2', 'C5:2 G5:2 E5:2 G5:2', 'G4:2 D5:2 B4:2 D5:2'], 4) },
    { inst: 'bell', vol: 0.2, layer: 0, notes: 'E6:16 r:16 C6:16 r:16 G6:16 r:16 D6:24 r:8' },
    { inst: 'sub', vol: 0.36, layer: 0, notes: 'A1:32 F1:32 C2:32 G1:32' },
    { inst: 'hat', vol: 0.14, layer: 0, hits: rep('..x...x...x...x.', 8) },
  ] },
  // ---- the four sectors
  drift: { bpm: 118, bars: 4, tracks: [
    { inst: 'kick', vol: 0.8, layer: 0, hits: rep('X...x...X...x...', 4) },
    { inst: 'bass', vol: 0.48, layer: 0, notes: 'A1:2 A1:2 A2:2 A1:2 A1:2 A2:2 A1:2 A2:2 | F1:2 F1:2 F2:2 F1:2 F1:2 F2:2 F1:2 F2:2 | C2:2 C2:2 C3:2 C2:2 C2:2 C3:2 C2:2 C3:2 | G1:2 G1:2 G2:2 G1:2 G1:2 G2:2 G1:2 G2:2' },
    { inst: 'pad', vol: 0.16, layer: 0, notes: 'A3+C4+E4:16 F3+A3+C4:16 C4+E4+G4:16 G3+B3+D4:16' },
    { inst: 'arp', vol: 0.26, layer: 1, notes: arp(['A4:1 C5:1 E5:1 C5:1', 'F4:1 A4:1 C5:1 A4:1', 'C5:1 E5:1 G5:1 E5:1', 'G4:1 B4:1 D5:1 B4:1'], 4) },
    { inst: 'hat', vol: 0.22, layer: 1, hits: rep('..x...x...x...x.', 4) },
    { inst: 'lead', vol: 0.3, layer: 2, notes: 'E5:6 D5:2 C5:4 E5:4 | F5:6 E5:2 C5:8 | G5:6 F5:2 E5:4 G5:4 | D5:12 r:4' },
    { inst: 'clap', vol: 0.34, layer: 2, hits: rep('....X.......X...', 4) },
    { inst: 'brass', vol: 0.26, layer: 3, notes: 'A4+E5:4 r:4 A4+E5:2 A4+E5:6 | F4+C5:4 r:4 F4+C5:2 F4+C5:6 | C5+G5:4 r:4 C5+G5:2 C5+G5:6 | G4+D5:16' },
    { inst: 'ohat', vol: 0.2, layer: 3, hits: rep('x.......x.......', 4) },
    { inst: 'tom', vol: 0.5, layer: 99, tag: 'boss', hits: rep('x..x..x.x..x.xxx', 4) },
    { inst: 'crash', vol: 0.3, layer: 99, tag: 'boss', hits: 'X...............................X...............................' },
    { inst: 'sub', vol: 0.4, layer: 99, tag: 'danger', notes: rep('A1:1 r:2 A1:1 r:12', 4) },
  ] },
  ember: { bpm: 128, bars: 4, tracks: [
    { inst: 'kick', vol: 0.85, layer: 0, hits: rep('X...X...X...X...', 4) },
    { inst: 'bass', vol: 0.5, layer: 0, notes: rep('D2:1 D2:1 r:1 D3:1', 4) + ' ' + rep('Bb1:1 Bb1:1 r:1 Bb2:1', 4) + ' ' + rep('G1:1 G1:1 r:1 G2:1', 4) + ' ' + rep('A1:1 A1:1 r:1 A2:1', 4) },
    { inst: 'hat', vol: 0.2, layer: 0, hits: rep('..x.', 16) },
    { inst: 'arp', vol: 0.28, layer: 1, notes: arp(['D5:1 F5:1 A5:1 D6:1', 'Bb4:1 D5:1 F5:1 Bb5:1', 'G4:1 Bb4:1 D5:1 G5:1', 'A4:1 C#5:1 E5:1 A5:1'], 4) },
    { inst: 'pad', vol: 0.16, layer: 1, notes: 'D4+F4+A4:16 Bb3+D4+F4:16 G3+Bb3+D4:16 A3+C#4+E4:16' },
    { inst: 'lead', vol: 0.32, layer: 2, notes: 'A5:4 F5:2 D5:2 A5:4 Bb5:4 | F5:8 D5:4 F5:4 | G5:4 Bb5:4 A5:2 G5:2 F5:4 | E5:8 C#5:8' },
    { inst: 'clap', vol: 0.36, layer: 2, hits: rep('....X.......X...', 4) },
    { inst: 'brass', vol: 0.28, layer: 3, notes: 'D5+A5:2 r:2 D5+A5:2 r:10 | Bb4+F5:2 r:2 Bb4+F5:2 r:10 | G4+D5:2 r:2 G4+D5:2 r:10 | A4+E5:16' },
    { inst: 'ohat', vol: 0.2, layer: 3, hits: rep('..X.', 16) },
    { inst: 'tom', vol: 0.5, layer: 99, tag: 'boss', hits: rep('x.x.x..xx.x.x.xx', 4) },
    { inst: 'crash', vol: 0.3, layer: 99, tag: 'boss', hits: 'X...............................X...............................' },
    { inst: 'sub', vol: 0.4, layer: 99, tag: 'danger', notes: rep('D2:1 r:2 D2:1 r:12', 4) },
  ] },
  tide: { bpm: 110, bars: 4, tracks: [
    { inst: 'kick', vol: 0.75, layer: 0, hits: rep('X......x..X.....', 4) },
    { inst: 'sub', vol: 0.44, layer: 0, notes: 'E2:6 E2:2 B1:8 | C2:6 C2:2 G1:8 | A1:6 A1:2 E2:8 | B1:6 B1:2 F#2:8' },
    { inst: 'pad', vol: 0.2, layer: 0, notes: 'E3+G3+B3:16 C3+E3+G3:16 A2+C3+E3:16 B2+D#3+F#3:16' },
    { inst: 'bell', vol: 0.22, layer: 1, notes: 'B5:3 G5:3 E5:2 B5:3 G5:3 E5:2 | C6:3 G5:3 E5:2 C6:3 G5:3 E5:2 | A5:3 E5:3 C5:2 A5:3 E5:3 C5:2 | B5:3 F#5:3 D#5:2 B5:3 F#5:3 D#5:2' },
    { inst: 'hat', vol: 0.2, layer: 1, hits: rep('x.x.x.x.x.x.x.x.', 4) },
    { inst: 'lead', vol: 0.28, layer: 2, notes: 'G5:8 F#5:4 E5:4 | E5:8 D5:4 C5:4 | C5:8 B4:4 C5:4 | D#5:16' },
    { inst: 'snare', vol: 0.3, layer: 2, hits: rep('....X.......X...', 4) },
    { inst: 'arp', vol: 0.24, layer: 3, notes: arp(['E5:1 G5:1 B5:1 E6:1', 'C5:1 E5:1 G5:1 C6:1', 'A4:1 C5:1 E5:1 A5:1', 'B4:1 D#5:1 F#5:1 B5:1'], 4) },
    { inst: 'bass', vol: 0.34, layer: 3, notes: rep('E2:2 E3:2', 4) + ' ' + rep('C2:2 C3:2', 4) + ' ' + rep('A1:2 A2:2', 4) + ' ' + rep('B1:2 B2:2', 4) },
    { inst: 'tom', vol: 0.5, layer: 99, tag: 'boss', hits: rep('x...x.x.x...xxx.', 4) },
    { inst: 'crash', vol: 0.3, layer: 99, tag: 'boss', hits: 'X...............................X...............................' },
    { inst: 'sub', vol: 0.4, layer: 99, tag: 'danger', notes: rep('E2:1 r:2 E2:1 r:12', 4) },
  ] },
  storm: { bpm: 138, bars: 4, tracks: [
    { inst: 'kick', vol: 0.9, layer: 0, hits: rep('X..xX...X..xX...', 4) },
    { inst: 'bass', vol: 0.5, layer: 0, notes: rep('C2:1 C2:1 C3:1 C2:1', 4) + ' ' + rep('Ab1:1 Ab1:1 Ab2:1 Ab1:1', 4) + ' ' + rep('Eb2:1 Eb2:1 Eb3:1 Eb2:1', 4) + ' ' + rep('G1:1 G1:1 G2:1 G1:1', 4) },
    { inst: 'hat', vol: 0.22, layer: 0, hits: rep('x.x.', 16) },
    { inst: 'snare', vol: 0.36, layer: 1, hits: rep('....X.......X..x', 4) },
    { inst: 'arp', vol: 0.28, layer: 1, notes: arp(['C5:1 Eb5:1 G5:1 C6:1', 'Ab4:1 C5:1 Eb5:1 Ab5:1', 'Eb5:1 G5:1 Bb5:1 Eb6:1', 'G4:1 B4:1 D5:1 G5:1'], 4) },
    { inst: 'lead', vol: 0.32, layer: 2, notes: 'G5:4 Eb5:4 C5:4 G5:4 | Ab5:6 G5:2 Eb5:8 | Bb5:4 G5:4 Eb5:4 Bb5:4 | B5:8 D6:8' },
    { inst: 'pad', vol: 0.16, layer: 2, notes: 'C4+Eb4+G4:16 Ab3+C4+Eb4:16 Eb4+G4+Bb4:16 G3+B3+D4:16' },
    { inst: 'brass', vol: 0.3, layer: 3, notes: 'C5+G5:3 C5+G5:3 C5+G5:2 r:8 | Ab4+Eb5:3 Ab4+Eb5:3 Ab4+Eb5:2 r:8 | Eb5+Bb5:3 Eb5+Bb5:3 Eb5+Bb5:2 r:8 | G4+D5:16' },
    { inst: 'crash', vol: 0.26, layer: 3, hits: 'X...............X...............X...............X...............' },
    { inst: 'tom', vol: 0.55, layer: 99, tag: 'boss', hits: rep('xx.xx.x.xx.xxxxx', 4) },
    { inst: 'sub', vol: 0.4, layer: 99, tag: 'danger', notes: rep('C2:1 r:2 C2:1 r:12', 4) },
  ] },
  // the debrief
  results: { bpm: 84, bars: 4, tracks: [
    { inst: 'pad', vol: 0.24, layer: 0, notes: 'A3+C4+E4:16 F3+A3+C4:16 D3+F3+A3:16 E3+G#3+B3:16' },
    { inst: 'bell', vol: 0.22, layer: 0, notes: 'E6:8 C6:8 | A5:8 C6:8 | D6:8 F6:8 | E6:16' },
    { inst: 'sub', vol: 0.34, layer: 0, notes: 'A1:16 F1:16 D2:16 E2:16' },
    { inst: 'arp', vol: 0.18, layer: 0, notes: arp(['A4:2 C5:2 E5:2 C5:2', 'F4:2 A4:2 C5:2 A4:2', 'D4:2 F4:2 A4:2 F4:2', 'E4:2 G#4:2 B4:2 G#4:2'], 2) },
  ] },
};

// short cues, played over the music
const STINGS = {
  wave: { bpm: 150, tracks: [
    { inst: 'arp', vol: 0.45, notes: 'A5:1 C6:1 E6:1 A6:3' },
    { inst: 'kick', vol: 0.6, hits: 'X.....' },
  ] },
  clear: { bpm: 150, tracks: [
    { inst: 'bell', vol: 0.45, notes: 'E6:2 A6:2 C7:4' },
    { inst: 'crash', vol: 0.3, hits: 'X' },
  ] },
  perfect: { bpm: 160, tracks: [
    { inst: 'bell', vol: 0.45, notes: 'A5:1 C6:1 E6:1 A6:1 C7:1 E7:5' },
    { inst: 'arp', vol: 0.35, notes: 'A5:1 E6:1 A6:1 E6:1 A6:1 E7:5' },
    { inst: 'crash', vol: 0.35, hits: '....X' },
  ] },
  warning: { bpm: 140, tracks: [
    { inst: 'brass', vol: 0.5, notes: 'C4+F#4:4 r:2 C4+F#4:4 r:2 C4+F#4:4 r:2 C4+F#4:8' },
    { inst: 'tom', vol: 0.7, hits: 'X.....X.....X.....X' },
  ] },
  sector: { bpm: 130, tracks: [
    { inst: 'crash', vol: 0.5, hits: 'X' },
    { inst: 'brass', vol: 0.45, notes: 'A4+E5:4 C5+G5:4 E5+B5:8' },
    { inst: 'kick', vol: 0.8, hits: 'X...X...X' },
  ] },
  gameover: { bpm: 96, tracks: [
    { inst: 'lead', vol: 0.4, notes: 'E5:2 C5:2 A4:2 F4:10' },
    { inst: 'sub', vol: 0.5, notes: 'r:6 A1:10' },
    { inst: 'crash', vol: 0.3, hits: '......X' },
  ] },
  best: { bpm: 140, tracks: [
    { inst: 'bell', vol: 0.45, notes: 'A5:2 E6:2 A6:2 C7:6' },
    { inst: 'arp', vol: 0.35, notes: 'A5:1 C6:1 E6:1 A6:1 C7:1 E7:1 A7:6' },
  ] },
};
