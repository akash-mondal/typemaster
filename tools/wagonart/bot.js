// A bot that plays WAGONHEART through real key events in the harness page.
//   const bot = await import('./bot.js'); bot.run({ seconds: 120, wpm: 70, acc: 0.96 })
// It types the ribbon, answers overlays, types remedies and repairs, hunts,
// fords rivers and shops. `tour()` forces every kind of event once and
// captures a frame of each to the capture server (POST /name -> /tmp/cap_name.png).
const W = window.WAGONHEART, D = W.dev, S = W.state;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// game time advances by synthetic frames (window.step in the harness), so a
// background tab's throttled timers cannot slow the run
let wait = ms => sleep(ms);
const frames = ms => { window.step(Math.max(1, Math.round(ms / (1000 / 60)))); return Promise.resolve(); };
const code = k => k === 'Enter' ? 'Enter' : k === 'Escape' ? 'Escape' : k === 'Backspace' ? 'Backspace' : k.startsWith('Arrow') ? k : k === ' ' ? 'Space' : /\d/.test(k) ? 'Digit' + k : 'Key' + k.toUpperCase();
export const key = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, code: code(k) }));
export async function cap(name) {
  const c = document.getElementById('c');
  await fetch('http://127.0.0.1:8766/' + name, { method: 'POST', body: c.toDataURL() }).catch(() => {});
}
const errors = [];
addEventListener('error', e => errors.push(String(e.message)));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));

export function start(trade) {
  const R = D.newJourney(trade || 'wheelwright', ['mara', 'john', 'ruth', 'sam', 'lily']);
  for (const [k, q] of Object.entries({ oxen: 6, food: 600, clothing: 5, shot: 150, wheel: 1, axle: 1, medicine: 4, water: 2 })) D.Sim.buy(R, k, q);
  D.setMode('travel');
  return R;
}

const seen = new Set();
async function once(name) { if (seen.has(name)) return; seen.add(name); await cap('wh_' + name); }

// one decision or keystroke; returns ms to wait before the next
async function step(o) {
  const gap = 60000 / (o.wpm * 5);
  const slip = () => Math.random() > o.acc;
  switch (S.mode) {
    case 'travel': {
      const O = S.overlay;
      if (!O) {
        const V = S.view;
        if (!V.line) return 100;
        if (Math.random() < 0.004) { key('Enter'); return 300; }   // visit camp now and then
        key(slip() ? 'q' : V.line[V.typed]);
        return gap;
      }
      await once(O.kind + '_' + O.title.toLowerCase().replace(/[^a-z]+/g, '_'));
      if (O.ch) {
        if (O.ch.done) { key('Enter'); return 500; }
        const ph = O.ch.phrases[O.ch.i];
        key(slip() ? 'q' : ph[O.ch.typed]);
        return gap;
      }
      if (O.kind === 'grave') { for (const ch of 'rest well') { key(ch); await wait(gap); } key('Enter'); return 400; }
      // choices: camp goes on, arrivals rest/store sometimes, else the first option
      let pick = O.options[0];
      if (O.kind === 'camp') pick = Math.random() < 0.3 ? 'hunt' : 'go on';
      if (O.kind === 'arrival') pick = O.options.includes('read') ? 'read' : O.options.includes('store') && Math.random() < 0.5 ? 'store' : 'continue';
      if (O.kind === 'river') pick = O.options.includes('caulk') ? 'caulk' : O.options[0];
      if (O.kind === 'choice' && O.options.includes('walk on')) pick = 'walk on';
      for (const ch of pick) { key(ch); await wait(gap); }
      key('Enter');
      return 400;
    }
    case 'store': {
      await once('store');
      key('ArrowDown'); await wait(80); key('Enter'); await wait(80);   // a sack of food
      key('Escape');
      return 400;
    }
    case 'hunt': {
      const H = S.hunt;
      await once('hunt');
      if (!H || H.done) return 200;
      const a = H.active || H.animals.find(q => !q.dead && q.x > 20 && q.x < 300);
      if (!a) return 120;
      key(slip() ? 'q' : a.word[a.typed]);
      return gap;
    }
    case 'river': {
      const X = S.cross;
      await once('river');
      if (!X || X.done) return 200;
      const it = X.active || X.items.find(q => q.state === 'come');
      if (!it) return 100;
      key(slip() ? 'q' : it.word[it.typed]);
      return gap;
    }
    case 'results': await once('results'); return 1000;
    default: return 200;
  }
}

export async function run(o) {
  o = Object.assign({ seconds: 60, wpm: 60, acc: 0.95 }, o);
  wait = frames;
  let gameMs = 0;
  const modes = {};
  while (gameMs < o.seconds * 1000 && S.mode !== 'results') {
    modes[S.mode] = (modes[S.mode] || 0) + 1;
    const ms = await step(o);
    await wait(ms);
    if (o.snap && Math.floor((gameMs + ms) / (o.snap * 1000)) > Math.floor(gameMs / (o.snap * 1000))) await cap('run_' + String(Math.floor((gameMs + ms) / (o.snap * 1000))).padStart(2, '0'));
    gameMs += ms;
  }
  wait = sleep;
  window.manual = false;
  const R = S.R;
  return { errors, seen: [...seen], modes, mode: S.mode, miles: Math.round(R.miles), day: R.day, alive: D.Sim.living(R).length, legs: R.stats.landmarks, regions: R.stats.regions, biome: D.Sim.biome(R), hour: +R.hour.toFixed(2), transition: R.transition };
}

// force each kind of scene once and capture it
export async function tour() {
  const R = start();
  await wait(300);
  const events = [
    { type: 'illness', who: 'john', kind: 'fever' }, { type: 'breakdown', part: 'wheel' }, { type: 'wolves' }, { type: 'stranger', offer: 0 },
    { type: 'mirage' }, { type: 'stag' }, { type: 'recruit', name: 'wren' }, { type: 'lost' }, { type: 'region', biome: 'river' },
  ];
  for (const e of events) {
    S.overlay = null; D.openEvent(e); await wait(900);
    if (S.overlay && S.overlay.ch) { const ph = S.overlay.ch.phrases[0]; for (const ch of ph.slice(0, 4)) { key(ch); await wait(70); } }
    await cap('tour_' + e.type); S.overlay = null; S.toast = null;
  }
  D.openCamp(); await wait(500); await cap('tour_camp'); S.overlay = null;
  const leg = D.Sim.leg(R);
  D.openArrival(Object.assign({}, leg, { kind: 'fort', name: 'Fort Greenwell' })); await wait(700); await cap('tour_fort'); S.overlay = null;
  D.openArrival({ kind: 'river', name: 'Heron River', river: { depth: 3.4, width: 300, current: 'swift', ferry: 12 } }); await wait(700); await cap('tour_riverchoice');
  for (const ch of 'caulk') { key(ch); await wait(60); } key('Enter'); await wait(4500); await cap('tour_crossing');
  while (S.mode === 'river') await wait(300);
  D.startHunt(); await wait(5000); await cap('tour_hunt');
  while (S.mode === 'hunt') { S.hunt.dur = 0; await wait(300); }
  D.openEvent({ type: 'death', who: 'sam', cause: 'fever', mile: 10 }); await wait(700); for (const ch of 'gone ahead') { key(ch); await wait(50); } await cap('tour_grave'); key('Enter'); await wait(300);
  return { errors };
}
