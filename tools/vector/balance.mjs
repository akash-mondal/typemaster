// Headless balance runs for VECTOR.
//   node tools/vector/balance.mjs [runs] [maxSectors]
// A bot types at a set speed and accuracy. It plans a turn from what it saw a reaction time
// ago, then has to type the steer key like anyone else; between turns it types the word.
// It hunts the nearest rival by riding across its path, grinds walls, fires power cells
// and picks upgrades at random. Reports how far each profile gets.
import V from '../../games/vector-sim.js';

const TRACE = process.argv[2] === 'trace';
const RUNS = TRACE ? 1 : +(process.argv[2] || 40);
const MAXS = +(process.argv[3] || 30);
const DT = 1 / 60;
const DX = V.DX, DY = V.DY;
const left = d => (d + 3) % 4, right = d => (d + 1) % 4;

const PROFILES = [
  { name: '30wpm', wpm: 30, acc: 0.93, react: 0.42, smart: 0.6 },
  { name: '50wpm', wpm: 50, acc: 0.95, react: 0.32, smart: 0.75 },
  { name: '80wpm', wpm: 80, acc: 0.97, react: 0.24, smart: 0.9 },
];

function plan(S, P, prof, rnd) {
  // score straight / left / right the way a player would glance at it
  const AI = V._ai;
  const target = nearestRival(S, P);
  let best = null, bestS = -1e9;
  for (const [side, d] of [[null, P.d], ['L', left(P.d)], ['R', right(P.d)]]) {
    // look from the NEXT centre, where a queued turn would happen
    const probe = { ...P, x: P.x + (P.p > 0 ? DX[P.d] : 0), y: P.y + (P.p > 0 ? DY[P.d] : 0) };
    if (AI.nextCellBlocked(S, probe, d)) continue;
    const nx = probe.x + DX[d], ny = probe.y + DY[d];
    const room = AI.flood(S, nx, ny, P.level, 150, P);
    let s = Math.min(room.size, 150) * 1.0 + (room.size < 40 ? -200 : 0) + (room.exit ? 15 : 0);
    let runway = 0; for (let k = 1; k <= 7; k++) { const qx = probe.x + DX[d] * k, qy = probe.y + DY[d] * k; if (AI.blockedAt(S, qx, qy, P.level, P, true)) break; runway++; }
    s += runway * 4;
    if (target) {
      const tx = target.ring ? target.x : target.x + DX[target.d] * 3, ty = target.ring ? target.y : target.y + DY[target.d] * 3;
      s += ((Math.abs(probe.x - tx) + Math.abs(probe.y - ty)) - (Math.abs(nx - tx) + Math.abs(ny - ty))) * (target.ring ? 40 : 10) * prof.smart;
    }
    // a turn takes a reaction and a keystroke: straight ahead must leave room for that
    const lag = prof.react * P.speed * 1.3 + 2.2;
    if (side === null && runway < lag) s -= (lag - runway) * 25;
    if (side === null) s += 8;
    s += (hashNoise(P, side) - 0.5) * 20 * (1 - prof.smart);
    if (s > bestS) { bestS = s; best = side; }
  }
  return best;
}
// noise that holds still for a cell, so a bot doesn't dither between frames
function hashNoise(P, side) { let h = (P.x * 73856093) ^ (P.y * 19349663) ^ ((side === 'L' ? 1 : side === 'R' ? 2 : 3) * 83492791) ^ (P.d * 2654435761); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function danger(S, P, prof) {
  // a sensible typist eases off the words when a wall is coming up fast
  let runway = 0;
  for (let k = 1; k <= 8; k++) { if (V._ai.blockedAt(S, P.x + DX[P.d] * k, P.y + DY[P.d] * k, P.level, P, true)) break; runway++; }
  return runway < P.speed * (prof.react + 0.3) * prof.smart;
}
function nearestRival(S, P) {
  let best = null, bd = 1e9;
  for (const b of S.bikes) if (b.alive && b.kind !== 'player') { const d = Math.abs(b.x - P.x) + Math.abs(b.y - P.y); if (d < bd) { bd = d; best = b; } }
  if (S.boss && !S.boss.down) {
    // circle the nearest anchor: aim at the next corner of a ring two cells out, going round
    let py = null, bd = 1e9;
    for (const q of S.A.pylons) if (q.alive) { const d = Math.abs(q.x - P.x) + Math.abs(q.y - P.y); if (d < bd) { bd = d; py = q; } }
    if (py) {
      if (bd > 4) return { x: py.x, y: py.y + 2, d: 0 };
      const corners = [[py.x + 2, py.y + 2], [py.x - 2, py.y + 2], [py.x - 2, py.y - 2], [py.x + 2, py.y - 2]];
      let ci = 0, cd = 1e9;
      corners.forEach(([x, y], i) => { const d = Math.abs(x - P.x) + Math.abs(y - P.y); if (d < cd) { cd = d; ci = i; } });
      const [x, y] = corners[(ci + (cd <= 1 ? 1 : 0)) % 4];
      return { x, y, d: 0, ring: true };
    }
  }
  if (!best && S.exitOpen) { const n = S.A.n; return { x: S.A.exit % n, y: Math.floor(S.A.exit / n), d: 0 }; }
  return best;
}

function playSector(run, prof, rnd) {
  const S = V.startSector(run);
  const P = V.player(S);
  const gap = 60 / (prof.wpm * 5);
  let keyT = 0, planT = 0, want = null, wantAt = 0, t = 0, pressed = false;
  while (!S.over && !S.cleared && t < 240) {
    t += DT;
    planT -= DT;
    if (planT <= 0 && P.alive) { planT = 0.12; const w = plan(S, P, prof, rnd); if (TRACE && process.env.PLAN) console.log('   plan', t.toFixed(2), 'P', P.x, P.y, 'p', P.p.toFixed(2), 'd', P.d, 'want', w, 'q', P.queue.join(''), 'hold', P.holding, 'L', S.typing.L, 'R', S.typing.R, 'word', S.typing.word, S.typing.typed); if (w !== want) {
        // commit: once a turn is chosen, only drop it if it has become impossible or pointless
        const valid = want && !V._ai.nextCellBlocked(S, { ...P, x: P.x + (P.p > 0 ? DX[P.d] : 0), y: P.y + (P.p > 0 ? DY[P.d] : 0) }, want === 'L' ? left(P.d) : right(P.d));
        if (!want || !valid || (w === null && !danger(S, P, prof))) { if (!want && w) wantAt = t; want = w; pressed = false; }
      } }
    keyT -= DT;
    const ty0 = S.typing;
    if (want && P.alive && t - wantAt >= prof.react && !pressed) {
      pressed = true;
      const k = want === 'L' ? ty0.L[ty0.lT] : ty0.R[ty0.rT];
      if (rnd() < prof.acc) { const r = V.key(S, k); if (r === 'left' || r === 'right') { want = null; pressed = false; } else pressed = false; }
      else { V.key(S, 'q' === ty0.word[ty0.typed] ? 'z' : 'q'); pressed = false; wantAt = t; }
      keyT = Math.max(keyT, gap * 0.5);
    }
    if (keyT <= 0 && P.alive) {
      keyT = gap * (0.7 + rnd() * 0.6);
      const ty = S.typing;
      if (false) {
        const k = want === 'L' ? ty.L[ty.lT] : ty.R[ty.rT];
        if (rnd() < prof.acc) { const r = V.key(S, k); if (r === 'left' || r === 'right') want = null; }
        else V.key(S, 'q' === ty.word[ty.typed] ? 'z' : 'q');
      } else if (S.countdown <= 0 && !(want && t - wantAt < prof.react) && !danger(S, P, prof)) {
        if (rnd() < prof.acc) V.key(S, ty.word[ty.typed]);
        else { const bad = 'zxqj'.split('').find(c => c !== ty.word[ty.typed] && !ty.L.includes(c) && !ty.R.includes(c)) || 'z'; V.key(S, bad); }
      }
      if (S.carried.length && rnd() < 0.02) V.fire(S);
    }
    V.step(S, DT);
    for (const e of V.takeEvents(S)) {
      if (e.type === 'derez' && e.bike === 0) {
        const nx = P.x + DX[P.d], ny = P.y + DY[P.d], n = S.A.n;
        const rim = nx <= 0 || ny <= 0 || nx >= n - 1 || ny >= n - 1;
        const o = rim ? -9 : S.wallOwner[P.level][ny * n + nx];
        const what = rim ? 'rim' : o === 0 ? 'own' : o > 0 ? 'rival' : o === -2 ? 'boss' : e.cause;
        CAUSES[what] = (CAUSES[what] || 0) + 1;
      }
      if (e.type === 'anchor_break') ANCH.n++;
      if (e.type === 'seal') ANCH.seals++;
      if (e.type === 'derez' && e.bike !== 0) ANCH['rk_' + e.cause] = (ANCH['rk_' + e.cause] || 0) + 1;
      if (TRACE && ['derez', 'hold', 'rez', 'seal', 'exit_open', 'sector_clear', 'turn', 'typo'].includes(e.type) && (e.bike === undefined || e.bike === 0 || e.type === 'derez')) console.log(t.toFixed(2), e.type, e.kind || '', e.cause || e.side || '', 'P', P.x, P.y, 'd', P.d, 'v', P.speed.toFixed(1), e.by !== undefined ? 'by ' + e.by : '');
    }
  }
  return { S, t, timeout: t >= 240 && !S.cleared && !S.over };
}

let CAUSES = {}, PER = {}, ANCH = { n: 0, seals: 0 };
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };
for (const prof of (TRACE ? [PROFILES[+(process.argv[4] || 1)]] : PROFILES)) {
  const reached = [], mins = [], timeouts = [], firstBoss = [];
  CAUSES = {}; PER = {}; ANCH = { n: 0, seals: 0 };
  let deathsBy = {};
  for (let r = 0; r < RUNS; r++) {
    const run = V.createRun({ seed: TRACE ? +process.argv[3] : 5000 + r });
    const rnd = V.mulberry32(r * 97 + 3);
    let to = 0;
    while (!run.over && run.sector < MAXS) {
      const coresBefore = run.cores;
      const res = playSector(run, prof, rnd);
      const ps = PER[run.sector] = PER[run.sector] || { n: 0, lost: 0, cleared: 0, time: 0, kills: 0 };
      ps.n++; ps.lost += coresBefore - Math.max(0, run.cores); ps.cleared += res.S.cleared ? 1 : 0; ps.time += res.t;
      if (res.timeout) { to++; run.over = true; }
      if (res.S.cleared) { const ch = V.upgradeChoices(run); if (ch.length) V.takeUpgrade(run, ch[Math.floor(rnd() * ch.length)].key); }
      if (res.S.over || res.timeout) { reached.push(run.sector); mins.push(run.stats.time / 60); }
    }
    if (!run.over) { reached.push(run.sector + 1); mins.push(run.stats.time / 60); }
    timeouts.push(to);
  }
  console.log(`${prof.name.padEnd(6)} sector reached p10/p50/p90 ${pct(reached, .1)}/${pct(reached, .5)}/${pct(reached, .9)}  minutes p50 ${pct(mins, .5).toFixed(1)}  timeouts ${timeouts.reduce((a, b) => a + b, 0)}  deaths ${JSON.stringify(CAUSES)}`);
  console.log('   anchors broken ' + ANCH.n + ', seals ' + ANCH.seals + ', rivals derezzed by ' + JSON.stringify(Object.fromEntries(Object.entries(ANCH).filter(([k]) => k.startsWith('rk_')))));
  console.log('   per sector (cores lost per attempt, clear %, seconds): ' + Object.entries(PER).slice(0, 8).map(([k, v]) => `s${k} ${(v.lost / v.n).toFixed(2)} ${Math.round(100 * v.cleared / v.n)}% ${Math.round(v.time / v.n)}s`).join(' | '));
}
