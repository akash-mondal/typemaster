// A typing bot for the local harness (play.html). It plays KATA through the same
// input the engine hands the game, at a set speed and error rate, so a whole run
// can be verified without a human. Load it from the console:
//   await import('./bot.js'); oneRun(5, 0.03, 9000)
const BOT = { cps: 5, err: 0.03, acc: 0, choice: 0 };
let rs = 987;
const rr = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };

export function botFrame() {
  const S = window.KATA.state, R = S.R;
  const chars = []; let enter = 0;
  if (S.mode === 'title' || S.mode === 'pace') enter = 1;
  else if (S.mode === 'play' && R && !R.dead) {
    BOT.acc += BOT.cps / 30;
    if (BOT.acc >= 1) {
      BOT.acc -= 1;
      let want = null;
      if (R.menu || R.enc) { /* wait */ }
      else if (R.hazard) want = R.hazard.word[R.hazard.typed.length];
      else if (R.duel) { if (R.duel.phase === 'type') want = R.duel.word[R.duel.typed.length]; }
      else if (R.grap) { if (R.grap.phase === 'prompt') want = R.grap.word[R.grap.typed.length]; }
      else if (R.pending) want = R.slots[R.si].opts[(BOT.choice++) % 2].text[0];
      else {
        const o = R.slots[R.si].opts[R.choice];
        if (o && R.ci < o.len && R.stunT <= 0) want = o.text[R.ci];
      }
      if (want != null) chars.push(rr() < BOT.err ? (want === 'q' ? 'z' : 'q') : want);
    }
  }
  window.send(chars, [], 0, enter);
  window.step(1, 1000 / 30);
}

export function oneRun(cps, err, maxFrames, daily) {
  const S = window.KATA.state;
  S.mode = 'title'; S.sel = daily ? 1 : 0;
  BOT.err = err; BOT.cps = cps; BOT.acc = 0;
  const stages = [];
  for (let f = 0; f < maxFrames; f++) {
    botFrame();
    const R = S.R;
    if (R && S.mode === 'play' && stages[R.stage] == null) stages[R.stage] = Math.round(S.t - R.start);
    if (S.mode === 'results') break;
  }
  const R = S.R;
  return [Math.round(cps * 12) + 'wpm', Math.round(err * 100) + '%err',
    Math.round((R.end || S.t) - R.start) + 's', 'stage ' + R.stage, R.roofs + ' roofs',
    R.dead ? R.dead.cause : 'alive', 'kills ' + R.kills, 'stage times ' + stages.filter(x => x != null).join(',')].join(' | ');
}

Object.assign(window, { BOT, botFrame, oneRun });
