/*
 * vector-sim.js - VECTOR's rules, headless and deterministic.
 *
 * The game file draws and plays sound; everything that decides who lives lives here, so a
 * bot can play thousands of sectors without a screen (tools/vector/balance.mjs).
 *
 * Units: cells and seconds. Directions: 0 +x, 1 +y, 2 -x, 3 -y. Levels: 0 floor, 1 deck.
 * A bike travels from one cell centre to the next; p in [0,1) is how far along it is.
 * It lays its wall into a cell as it leaves it (p crosses 0.5). A wall cell lives while its
 * stamp is ahead of its owner's tail, so every trail is a fixed-length snake.
 *
 * Driving the sim:
 *   const run = createRun({ seed }); const S = startSector(run);
 *   key(S, 'f')          a typed letter: steers, feeds the word, or is a typo
 *   brake(S, true)       Backspace held
 *   fire(S)              Enter: the carried power cell
 *   step(S, dt)          advance; read and clear S.events
 */

import WORDS from './nova-words.js';

// ---------------------------------------------------------------- rng and helpers
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const left = d => (d + 3) % 4, right = d => (d + 1) % 4, back = d => (d + 2) % 4;
const pickR = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

// ---------------------------------------------------------------- tuning
export const T = {
  cruise: 3.2, wordPulse: 1.6, pulseDecay: 1.2, streakStep: 0.25, streakMax: 3, grindMax: 2.5, grindRate: 0.9,
  capStart: 5.2, capPerSector: 0.35, capMax: 10, brakeFactor: 0.55, brakeReserve: 1.5, brakeRefill: 4,
  buffer: 0.35, bufferRefill: 0.25, rivalBuffer: 0.16,
  trailBase: 6, trailPerStreak: 2, trailMax: 40, typoCut: 4, sputter: 0.3,
  energyWord: 4, energyFlawless: 8, energyGrind: 12, energySeal: 30,
  sealLimit: 60, sealEvery: 0.25,
  cellEvery: [12, 18], cellsMax: 2,
  pulseRadius: 3, lanceRange: 12, spikeTime: 4, phaseTime: 3, surgeTime: 3, surgeBoost: 3,
  respawnShield: 2, cores: 3,
  deadWallFade: 0.6,
};
export const POWERS = ['shield', 'lance', 'spike', 'phase', 'surge', 'reset'];
export const ABILITY_WORDS = ['pulse', 'derez', 'phase', 'surge', 'vector', 'cipher', 'kernel', 'overdrive'];
const THEME = ['grid', 'pulse', 'vector', 'cipher', 'kernel', 'signal', 'binary', 'circuit', 'neon', 'volt', 'lumen', 'photon', 'sector', 'daemon',
  'packet', 'buffer', 'matrix', 'render', 'raster', 'pixel', 'syntax', 'socket', 'proxy', 'router', 'codec', 'glyph', 'orbit', 'quasar', 'prism',
  'laser', 'drive', 'cycle', 'spark', 'trace', 'lattice', 'voltage', 'current', 'rezzed', 'program', 'compile', 'execute', 'overflow', 'firewall'];

export const RIVALS = {
  drone: { colour: 'drone', speed: 0.85, trail: 0.6, look: 3, from: 1 },
  hunter: { colour: 'hunter', speed: 1.0, trail: 1.0, look: 6, from: 2 },
  sealer: { colour: 'sealer', speed: 1.0, trail: 1.1, look: 6, from: 4 },
  mirror: { colour: 'mirror', speed: 1.0, trail: 1.0, look: 5, from: 6 },
  glitch: { colour: 'glitch', speed: 1.05, trail: 0.9, look: 5, from: 8 },
  warden: { colour: 'warden', speed: 0.8, trail: 2.0, look: 6, from: 10 },
};

export const UPGRADES = [
  { key: 'buffer', name: 'buffer', text: '+0.1 s near-miss grace', max: 3 },
  { key: 'longwall', name: 'long wall', text: '+4 cells of base wall', max: 3 },
  { key: 'clean', name: 'clean code', text: 'first typo each sector is free', max: 1 },
  { key: 'pocket', name: 'pocket', text: 'carry two power cells', max: 1 },
  { key: 'magnet', name: 'magnet', text: 'collect cells from two away', max: 1 },
  { key: 'afterburn', name: 'afterburn', text: 'word pulses last longer', max: 3 },
  { key: 'hardened', name: 'hardened', text: '+1 core', max: 1 },
  { key: 'overclock', name: 'overclock', text: '+1 top speed, +10% score', max: 3 },
  { key: 'sealant', name: 'sealant', text: 'seal bigger regions', max: 2 },
  { key: 'echo', name: 'echo', text: 'every third word refills brake', max: 1 },
  { key: 'grinder', name: 'grinder', text: 'grinding charges faster', max: 3 },
  { key: 'coolant', name: 'coolant', text: 'buffer refills faster', max: 2 },
  { key: 'splice', name: 'splice', text: 'typos cut two cells, not four', max: 1 },
  { key: 'battery', name: 'battery', text: 'start sectors with half energy', max: 1 },
  { key: 'lens', name: 'lens', text: 'lance flies further', max: 2 },
  { key: 'aegis', name: 'aegis', text: 'rez with a longer shield', max: 2 },
  { key: 'streaker', name: 'streaker', text: 'streak builds speed faster', max: 2 },
  { key: 'scavenger', name: 'scavenger', text: 'power cells appear more often', max: 2 },
  { key: 'anchor', name: 'anchor', text: 'brake lasts longer', max: 2 },
  { key: 'gold', name: 'gold', text: 'ability words need less energy', max: 2 },
];

// ---------------------------------------------------------------- a run
export function createRun(opts) {
  opts = opts || {};
  const seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
  return {
    seed, rnd: mulberry32(seed), sector: 0, score: 0, cores: T.cores, up: {}, over: false,
    stats: { words: 0, typos: 0, letters: 0, derez: 0, seals: 0, grind: 0, sectors: 0, bosses: 0, best: 0, time: 0 },
  };
}
const upN = (run, k) => run.up[k] || 0;
export function upgradeChoices(run) {
  const open = UPGRADES.filter(u => upN(run, u.key) < u.max);
  const out = [];
  while (out.length < 3 && open.length) out.push(open.splice(Math.floor(run.rnd() * open.length), 1)[0]);
  return out;
}
export function takeUpgrade(run, key) {
  run.up[key] = upN(run, key) + 1;
  if (key === 'hardened') run.cores++;
}

// ---------------------------------------------------------------- arenas
function arenaSize(sector) { return Math.min(30, 18 + 2 * Math.floor((sector - 1) / 2) * 1); }

export function buildArena(run, sector) {
  const rnd = run.rnd;
  const boss = sector % 5 === 0;
  const n = boss ? 24 : arenaSize(sector);
  const A = {
    n, boss, cells: n * n,
    solid: new Uint8Array(n * n),        // pylons and gate bars (level 0)
    mod: new Float32Array(n * n).fill(1), // speed strips
    deck: new Uint8Array(n * n),         // a level-1 platform above this cell
    ramp: new Int8Array(n * n).fill(-1), // uphill direction of a ramp in this cell
    portal: new Int32Array(n * n).fill(-1),
    fault: [], gates: [], pylons: [], spawns: [], exit: -1,
  };
  const at = (x, y) => y * n + x;
  const mirror = (x, y) => [n - 1 - x, n - 1 - y];
  const free = (x, y) => x > 1 && y > 1 && x < n - 2 && y < n - 2 && !A.solid[at(x, y)] && A.ramp[at(x, y)] < 0 && A.portal[at(x, y)] < 0;
  const cx = n >> 1;

  if (!boss && sector >= 3) {   // speed and slow strips, mirrored
    const k = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < k; i++) {
      const horiz = rnd() < 0.5, len = 4 + Math.floor(rnd() * 5), fast = rnd() < 0.65;
      const x0 = 3 + Math.floor(rnd() * (n - 6 - (horiz ? len : 0))), y0 = 3 + Math.floor(rnd() * (n - 6 - (horiz ? 0 : len)));
      for (let j = 0; j < len; j++) {
        const x = x0 + (horiz ? j : 0), y = y0 + (horiz ? 0 : j);
        A.mod[at(x, y)] = fast ? 1.5 : 0.6;
        const [mx, my] = mirror(x, y); A.mod[at(mx, my)] = fast ? 1.5 : 0.6;
      }
    }
  }
  if (!boss && sector >= 6) {   // decks with a ramp, mirrored
    const k = sector >= 11 ? 2 : 1;
    for (let i = 0; i < k; i++) {
      const w = 3 + Math.floor(rnd() * 3), h = 3 + Math.floor(rnd() * 2);
      const x0 = 3 + Math.floor(rnd() * (cx - w - 3)), y0 = 3 + Math.floor(rnd() * (n - h - 6));
      for (const [ox, oy, flip] of [[x0, y0, false], [n - x0 - w, n - y0 - h, true]]) {
        for (let y = oy; y < oy + h; y++) for (let x = ox; x < ox + w; x++) A.deck[at(x, y)] = 1;
        // the ramp climbs into the deck from the middle of one long side
        const rx = ox + (w >> 1), ry = flip ? oy - 1 : oy + h;
        if (ry > 1 && ry < n - 2) { A.ramp[at(rx, ry)] = flip ? 1 : 3; }
      }
    }
  }
  if (!boss && sector >= 8) {   // portal pairs
    const k = sector >= 13 ? 2 : 1;
    for (let i = 0; i < k; i++) {
      let tries = 0, x, y;
      do { x = 3 + Math.floor(rnd() * (n - 6)); y = 3 + Math.floor(rnd() * (n - 6)); tries++; } while ((!free(x, y) || A.deck[at(x, y)] || Math.abs(x - cx) < 3) && tries < 50);
      const [mx, my] = mirror(x, y);
      if (tries < 50 && free(mx, my) && !A.deck[at(mx, my)]) { A.portal[at(x, y)] = at(mx, my); A.portal[at(mx, my)] = at(x, y); }
    }
  }
  if (!boss && sector >= 10) {  // fault tiles in small clusters
    const k = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < k; i++) {
      const x0 = 4 + Math.floor(rnd() * (n - 8)), y0 = 4 + Math.floor(rnd() * (n - 8));
      for (const [x, y] of [[x0, y0], [x0 + 1, y0], [x0, y0 + 1], [x0 + 1, y0 + 1]]) {
        for (const [fx, fy] of [[x, y], mirror(x, y)]) if (free(fx, fy) && !A.deck[at(fx, fy)]) A.fault.push({ i: at(fx, fy), state: 'idle', t: 2 + rnd() * 8 });
      }
    }
  }
  if (!boss && sector >= 12) {  // a gate: two lanes of three cells that take turns being barred
    const y = cx, xs = [cx - 4, cx + 2];
    const laneA = [], laneB = [];
    for (let j = 0; j < 3; j++) { laneA.push(at(xs[0] + j, y)); laneB.push(at(xs[1] + j, y)); }
    A.gates.push({ a: laneA, b: laneB, open: 'a', t: 3 });
    for (const i of laneB) A.solid[i] = 1;
  }
  if (boss) {
    const spots = [[cx, 5], [5, n - 6], [n - 6, n - 6]];
    for (const [x, y] of spots) { A.solid[at(x, y)] = 1; A.pylons.push({ i: at(x, y), x, y, alive: true }); }
  }
  // spawns: the player at the bottom middle heading up the screen; rivals around the rim
  A.spawns = [
    { x: cx, y: n - 4, d: 3 }, { x: cx - 1, y: 3, d: 1 }, { x: 3, y: cx, d: 0 }, { x: n - 4, y: cx + 1, d: 2 },
    { x: 4, y: 4, d: 0 }, { x: n - 5, y: n - 5, d: 2 }, { x: n - 5, y: 4, d: 1 }, { x: 4, y: n - 5, d: 3 },
  ];
  for (const s of A.spawns) { const i = at(s.x, s.y); A.solid[i] = 0; A.deck[i] = 0; A.ramp[i] = -1; A.portal[i] = -1; A.mod[i] = 1; }
  return A;
}

// ---------------------------------------------------------------- sector
function rivalLineup(sector, rnd) {
  if (sector % 5 === 0) return [];
  const count = Math.min(6, sector === 1 ? 1 : 1 + Math.floor(sector / 2));
  const kinds = Object.keys(RIVALS).filter(k => RIVALS[k].from <= sector);
  const out = [];
  // the newest kind always appears in the sector that introduces it
  const fresh = kinds.find(k => RIVALS[k].from === sector);
  if (fresh) { out.push(fresh); if (fresh === 'sealer') out.push('sealer'); }
  while (out.length < count) {
    let k = pickR(rnd, kinds);
    if (k === 'sealer') { if (out.length + 2 > count) k = 'hunter'; else out.push('sealer'); }
    if (k === 'warden' && out.filter(q => q === 'warden').length >= 1) k = 'hunter';
    out.push(k);
  }
  return out.slice(0, count);
}

// near-miss grace: generous while learning, down to the base by sector 10
function playerBuffer(S) { return Math.max(T.buffer, 0.55 - 0.02 * (S.sector - 1)) + 0.1 * upN(S.run, 'buffer'); }
function makeBike(S, id, kind, spawn) {
  const R = kind === 'player' ? null : RIVALS[kind];
  return {
    id, kind, x: spawn.x, y: spawn.y, d: spawn.d, p: 0, level: 0,
    alive: true, deadAt: 0, dist: 0, tail: 0, speed: T.cruise, grind: 0, grindSide: 0,
    buffer: kind === 'player' ? playerBuffer(S) : T.rivalBuffer, holding: false,
    queue: [], shield: kind === 'player' ? 0 : 0, phase: 0, spike: 0, surge: 0, laid: false,
    trailMul: R ? R.trail : 1, speedMul: R ? R.speed : 1, look: R ? R.look : 0,
    armour: kind === 'warden' ? 1 : 0, sealed: false, sealedBy: false, nextThink: 0, teleportT: 5,
    mirrorLog: [], partner: null, role: 0, glitched: 0, rezT: 0.6, stun: 0, lean: 0, leanT: 0, burst: 0, lastWall: -1, lastWallLevel: 0,
  };
}

export function startSector(run) {
  run.sector++;
  const sector = run.sector;
  const A = buildArena(run, sector);
  const n = A.n;
  const S = {
    run, sector, A, t: 0, events: [], over: false, cleared: false, exitOpen: false, clearT: 0,
    wallOwner: [new Int16Array(n * n).fill(-1), new Int16Array(n * n).fill(-1)],
    wallStamp: [new Float32Array(n * n), new Float32Array(n * n)],
    wallExpire: [new Float32Array(n * n), new Float32Array(n * n)], // for owner -2 (boss pillars)
    bikes: [], cells: [], cellT: 6, sealT: 0,
    typing: null, energy: upN(run, 'battery') ? 50 : 0, brakeLeft: T.brakeReserve + 0.5 * upN(run, 'anchor'), braking: false,
    pulseV: 0, sputter: 0, streak: 0, trail: T.trailBase, carried: [], freeTypo: upN(run, 'clean') > 0,
    boss: null, countdown: 3.2, wordsThisSector: 0, startScore: run.score,
  };
  S.bikes.push(makeBike(S, 0, 'player', A.spawns[0]));
  const lineup = rivalLineup(sector, run.rnd);
  lineup.forEach((k, i) => S.bikes.push(makeBike(S, i + 1, k, A.spawns[1 + (i % (A.spawns.length - 1))])));
  const sealers = S.bikes.filter(b => b.kind === 'sealer');
  for (let i = 0; i + 1 < sealers.length; i += 2) { sealers[i].partner = sealers[i + 1]; sealers[i + 1].partner = sealers[i]; sealers[i + 1].role = 1; }
  if (A.boss) S.boss = makeBoss(S);
  S.typing = makeTyping(S);
  S.events.push({ type: 'sector', sector, boss: A.boss });
  return S;
}
export const player = S => S.bikes[0];

// ---------------------------------------------------------------- walls
const idx = (S, x, y) => y * S.A.n + x;
const inside = (S, x, y) => x >= 0 && y >= 0 && x < S.A.n && y < S.A.n;
export function wallAlive(S, level, i) {
  const o = S.wallOwner[level][i];
  if (o === -1) return false;
  if (o === -2) return S.t < S.wallExpire[level][i];
  const b = S.bikes[o];
  if (!b) return false;
  if (!b.alive) return S.t - b.deadAt < T.deadWallFade * (0.3 + 0.7 * clamp((S.wallStamp[level][i] - b.tail) / Math.max(1, b.dist - b.tail), 0, 1));
  return S.wallStamp[level][i] >= b.tail;
}
function trailLength(S, b) {
  // no wall outgrows its arena: past about a third of the floor a trail stops being a weapon and becomes a cage
  const roomCap = Math.round(S.A.n * 1.4);
  if (b.kind === 'player') return Math.min(T.trailMax, roomCap, S.trail) + 4 * upN(S.run, 'longwall');
  return Math.min(roomCap, (7 + S.sector * 1.1) * b.trailMul);
}
function layWall(S, b, x, y, level) {
  if (!inside(S, x, y)) return;
  const i = idx(S, x, y);
  if (S.A.portal[i] >= 0) return;
  S.wallOwner[level][i] = b.id; S.wallStamp[level][i] = b.dist;
  b.lastWall = i; b.lastWallLevel = level;
  if (b.spike > 0) {   // spike: short side walls one cell out
    for (const side of [left(b.d), right(b.d)]) {
      const sx = x + DX[side], sy = y + DY[side];
      if (inside(S, sx, sy) && !blockedAt(S, sx, sy, level, b)) { const j = idx(S, sx, sy); S.wallOwner[level][j] = b.id; S.wallStamp[level][j] = b.dist; }
    }
  }
}

// what occupies a cell for a bike on `level` arriving from direction d
function levelInto(S, x, y, fromLevel, d) {
  const i = idx(S, x, y);
  const r = S.A.ramp[i];
  if (r >= 0) {
    if (fromLevel === 0 && d === r) return { level: 1, ok: true };      // climbing
    if (fromLevel === 1 && d === back(r)) return { level: 0, ok: true }; // descending
    return { level: fromLevel, ok: false };                              // the side of a ramp
  }
  if (fromLevel === 1) return { level: S.A.deck[i] ? 1 : 0, ok: true };  // off an open edge you drop
  return { level: 0, ok: true };
}
function blockedAt(S, x, y, level, b, ignoreBikes) {
  if (!inside(S, x, y) || x === 0 || y === 0 || x === S.A.n - 1 || y === S.A.n - 1) {
    const i = inside(S, x, y) ? idx(S, x, y) : -1;
    return !(S.exitOpen && i === S.A.exit && b && b.kind === 'player');
  }
  const i = idx(S, x, y);
  if (level === 0 && S.A.solid[i]) return true;
  if (level === 0 && S.faultGone && S.faultGone[i]) return true;
  if (wallAlive(S, level, i)) {
    if (b && b.burst > 0) return false;
    if (b && b.phase > 0 && S.wallOwner[level][i] === b.id) return false;
    return true;
  }
  return false;
}
function nextCellBlocked(S, b, d) {
  const x = b.x + DX[d], y = b.y + DY[d];
  if (!inside(S, x, y)) return true;
  const L = levelInto(S, x, y, b.level, d);
  if (!L.ok) return true;
  return blockedAt(S, x, y, L.level, b);
}

// ---------------------------------------------------------------- typing
function wordPool(S) {
  const s = S.sector;
  const lo = Math.min(6, 3 + Math.floor(s / 4)), hi = Math.min(9, 5 + Math.floor(s / 3));
  return { lo, hi };
}
function steerPool(S) {
  if (S.sector <= 3) return 'asdfghjkl';
  if (S.sector <= 7) return 'asdfghjklqwertyuiop';
  return 'abcdefghijklmnopqrstuvwxyz';
}
function makeTyping(S) {
  const T0 = { word: '', typed: 0, flawless: true, ability: false, L: '', R: '', lT: 0, rT: 0 };
  S.typing = T0;
  rollSteer(S);
  newWord(S);
  return T0;
}
function newWord(S) {
  const ty = S.typing, rnd = S.run.rnd;
  const banned = new Set((ty.L + ty.R).split(''));
  const ok = w => w && ![...w].some(c => banned.has(c));
  const needGold = S.energy >= 100 - 20 * upN(S.run, 'gold');
  let w = null;
  if (needGold) { const opts = ABILITY_WORDS.filter(ok); if (opts.length) { w = pickR(rnd, opts); ty.ability = true; } }
  if (!w) {
    ty.ability = false;
    const { lo, hi } = wordPool(S);
    for (let k = 0; k < 60 && !ok(w); k++) {
      if (rnd() < 0.3) { const th = THEME.filter(q => q.length >= lo && q.length <= hi); w = pickR(rnd, th.length ? th : THEME); }
      else { const len = lo + Math.floor(rnd() * (hi - lo + 1)); w = pickR(rnd, WORDS[len] || WORDS[5]); }
    }
    if (!ok(w)) w = 'grid';
  }
  ty.word = w; ty.typed = 0; ty.flawless = true;
}
function rollSteer(S) {
  const ty = S.typing, rnd = S.run.rnd;
  const pool = [...steerPool(S)].filter(c => !ty.word.includes(c));
  const two = S.sector >= 12 && rnd() < clamp((S.sector - 11) * 0.08, 0, 0.5);
  const take = () => pool.splice(Math.floor(rnd() * pool.length), 1)[0] || 'x';
  ty.L = two ? take() + take() : take();
  ty.R = two ? take() + take() : take();
  ty.lT = 0; ty.rT = 0;
}

// a typed letter. Returns 'left' | 'right' | 'letter' | 'word' | 'typo' | 'ignored'
export function key(S, ch) {
  const P = player(S);
  if (!P.alive || S.over || S.cleared) return 'ignored';
  ch = String(ch).toLowerCase();
  if (!/^[a-z]$/.test(ch)) return 'ignored';
  const ty = S.typing;
  S.run.stats.letters++;
  // steering first: the letters never overlap the word
  if (ch === ty.L[ty.lT]) { ty.lT++; ty.rT = 0; if (ty.lT >= ty.L.length) { queueTurn(S, P, 'L'); rollSteer(S); return 'left'; } return 'letter'; }
  if (ch === ty.R[ty.rT]) { ty.rT++; ty.lT = 0; if (ty.rT >= ty.R.length) { queueTurn(S, P, 'R'); rollSteer(S); return 'right'; } return 'letter'; }
  if (S.countdown > 0) return 'ignored';
  if (ch === ty.word[ty.typed]) {
    ty.typed++;
    if (ty.typed >= ty.word.length) { finishWord(S); return 'word'; }
    return 'letter';
  }
  typo(S);
  return 'typo';
}
function finishWord(S) {
  const ty = S.typing, run = S.run;
  run.stats.words++; S.wordsThisSector++;
  S.streak++;
  S.trail = Math.min(T.trailMax, S.trail + T.trailPerStreak);
  run.stats.best = Math.max(run.stats.best, S.streak);
  S.pulseV = T.wordPulse * (1 + 0.25 * upN(run, 'afterburn'));
  S.energy = clamp(S.energy + (ty.flawless ? T.energyFlawless : T.energyWord), 0, 100);
  if (upN(run, 'echo') && S.wordsThisSector % 3 === 0) S.brakeLeft = T.brakeReserve + 0.5 * upN(run, 'anchor');
  score(S, 10);
  S.events.push({ type: 'word', word: ty.word, streak: S.streak, flawless: ty.flawless, ability: ty.ability });
  if (S.streak % 10 === 0) S.events.push({ type: 'streak', streak: S.streak });
  if (ty.ability && ty.flawless) { S.energy = 0; pulse(S, player(S)); }
  newWord(S);
}
function typo(S) {
  const ty = S.typing, run = S.run, P = player(S);
  run.stats.typos++;
  ty.flawless = false; ty.lT = 0; ty.rT = 0;
  if (S.freeTypo) { S.freeTypo = false; S.events.push({ type: 'typo', free: true }); return; }
  const cut = upN(run, 'splice') ? 2 : T.typoCut;
  const had = S.streak;
  S.streak = 0;
  S.trail = Math.max(2, S.trail - cut);
  P.tail = Math.max(P.tail, P.dist - trailLength(S, P));
  S.sputter = T.sputter;
  S.events.push({ type: 'typo', cut, lostStreak: had });
}
function queueTurn(S, b, side) {
  if (b.queue.length >= 2) b.queue.shift();
  b.queue.push(side);
  // just past a centre: turn now, as if the key had come a moment earlier
  if (b.p < 0.2 && !b.laid && b.queue.length === 1) { b.p = 0; applyTurn(S, b); }
}
function applyTurn(S, b) {
  const side = b.queue.shift();
  if (!side) return false;
  b.d = side === 'L' ? left(b.d) : right(b.d);
  b.lean = side === 'L' ? -1 : 1; b.leanT = 0.28;
  S.events.push({ type: 'turn', bike: b.id, side });
  if (b.kind === 'player') for (const m of S.bikes) if (m.kind === 'mirror' && m.alive) m.mirrorLog.push({ t: S.t + 1, side });
  return true;
}
export function brake(S, on) { S.braking = !!on; }
export function fire(S) {
  const P = player(S);
  const c = S.carried.shift();
  if (!c || !P.alive) return false;
  usePower(S, P, c);
  return true;
}

// ---------------------------------------------------------------- powers
function usePower(S, b, kind) {
  S.events.push({ type: 'power', kind, bike: b.id });
  if (kind === 'shield') b.shield = 1e9;
  else if (kind === 'phase') b.phase = T.phaseTime;
  else if (kind === 'spike') b.spike = T.spikeTime;
  else if (kind === 'surge') { for (const o of S.bikes) o.surge = T.surgeTime + (o === b ? 0 : 0); S.events.push({ type: 'surge' }); }
  else if (kind === 'reset') { S.wallOwner[0].fill(-1); S.wallOwner[1].fill(-1); for (const o of S.bikes) o.tail = o.dist; }
  else if (kind === 'lance') {
    const range = T.lanceRange + 4 * upN(S.run, 'lens');
    let x = b.x, y = b.y;
    const hits = [];
    for (let k = 0; k < range; k++) {
      x += DX[b.d]; y += DY[b.d];
      if (!inside(S, x, y) || x === 0 || y === 0 || x === S.A.n - 1 || y === S.A.n - 1) break;
      const i = idx(S, x, y);
      S.wallOwner[b.level][i] = -1;
      for (const o of S.bikes) if (o !== b && o.alive && o.x === x && o.y === y && o.level === b.level) hits.push(o);
    }
    S.events.push({ type: 'lance', x0: b.x, y0: b.y, x1: x, y1: y, d: b.d });
    for (const o of hits) derez(S, o, 'lance', b);
  }
}
function pulse(S, b) {
  S.events.push({ type: 'pulse', x: b.x, y: b.y });
  const r = T.pulseRadius;
  for (let lv = 0; lv < 2; lv++)
    for (let y = b.y - r; y <= b.y + r; y++) for (let x = b.x - r; x <= b.x + r; x++)
      if (inside(S, x, y) && Math.abs(x - b.x) + Math.abs(y - b.y) <= r + 1) S.wallOwner[lv][idx(S, x, y)] = -1;
  for (const o of S.bikes) {
    if (o === b || !o.alive) continue;
    if (Math.abs(o.x - b.x) + Math.abs(o.y - b.y) <= r + 2) { o.queue = [S.run.rnd() < 0.5 ? 'L' : 'R']; o.stun = 0.6; }
  }
}

// ---------------------------------------------------------------- score
function score(S, pts) {
  const mult = (1 + S.streak / 10) * (1 + 0.1 * upN(S.run, 'overclock'));
  S.run.score += Math.round(pts * mult);
}

// ---------------------------------------------------------------- death
export function derez(S, b, cause, by) {
  if (!b.alive) return;
  if (b.shield > 0 && cause === 'wall') return;
  b.alive = false; b.deadAt = S.t;
  S.events.push({ type: 'derez', bike: b.id, kind: b.kind, x: b.x, y: b.y, d: b.d, p: b.p, level: b.level, cause, by: by ? by.id : -1 });
  if (b.kind === 'player') {
    S.run.cores--;
    S.streak = 0;
    if (S.run.cores <= 0) { S.over = true; S.run.over = true; S.events.push({ type: 'gameover' }); }
    else S.respawnT = 1.6;
  } else {
    S.run.stats.derez++;
    score(S, 100 * S.sector);
  }
}
function respawn(S) {
  const P = player(S);
  // the spawn with the most room
  let best = null, bestRoom = -1;
  for (const s of S.A.spawns) {
    if (blockedAt(S, s.x, s.y, 0, P)) continue;
    const room = flood(S, s.x, s.y, 0, 120, P).size;
    if (room > bestRoom) { bestRoom = room; best = s; }
  }
  best = best || S.A.spawns[0];
  Object.assign(P, { x: best.x, y: best.y, d: best.d, p: 0, level: 0, alive: true, holding: false, queue: [], laid: false, rezT: 0.6, lastWall: -1 });
  P.tail = P.dist;
  P.shield = T.respawnShield * (1 + 0.5 * upN(S.run, 'aegis'));
  P.shieldTimed = true;
  S.events.push({ type: 'rez', bike: 0, x: P.x, y: P.y });
}

// ---------------------------------------------------------------- flood fill
function flood(S, sx, sy, level, cap, b) {
  const n = S.A.n;
  const seen = new Set(), stack = [[sx, sy]];
  let exit = false, playerWall = false;
  while (stack.length && seen.size < cap) {
    const [x, y] = stack.pop();
    const i = y * n + x;
    if (seen.has(i)) continue;
    seen.add(i);
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inside(S, nx, ny)) continue;
      const j = ny * n + nx;
      if (seen.has(j)) continue;
      if (level === 1 && !S.A.deck[j] && S.A.ramp[j] < 0) { exit = true; continue; }
      if (S.A.ramp[j] >= 0 || S.A.portal[j] >= 0) { exit = true; continue; }
      if (blockedAt(S, nx, ny, level, b, true)) {
        if (wallAlive(S, level, j) && S.wallOwner[level][j] === 0) playerWall = true;
        continue;
      }
      stack.push([nx, ny]);
    }
  }
  return { size: seen.size, exit, playerWall, capped: seen.size >= cap };
}

// ---------------------------------------------------------------- AI
function think(S, b) {
  const P = player(S);
  const rnd = S.run.rnd;
  const opts = [b.d, left(b.d), right(b.d)];
  const skill = clamp(0.55 + S.sector * 0.03, 0.55, 0.95);
  let best = b.d, bestScore = -1e9;
  const target = aiTarget(S, b, P);
  for (const d of opts) {
    if (nextCellBlocked(S, b, d)) continue;
    const nx = b.x + DX[d], ny = b.y + DY[d];
    const L = levelInto(S, nx, ny, b.level, d);
    const room = flood(S, nx, ny, L.level, 30 + b.look * 12, b);
    let s = room.size + (room.exit ? 20 : 0);
    // look straight ahead a few cells: prefer long runways
    let run = 0; for (let k = 1; k <= b.look; k++) { const qx = b.x + DX[d] * k, qy = b.y + DY[d] * k; if (!inside(S, qx, qy) || blockedAt(S, qx, qy, L.level, b, true)) break; run++; }
    s += run * 3;
    if (target) {
      const dist0 = Math.abs(b.x - target.x) + Math.abs(b.y - target.y);
      const dist1 = Math.abs(nx - target.x) + Math.abs(ny - target.y);
      s += (dist0 - dist1) * 14 * skill;
    }
    if (d === b.d) s += 6;  // riders prefer to hold a line
    s += (rnd() - 0.5) * (30 * (1 - skill));
    if (s > bestScore) { bestScore = s; best = d; }
  }
  if (best !== b.d) b.queue = [best === left(b.d) ? 'L' : 'R'];
  else if (b.kind === 'drone' && S.t > b.nextThink) {
    b.nextThink = S.t + 2 + rnd() * 2;
    const side = rnd() < 0.5 ? 'L' : 'R';
    const d = side === 'L' ? left(b.d) : right(b.d);
    if (!nextCellBlocked(S, b, d) && flood(S, b.x + DX[d], b.y + DY[d], b.level, 40, b).size >= 30) b.queue = [side];
  }
}
function aiTarget(S, b, P) {
  if (!P.alive) return null;
  const lead = Math.round(P.speed * 1.0);
  const px = P.x + DX[P.d] * lead, py = P.y + DY[P.d] * lead;
  switch (b.kind) {
    case 'hunter': case 'glitch': return { x: px + DX[P.d] * 2, y: py + DY[P.d] * 2 };
    case 'sealer': {
      const side = b.role ? left(P.d) : right(P.d);
      const ahead = b.role ? 5 : 1;
      return { x: P.x + DX[P.d] * ahead + DX[side] * 2, y: P.y + DY[P.d] * ahead + DY[side] * 2 };
    }
    case 'warden': return { x: px, y: py };
    case 'drone': return null;
    case 'mirror': return null;
  }
  return null;
}

// ---------------------------------------------------------------- boss
function makeBoss(S) {
  const n = S.A.n;
  return { x: n / 2, y: n / 2, hp: S.A.pylons.length, t: 3, phase: 0, attacks: [], angry: 0, down: false, tier: S.sector / 5 };
}
function bossStep(S, dt) {
  const B = S.boss, P = player(S), rnd = S.run.rnd, n = S.A.n;
  if (B.down) return;
  // hover toward a point between the player and the centre
  const tx = P.alive ? (P.x + n / 2) / 2 : n / 2, ty = P.alive ? (P.y + n / 2) / 2 : n / 2;
  B.x += (tx - B.x) * Math.min(1, dt * 0.6); B.y += (ty - B.y) * Math.min(1, dt * 0.6);
  B.t -= dt * (1 + 0.3 * B.angry) * (0.75 + 0.25 * Math.min(3, B.tier));
  if (B.t <= 0 && P.alive) {
    B.t = 4.2 - 0.45 * B.angry;
    const roll = rnd();
    const warn = Math.max(0.5, 1.05 - 0.1 * B.angry - 0.08 * (B.tier - 1));
    if (roll < 0.45) {
      const horiz = rnd() < 0.5;
      const line = horiz ? P.y + DY[P.d] : P.x + DX[P.d];
      B.attacks.push({ kind: 'sweep', horiz, line: clamp(line, 1, n - 2), warn, live: 0.5, t: 0 });
      S.events.push({ type: 'boss_sweep_warn' });
    } else if (roll < 0.85) {
      const k = 4 + Math.floor(rnd() * 3) + B.angry;
      const cells = [];
      for (let j = 0; j < k; j++) {
        const x = clamp(P.x + DX[P.d] * (2 + Math.floor(rnd() * 5)) + Math.floor(rnd() * 5) - 2, 1, n - 2);
        const y = clamp(P.y + DY[P.d] * (2 + Math.floor(rnd() * 5)) + Math.floor(rnd() * 5) - 2, 1, n - 2);
        cells.push(idx(S, x, y));
      }
      B.attacks.push({ kind: 'drop', cells, warn: warn + 0.2, t: 0 });
      S.events.push({ type: 'boss_drop_warn' });
    } else if (S.bikes.filter(q => q.alive && q.kind === 'drone').length < 3) {
      for (const s of [S.A.spawns[4], S.A.spawns[5]]) {
        const b = makeBike(S, S.bikes.length, 'drone', s);
        if (!blockedAt(S, s.x, s.y, 0, b)) S.bikes.push(b);
      }
      S.events.push({ type: 'boss_brood' });
    }
  }
  for (const a of B.attacks) {
    a.t += dt;
    if (a.kind === 'sweep' && a.t >= a.warn && !a.fired) { a.fired = true; S.events.push({ type: 'boss_sweep', horiz: a.horiz, line: a.line }); }
    if (a.kind === 'sweep' && a.fired && a.t < a.warn + a.live) {
      for (const b of S.bikes) if (b.alive && b.level === 0 && (a.horiz ? b.y === a.line : b.x === a.line)) derez(S, b, 'sweep');
    }
    if (a.kind === 'drop' && a.t >= a.warn && !a.fired) {
      a.fired = true;
      for (const i of a.cells) {
        for (const b of S.bikes) if (b.alive && b.level === 0 && idx(S, b.x, b.y) === i) derez(S, b, 'drop');
        S.wallOwner[0][i] = -2; S.wallExpire[0][i] = S.t + 5;
      }
      S.events.push({ type: 'boss_drop', cells: a.cells });
    }
  }
  B.attacks = B.attacks.filter(a => a.t < (a.kind === 'sweep' ? a.warn + a.live + 0.1 : a.warn + 0.1));
}
function checkAnchors(S) {
  for (const py of S.A.pylons) {
    if (!py.alive) continue;
    // a pylon breaks when the region around it is closed off, with the player's wall in the boundary
    const n = S.A.n;
    // closed off: every open neighbour's region is small and walled, and the player's wall is part of it.
    // A tight ring leaves no open neighbour at all, which counts too.
    let open = 0, closed = true, playerWall = false;
    for (let d = 0; d < 4; d++) {
      const x = py.x + DX[d], y = py.y + DY[d];
      if (blockedAt(S, x, y, 0, null, true)) { const j = idx(S, x, y); if (inside(S, x, y) && wallAlive(S, 0, j) && S.wallOwner[0][j] === 0) playerWall = true; continue; }
      open++;
      const r = flood(S, x, y, 0, T.sealLimit + 20 * upN(S.run, 'sealant') + 1, null);
      if (r.capped || r.exit) closed = false;
      if (r.playerWall) playerWall = true;
    }
    const broken = closed && playerWall;
    if (broken) {
      py.alive = false; S.A.solid[py.i] = 0;
      S.boss.hp--; S.boss.angry++;
      score(S, 800 * S.sector / 5);
      S.events.push({ type: 'anchor_break', x: py.x, y: py.y, left: S.boss.hp });
      if (S.boss.hp <= 0) {
        S.boss.down = true;
        S.run.stats.bosses++;
        score(S, 5000 * S.boss.tier);
        S.events.push({ type: 'boss_down', x: S.boss.x, y: S.boss.y });
        for (const b of S.bikes) if (b.kind !== 'player' && b.alive) derez(S, b, 'boss');
      }
    }
  }
}

// ---------------------------------------------------------------- seals
function checkSeals(S) {
  const limit = T.sealLimit + 20 * upN(S.run, 'sealant');
  const P = player(S);
  for (const b of S.bikes) {
    if (!b.alive || b.kind === 'player' || b.sealed) continue;
    const r = flood(S, b.x, b.y, b.level, limit + 1, b);
    if (r.capped || r.exit) continue;
    if (b.burst > 0) continue;
    if (b.armour > 0) {   // a warden's first seal only cracks its armour
      if (!b.sealArmed) { b.sealArmed = true; b.armour = 0; b.burst = 1.2; S.events.push({ type: 'armour', bike: b.id }); }
      continue;
    }
    b.sealed = true; b.sealedAt = S.t;
    if (r.playerWall) {
      S.run.stats.seals++;
      score(S, 250 * S.sector);
      S.energy = clamp(S.energy + T.energySeal, 0, 100);
      S.events.push({ type: 'seal', bike: b.id, size: r.size, x: b.x, y: b.y });
    }
  }
  // is the player sealed in? (warning only)
  if (P.alive) {
    const r = flood(S, P.x, P.y, P.level, 50, P);
    const was = S.playerSealed;
    S.playerSealed = !r.capped && !r.exit;
    if (S.playerSealed && !was) S.events.push({ type: 'trapped', size: r.size });
  }
}

// ---------------------------------------------------------------- power cells
function spawnCell(S) {
  const rnd = S.run.rnd, n = S.A.n;
  for (let k = 0; k < 40; k++) {
    const x = 2 + Math.floor(rnd() * (n - 4)), y = 2 + Math.floor(rnd() * (n - 4));
    const i = idx(S, x, y);
    if (S.A.solid[i] || S.A.ramp[i] >= 0 || S.A.portal[i] >= 0 || S.A.deck[i] || wallAlive(S, 0, i)) continue;
    if (S.bikes.some(b => b.alive && Math.abs(b.x - x) + Math.abs(b.y - y) < 3)) continue;
    const kind = pickR(rnd, S.A.boss ? ['shield', 'lance', 'phase', 'reset'] : POWERS);
    S.cells.push({ x, y, kind, t: 0 });
    S.events.push({ type: 'cell_spawn', x, y, kind });
    return;
  }
}

// ---------------------------------------------------------------- hazards
function hazardStep(S, dt) {
  const A = S.A;
  if (A.fault.length) {
    S.faultGone = S.faultGone || new Uint8Array(A.cells);
    for (const f of A.fault) {
      f.t -= dt;
      if (f.t > 0) continue;
      if (f.state === 'idle') { f.state = 'warn'; f.t = 1; S.events.push({ type: 'fault_warn', i: f.i }); }
      else if (f.state === 'warn') {
        f.state = 'gone'; f.t = 6; S.faultGone[f.i] = 1; S.wallOwner[0][f.i] = -1;
        S.events.push({ type: 'fault_fall', i: f.i });
        for (const b of S.bikes) if (b.alive && b.level === 0 && idx(S, b.x, b.y) === f.i) derez(S, b, 'fall');
      } else { f.state = 'idle'; f.t = 4 + S.run.rnd() * 6; S.faultGone[f.i] = 0; }
    }
  }
  for (const g of A.gates) {
    g.t -= dt;
    if (g.t <= 0) {
      g.t = 3;
      const closing = g.open === 'a' ? g.a : g.b, opening = g.open === 'a' ? g.b : g.a;
      for (const i of opening) A.solid[i] = 0;
      for (const i of closing) { A.solid[i] = 1; for (const b of S.bikes) if (b.alive && b.level === 0 && idx(S, b.x, b.y) === i) derez(S, b, 'gate'); }
      g.open = g.open === 'a' ? 'b' : 'a';
      S.events.push({ type: 'gate_move' });
    }
  }
}

// ---------------------------------------------------------------- a bike's move
function bikeSpeed(S, b, dt) {
  const i = idx(S, b.x, b.y);
  let v;
  if (b.kind === 'player') {
    S.pulseV = Math.max(0, S.pulseV - dt * T.wordPulse / (T.pulseDecay * (1 + 0.25 * upN(S.run, 'afterburn'))));
    const streakV = Math.min(T.streakMax, S.streak * T.streakStep * (1 + 0.25 * upN(S.run, 'streaker')));
    v = T.cruise + S.pulseV + streakV + b.grind;
    const cap = Math.min(T.capMax, T.capStart + (S.sector - 1) * T.capPerSector) + upN(S.run, 'overclock');
    v = Math.min(v, cap);
    if (S.sputter > 0) { S.sputter -= dt; v = Math.min(v, T.cruise * 0.8); }
    if (S.braking && S.brakeLeft > 0) { v *= T.brakeFactor; S.brakeLeft -= dt; S.events.push({ type: 'braking' }); }
    else S.brakeLeft = Math.min(T.brakeReserve + 0.5 * upN(S.run, 'anchor'), S.brakeLeft + dt * T.brakeReserve / T.brakeRefill);
  } else {
    v = (T.cruise * 0.9 + 0.12 * S.sector + b.grind) * b.speedMul;
    v = Math.min(v, T.capStart + (S.sector - 1) * T.capPerSector * 0.8);
  }
  if (b.level === 0) v *= S.A.mod[i];
  if (b.surge > 0) v += T.surgeBoost;
  return v;
}

function bikeStep(S, b, dt) {
  if (!b.alive) return;
  if (b.rezT > 0) { b.rezT -= dt; return; }
  if (b.sealed && b.alive && S.t - b.sealedAt > 2.5) { derez(S, b, 'seal'); return; }
  for (const k of ['phase', 'spike', 'surge', 'burst']) if (b[k] > 0) b[k] = Math.max(0, b[k] - dt);
  if (b.shieldTimed && b.shield > 0) { b.shield -= dt; if (b.shield <= 0) { b.shield = 0; b.shieldTimed = false; } }
  if (b.leanT > 0) b.leanT -= dt;
  if (b.stun > 0) b.stun -= dt;
  // mirror: replay the player's turns a second late
  if (b.kind === 'mirror') while (b.mirrorLog.length && b.mirrorLog[0].t <= S.t) { const m = b.mirrorLog.shift(); if (!b.queue.length) b.queue.push(m.side); }
  // glitch: jump ahead through anything every few seconds
  if (b.kind === 'glitch') {
    b.teleportT -= dt;
    if (b.teleportT <= 0 && b.p < 0.3) {
      b.teleportT = 5;
      const tx = b.x + DX[b.d] * 4, ty = b.y + DY[b.d] * 4;
      if (inside(S, tx, ty) && !blockedAt(S, tx, ty, b.level, b)) {
        S.events.push({ type: 'glitch', bike: b.id, x0: b.x, y0: b.y, x1: tx, y1: ty });
        layWall(S, b, b.x, b.y, b.level);
        b.x = tx; b.y = ty; b.p = 0;
      }
    }
  }

  // grinding: a live wall in a neighbouring cell, parallel to travel
  let sides = 0, grindSide = 0;
  for (const side of [left(b.d), right(b.d)]) {
    const gx = b.x + DX[side], gy = b.y + DY[side];
    if (!inside(S, gx, gy)) continue;
    const j = idx(S, gx, gy);
    const rim = gx === 0 || gy === 0 || gx === S.A.n - 1 || gy === S.A.n - 1;
    if (wallAlive(S, b.level, j) || (rim && b.level === 0)) { sides += rim ? 0.5 : 1; grindSide = side === left(b.d) ? -1 : 1; }
  }
  const rate = T.grindRate * (1 + 0.3 * upN(S.run, 'grinder'));
  if (sides > 0) {
    b.grind = Math.min(T.grindMax * (sides >= 2 ? 1.4 : 1), b.grind + dt * rate * sides * (sides >= 2 ? 2 : 1));
    if (b.kind === 'player') { S.energy = clamp(S.energy + dt * T.energyGrind * sides * (1 + 0.3 * upN(S.run, 'grinder')), 0, 100); S.run.stats.grind += dt * b.speed; S.grindScore = (S.grindScore || 0) + dt * b.speed; while (S.grindScore >= 1) { S.grindScore--; score(S, 2); } }
  } else b.grind = Math.max(0, b.grind - dt * 1.2);
  b.grindSide = sides > 0 ? grindSide : 0;

  b.speed = bikeSpeed(S, b, dt);
  if (b.holding) {
    // waiting at a centre with the way ahead shut: burn buffer, look for a turn
    if (b.queue.length) applyTurn(S, b);
    if (!nextCellBlocked(S, b, b.d)) { b.holding = false; S.events.push({ type: 'unhold', bike: b.id }); }
    else {
      b.buffer -= dt;
      if (b.kind !== 'player' && b.stun <= 0) think(S, b);
      if (b.buffer <= 0) { derez(S, b, 'wall'); return; }
      return;
    }
  } else {
    const cap = b.kind === 'player' ? playerBuffer(S) : T.rivalBuffer;
    b.buffer = Math.min(cap, b.buffer + dt * T.bufferRefill * (1 + 0.5 * upN(S.run, 'coolant')));
  }

  let move = b.speed * dt;
  while (move > 0 && b.alive) {
    const toHalf = b.p < 0.5 ? 0.5 - b.p : Infinity;
    const toEnd = 1 - b.p;
    if (!b.laid && toHalf <= move) {
      // crossing into the next cell: lay the wall behind, then enter
      b.p = 0.5; move -= toHalf; b.dist += toHalf;
      const nx = b.x + DX[b.d], ny = b.y + DY[b.d];
      const L = inside(S, nx, ny) ? levelInto(S, nx, ny, b.level, b.d) : { ok: false, level: b.level };
      const wallHit = !L.ok || blockedAt(S, nx, ny, L.level, b, true);
      const other = !wallHit && S.bikes.find(o => o !== b && o.alive && o.level === L.level && o.x === nx && o.y === ny);
      if (other) {
        // a bike in the way: head-on is fatal for both; otherwise wait at the edge on the buffer
        if (other.d === back(b.d)) { derez(S, other, 'bike', b); derez(S, b, 'bike', other); return; }
        b.p = 0.5 - 1e-4; b.dist -= 1e-4;
        b.buffer -= move / Math.max(0.5, b.speed);
        if (b.buffer <= 0) { derez(S, b, 'bike', other); return; }
        move = 0;
        break;
      }
      if (wallHit) {
        if (b.shield > 0 && L.ok && inside(S, nx, ny) && wallAlive(S, L.level, idx(S, nx, ny))) {
          S.wallOwner[L.level][idx(S, nx, ny)] = -1;
          if (!b.shieldTimed) b.shield = 0;
          S.events.push({ type: 'shield_break', bike: b.id, x: nx, y: ny });
        } else {
          derez(S, b, 'wall');
          return;
        }
      }
      layWall(S, b, b.x, b.y, b.level);
      b.laid = true;
      b.x = nx; b.y = ny; b.fromLevel = b.level; b.level = L.level;
      if (b.level !== b.fromLevel) S.events.push({ type: b.level > b.fromLevel ? 'climb' : 'drop', bike: b.id });
      continue;
    }
    if (toEnd <= move) {
      // arrive at the cell centre
      move -= toEnd; b.dist += toEnd; b.p = 0; b.laid = false;
      b.tail = Math.max(b.tail, b.dist - trailLength(S, b));
      arrive(S, b);
      if (!b.alive) return;
      if (b.kind !== 'player' && b.stun <= 0) think(S, b);
      if (b.queue.length) applyTurn(S, b);
      if (nextCellBlocked(S, b, b.d)) {
        b.holding = true;
        S.events.push({ type: 'hold', bike: b.id });
        return;
      }
      continue;
    }
    b.p += move; b.dist += move; move = 0;
  }
  b.tail = Math.max(b.tail, b.dist - trailLength(S, b));
}

function arrive(S, b) {
  const i = idx(S, b.x, b.y);
  // portals keep heading
  const to = S.A.portal[i];
  if (to >= 0 && b.level === 0 && !b.justPorted) {
    b.x = to % S.A.n; b.y = Math.floor(to / S.A.n); b.justPorted = true;
    S.events.push({ type: 'portal', bike: b.id, from: i, to });
    return;
  }
  b.justPorted = false;
  if (b.kind === 'player') {
    const mag = upN(S.run, 'magnet') ? 2 : 0;
    for (let k = S.cells.length - 1; k >= 0; k--) {
      const c = S.cells[k];
      if (Math.abs(c.x - b.x) + Math.abs(c.y - b.y) <= mag && b.level === 0) {
        S.cells.splice(k, 1);
        const room = upN(S.run, 'pocket') ? 2 : 1;
        if (S.carried.length >= room) S.carried.shift();
        S.carried.push(c.kind);
        S.events.push({ type: 'pickup', kind: c.kind, x: c.x, y: c.y });
      }
    }
    if (S.exitOpen && i === S.A.exit) {
      S.cleared = true;
      S.run.stats.sectors++;
      if (S.run.cores < T.cores + upN(S.run, 'hardened')) { S.run.cores++; S.events.push({ type: 'core_restored' }); }
      const bonus = Math.max(0, Math.round(1000 * S.sector * clamp(1 - (S.clearT - 30) / 120, 0, 1)));
      score(S, bonus);
      S.events.push({ type: 'sector_clear', bonus });
    }
  }
}

// ---------------------------------------------------------------- the frame
export function step(S, dt) {
  if (S.over || S.cleared) return;
  dt = Math.min(dt, 0.05);
  S.run.stats.time += dt;
  if (S.countdown > 0) {
    const was = Math.ceil(S.countdown);
    S.countdown -= dt;
    if (Math.ceil(S.countdown) !== was && S.countdown > 0) S.events.push({ type: 'count', n: Math.ceil(S.countdown) });
    if (S.countdown <= 0) S.events.push({ type: 'go' });
    return;
  }
  S.t += dt; S.clearT += dt;
  hazardStep(S, dt);
  if (S.boss) bossStep(S, dt);
  // bikes move in small sub-steps so fast bikes never skip a cell's checks
  const sub = Math.max(1, Math.ceil(Math.max(...S.bikes.map(b => b.alive ? b.speed : 0)) * dt / 0.4));
  for (let k = 0; k < sub; k++) for (const b of S.bikes) bikeStep(S, b, dt / sub);
  if (!player(S).alive && !S.over && S.respawnT != null) { S.respawnT -= dt; if (S.respawnT <= 0) { S.respawnT = null; respawn(S); } }

  S.cellT -= dt;
  if (S.cellT <= 0) {
    S.cellT = (T.cellEvery[0] + S.run.rnd() * (T.cellEvery[1] - T.cellEvery[0])) / (1 + 0.3 * upN(S.run, 'scavenger'));
    if (S.cells.length < T.cellsMax) spawnCell(S);
  }
  S.sealT -= dt;
  if (S.sealT <= 0) { S.sealT = T.sealEvery; checkSeals(S); if (S.boss) checkAnchors(S); }

  // the sector is won when no rival rides and (in a boss sector) the overseer is down
  const rivalsLeft = S.bikes.some(b => b.alive && b.kind !== 'player');
  if (!S.exitOpen && !rivalsLeft && (!S.boss || S.boss.down) && player(S).alive) openExit(S);
  if (S.exitOpen && !S.cleared) {
    const P = player(S);
    P.shield = Math.max(P.shield, 0.5); P.shieldTimed = true;
    S.exitT = (S.exitT || 0) + dt;
    if (S.exitT >= 2.2) {
      S.cleared = true;
      S.run.stats.sectors++;
      if (S.run.cores < T.cores + upN(S.run, 'hardened')) { S.run.cores++; S.events.push({ type: 'core_restored' }); }
      const bonus = Math.max(0, Math.round(1000 * S.sector * clamp(1 - (S.clearT - 30) / 120, 0, 1)));
      score(S, bonus);
      S.events.push({ type: 'sector_clear', bonus });
    }
  }
}
function openExit(S) {
  const P = player(S), n = S.A.n;
  // the rim cell nearest ahead of the player
  const cands = [];
  for (let k = 2; k < n - 2; k++) cands.push([k, 0], [k, n - 1], [0, k], [n - 1, k]);
  let best = cands[0], bd = 1e9;
  for (const [x, y] of cands) { const dd = Math.abs(x - P.x) + Math.abs(y - P.y); if (dd < bd) { bd = dd; best = [x, y]; } }
  S.A.exit = idx(S, best[0], best[1]);
  S.exitOpen = true;
  S.events.push({ type: 'exit_open', x: best[0], y: best[1] });
}

export function takeEvents(S) { const e = S.events; S.events = []; return e; }

export default {
  T, POWERS, RIVALS, UPGRADES, ABILITY_WORDS, mulberry32, createRun, startSector, buildArena, player, key, brake, fire, step, takeEvents,
  wallAlive, upgradeChoices, takeUpgrade, derez, DX, DY,
  // for tooling (bots and the harness)
  _ai: { nextCellBlocked, flood, levelInto, blockedAt, think },
};
