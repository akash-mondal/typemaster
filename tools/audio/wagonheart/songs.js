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
