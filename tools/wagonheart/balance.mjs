// Headless balance runs for WAGONHEART.
//   node tools/wagonheart/balance.mjs [runs]
// A bot types at a set speed and accuracy, answers events with a success rate
// that follows its skill, hunts when food runs low, rests when people weaken,
// restocks at forts and ferries deep rivers. Reports how far each profile gets.
import S from '../../games/wagonheart-sim.js';
import T from '../../games/wagonheart-text.js';

const RUNS = +(process.argv[2] || 60);
const MAX_MINUTES = 150;

const PROFILES = [
  { name: '25wpm careful', wpm: 25, acc: 0.9, smart: 0.8 },
  { name: '45wpm solid', wpm: 45, acc: 0.95, smart: 0.85 },
  { name: '70wpm expert', wpm: 70, acc: 0.97, smart: 0.92 },
  { name: '90wpm reckless', wpm: 90, acc: 0.9, smart: 0.5 },
];

function outfit(R) {
  const plan = { oxen: 6, food: 700, clothing: 6, shot: 200, wheel: 1, axle: 1, tongue: 1, medicine: 5, water: 2 };
  if (R.inv.money < 500) Object.assign(plan, { oxen: 4, food: 500, clothing: 4, shot: 100, wheel: 1, axle: 1, tongue: 0, medicine: 3, water: 2 });
  for (const [k, q] of Object.entries(plan)) S.buy(R, k, q);
}
function restock(R, P) {
  const alive = S.living(R).length;
  const want = { food: alive * 2.5 * 25, medicine: 4, clothing: alive, shot: 120, wheel: 1, axle: 1, water: 4 };
  if (S.healthyOxen(R).length < 4) S.buy(R, 'oxen', 2);
  for (const [k, q] of Object.entries(want)) { const need = q - R.inv[k]; if (need > 0) S.buy(R, k, Math.ceil(need * P.smart)); }
  if (R.inv.goods) S.sell(R, 'goods', R.inv.goods);
}

function run(P, seed) {
  const R = S.createRun({ trade: ['merchant', 'wheelwright', 'farmer'][seed % 3], seed });
  outfit(R);
  S.setPace(R, P.wpm);
  const lettersPerSec = P.wpm * 5 / 60;
  let seconds = 0, lineLetters = 0, lineErr = 0, ills = 0, minH = 100, events = 0, rests = 0, lastCheck = -1, coastMin = null;
  const rnd = S.mulberry32(seed * 7 + 1);
  const skill = () => rnd() < P.acc * P.smart + 0.05;
  while (!R.over && seconds < MAX_MINUTES * 60) {
    // travel one letter
    if (!S.canMove(R)) {
      if (R.inv.money >= S.price(R, 'oxen')) S.buy(R, 'oxen', 2);
      else { R.onFoot = true; }
    }
    const ok = rnd() < P.acc;
    S.travelLetter(R, ok);
    seconds += 1 / lettersPerSec;
    lineLetters++; if (!ok) lineErr++;
    if (lineLetters >= 24) { S.finishLine(R, lineErr === 0); lineLetters = 0; lineErr = 0; }
    // camp decisions a sensible player makes
    const alive = S.living(R);
    if (alive.length && R.inv.food < alive.length * 2.5 * 6) {
      const shots = Math.min(R.inv.shot, 40);
      if (shots > 10) { const meat = Math.round((20 + rnd() * 160) * R.tune.game * (0.5 + P.acc / 2)); S.huntOutcome(R, Math.round(shots * (0.6 + rnd() * 0.4)), meat); seconds += 55; }
      else if (R.rations !== 'bare') R.rations = R.inv.food <= 0 ? 'bare' : 'meagre';
    } else if (R.inv.food > alive.length * 2.5 * 15) R.rations = 'filling';
    for (const p of alive) minH = Math.min(minH, p.health);
    // a person notices the party only now and then, and not always in time
    if (R.day !== lastCheck) { lastCheck = R.day; if (rnd() < 0.18 * P.smart && alive.some(p => p.health < 40) && R.inv.food > alive.length * 3 * 3) { S.restDays(R, 2); seconds += 6; rests++; } }
    // events
    while (R.pending.length) {
      const e = R.pending.shift();
      seconds += 6; if (e.type !== 'arrive') events++;
      switch (e.type) {
        case 'crossing': if (coastMin == null) coastMin = seconds / 60; break;
        case 'arrive': {
          const L = e.leg;
          if (L.kind === 'fort') { if (R.inv.money < 150) { S.letterWork(R, P.acc, 3); seconds += 60; } restock(R, P); seconds += 25; }
          if (L.kind === 'river') {
            const r = L.river;
            const method = r.depth > 3.5 && R.inv.money >= r.ferry ? 'ferry' : r.depth > 2.6 ? 'caulk' : 'ford';
            const res = S.riverOutcome(R, r, method, skill() ? 0.8 + rnd() * 0.2 : 0.3 + rnd() * 0.3);
            if (res.lost.swept) { const p = R.party.find(q => q.name === res.lost.swept); if (!skill() && p) S.kill(R, p, 'drowned'); }
            seconds += 20;
          }
          if (L.kind === 'stone' && rnd() < P.acc) S.wakeStone(R);
          S.departLandmark(R);
          break;
        }
        case 'illness': ills++; S.illnessOutcome(R, e.who, e.kind, skill()); break;
        case 'breakdown': S.breakdownOutcome(R, e.part, R.inv[e.part] > 0 ? 'spare' : 'jury', skill()); break;
        case 'oxlost': if (!skill()) { const o = S.healthyOxen(R)[0]; if (o) o.health = 0; } break;
        case 'mud': if (!skill()) S.restDays(R, 1, true); break;
        case 'stampede': if (!skill()) { const p = S.living(R)[0]; if (p) p.health = Math.max(1, p.health - 20); } break;
        case 'lost': if (!skill()) S.restDays(R, 2, true); break;
        case 'wolves': case 'thieves': if (!skill()) { R.inv.food = Math.floor(R.inv.food * 0.8); R.inv.shot = Math.max(0, R.inv.shot - 10); } break;
        case 'stranger': { const [, deal] = T.STRANGER_OFFERS[e.offer]; if (S.canAfford(R, deal.give) && rnd() < 0.5) { for (const [k, v] of Object.entries(deal.give)) R.inv[k] -= v; S.applyGains(R, deal.get); } break; }
        case 'berries': S.forageOutcome(R, 4 + Math.floor(rnd() * 6)); break;
        case 'wagon': S.applyGains(R, { wheel: 1, food: 30 }); break;
        case 'spring': S.applyGains(R, { water: 3 }); break;
        case 'musician': S.applyGains(R, { morale: 20 }); break;
        case 'wildfire': if (!skill()) { R.inv.food = Math.floor(R.inv.food * 0.85); R.inv.clothing = Math.max(0, R.inv.clothing - 1); } break;
        case 'recruit': if (R.party.length < 6) R.party.push(S.person(e.name, 'tough')); break;
        case 'death': S.addGrave(R, e.who, 'rest easy'); break;
        case 'stranded': R.onFoot = true; break;
      }
    }
  }
  return {
    minutes: seconds / 60, miles: Math.round(R.miles), crossing: R.crossing, regions: R.stats.regions,
    alive: S.living(R).length, deaths: R.stats.deaths, causes: R.party.filter(p => !p.alive).map(p => p.cause + '@' + (R.graves.find(g => g.name === p.name) || {}).biome), over: R.over ? R.over.why : 'time', score: S.score(R), year: S.year(R),
    reachedCoast1: R.stats.regions >= 7 || R.crossing > 1, coastMin, ills, minH, events, rests, days: R.day,
    coastMinutes: null,
  };
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };
for (const P of PROFILES) {
  const rs = [];
  for (let i = 0; i < RUNS; i++) rs.push(run(P, 1000 + i));
  const miles = rs.map(r => r.miles), mins = rs.map(r => r.minutes), deaths = rs.map(r => r.deaths);
  const cross = rs.filter(r => r.reachedCoast1).length;
  const cm = rs.filter(r => r.coastMin != null).map(r => r.coastMin);
  const causes = {}; for (const r of rs) for (const c of r.causes) causes[c] = (causes[c] || 0) + 1;
  console.log('   ills p50', pct(rs.map(r => r.ills), 0.5), 'events p50', pct(rs.map(r => r.events), 0.5), 'minHealth p50', Math.round(pct(rs.map(r => r.minH), 0.5)), 'rests p50', pct(rs.map(r => r.rests), 0.5), 'days p50', pct(rs.map(r => r.days), 0.5));
  console.log('   causes', JSON.stringify(Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 8)));
  console.log(`${P.name.padEnd(16)} miles p10/p50/p90 ${pct(miles, 0.1)}/${pct(miles, 0.5)}/${pct(miles, 0.9)}  minutes p50 ${pct(mins, 0.5).toFixed(0)}  crossed-1 ${Math.round(100 * cross / RUNS)}% (p50 ${cm.length ? pct(cm, 0.5).toFixed(0) : '-'} min)  deaths p50 ${pct(deaths, 0.5)}  maxCrossing ${Math.max(...rs.map(r => r.crossing))}  endings ${JSON.stringify(rs.reduce((a, r) => (a[r.over] = (a[r.over] || 0) + 1, a), {}))}`);
}
