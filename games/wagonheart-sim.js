/*
 * wagonheart-sim.js - the journey, without pictures.
 *
 * Everything that is true about a run lives here: the land, the calendar, the
 * wagon, the people, the supplies and what happens to them. The game draws it
 * and feeds it keystrokes; a test bot can drive it with no screen at all.
 *
 *   const R = createRun({ trade: 'farmer', names: [...], seed })
 *   travelLetter(R, ok)       one typed letter while rolling (ok = correct key)
 *   finishLine(R, flawless)   a ribbon line completed
 *   pace(R, wpm)              the rolling typing speed sets the pace
 *   restDays(R, n), hunt results, crossings, repairs ... apply their effects
 *   R.pending                 events for the game to present (shift() them)
 */

import T from './wagonheart-text.js';

export const BIOME_ORDER = ['meadow', 'river', 'barrens', 'highwood', 'pass', 'saltmere', 'coast'];
const LUSH = new Set(['meadow', 'river', 'highwood', 'coast']);
const DRY = new Set(['barrens', 'saltmere']);
export const WORDS_PER_DAY = 20;               // a travel day: ~30 s at 40 wpm
export const TRANSITION_MILES = 30;
export const CAP_CROSSING = 6;

export const PACES = [
  { key: 'easy',   name: 'EASY',   upTo: 25,  miles: 0.8,  health: 0.6, oxen: 0.6, wear: 0.7 },
  { key: 'steady', name: 'STEADY', upTo: 45,  miles: 1.0,  health: 1.0, oxen: 1.0, wear: 1.0 },
  { key: 'hard',   name: 'HARD',   upTo: 70,  miles: 1.2,  health: 1.5, oxen: 1.5, wear: 1.25 },
  { key: 'driven', name: 'DRIVEN', upTo: 1e9, miles: 1.35, health: 2.2, oxen: 2.0, wear: 1.6 },
];

// ---------------------------------------------------------------- rng
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pickR = (R, arr) => arr[Math.floor(R.rnd() * arr.length)];
const chance = (R, p) => R.rnd() < p;

// how hard the land is on this crossing
export function crossingTune(c) {
  const d = clamp((c - 1) / (CAP_CROSSING - 1), 0, 1);
  return {
    d,
    eventChance: 0.28 + 0.14 * d,         // per travel day: at 40 wpm a day is ~30 s, so an event every 1-2 minutes
    illness: 1 + 1.2 * d,
    harsh: 1 + 0.8 * d,
    prices: 1 + 1.2 * d,
    game: 1 - 0.55 * d,
    current: 1 + 1.2 * d,
    wordMin: 3 + Math.round(2 * d), wordMax: 6 + Math.round(4 * d),
    winterDays: 60 + Math.round(40 * d),
  };
}

// ---------------------------------------------------------------- the land
function makeRegion(R, index) {
  const crossing = R.crossing;
  const biome = R.biomeSeq[index % R.biomeSeq.length];
  const legs = [];
  const nLegs = 4 + (R.rnd() < 0.3 ? 1 : 0);
  const L = T.LANDMARKS[biome];
  const sights = [...L.sights].sort(() => R.rnd() - 0.5);
  const forts = [...L.forts].sort(() => R.rnd() - 0.5);
  let sinceFort = 0;
  for (let i = 0; i < nLegs; i++) {
    const last = i === nLegs - 1;
    sinceFort++;
    const fort = last || sinceFort >= 3 || (sinceFort >= 2 && R.rnd() < 0.35);
    if (fort) sinceFort = 0;
    const riverChance = biome === 'river' ? 0.7 : biome === 'highwood' || biome === 'meadow' ? 0.25 : biome === 'coast' ? 0.2 : 0.08;
    const river = !fort && R.rnd() < riverChance;
    const stone = !fort && !river && (biome === 'barrens' ? R.rnd() < 0.55 : R.rnd() < 0.25);
    legs.push({
      length: Math.round(32 + R.rnd() * 26 + (biome === 'saltmere' ? 8 : 0)),
      name: fort ? forts[i % forts.length] : river ? riverName(R, biome) : sights[i % sights.length],
      kind: fort ? 'fort' : river ? 'river' : stone ? 'stone' : 'sight',
      gateway: last,
      river: river ? {
        depth: +(1.5 + R.rnd() * (biome === 'river' ? 6 : 4)).toFixed(1),
        width: Math.round(120 + R.rnd() * 500),
        current: R.rnd() < 0.3 ? 'swift' : R.rnd() < 0.2 ? 'raging' : 'slow',
        ferry: 5 + Math.round(R.rnd() * 15 * crossingTune(crossing).prices),
      } : null,
      fork: !last && i > 0 && R.rnd() < 0.18,
    });
  }
  return { biome, index, legs, crossing };
}
function riverName(R, biome) {
  const a = ['Willow', 'Stone', 'Heron', 'Snake', 'Bitter', 'Silver', 'Otter', 'Cold', 'Red', 'Long'];
  const b = biome === 'pass' ? 'Torrent' : biome === 'coast' ? 'Estuary' : 'River';
  return pickR(R, a) + ' ' + b;
}
function biomeSequence(R, crossing) {
  if (crossing === 1) return [...BIOME_ORDER];
  // later crossings shuffle the middle; Greenmeadow always first, the Pass before the coast
  const middle = ['river', 'barrens', 'highwood', 'saltmere'].sort(() => R.rnd() - 0.5);
  return ['meadow', ...middle, 'pass', 'coast'];
}

// ---------------------------------------------------------------- a run
export function createRun(opts) {
  opts = opts || {};
  const seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
  const trade = T.TRADES.find(t => t.key === opts.trade) || T.TRADES[1];
  const names = (opts.names && opts.names.length ? opts.names : T.DEFAULT_NAMES).slice(0, 5);
  const R = {
    seed, rnd: mulberry32(seed), trade,
    crossing: 1, regionIndex: 0, legIndex: 0,
    miles: 0, legMiles: 0, day: 0, hour: 3.2, words: 0, clock: 0,
    party: [], oxen: [],
    inv: { food: 0, water: 0, clothing: 0, shot: 0, wheel: 0, axle: 0, tongue: 0, medicine: 0, money: trade.money, goods: 0 },
    wear: { wheel: 5, axle: 5, tongue: 5 },
    morale: 70, rations: 'filling', pace: PACES[1], paceKey: 'steady',
    weather: { kind: 'clear', left: 2 },
    pending: [], log: [],
    graves: [], settled: [], poem: 0, versesDone: 0,
    stats: { letters: 0, errors: 0, lines: 0, flawless: 0, landmarks: 0, regions: 0, crossings: 0, hunts: 0, meat: 0, deaths: 0 },
    over: null, onFoot: false,
    tune: crossingTune(1),
    transition: null,          // { from, to, start } while crossing into a new biome
  };
  const traits = Object.keys(T.TRAITS).sort(() => R.rnd() - 0.5);
  names.forEach((n, i) => R.party.push(person(n, i === 0 ? null : traits[i % traits.length], i === 0)));
  R.biomeSeq = biomeSequence(R, 1);
  R.region = makeRegion(R, 0);
  return R;
}
export function person(name, trait, leader) {
  return { name, trait: trait || null, leader: !!leader, health: 100, alive: true, ill: null, injured: 0, riding: false };
}

export const living = R => R.party.filter(p => p.alive);
export const hasTrait = (R, t) => living(R).some(p => p.trait === t);
export const biome = R => R.region.biome;
export const leg = R => R.region.legs[R.legIndex];
// a trail year is short: four 30-day seasons, so every run meets a winter
export const SEASON_DAYS = 30;
export const season = R => ['spring', 'summer', 'autumn', 'winter'][Math.floor((R.day % (SEASON_DAYS * 4)) / SEASON_DAYS)];
export const year = R => 1 + Math.floor(R.day / (SEASON_DAYS * 4));
export const healthyOxen = R => R.oxen.filter(o => o.health > 0);
export const weight = R => R.inv.food + R.inv.water * 40 + R.inv.clothing * 5 + R.inv.shot * 0.05 + (R.inv.wheel + R.inv.axle + R.inv.tongue) * 25 + R.inv.medicine * 0.5 + R.inv.goods * 10 + living(R).filter(p => p.riding).length * 140;

// ---------------------------------------------------------------- store
export function price(R, key) {
  const item = T.STORE.find(s => s.key === key);
  if (!item) return Infinity;
  const remote = 1 + (R.regionIndex % BIOME_ORDER.length) * 0.06;   // dearer further from the trailhead, reset each crossing
  let p = item.price * R.tune.prices * remote;
  if (R.trade.key === 'merchant') p *= 0.85;
  return p;
}
export function buy(R, key, qty) {
  const item = T.STORE.find(s => s.key === key);
  if (!item || !(qty > 0)) return { ok: false, why: 'nothing to buy' };
  const cost = key === 'oxen' ? price(R, key) * Math.ceil(qty / 2) : price(R, key) * qty;
  if (cost > R.inv.money + 1e-6) return { ok: false, why: 'not enough money', cost };
  R.inv.money -= cost;
  if (key === 'oxen') for (let i = 0; i < qty; i++) R.oxen.push({ health: 100 });
  else R.inv[key] += qty;
  return { ok: true, cost };
}
// work at a fort: write letters home for settlers. The game runs the typing;
// quality 0..1 is accuracy and pace. One letter takes half a day.
export function letterWork(R, quality, letters) {
  const pay = Math.round(letters * (6 + 10 * quality) * (1 + R.tune.d * 0.5));
  R.inv.money += pay;
  R.day += Math.ceil(letters / 2);
  return pay;
}
export function sell(R, key, qty) {
  if (key !== 'goods' || R.inv.goods < qty) return { ok: false };
  const each = (R.trade.key === 'merchant' ? 18 : 15) * (1 + R.tune.d * 0.6);
  R.inv.goods -= qty; R.inv.money += each * qty;
  return { ok: true, gain: each * qty };
}

// ---------------------------------------------------------------- pace and travel
export function setPace(R, wpm) {
  const p = PACES.find(pp => wpm < pp.upTo) || PACES[3];
  R.pace = p; R.paceKey = p.key;
  return p;
}
function travelFactor(R) {
  const ox = healthyOxen(R);
  if (R.onFoot) return 0.5;
  if (ox.length < 2) return 0;
  const count = ox.length >= 6 ? 1.05 : ox.length >= 4 ? 1 : ox.length === 3 ? 0.85 : 0.7;
  const oxHealth = 0.6 + 0.4 * (ox.reduce((a, o) => a + o.health, 0) / ox.length / 100);
  const load = weight(R) > 2000 ? 0.8 : 1;
  const w = R.weather.kind;
  const weather = w === 'snow' ? 0.6 : w === 'storm' ? 0.75 : w === 'rain' ? 0.88 : w === 'dust' ? 0.85 : w === 'fog' ? 0.9 : 1;
  const hurt = living(R).some(p => p.riding) ? 0.92 : 1;
  return count * oxHealth * load * weather * hurt;
}
export const canMove = R => !R.over && (R.onFoot || healthyOxen(R).length >= 2);

// one correct or wrong letter of the ribbon; returns what happened
export function travelLetter(R, ok) {
  if (!canMove(R)) return { stuck: true };
  R.stats.letters++;
  const out = {};
  if (ok) {
    const mpl = R.pace.miles * 1.2 * travelFactor(R) / 6;    // ~6 letters to a word, ~1.2 miles a word
    advanceMiles(R, mpl, out);
    R.words += 1 / 6;
    if (R.words >= WORDS_PER_DAY) { R.words -= WORDS_PER_DAY; endDay(R, out); }
    // the sky turns through a whole day and night every three travel days, never jumping
    R.clock += 1 / 6;
    R.hour = (3.2 + (R.clock / (WORDS_PER_DAY * 3)) * 8) % 8;
  } else {
    R.stats.errors++;
    const parts = ['wheel', 'axle', 'tongue'];
    const part = pickR(R, parts);
    R.wear[part] = Math.min(100, R.wear[part] + 0.9 * R.pace.wear * (R.paceKey === 'driven' ? 2 : 1));
    out.jolt = part;
    if (R.rnd() < 0.08) { const ox = pickR(R, healthyOxen(R)); if (ox) { ox.health = Math.max(0, ox.health - 2); out.stumble = true; } }
  }
  return out;
}
export function finishLine(R, flawless) {
  R.stats.lines++;
  if (flawless) {
    R.stats.flawless++;
    R.morale = clamp(R.morale + 1.2, 0, 100);
  }
}
function advanceMiles(R, m, out) {
  const L = leg(R);
  R.miles += m;
  R.legMiles += m;
  if (R.transition) {
    const t = (R.miles - R.transition.start) / TRANSITION_MILES;
    R.transition.t = clamp(t, 0, 1);
    if (t >= 1) R.transition = null;
  }
  if (R.legMiles >= L.length) {
    R.legMiles = L.length;
    out.arrive = L;
    R.pending.push({ type: 'arrive', leg: L });
  }
}
// the game calls this once the arrival scene is done
export function departLandmark(R) {
  const L = leg(R);
  R.stats.landmarks++;
  R.legMiles = 0;
  if (L.gateway) {
    R.stats.regions++;
    const from = R.region.biome;
    R.regionIndex++;
    if (R.regionIndex % R.biomeSeq.length === 0) {
      R.stats.crossings++;
      R.crossing++;
      R.tune = crossingTune(R.crossing);
      R.biomeSeq = biomeSequence(R, R.crossing);
      R.pending.push({ type: 'crossing', crossing: R.crossing });
    }
    R.region = makeRegion(R, R.regionIndex);
    R.legIndex = 0;
    R.transition = { from, to: R.region.biome, start: R.miles, t: 0 };
    R.pending.push({ type: 'region', biome: R.region.biome });
  } else {
    R.legIndex++;
  }
}

// ---------------------------------------------------------------- the day
function endDay(R, out) {
  R.day++;
  out.day = true;
  const alive = living(R);
  const cook = hasTrait(R, 'cook') ? 0.9 : 1;
  const farmer = R.trade.key === 'farmer' ? 0.8 : 1;
  const ration = R.rations === 'filling' ? 2.5 : R.rations === 'meagre' ? 1.6 : 0.9;
  const need = alive.length * ration * cook * farmer;
  const ate = Math.min(R.inv.food, need);
  R.inv.food = Math.max(0, R.inv.food - need);
  const starving = ate < need * 0.99;
  if (DRY.has(biome(R))) {
    const drink = alive.length * 0.05 * (R.weather.kind === 'heat' ? 2 : 1);
    R.inv.water = Math.max(0, R.inv.water - drink);
  }
  const thirsty = DRY.has(biome(R)) && R.inv.water <= 0;
  const winter = season(R) === 'winter';
  const cold = (biome(R) === 'pass' || winter) && R.inv.clothing < alive.length;
  const tough = p => p.trait === 'tough';

  for (const p of alive) {
    let dh = -0.5 * R.pace.health * R.tune.harsh;
    dh += R.rations === 'filling' ? 0.55 : R.rations === 'meagre' ? -0.35 : -2;
    if (starving) dh -= 4;
    if (thirsty) dh -= 5;
    if (cold) dh -= biome(R) === 'pass' ? 3.5 : 1.5;
    if (R.weather.kind === 'storm' || R.weather.kind === 'snow') dh -= 0.6;
    if (R.morale < 30) dh -= 0.8;
    if (p.ill) dh -= p.ill.sev * (tough(p) ? 0.6 : 1);
    if (p.injured > 0) { p.injured--; if (p.injured === 0) p.riding = false; }
    p.health = clamp(p.health + dh, 0, 100);
    // illness runs its course: treated illnesses fade, untreated linger
    if (p.ill) { p.ill.days--; if (p.ill.days <= 0) { p.ill = null; R.pending.push({ type: 'recovered', who: p.name }); } }
    // the critically weak can slip away overnight, sick or not
    if (p.health < 18 && R.rnd() < 0.06 * R.tune.harsh) p.health = 0;
    if (p.health <= 0) kill(R, p, p.ill ? p.ill.kind : starving ? 'hunger' : thirsty ? 'thirst' : cold ? 'cold' : 'exhaustion');
  }

  for (const o of R.oxen) {
    if (o.health <= 0) continue;
    let d = -0.4 * R.pace.oxen;
    if (LUSH.has(biome(R))) d += 0.55;
    if (DRY.has(biome(R))) d -= 0.4;
    if (biome(R) === 'pass') d -= 0.5;
    o.health = clamp(o.health + d, 0, 100);
    if (o.health <= 0) R.pending.push({ type: 'oxdied' });
  }

  for (const k of Object.keys(R.wear)) R.wear[k] = Math.min(100, R.wear[k] + 0.35 * R.pace.wear);
  // clothes wear through in the cold
  if ((biome(R) === 'pass' || winter) && R.inv.clothing > 0 && R.rnd() < 0.05) R.inv.clothing--;
  R.morale = clamp(R.morale - (hasTrait(R, 'singer') ? 0.15 : 0.35) - (starving ? 2 : 0) + (R.rations === 'filling' ? 0.2 : 0), 0, 100);

  // weather drifts
  R.weather.left--;
  if (R.weather.left <= 0) R.weather = rollWeather(R);

  // something may happen
  if (living(R).length && R.rnd() < R.tune.eventChance) {
    const ev = rollEvent(R);
    if (ev) R.pending.push(ev);
  }
  // breakdowns follow wear
  for (const k of Object.keys(R.wear)) {
    if (R.rnd() < Math.pow(R.wear[k] / 100, 2) * 0.12) { R.pending.push({ type: 'breakdown', part: k }); break; }
  }
  if (!living(R).length) R.over = { why: 'party' };
  if (!R.onFoot && healthyOxen(R).length < 2 && R.inv.money < price(R, 'oxen')) R.pending.push({ type: 'stranded' });
}

export function rollWeather(R) {
  const b = biome(R), s = season(R);
  const table = {
    meadow:   { clear: 5, rain: 2, storm: 1, fog: 0.5 },
    river:    { clear: 4, rain: 3, storm: 1, fog: 1.5 },
    barrens:  { clear: 5, dust: 2, heat: 1.5, storm: 0.5 },
    highwood: { clear: 3, rain: 2, fog: 2.5, storm: 0.5 },
    pass:     { clear: 3, snow: s === 'winter' ? 5 : 2, storm: 1, fog: 1 },
    saltmere: { clear: 4, heat: 3.5, dust: 1 },
    coast:    { clear: 5, rain: 2, fog: 1.5, storm: 1 },
  }[b];
  if (s === 'winter' && b !== 'saltmere') table.snow = (table.snow || 0) + 1.5;
  const total = Object.values(table).reduce((a, v) => a + v, 0);
  let r = R.rnd() * total;
  for (const [k, v] of Object.entries(table)) { r -= v; if (r <= 0) return { kind: k, left: 1 + Math.floor(R.rnd() * 4) }; }
  return { kind: 'clear', left: 2 };
}

// ---------------------------------------------------------------- events
export function rollEvent(R) {
  const b = biome(R), alive = living(R);
  const who = () => pickR(R, alive);
  const bag = [];
  const add = (w, fn) => bag.push([w, fn]);
  const ill = hasTrait(R, 'tough') ? 0.8 : 1;
  add(3 * R.tune.illness * ill * (R.rations === 'bare' ? 1.8 : 1), () => {
    const p = who(); if (p.ill) return null;
    const kinds = b === 'pass' ? ['chill', 'frostbite', 'cough', 'fever'] : b === 'river' ? ['fever', 'dysentery', 'chill'] : DRY.has(b) ? ['exhaustion', 'fever', 'dysentery'] : ['fever', 'dysentery', 'cough', 'chill'];
    return { type: 'illness', who: p.name, kind: pickR(R, kinds) };
  });
  if (!DRY.has(b) || b === 'barrens') add(0.8, () => ({ type: 'illness', who: who().name, kind: 'snakebite' }));
  add(0.8, () => ({ type: 'illness', who: who().name, kind: 'fracture' }));
  add(1.2, () => (healthyOxen(R).length > 2 ? { type: 'oxlost' } : null));
  if (b === 'river' || b === 'meadow' || R.weather.kind === 'rain') add(1.5, () => ({ type: 'mud' }));
  if (b === 'meadow' || b === 'river') add(0.7, () => ({ type: 'stampede' }));
  if (b === 'highwood') add(1.6, () => ({ type: 'lost' }));
  if (b === 'highwood' || b === 'pass') add(1.1, () => ({ type: 'wolves' }));
  add(0.9, () => ({ type: 'thieves' }));
  add(1.6, () => ({ type: 'stranger', offer: Math.floor(R.rnd() * T.STRANGER_OFFERS.length) }));
  if (LUSH.has(b)) add(1.2, () => ({ type: 'berries' }));
  add(0.7, () => ({ type: 'wagon' }));
  if (DRY.has(b)) add(1.3, () => ({ type: 'spring' }));
  add(0.5, () => ({ type: 'musician' }));
  if (b === 'meadow' || b === 'barrens' || b === 'saltmere') add(0.4 + (season(R) === 'summer' ? 0.6 : 0), () => ({ type: 'wildfire' }));
  if (b === 'saltmere') add(1.2, () => ({ type: 'mirage' }));
  if (b === 'meadow' || b === 'highwood') add(0.25, () => ({ type: 'stag' }));
  if (R.crossing >= 1 && R.party.length < 6) add(0.5, () => ({ type: 'recruit', name: freshName(R) }));
  if (alive.length >= 2) add(0.8, () => ({ type: 'banter' }));
  const total = bag.reduce((a, [w]) => a + w, 0);
  let r = R.rnd() * total;
  for (const [w, fn] of bag) { r -= w; if (r <= 0) return fn(); }
  return null;
}
export function freshName(R) {
  const used = new Set(R.party.map(p => p.name));
  const free = T.RECRUITS.filter(n => !used.has(n));
  return free.length ? pickR(R, free) : pickR(R, T.RECRUITS) + 'y';
}

// ---- event outcomes (the game runs the typing challenge, then reports how it went)
export function illnessOutcome(R, name, kind, success) {
  const p = R.party.find(q => q.name === name && q.alive); if (!p) return;
  const usedMedicine = R.inv.medicine > 0;
  if (usedMedicine) R.inv.medicine--;
  const sev = ({ fever: 5, dysentery: 7, chill: 3.5, cough: 3.5, snakebite: 9, fracture: 2, frostbite: 6, exhaustion: 4 }[kind] || 4) * R.tune.harsh;
  if (kind === 'fracture') { p.injured = success ? 8 : 16; p.riding = true; p.health = Math.max(1, p.health - (success ? 5 : 15)); return; }
  const good = success && usedMedicine;
  p.ill = { kind, sev: good ? sev * 0.35 : success || usedMedicine ? sev * 0.7 : sev, days: good ? 4 : 8 + Math.floor(R.rnd() * 6) };
  if (kind === 'snakebite' && !success) p.health = Math.max(1, p.health - 25);
}
export function breakdownOutcome(R, part, method, success) {
  // method: 'spare' | 'jury' | 'wait'
  if (method === 'spare' && R.inv[part] > 0) {
    R.inv[part] -= R.trade.key === 'wheelwright' && R.rnd() < 0.5 ? 0 : 1;
    R.wear[part] = success ? 5 : 30;
    return true;
  }
  if (method === 'jury') { R.wear[part] = success ? 55 : 80; return success; }
  if (method === 'wait') { restDays(R, 2 + Math.floor(R.rnd() * 3), true); R.wear[part] = 40; return true; }
  return false;
}
export function restDays(R, n, travelling) {
  for (let i = 0; i < n; i++) {
    R.day++;
    const alive = living(R);
    const need = alive.length * (R.rations === 'filling' ? 2.5 : R.rations === 'meagre' ? 1.6 : 0.9);
    const starving = R.inv.food < need;
    R.inv.food = Math.max(0, R.inv.food - need);
    for (const p of alive) {
      p.health = clamp(p.health + (starving ? -3 : 3 + (hasTrait(R, 'cook') ? 1 : 0)) - (p.ill ? p.ill.sev * 0.6 : 0), 0, 100);
      if (p.ill) { p.ill.days -= 2; if (p.ill.days <= 0) p.ill = null; }
      if (p.health <= 0) kill(R, p, 'illness');
    }
    for (const o of R.oxen) if (o.health > 0) o.health = clamp(o.health + (LUSH.has(biome(R)) ? 4 : 1.5), 0, 100);
    if (!travelling) R.morale = clamp(R.morale + 4 + (hasTrait(R, 'singer') ? 2 : 0), 0, 100);
  }
  if (!living(R).length) R.over = { why: 'party' };
}
export function kill(R, p, cause) {
  if (!p.alive) return;
  p.alive = false; p.health = 0; p.cause = cause;
  R.stats.deaths++;
  R.morale = clamp(R.morale - 25, 0, 100);
  R.pending.push({ type: 'death', who: p.name, cause, mile: Math.round(R.miles) });
}
export function addGrave(R, name, epitaph) {
  R.graves.push({ name, epitaph: (epitaph || '').slice(0, 40), mile: Math.round(R.miles), biome: biome(R), day: R.day });
}

// hunting: the game reports shots fired and animals taken
export function huntOutcome(R, shots, meat) {
  R.stats.hunts++;
  R.inv.shot = Math.max(0, R.inv.shot - shots);
  const cap = hasTrait(R, 'hunter') ? 200 : 100;
  const kept = Math.min(meat, cap);
  R.inv.food += kept;
  R.stats.meat += kept;
  R.region.hunted = (R.region.hunted || 0) + 1;
  R.day += 1;
  return { kept, wasted: meat - kept };
}
export function forageOutcome(R, picked) {
  const f = (R.trade.key === 'farmer' ? 1.3 : 1) * picked;
  R.inv.food += Math.round(f * 4);
  if (R.rnd() < 0.2 * picked / 5) R.inv.medicine++;
  R.day += 1;
}

// rivers: method 'ford' | 'caulk' | 'ferry' | 'wait'; score 0..1 from the typing challenge
export function riverOutcome(R, river, method, score) {
  const lost = {};
  if (method === 'ferry') { R.inv.money = Math.max(0, R.inv.money - river.ferry); R.day += 1 + Math.floor(R.rnd() * 2); return { safe: true, lost }; }
  if (method === 'wait') { R.day += 1; river.depth = Math.max(1.2, +(river.depth + (R.rnd() - 0.55) * 1.2).toFixed(1)); return { waited: true, lost }; }
  if (method === 'caulk') R.day += 1;
  const danger = (river.depth / (method === 'caulk' ? 9 : 4)) * (river.current === 'raging' ? 1.8 : river.current === 'swift' ? 1.3 : 1) * R.tune.current;
  const fail = clamp(danger - score * 1.2, 0, 1);
  if (fail > 0.15) {
    const frac = fail * 0.5;
    for (const k of ['food', 'clothing', 'shot', 'medicine', 'water']) { const n = Math.floor(R.inv[k] * frac * R.rnd()); if (n > 0) { R.inv[k] -= n; lost[k] = n; } }
    if (fail > 0.55 && R.oxen.length && R.rnd() < fail) { const ox = pickR(R, healthyOxen(R)); if (ox) { ox.health = 0; lost.oxen = 1; } }
    if (fail > 0.7 && R.rnd() < fail - 0.5) lost.swept = pickR(R, living(R)).name;
  }
  return { safe: fail <= 0.15, lost };
}

// strangers and good fortune
export function applyGains(R, g) {
  for (const [k, v] of Object.entries(g || {})) {
    if (k === 'morale') R.morale = clamp(R.morale + v, 0, 100);
    else if (k === 'oxen') for (let i = 0; i < v; i++) R.oxen.push({ health: 90 });
    else if (k === 'shortcut') { const L = leg(R); L.length = Math.max(Math.round(R.legMiles + 5), L.length - 40); }
    else if (k in R.inv) R.inv[k] = Math.max(0, R.inv[k] + v);
  }
}
export function canAfford(R, give) { return Object.entries(give || {}).every(([k, v]) => (k in R.inv ? R.inv[k] >= v : true)); }

// the standing stones
export function wakeStone(R) {
  R.poem = Math.min(T.POEM.length, R.poem + 1);
  const verse = Math.floor(R.poem / 7);
  const newVerse = verse > R.versesDone;
  if (newVerse) R.versesDone = verse;
  R.morale = clamp(R.morale + 10, 0, 100);
  return { line: T.POEM[R.poem - 1], newVerse, verse };
}
export const verseActive = (R, i) => R.versesDone > i;

// ---------------------------------------------------------------- score
export function score(R) {
  const alive = living(R);
  const healthW = p => (p.health > 70 ? 1 : p.health > 45 ? 0.75 : 0.5);
  const acc = R.stats.letters ? (R.stats.letters - R.stats.errors) / R.stats.letters : 1;
  const base = R.miles * 1 + R.stats.landmarks * 50 + R.stats.regions * 500 + R.stats.crossings * 2000 +
    alive.reduce((a, p) => a + 100 * healthW(p), 0) + R.settled.length * 750 + R.stats.flawless * 5 + R.poem * 40;
  return Math.round(base * R.trade.mult * (0.5 + acc / 2));
}
export function title(R) {
  const s = score(R);
  let t = T.TITLES[0][1];
  for (const [min, name] of T.TITLES) if (s >= min) t = name;
  return t;
}

export default {
  mulberry32, BIOME_ORDER, PACES, WORDS_PER_DAY, TRANSITION_MILES, createRun, person, living, hasTrait, biome, leg, season, year,
  healthyOxen, weight, price, buy, sell, letterWork, setPace, canMove, travelLetter, finishLine, departLandmark, rollWeather, rollEvent,
  illnessOutcome, breakdownOutcome, restDays, kill, addGrave, huntOutcome, forageOutcome, riverOutcome, applyGains, canAfford,
  wakeStone, verseActive, score, title, crossingTune, freshName,
};
