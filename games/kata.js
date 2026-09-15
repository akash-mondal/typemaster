/*
 * KATA - a typing game for TYPEMAXX.
 *
 * You run a road of rooftops through five Japanese worlds by typing the words
 * written on them. The road is built fresh every run: its words, the size and
 * height of every roof, the gaps, and who is waiting on them.
 *
 *   - a finished line leaps you to the next roof; a wide chasm needs the
 *     grappling hook, thrown by typing its word
 *   - a wrong key does not slide past: it cracks the tiles under you, and a
 *     roof cracked three times gives way
 *   - the ronin guards a highlighted word: type it perfectly or be cut down
 *   - kage throw shuriken and archers loose arrows from the roofs ahead; type
 *     the word to dodge, and anyone still standing when you reach him attacks -
 *     type his kill word first. Catch a star or parry an arrow to kill at range
 *   - blue words snuff a post lantern: the enemy on that roof never sees you
 *   - gold words charge kata, cast with Enter and their name
 *   - clear all five worlds and the road keeps going, faster
 *
 * Contract (TYPEMAXX engine): export an object with enter(), exit() and
 * draw(ctx, W, H, seconds, now, input). input.pull() returns
 * { chars, keys, back, enter } for the frame. Everything is drawn in a
 * 320x240 logical space, scaled to whatever surface arrives.
 *
 * Art: assets/flow/atlas.png + manifest.json, loaded relative to this module.
 */

const BASE = new URL('../assets/flow/', import.meta.url).href;
const LW = 320, LH = 240;

// ---------------------------------------------------------------- tuning
const ADV = 7;              // monospaced cell on the roof boards
const PADX = 12;            // board inset from the roof's left edge
const LANES = [110, 138, 164];   // ridge y for high, mid, low
const VOID_Y = 190;
const MAXC = 22;            // characters per roof, at most

const COL = {
  ink: '#E8F4EC', dim: '#4F7A62', hot: '#8DF0B4', gold: '#F4B93D', red: '#E0484E',
  lamp: '#F2A63C', pale: '#FFF3D0', mute: '#5E8270', shade: '#2E3F37', steel: '#A8AEC0',
  verm: '#C8342E', sky: '#9FB4D8', ice: '#BCD8EE', pink: '#F4B8CA',
};

// ---------------------------------------------------------------- the climb
// One endless run. Difficulty rises with distance along a single curve and
// stops rising at the cap: STAGE 1 is a stroll, STAGE 10 is the road at full
// fury, and it never gets harder than that. Every new rule switches on at the
// start of the stage that announces it.
const CAP_ROOFS = 110;          // roofs to full difficulty
const STAGE_ROOFS = 11;         // roofs per stage
const MAX_STAGE = 10;
const WORDS = [
  { hz: ['duck', 'drop', 'block', 'guard'], kill: ['cut', 'hit', 'end', 'now'], hook: ['hook', 'rope', 'grip'] },
  { hz: ['duck', 'slide', 'block', 'parry'], kill: ['slash', 'strike', 'blade', 'sever'], hook: ['swing', 'reach', 'climb'] },
  { hz: ['slide', 'evade', 'parry', 'deflect'], kill: ['cleave', 'sunder', 'finish', 'strike'], hook: ['grapple', 'ascend', 'hurtle'] },
];
const STAGE_NOTES = ['', 'the road begins', 'the city stirs', 'more blades on the roofs', 'the chasms widen',
  'the tiles grow brittle', 'they strike twice', 'blades wait in pairs', 'shadows hide in wait',
  'the ronin show no mercy', 'full fury'];
function diffAt(roofs) { const x = clamp(roofs / CAP_ROOFS, 0, 1); return x * x * (3 - 2 * x); }
function stageAt(roofs) { return Math.min(MAX_STAGE, 1 + Math.floor(roofs / STAGE_ROOFS)); }
function tune(d) {
  const tier = d < 0.34 ? 0 : d < 0.64 ? 1 : 2;
  const ramp = (a, b) => clamp((d - a) / (b - a), 0, 1);
  return Object.assign({
    d, speed: lerp(16, 44, d), lead: 150, window: lerp(2.5, 1.15, d),
    hitCost: d < 0.64 ? 1 : 2, cracks: d < 0.35 ? 5 : d < 0.64 ? 4 : 3, roninKills: d >= 0.895,
    roofs: [Math.round(lerp(4, 7, d)), Math.round(lerp(6, 9, d))],
    enemyMul: lerp(0.35, 1.45, d), heartMul: lerp(1.4, 0.55, d), grappleMul: lerp(0.4, 1.3, d), dropMul: lerp(0.3, 1.2, d),
    snuff: lerp(0.6, 0.25, d), maxRun: d < 0.3 ? 1 : d < 0.7 ? 2 : 3,
    twice: d >= 0.495 ? lerp(0.45, 0.7, ramp(0.495, 1)) : 0,
    pairs: d >= 0.645 ? lerp(0.6, 0.9, ramp(0.645, 1)) : 0,
    roninMul: d >= 0.645 ? 1.8 : 1,
    ambush: d >= 0.78 ? lerp(0.4, 0.55, ramp(0.78, 1)) : 0,
    laneJitter: lerp(4, 13, d), gapVar: lerp(14, 34, d), chasm: lerp(76, 96, d),
  }, WORDS[tier]);
}

const RANKS = [
  { name: 'GENIN', tile: 'hanko_genin' },
  { name: 'CHUNIN', tile: 'hanko_chunin' },
  { name: 'JONIN', tile: 'hanko_jonin' },
  { name: 'KAGE', tile: 'hanko_kage' },
];

const KATAS = [
  { name: 'TIGER', clip: 'kata_tiger', cost: 4, rank: 0, desc: 'cut down every foe in sight' },
  { name: 'STILL', clip: 'kata_still', cost: 2, rank: 0, desc: 'stop the pursuit for four breaths' },
  { name: 'SHADOW', clip: 'kata_shadow', cost: 3, rank: 1, desc: 'no blade or arrow can touch you' },
  { name: 'CRANE', clip: 'kata_crane', cost: 3, rank: 2, desc: 'soar far ahead of the pursuit' },
];

const TIERS = [0, 40, 100, 180];
const TIER_NAMES = ['', 'SWIFT', 'FIERCE', 'FLOW'];

// ---------------------------------------------------------------- the worlds
// weights: how often a roof carries each event in this world
const WORLDS = {
  city: {
    name: 'NIGHT CITY', sub: 'rain on the tiles', weather: 'rain',
    roofs: ['town', 'inn', 'temple', 'shrine', 'tower', 'town', 'inn'], span: 'bridge',
    w: { ronin: 0.16, kage: 0.22, archer: 0.16, heart: 0.08, power: 0.34, grapple: 0.14, drop: 0 },
    gate: 'back to the night city',
    lines: [
      'rain on the tiles', 'lanterns sway below', 'the night market hums', 'a cat on the gutter',
      'charcoal smoke rises', 'a bell over the river', 'run the ridge line', 'every roof is a road',
      'quiet feet, fast hands', 'the watch is changing', 'shutters closing tight', 'wet tiles, sure steps',
      'moonlight on the eaves', 'a lamp goes dark', 'this city never sleeps', 'soot and cedar',
      'the gutters sing', 'a drum beats twice', 'long shadows lean', 'the west gate is shut',
      'silk flags in the wind', 'steam from the baths', 'a sentry yawns', 'keep low, keep moving',
      'noodle stalls glow', 'paper doors glow gold', 'the river runs black', 'over the tea house',
      'a kite snaps its line', 'the moon hangs red', 'trust the next roof', 'a crow takes flight',
      'breathe, then leap', 'the alley is empty', 'sandals clatter below', 'an owl calls once',
      'someone is watching', 'follow the lanterns', 'ink drips from eaves', 'gamblers shout below',
    ],
    forks: [['over the temple', 'under the bell tower'], ['high on the wall', 'low past the stables'],
            ['across the pagoda', 'through the market']],
  },
  grove: {
    name: 'BAMBOO GROVE', sub: 'mist between the stalks', weather: 'fireflies',
    roofs: ['hut', 'minka', 'hut', 'hut'], span: 'deck',
    w: { ronin: 0.12, kage: 0.26, archer: 0.08, heart: 0.12, power: 0.36, grapple: 0.26, drop: 0 },
    gate: 'into the bamboo grove',
    lines: [
      'mist between stalks', 'the bamboo creaks', 'dew on every leaf', 'a crane lifts off',
      'green light, soft moss', 'the stalks bend low', 'wind hums in the reeds', 'a fox in the fern',
      'frogs sing at dawn', 'the stream is cold', 'smoke from a hearth', 'straw roofs, still air',
      'the grove breathes', 'step light on bamboo', 'a dragonfly hovers', 'rice terraces shine',
      'the farmer sleeps', 'moss on the stones', 'a spider mends silk', 'sunlight in slivers',
      'the path is hidden', 'tall stalks, no sky', 'a woodpecker knocks', 'the reeds whisper',
      'rope bridges sway', 'hands on the rope', 'the wind turns east', 'fireflies drift up',
      'a heron waits', 'swaying platforms', 'green on green', 'do not look down',
      'roots grip the hill', 'a bell in the wood', 'the mist is lifting', 'soft rain on thatch',
    ],
    forks: [['up the tall stalks', 'down by the stream'], ['over the terraces', 'through the reeds']],
  },
  snow: {
    name: 'SNOW SHRINE PASS', sub: 'the mountain holds its breath', weather: 'snow',
    roofs: ['snowtown', 'snowtemple', 'snowpine', 'snowtown'], span: 'bridge',
    w: { ronin: 0.18, kage: 0.20, archer: 0.12, heart: 0.10, power: 0.3, grapple: 0.14, drop: 0.3 },
    gate: 'up the snow pass',
    lines: [
      'snow on the shrine', 'the pass is silent', 'breath turns to cloud', 'ice on the eaves',
      'a monk sweeps snow', 'pines bow with snow', 'the lanterns are stone', 'cold hands, warm heart',
      'the drifts are deep', 'wolves on the ridge', 'a bell rings once', 'the stars are sharp',
      'footprints fill in', 'prayer flags freeze', 'steam from a spring', 'the peak is white',
      'icicles like teeth', 'the path climbs on', 'snow hides the stairs', 'a torii in snow',
      'the incense is thin', 'still water, thin ice', 'the wind bites', 'a lone pine stands',
      'the moon on snow', 'the shrine gate creaks', 'frost on the rope', 'slow breath, fast feet',
      'the valley is far', 'no sound but snow', 'white roofs below', 'the cold is patient',
    ],
    forks: [['over the shrine', 'under the ice cliff'], ['high on the ridge', 'low by the spring']],
  },
  castle: {
    name: 'CASTLE WALLS', sub: 'the keep burns in the sunset', weather: 'petals',
    roofs: ['keep', 'turretwall', 'sakurawall', 'keep'], span: 'bridge',
    w: { ronin: 0.24, kage: 0.12, archer: 0.28, heart: 0.08, power: 0.32, grapple: 0.16, drop: 0 },
    gate: 'to the castle walls',
    lines: [
      'the keep at sunset', 'petals on the moat', 'white walls, dark tile', 'archers on the wall',
      'the gate is barred', 'gold fish on the ridge', 'banners in the wind', 'the lord is watching',
      'stone upon stone', 'the moat is deep', 'sakura in bloom', 'guards change at dusk',
      'the drums call war', 'arrow slits stare', 'climb the outer wall', 'the inner court waits',
      'a daimyo drinks tea', 'plaster warm with sun', 'the tower bell rings', 'spears catch the light',
      'the sky is burning', 'petals fall like rain', 'honor or nothing', 'over the turret',
      'the wall runs on', 'a hawk above the keep', 'the bridge is raised', 'steel in the shadows',
      'the last light fades', 'silence on the wall', 'pink sky, red sun', 'the keep is near',
    ],
    forks: [['up the high keep', 'down the moat wall'], ['over the turret', 'through the gardens']],
  },
  harbour: {
    name: 'HARBOUR AT DUSK', sub: 'the sea swallows the sun', weather: 'spray',
    roofs: ['warehouse', 'boat', 'warehouse', 'boat'], span: 'pier',
    w: { ronin: 0.12, kage: 0.20, archer: 0.14, heart: 0.10, power: 0.34, grapple: 0.30, drop: 0.2 },
    gate: 'down to the harbour',
    lines: [
      'gulls over the docks', 'the tide is turning', 'salt on the wind', 'boats knock together',
      'nets dry on poles', 'the lighthouse wakes', 'barrels of sake', 'ropes creak on masts',
      'the sea is red', 'sailors sing below', 'fish scales shine', 'the pier is slick',
      'cargo swings above', 'waves slap the hull', 'the harbour master', 'lanterns on the water',
      'a junk drops anchor', 'tar and cedar', 'the tide pulls hard', 'the sun goes under',
      'boats rise and fall', 'masts like a forest', 'the fish market wakes', 'a bell on a buoy',
      'the far islands', 'smoke from the galley', 'jump the gunwale', 'the deck rolls',
      'coins change hands', 'the sails are furled', 'crabs on the stones', 'the last ferry',
    ],
    forks: [['over the masts', 'under the pier'], ['along the warehouses', 'down the docks']],
  },
};
const WORLD_KEYS = ['city', 'grove', 'snow', 'castle', 'harbour'];

// how each roof type is built from atlas pieces
const ROOF_STYLES = {
  town: { face: 'face_kawara', ridge: 'ridge_plain', eave: 'eave_straight', wall: '#0D1220', win: ['shoji_lit', 'shoji_dark'] },
  inn: { face: 'face_terracotta', ridge: 'ridge_plain', eave: 'eave_straight', wall: '#16100E', win: ['shoji_lit', 'shoji_dark'], wallLantern: true },
  temple: { face: 'face_copper', ridge: 'ridge_ornate', curl: 'eave_curl', shachi: true, wall: '#0A1418', win: ['shoji_lit', 'shoji_dark'] },
  shrine: { face: 'face_thatch', ridge: 'ridge_plain', eave: 'eave_straight', wall: '#0D1220', win: ['shoji_dark'], topper: ['shrine', 38, 28] },
  tower: { face: 'face_kawara', ridge: 'ridge_plain', eave: 'eave_straight', wall: '#0D1220', win: ['shoji_lit'], topper: ['yagura', 34, 26] },
  hut: { face: 'face_thatch_grove', ridge: 'ridge_thatch', eave: 'eave_thatch', wallTile: 'wall_bamboo', win: ['window_grove', 'shoji_dark'] },
  minka: { face: 'face_thatch_grove', ridge: 'ridge_thatch', eave: 'eave_thatch', wall: '#1C2616', win: ['window_grove'], topper: ['fence_bamboo', 32, 18] },
  snowtown: { face: 'face_snow', ridge: 'ridge_snow', eave: 'eave_snow', icicles: true, wall: '#0E1420', win: ['shoji_lit', 'shoji_dark'] },
  snowtemple: { face: 'face_snow_temple', ridge: 'ridge_snow', curl: 'eave_curl', icicles: true, wall: '#0A1418', win: ['shoji_lit'], topper: ['toro', 22, 26] },
  snowpine: { face: 'face_snow', ridge: 'ridge_snow', eave: 'eave_snow', icicles: true, wall: '#0E1420', win: ['shoji_dark'], topper: ['pine_small', 32, 42] },
  keep: { face: 'face_black', ridge: 'ridge_gold', curl: 'eave_gold', wallTile: 'wall_plaster', band: 'namako', win: ['window_slit', 'window_castle'], light: true },
  turretwall: { face: 'face_black', ridge: 'ridge_gold', curl: 'eave_gold', wallTile: 'wall_plaster', band: 'namako', win: ['window_slit'], light: true, topper: ['turret', 36, 24] },
  sakurawall: { face: 'face_black', ridge: 'ridge_gold', curl: 'eave_gold', wallTile: 'wall_plaster', band: 'namako', win: ['window_castle'], light: true, topper: ['sakura_small', 36, 24] },
  warehouse: { face: 'face_boards', ridge: 'ridge_boards', eave: 'eave_boards', wallTile: 'wall_planks', win: ['window_port', 'shoji_dark'], topper: ['barrels', 30, 14] },
  boat: { boat: true },
};
// ---------------------------------------------------------------- state
const S = {
  loading: false, ready: false, error: null,
  M: null, img: null, tint: {}, fontY0: 0,
  mode: 'title', t: 0, lastSec: null, dt: 0,
  sel: 0, rankBest: 0, daily: false, best: 0, bestStage: 0,
  R: null, modeT: 0,
  shake: 0, flash: null,
  ctx: null,
};

function loadRank() {
  try {
    S.rankBest = Math.max(0, Math.min(3, parseInt(localStorage.getItem('typemaxx.kata.rank') || '0', 10) || 0));
    S.best = parseInt(localStorage.getItem('typemaxx.kata.best') || '0', 10) || 0;
    S.bestStage = parseInt(localStorage.getItem('typemaxx.kata.stage') || '0', 10) || 0;
  } catch (e) { S.rankBest = 0; S.best = 0; }
}
function saveStage(st) {
  if (st <= S.bestStage) return false;
  S.bestStage = st;
  try { localStorage.setItem('typemaxx.kata.stage', String(st)); } catch (e) {}
  return true;
}
function saveBest(score) {
  if (score <= S.best) return false;
  S.best = score;
  try { localStorage.setItem('typemaxx.kata.best', String(score)); } catch (e) {}
  return true;
}
function saveRank(r) {
  if (r <= S.rankBest) return false;
  S.rankBest = r;
  try { localStorage.setItem('typemaxx.kata.rank', String(r)); } catch (e) {}
  return true;
}

async function loadAssets() {
  if (S.loading || S.ready) return;
  S.loading = true;
  try {
    const M = await (await fetch(BASE + 'manifest.json')).json();
    const img = new Image();
    img.crossOrigin = 'anonymous';           // must precede src, or WebGL upload taints
    await new Promise((resolve, reject) => {
      // onload rather than decode(): decode() can stall in a background tab
      img.onload = resolve;
      img.onerror = () => reject(new Error('atlas.png failed to load'));
      img.src = BASE + 'atlas.png';
    });
    S.M = M; S.img = img;
    buildTints();
    S.ready = true;
  } catch (e) {
    S.error = String(e && e.message || e);
  }
  S.loading = false;
}

// Tint only the band of the atlas that holds the fonts, once per colour.
function buildTints() {
  let y0 = 1e9, y1 = 0;
  for (const face of Object.values(S.M.fonts)) {
    for (const g of Object.values(face.glyphs)) {
      y0 = Math.min(y0, g[1]); y1 = Math.max(y1, g[1] + g[3]);
    }
  }
  S.fontY0 = y0;
  const w = S.img.width, h = y1 - y0;
  for (const [name, css] of Object.entries(COL)) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(S.img, 0, y0, w, h, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = css;
    g.fillRect(0, 0, w, h);
    S.tint[name] = c;
  }
}

// ---------------------------------------------------------------- utils
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash(i, k) {
  let x = (i * 374761393 + k * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, u) => a + (b - a) * u;
function wrapX(x, p) { return ((x % p) + p) % p; }

function wrapText(text, maxc) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur.length) cur = w;
    else if (cur.length + 1 + w.length <= maxc) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur.length) lines.push(cur);
  // every line but the last ends with the space that joins it to the next,
  // so the player types the passage exactly as written
  return lines.map((l, i) => i < lines.length - 1 ? l + ' ' : l);
}

// ---------------------------------------------------------------- drawing
function ctx() { return S.ctx; }

function put(name, i, x, y, alpha) {
  const c = S.M.clips[name];
  if (!c || !c.frames.length) return;
  const n = c.frames.length;
  const f = c.frames[((Math.floor(i) % n) + n) % n];
  const g = ctx();
  if (alpha != null && alpha < 1) { g.globalAlpha = alpha; }
  g.drawImage(S.img, f[0], f[1], f[2], f[3],
    Math.round(x - c.anchor[0]), Math.round(y - c.anchor[1]), f[2], f[3]);
  if (alpha != null && alpha < 1) g.globalAlpha = 1;
}
function putScaled(name, i, cx, cy, s) {
  const c = S.M.clips[name];
  if (!c) return;
  const n = c.frames.length;
  const f = c.frames[clamp(Math.floor(i), 0, n - 1)];
  ctx().drawImage(S.img, f[0], f[1], f[2], f[3],
    Math.round(cx - f[2] * s / 2), Math.round(cy - f[3] * s / 2), f[2] * s, f[3] * s);
}
function frameOf(name, sec) {
  const c = S.M.clips[name];
  return c ? Math.floor(sec * 1000 / c.ms) : 0;
}
function tile(name) { return S.M.tiles[name]; }
function blit(name, x, y, w, h) {
  const t = tile(name); if (!t) return;
  const cw = w == null ? t[2] : w, ch = h == null ? t[3] : h;
  if (cw <= 0 || ch <= 0) return;
  ctx().drawImage(S.img, t[0], t[1], cw, ch, Math.round(x), Math.round(y), cw, ch);
}
function blitScaled(name, x, y, s) {
  const t = tile(name); if (!t) return;
  ctx().drawImage(S.img, t[0], t[1], t[2], t[3], Math.round(x), Math.round(y), t[2] * s, t[3] * s);
}
function blitFlip(name, x, y) {
  const t = tile(name); if (!t) return;
  const g = ctx();
  g.save();
  g.translate(Math.round(x) + t[2], Math.round(y));
  g.scale(-1, 1);
  g.drawImage(S.img, t[0], t[1], t[2], t[3], 0, 0, t[2], t[3]);
  g.restore();
}
function tileAcross(name, x, y, w) {
  const t = tile(name); if (!t) return;
  for (let cx = 0; cx < w; cx += t[2]) blit(name, x + cx, y, Math.min(t[2], w - cx), t[3]);
}
function rect(x, y, w, h, css) {
  const g = ctx();
  g.fillStyle = css;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function frame1(x, y, w, h, css) {
  rect(x, y, w, 1, css); rect(x, y + h - 1, w, 1, css);
  rect(x, y, 1, h, css); rect(x + w - 1, y, 1, h, css);
}

// ---- text, from the pre-tinted font band
function face(name) { return S.M.fonts[name]; }
function textW(fname, str, s) {
  s = s || 1;
  const G = face(fname).glyphs;
  let w = 0;
  for (let i = 0; i < str.length; i++) { const g = G[str[i]]; if (g) w += g[4] * s; }
  return w;
}
function text(fname, str, x, y, colour, s) {
  s = s || 1;
  const sheet = S.tint[colour] || S.tint.ink;
  const G = face(fname).glyphs;
  let pen = Math.round(x);
  const top = Math.round(y), g2 = ctx();
  for (let i = 0; i < str.length; i++) {
    const g = G[str[i]];
    if (!g) { pen += 3 * s; continue; }
    if (g[2] && g[3]) {
      g2.drawImage(sheet, g[0], g[1] - S.fontY0, g[2], g[3],
        pen + g[5] * s, top + g[6] * s, g[2] * s, g[3] * s);
    }
    pen += g[4] * s;
  }
  return pen;
}
function textC(fname, str, cx, y, colour, s) {
  return text(fname, str, Math.round(cx - textW(fname, str, s) / 2), y, colour, s);
}
function textR(fname, str, rx, y, colour, s) {
  return text(fname, str, Math.round(rx - textW(fname, str, s)), y, colour, s);
}
// one roof-board glyph centred in its monospaced cell
function cell(ch, x, y, colour) {
  const G = face('small').glyphs, g = G[ch];
  if (!g) return;
  text('small', ch, x + Math.floor((ADV - g[4]) / 2), y, colour);
}


// ---------------------------------------------------------------- backdrops
function strip(name, y, scroll, factor) {
  const t = tile(name); if (!t) return;
  const off = -wrapX(scroll * factor, 320);
  for (let k = 0; k <= 1; k++) blit(name, off + k * 320, y);
}
// a landmark on a parallax layer, repeating every `period` pixels
function mark(name, x, y, scroll, factor, period) {
  period = period || 320;
  const off = -wrapX(scroll * factor, period);
  for (let k = -1; k <= Math.ceil(LW / period); k++) blit(name, off + k * period + x, y);
}
function stars(tt, n, col) {
  const g = ctx();
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const sx = (i * 97 + 13) % 320, sy = (i * 61 + 7) % 96;
    if (((tt * 1.1 + i) | 0) % 5) g.fillRect(sx, sy, 1, 1);
  }
}

const BACKDROP = {
  city(scroll, tt) {
    blit('sky', 0, 0);
    rect(0, 120, LW, VOID_Y - 120, '#1C263E');
    stars(tt, 36, COL.dim);
    const ss = tt % 9;
    if (ss < 0.5) {
      const p = ss / 0.5, x0 = 50 + p * 150, y0 = 18 + p * 26, g = ctx();
      g.fillStyle = COL.ink;
      for (let k = 0; k < 6; k++) g.fillRect(Math.round(x0 - k * 2), Math.round(y0 - k * 0.5), 2, 1);
    }
    blit('moon', 244, 20);
    for (let i = 0; i < 4; i++) {
      blit('cloud_long', wrapX(i * 110 - scroll * 0.05 - tt * 4, 400) - 40, 18 + i * 19);
      blit('cloud_short', wrapX(i * 90 + 50 - scroll * 0.07 - tt * 6, 400) - 40, 30 + i * 17);
    }
    for (let i = 0; i < 3; i++) {
      const a = tt / 1.4 + i * 2.1;
      blit(((tt * 4.5 | 0) + i) % 2 ? 'crow_a' : 'crow_b', 256 + Math.cos(a) * 26, 34 + Math.sin(a) * 8);
    }
    for (let i = 0; i < 5; i++) {
      const lx = wrapX(i * 67 + 20 - scroll * 0.15 + Math.sin(tt * 1.1 + i) * 6, 340) - 10;
      const ly = wrapX(i * 43 - tt * 12, 150) - 10;
      blit(i % 2 ? 'sky_lantern' : 'sky_lantern_dim', lx, ly);
    }
    strip('ridge_far', 90, scroll, 0.10);
    mark('pagoda_b', 60, 97, scroll, 0.22);
    mark('pagoda_a', 224, 119, scroll, 0.22);
    strip('ridge_mid', 106, scroll, 0.22);
    mark('torii', 150, 144, scroll, 0.36);
    strip('ridge_near', 120, scroll, 0.36);
  },
  grove(scroll, tt) {
    blit('sky_grove', 0, 0);
    rect(0, 120, LW, VOID_Y - 120, '#15261C');
    blit('sun_grove', 56, 20);
    for (let i = 0; i < 3; i++) {
      blit('cloud_long', wrapX(i * 130 - scroll * 0.04 - tt * 3, 420) - 50, 30 + i * 14);
    }
    strip('ridge_grove_far', 84, scroll, 0.10);
    mark('minka_far', 150, 98, scroll, 0.16, 280);
    strip('ridge_grove_mid', 104, scroll, 0.22);
    mark('bamboo_stand', 20, 60, scroll, 0.30, 180);
    mark('bamboo_stand', 110, 72, scroll, 0.30, 240);
    strip('ridge_grove_near', 124, scroll, 0.36);
    for (let i = 0; i < 3; i++) {
      const a = tt * 0.9 + i * 2.4;
      const dx = wrapX(i * 110 + tt * 14 - scroll * 0.2, 360) - 20;
      blit(((tt * 12 | 0) + i) % 2 ? 'dragonfly_a' : 'dragonfly_b', dx, 50 + Math.sin(a * 2.3) * 10 + i * 12);
    }
  },
  snow(scroll, tt) {
    blit('sky_snow', 0, 0);
    rect(0, 120, LW, VOID_Y - 120, '#18203A');
    stars(tt, 48, '#8A98C0');
    blit('moon_snow', 232, 16);
    strip('ridge_snow_far', 78, scroll, 0.10);
    mark('pagoda_snow', 70, 66, scroll, 0.18, 300);
    strip('ridge_snow_mid', 102, scroll, 0.22);
    mark('pine_snow', 30, 100, scroll, 0.30, 150);
    mark('pine_snow', 96, 108, scroll, 0.30, 210);
    strip('ridge_snow_near', 124, scroll, 0.36);
    for (let i = 0; i < 2; i++) {
      const a = tt / 1.6 + i * 3;
      blit(((tt * 4 | 0) + i) % 2 ? 'crow_a' : 'crow_b', 90 + Math.cos(a) * 30 + i * 60, 40 + Math.sin(a) * 6);
    }
  },
  castle(scroll, tt) {
    blit('sky_castle', 0, 0);
    rect(0, 120, LW, VOID_Y - 120, '#321628');
    blit('sun_castle', 196, 38);
    for (let i = 0; i < 3; i++) {
      blit('cloud_long', wrapX(i * 120 - scroll * 0.05 - tt * 4, 420) - 50, 22 + i * 16);
    }
    strip('ridge_castle_far', 86, scroll, 0.10);
    mark('castle_keep', 180, 46, scroll, 0.14, 420);
    strip('ridge_castle_mid', 106, scroll, 0.22);
    mark('sakura_tree', 40, 112, scroll, 0.32, 190);
    strip('ridge_castle_near', 126, scroll, 0.36);
    const cx0 = 380 - (tt % 40) * 18;
    for (let i = 0; i < 5; i++) {
      const dx = Math.abs(i - 2) * 14, dy = Math.abs(i - 2) * 6;
      blit(((tt * 3.8 | 0) + i) % 2 ? 'crane_a' : 'crane_b', cx0 + dx, 30 + dy);
    }
    blit('kite', 40 + Math.sin(tt * 0.7) * 6, 24 + Math.cos(tt * 0.9) * 4);
  },
  harbour(scroll, tt) {
    blit('sky_harbour', 0, 0);
    rect(0, 110, LW, VOID_Y - 110, '#2A1434');
    blit('sun_harbour', 220, 70);
    for (let i = 0; i < 3; i++) {
      blit('cloud_short', wrapX(i * 100 - scroll * 0.05 - tt * 5, 400) - 30, 26 + i * 15);
    }
    strip('ridge_harbour_far', 52, scroll, 0.06);
    // the sea does not scroll much; its glints drift instead
    const soff = -wrapX(scroll * 0.08 + tt * 2, 320);
    for (let k = 0; k <= 1; k++) blit('sea', soff + k * 320, 110);
    mark('junk', 60, 92, scroll + tt * 20, 0.14, 360);
    mark('lighthouse', 250, 70, scroll, 0.2, 400);
    strip('ridge_harbour_near', 134, scroll, 0.36);
    for (let i = 0; i < 4; i++) {
      const a = tt / 1.2 + i * 1.7;
      blit(((tt * 5 | 0) + i) % 2 ? 'gull_a' : 'gull_b', wrapX(i * 80 - tt * 10, 360) - 20, 44 + Math.sin(a) * 6 + i * 5);
    }
  },
};

// below the roofs: the dark street, or the harbour water
function drawVoid(wk, scroll, tt) {
  if (wk === 'harbour') {
    rect(0, VOID_Y, LW, LH - VOID_Y, '#1A0C24');
    const g = ctx();
    for (let i = 0; i < 22; i++) {
      const y = VOID_Y + 4 + (i * 7) % 46;
      const x = wrapX(i * 71 - scroll * (0.5 + (i % 3) * 0.15) + Math.sin(tt + i) * 4, 360) - 20;
      g.fillStyle = i % 4 ? '#3A1C3A' : '#8A3E3A';
      g.fillRect(Math.round(x), y, 6 + (i % 5) * 3, 1);
    }
  } else {
    rect(0, VOID_Y, LW, LH - VOID_Y, wk === 'snow' ? '#05070E' : '#000');
  }
}

// weather sits in front of the roofs but behind the HUD
function drawWeather(wk, scroll, tt) {
  const g = ctx();
  if (wk === 'city') {
    for (let i = 0; i < 22; i++)
      blit('rain', wrapX(i * 53 - tt * 50 - scroll * 0.3, 340) - 10, wrapX(i * 37 + tt * 160, 190) - 10);
  } else if (wk === 'snow') {
    for (let i = 0; i < 46; i++) {
      const x = wrapX(i * 43 - scroll * 0.4 + Math.sin(tt * 0.8 + i) * 8, 330) - 5;
      const y = wrapX(i * 29 + tt * (14 + (i % 4) * 5), 250) - 5;
      g.fillStyle = i % 3 ? '#DCE6F4' : '#8A98B8';
      g.fillRect(Math.round(x), Math.round(y), i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
  } else if (wk === 'castle') {
    for (let i = 0; i < 26; i++) {
      const x = wrapX(i * 61 - scroll * 0.45 - tt * 18 + Math.sin(tt * 1.4 + i) * 10, 340) - 10;
      const y = wrapX(i * 37 + tt * (18 + (i % 3) * 6), 250) - 5;
      g.fillStyle = i % 2 ? '#F4B8CA' : '#DC86A2';
      g.fillRect(Math.round(x), Math.round(y), 2, 1);
      if (((tt * 3 + i) | 0) % 2) g.fillRect(Math.round(x) + 1, Math.round(y) + 1, 1, 1);
    }
  } else if (wk === 'grove') {
    for (let i = 0; i < 18; i++) {
      const x = wrapX(i * 83 - scroll * 0.3 + Math.sin(tt * 0.6 + i * 1.3) * 14, 340) - 10;
      const y = 40 + (i * 53) % 140 + Math.cos(tt * 0.7 + i) * 8;
      const on = Math.sin(tt * 2.2 + i * 1.7) > 0.1;
      if (!on) continue;
      g.fillStyle = 'rgba(214,240,120,0.25)';
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      g.fillStyle = '#E8F890';
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  } else if (wk === 'harbour') {
    for (let i = 0; i < 10; i++) {
      const x = wrapX(i * 97 - scroll * 0.6 - tt * 30, 360) - 20;
      const y = 176 + ((i * 13) % 14) - ((tt * 20 + i * 7) % 24);
      g.fillStyle = 'rgba(240,210,200,0.35)';
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
}

// ---------------------------------------------------------------- roofs
// A roof with its building, drawn at screen x. Returns the kanban board rect.
function drawRoof(o, x, ry, sink) {
  ry = ry + (sink || 0);
  const w = o.w, type = o.type, seed = o.seed;
  if (type === 'bridge' || type === 'deck' || type === 'pier') return drawSpan(o, x, ry);
  const st = ROOF_STYLES[type] || ROOF_STYLES.town;
  if (st.boat) return drawBoat(o, x, ry);
  const wallTop = ry + 17;
  if (st.wallTile) {
    const t = tile(st.wallTile);
    for (let yy = wallTop; yy < LH; yy += t[3]) tileAcross(st.wallTile, x + 2, yy, w - 4);
  } else {
    rect(x + 2, wallTop, w - 4, LH - wallTop, st.wall);
  }
  if (st.band) tileAcross(st.band, x + 2, wallTop + 40, w - 4);
  for (let k = 0, wx = x + 14; wx < x + w - 22; wx += 30, k++) {
    blit(st.win[Math.floor(hash(seed, 10 + k) * st.win.length)], wx, wallTop + 22);
  }
  // the kanban signboard: the road's words are written here
  const kx = x + 6, kw = w - 12;
  tileAcross('kanban_mid', kx + 5, wallTop + 3, kw - 10);
  blit('kanban_end', kx, wallTop + 3);
  blitFlip('kanban_end', kx + kw - 5, wallTop + 3);
  tileAcross('eave_shadow', x, ry + 14, w);
  tileAcross(st.face, x, ry, w);
  if (st.icicles) tileAcross('icicles', x, ry + 14, w);
  if (st.curl) {
    tileAcross(st.ridge, x - 4, ry - 5, w + 8);
    blit(st.curl, x - 10, ry + 8);
    blitFlip(st.curl, x + w - 2, ry + 8);
  } else {
    tileAcross(st.ridge, x - 2, ry - 4, w + 4);
    blit(st.eave, x - 5, ry + 11);
    blitFlip(st.eave, x + w - 1, ry + 11);
  }
  if (st.shachi) {
    blit('shachihoko', x - 6, ry - 13);
    blitFlip('shachihoko', x + w - 2, ry - 13);
  }
  if (st.topper && !o.enemy && !o.gate && !(o.guard)) {
    const [name, dx, dy] = st.topper;
    blit(name, x + w - dx, ry - dy);
  }
  if (st.wallLantern) blit('lantern', x + w - 12, wallTop + 20);
  if (o.gate) blit('gate_torii', x + Math.round(w / 2) - 30, ry - 50);
  return { x: kx, y: wallTop + 3, w: kw, h: 14, textY: wallTop + 6 };
}

// walkways: city and castle bridges, bamboo decks, harbour piers
function drawSpan(o, x, ry) {
  const w = o.w, type = o.type;
  if (type === 'deck') {
    tileAcross('rail_rope', x, ry - 8, w);
    tileAcross('deck_bamboo', x, ry - 2, w);
    for (const px of [x + 6, x + w - 9]) {
      rect(px, ry + 4, 3, LH - ry, '#3A4A22');
      rect(px + 2, ry + 4, 1, LH - ry, '#5E7430');
    }
  } else {
    tileAcross('railing', x, ry - 8, w);
    tileAcross('planks', x, ry - 2, w);
    const post = type === 'pier' ? '#1E120E' : '#2A1C12';
    for (let px = x + 6; px < x + w - 4; px += type === 'pier' ? 28 : w - 15) {
      rect(px, ry + 4, 3, LH - ry, post);
    }
  }
  rect(x + 8, ry + 8, w - 16, 14, '#0A0D12');
  frame1(x + 8, ry + 8, w - 16, 14, COL.shade);
  return { x: x + 8, y: ry + 8, w: w - 16, h: 14, textY: ry + 11 };
}

function drawBoat(o, x, ry) {
  const w = o.w;
  // the deck is where the ninja stands; the hull rides in the water below it
  tileAcross('planks', x, ry - 2, w);
  tileAcross('hull_mid', x + 12, ry + 4, w - 24);
  blit('hull_bow', x + w - 14, ry + 4);
  blitFlip('hull_bow', x - 4, ry + 4);
  rect(x + 8, ry + 6, w - 16, 14, '#0A0D12');
  frame1(x + 8, ry + 6, w - 16, 14, '#5A3822');
  if (!o.enemy && !o.guard && !o.gate) blit('mast', x + Math.round(w * 0.55), ry - 40);
  return { x: x + 8, y: ry + 6, w: w - 16, h: 14, textY: ry + 9 };
}

// ---------------------------------------------------------------- the road
function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
const randInt = (a, b, rnd) => a + Math.floor(rnd() * (b - a + 1));

function wordsOf(str) {
  const out = [];
  const re = /[A-Za-z']+/g;
  let m;
  while ((m = re.exec(str))) out.push({ start: m.index, end: m.index + m[0].length, w: m[0] });
  return out;
}

function makeOpt(textStr, x, lane, rnd, wk, type, jitter) {
  const len = textStr.length;
  return {
    world: wk, text: textStr, len, x, lane, type,
    ry: LANES[lane] + Math.round((rnd() - 0.5) * 2 * (jitter || 5)),
    w: len * ADV + PADX * 2 + Math.round(rnd() * 10) * 4,
    seed: Math.floor(rnd() * 1e6),
    marks: new Uint8Array(len), flaw: new Uint8Array(len),
    guard: null, enemy: null, drop: null, power: null, snuff: null, heart: null,
    grapple: null, hookPost: false, gate: false, route: null, crumble: null,
    cracks: 0, crackXs: [], holes: [], errs: 0, errT: -9, errI: 0,
  };
}
// a boat rides the swell; everything else stands still
function bobOf(o) { return o.type === 'boat' ? Math.round(Math.sin(S.t * 1.7 + o.seed) * 2) : 0; }
function footY(o) { return o.ry + bobOf(o) - 2; }
function charX(o, i) { return o.x + PADX + i * ADV; }
function enemyX(o) { return charX(o, o.len) + 16; }

function addGuard(opt) {
  let best = null;
  for (const wd of wordsOf(opt.text)) {
    if (wd.start < 6) continue;                 // never the first word: he needs runway
    if (wd.end > opt.len - 2) continue;         // and room behind him to stand
    if (wd.w.length < 4) continue;
    if (!best || wd.w.length > best.w.length) best = wd;
  }
  if (best) {
    opt.guard = { start: best.start, end: best.end, state: 'waiting', corpseT: null };
    opt.w = Math.max(opt.w, charX(opt, best.end) + 30 - opt.x);
  }
  return !!best;
}

function freeSpan(opt, wd) {
  const clash = r => r && wd.end > r.start - 1 && wd.start < r.end + 1;
  return !clash(opt.guard) && !clash(opt.power) && !clash(opt.snuff);
}

function addPower(opt) {
  for (const wd of wordsOf(opt.text)) {
    if (wd.w.length < 5 || !freeSpan(opt, wd)) continue;
    if (opt.enemy && wd.start <= opt.enemy.at && wd.end >= opt.enemy.at) continue;
    opt.power = { start: wd.start, end: wd.end, state: 'pending' };
    return true;
  }
  return false;
}

function makeHazard(kind, word, D, scale) {
  return {
    kind, word, state: 'pending', t: 0, T: (D.window + word.length * 0.14) * (scale || 1),
    typed: '', result: null, doneT: 0, badT: -9, startT: 0, owner: null, opt: null,
  };
}

function addEnemy(opt, kind, rnd, D, wk, minAt) {
  // in the snow they wait in the drifts and show late; later on, everywhere
  const late = wk === 'snow' || rnd() < D.ambush;
  let at = late ? Math.max(3, opt.len - 4) : clamp(Math.floor(opt.len * (0.35 + rnd() * 0.25)), 3, opt.len - 3);
  if (minAt) { if (minAt > opt.len - 2) return false; at = Math.max(at, minAt); }
  const word = kind === 'kage' ? pick(D.hz.slice(0, 2), rnd) : pick(D.hz.slice(2), rnd);
  const hz = makeHazard(kind === 'kage' ? 'shuriken' : 'arrow', word, D, late ? 0.85 : 1);
  opt.enemy = { kind, at, state: 'waiting', hz, deadT: null, killWord: pick(D.kill, rnd), hidden: late };
  hz.owner = opt.enemy;
  if (rnd() < D.twice) {
    const w2 = kind === 'kage' ? pick(D.hz.slice(0, 2), rnd) : pick(D.hz.slice(2), rnd);
    opt.enemy.hz2 = makeHazard(hz.kind, w2, D, 0.9);
  }
  opt.w = Math.max(opt.w, opt.len * ADV + PADX * 2 + 36);
  // a blue word before he acts snuffs the post lantern: he never sees you
  if (rnd() < D.snuff) {
    for (const wd of wordsOf(opt.text)) {
      if (wd.w.length >= 3 && wd.end <= at - 1 && freeSpan(opt, wd)) {
        opt.snuff = { start: wd.start, end: wd.end, state: 'pending', t: 0 };
        break;
      }
    }
  }
  return true;
}

function newRun() {
  const D = tune(0);
  let seed = (Math.random() * 1e9) | 0;
  if (S.daily) {
    const d = new Date();
    const key = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    seed = Math.floor(hash(key, 101) * 1e9);
  }
  const rnd = mulberry32(seed);
  S.R = {
    D, rnd, seed, daily: S.daily,
    slots: [], spans: [], used: {}, order: [], seg: -1, segBuilt: 0, loop: 0,
    nextX: 0, lane: 1, enemyRun: 0,
    si: 0, choice: 0, ci: 0, fromOpt: null, pending: false,
    drawX: 0, targetX: 0, cam: 0, jump: null, jumpY: 0,
    hearts: 4, maxHearts: 5, stage: 1, stageBanner: null,
    segs: 0, combo: 0, maxCombo: 0, tier: 0,
    score: 0, typed: 0, errors: 0, start: 0, end: 0,
    hazard: null, enc: null, duel: null, grap: null, anim: null,
    stillT: 0, shadowT: 0, hitstop: 0, stunT: 0, idleT: 0,
    menu: null, slam: null, fx: [], flying: [], dead: null, banner: null,
    kills: 0, parries: 0, dodges: 0, catches: 0, powers: 0, lanterns: 0, grapples: 0,
    snuffed: 0, cleanRoofs: 0, roofs: 0, breaks: 0, cleared: 0, worldLog: [],
    trail: [], lastLandT: -9,
  };
  const R = S.R;
  ensureRoad();
  const o0 = R.slots[0].opts[0];
  R.fromOpt = o0;
  R.drawX = R.targetX = charX(o0, 0) + ADV / 2;
  R.cam = R.drawX - D.lead;
  R.seg = 0;
  R.banner = { wk: o0.world, t0: S.t + 2.2 };
  R.worldLog.push({ wk: o0.world, roofs: 0, kills: 0 });
}

// keep at least a few segments of road ahead of the runner
function ensureRoad() {
  const R = S.R;
  while (R.slots.length - R.si < 14) {
    if (R.segBuilt % 5 === 0) {
      const last = R.order.length ? R.order[R.order.length - 1] : null;
      let next = shuffle(WORLD_KEYS.slice(), R.rnd);
      if (next[0] === last) next.push(next.shift());
      R.order = R.order.concat(next);
    }
    genSegment(R.order[R.segBuilt], R.segBuilt);
    R.segBuilt++;
  }
}

function takeLine(wk, d) {
  const R = S.R, W = WORLDS[wk];
  const used = R.used[wk] || (R.used[wk] = []);
  let pool = W.lines.filter(l => used.indexOf(l) < 0);
  if (!pool.length) { used.length = 0; pool = W.lines.slice(); }
  // early roofs lean short, later ones lean long
  const a = pick(pool, R.rnd), b = pick(pool, R.rnd);
  const longer = a.length >= b.length ? a : b, shorter = a.length >= b.length ? b : a;
  const line = R.rnd() < 0.25 + 0.6 * (d || 0) ? longer : shorter;
  used.push(line);
  return line;
}

function genSegment(wk, seg) {
  const R = S.R, rnd = R.rnd, W = WORLDS[wk];
  let D = tune(diffAt(R.slots.length));
  const count = randInt(D.roofs[0], D.roofs[1], rnd);
  const forkAt = rnd() < 0.8 ? randInt(2, Math.max(2, count - 2), rnd) : -1;
  let x = R.nextX, lane = R.lane, enemies = 0, lastGrapple = false;
  const segOpts = [];
  R.spans.push({ wk, seg, x0: x });

  for (let k = 0; k < count; k++) {
    const gate = k === 0 && seg > 0;
    const quiet = gate || (seg === 0 && k < 2);
    if (k > 0) {
      const r = rnd();
      if (r < 0.34) lane = Math.max(0, lane - 1);
      else if (r < 0.68) lane = Math.min(2, lane + 1);
    }
    D = tune(diffAt(R.slots.length));
    let type = pick(W.roofs, rnd);
    if (!quiet && lane === 2 && rnd() < 0.3) type = W.span;
    const text = gate ? W.gate : takeLine(wk, D.d);
    const opt = makeOpt(text, x, lane, rnd, wk, type, D.laneJitter);
    opt.gate = gate;
    if (R.pendingHook) { opt.hookPost = true; R.pendingHook = false; }

    if (!quiet) {
      const w = W.w, m = D.enemyMul;
      const r = rnd();
      const canEnemy = R.enemyRun < D.maxRun;
      if (canEnemy && r < w.ronin * m * D.roninMul && addGuard(opt)) {
        R.enemyRun++; enemies++;
        // later on the ronin does not stand alone
        if (rnd() < D.pairs) addEnemy(opt, rnd() < 0.5 ? 'kage' : 'archer', rnd, D, wk, opt.guard.end + 2);
      }
      else if (canEnemy && r < (w.ronin * D.roninMul + w.kage) * m) { addEnemy(opt, 'kage', rnd, D, wk); R.enemyRun++; enemies++; }
      else if (canEnemy && r < (w.ronin * D.roninMul + w.kage + w.archer) * m) { addEnemy(opt, 'archer', rnd, D, wk); R.enemyRun++; enemies++; }
      else {
        R.enemyRun = 0;
        if (w.drop && rnd() < w.drop * D.dropMul) {
          opt.drop = makeHazard(wk === 'snow' ? 'icicle' : 'crate', pick(D.hz.slice(0, 2), rnd), D);
          opt.drop.at = clamp(Math.floor(opt.len * 0.5), 3, opt.len - 3);
        } else if (rnd() < w.heart * D.heartMul) {
          opt.heart = { i: clamp(randInt(2, opt.len - 3, rnd), 1, opt.len - 1), taken: false };
        }
      }
      if (rnd() < w.power) addPower(opt);
      if ((opt.enemy || opt.guard) && (type === 'bridge' || type === 'deck' || type === 'pier')) opt.type = pick(W.roofs, rnd);
    }
    R.slots.push({ kind: 'line', opts: [opt], seg, world: wk });
    segOpts.push(opt);
    let gap = 22 + Math.round(rnd() * D.gapVar);

    // a chasm the hook must cross
    if (!quiet && !lastGrapple && k < count - 1 && k !== forkAt && rnd() < W.w.grapple * D.grappleMul) {
      opt.grapple = { word: pick(D.hook, rnd) };
      gap = Math.round(D.chasm + rnd() * 12);
      R.pendingHook = true;
      lastGrapple = true;
    } else lastGrapple = false;
    x = opt.x + opt.w + gap;

    // a fork in the road
    if (k === forkAt && !opt.grapple) {
      const pair = pick(W.forks, rnd);
      const hi = makeOpt(pair[0], x, 0, rnd, wk, pick(W.roofs, rnd), 0);
      const lo = makeOpt(pair[1], x, 2, rnd, wk, pick(W.roofs, rnd), 0);
      hi.ry = LANES[0]; lo.ry = LANES[2];
      hi.route = 'high'; lo.route = 'low';
      addGuard(hi);
      hi.heart = { i: 3, taken: false };
      addEnemy(lo, 'kage', rnd, D, wk);
      lo.snuff = null;
      R.slots.push({ kind: 'fork', opts: [hi, lo], seg, world: wk });
      x = Math.max(hi.x + hi.w, lo.x + lo.w) + 28 + Math.round(rnd() * 16);
      lane = 1;
      R.enemyRun = 1;
    }
  }
  // every world shows its teeth at least once
  if (!enemies) {
    const cands = segOpts.filter((o, i) => i > 0 && !o.gate && !o.guard && !o.enemy && !o.drop);
    if (cands.length) {
      const o = pick(cands, rnd);
      o.heart = null;
      addEnemy(o, rnd() < 0.5 ? 'kage' : 'archer', rnd, D, wk);
      if (o.power && o.enemy && o.power.start <= o.enemy.at && o.power.end >= o.enemy.at) o.power = null;
    }
  }
  R.nextX = x;
  R.lane = lane;
}

function worldAt(xw) {
  const sp = S.R.spans;
  let cur = sp[0], next = null;
  for (let i = 0; i < sp.length; i++) {
    if (sp[i].x0 <= xw) { cur = sp[i]; next = sp[i + 1] || null; }
  }
  return { cur, next };
}

// ---------------------------------------------------------------- run helpers
function curOpt() {
  const R = S.R;
  if (R.pending) return null;
  const slot = R.slots[R.si];
  return slot ? slot.opts[R.choice] : null;
}
function hereOpt() { return curOpt() || S.R.fromOpt; }

function addFx(clip, x, y, opts) {
  S.R.fx.push(Object.assign({ clip, x, y, t0: S.t, scale: 1 }, opts || {}));
}
function embers(x, y, n, colour, up) {
  for (let i = 0; i < n; i++) {
    const a = hash(Math.floor(S.t * 1000) + i, 7) * Math.PI * 2;
    const sp = 12 + hash(i, Math.floor(S.t * 100)) * 34;
    S.R.fx.push({
      dot: true, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (up || 20),
      life: 0.5 + hash(i, 3) * 0.6, t0: S.t, col: colour,
    });
  }
}
function flash(css, dur) { S.flash = { css, t0: S.t, dur }; }
function shake(amount) { S.shake = Math.max(S.shake, amount); }

function setTier() {
  const R = S.R;
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (R.combo >= TIERS[i]) t = i;
  if (t > R.tier) embers(R.drawX, footY(hereOpt()) - 18, 14, COL.gold, 30);
  R.tier = t;
}
function goodKey() {
  const R = S.R;
  R.combo++;
  R.maxCombo = Math.max(R.maxCombo, R.combo);
  R.score += 10 * (1 + R.tier);
  R.idleT = 0;
  setTier();
}
function mistake() {
  const R = S.R;
  R.errors++;
  const drop = Math.max(0, R.tier - 1);
  R.combo = Math.min(R.combo, TIERS[drop]);
  setTier();
}

function die(cause) {
  const R = S.R;
  if (R.dead) return;
  R.dead = { cause, t0: S.t };
  R.end = S.t;
  R.anim = null;
  shake(3); flash('rgba(200,30,40,0.55)', 0.35);
  addFx('blood_spray', R.drawX + 2, (R.jump || R.grap ? R.jumpY : footY(hereOpt())) - 18);
}

// every blow that lands goes through here
function loseHeart(cause, n) {
  const R = S.R;
  if (R.dead) return;
  const o = hereOpt();
  if (R.shadowT > 0) { embers(R.drawX, footY(o) - 18, 8, COL.sky, 10); return; }
  R.hearts -= n || 1;
  R.anim = { clip: 'ninja_stumble', t0: S.t, dur: 0.42 };
  shake(3);
  flash('rgba(224,40,50,0.35)', 0.22);
  addFx('blood_spray', R.drawX + 2, footY(o) - 18);
  if (R.hearts <= 0) die(cause);
}

// a wrong key cracks the tiles underfoot; the third crack gives way
function crack(o) {
  const R = S.R;
  if (!o || R.dead) return;
  o.cracks++;
  o.crackXs.push(Math.round(R.drawX - o.x) + ((o.cracks * 7) % 9) - 4);
  shake(1);
  if (o.cracks >= R.D.cracks) {
    o.cracks = 0;
    o.crackXs.length = 0;
    o.holes.push(Math.round(R.drawX - o.x));
    R.breaks++;
    R.stunT = 0.45;
    addFx('dust', R.drawX, footY(o) + 1);
    embers(R.drawX, footY(o), 10, COL.shade, 4);
    loseHeart('FELL THROUGH', 1);
  }
}

// ---------------------------------------------------------------- moving on
function advance(from, to, how) {
  const R = S.R;
  R.roofs++;
  R.D = tune(diffAt(R.roofs));
  const st = stageAt(R.roofs);
  if (st > R.stage) {
    R.stage = st;
    R.stageBanner = { stage: st, t0: S.t };
    R.score += 500 * st;
    flash('rgba(244,185,61,0.3)', 0.35);
    embers(R.drawX, footY(from) - 20, 18, COL.gold, 34);
  }
  if (R.worldLog.length) R.worldLog[R.worldLog.length - 1].roofs++;
  if (!from.errs && !from.cracks && !from.holes.length) { R.cleanRoofs++; R.score += 150; }
  R.fromOpt = from;
  R.si++;
  R.ci = 0;
  R.idleT = 0;
  ensureRoad();
  const slot = R.slots[R.si];
  if (slot.seg > R.seg) enterWorld(slot);
  if (slot.kind === 'fork') {
    R.pending = true;
    R.choice = -1;
    R.targetX = charX(from, from.len) - 2;
    return;
  }
  R.pending = false;
  R.choice = 0;
  if (how !== 'landed') startJump(slot.opts[0]);
}

function enterWorld(slot) {
  const R = S.R;
  R.seg = slot.seg;
  R.worldLog.push({ wk: slot.world, roofs: 0, kills: 0 });
  R.score += 1000;
  if (slot.seg % 5 === 0) {
    R.cleared++;
    R.score += 3000 * R.cleared;
    R.banner = { wk: slot.world, t0: S.t, cleared: R.cleared };
    flash('rgba(255,243,208,0.4)', 0.5);
    embers(R.drawX, footY(hereOpt()) - 20, 30, COL.gold, 40);
  } else {
    R.banner = { wk: slot.world, t0: S.t };
  }
}

function startJump(toOpt) {
  const R = S.R;
  const from = R.fromOpt;
  const x1 = charX(toOpt, 0) + ADV / 2;
  const up = footY(from) - footY(toOpt);
  R.jump = {
    t: 0, dur: 0.42 + Math.abs(up) * 0.002 + Math.max(0, x1 - R.drawX - 60) * 0.002,
    x0: R.drawX, x1, y0: footY(from), to: toOpt, h: 22 + Math.max(0, up) * 0.6,
  };
}

function completeLine() {
  const R = S.R;
  const opt = curOpt();
  if (!opt || R.duel || R.grap || R.hazard || R.enc) return;
  const e = opt.enemy;
  if (e && e.state !== 'dead' && e.state !== 'dying') { startDuel(opt); return; }
  if (opt.grapple && !opt.grapple.done) { startGrapple(opt); return; }
  const next = R.slots[R.si + 1];
  if (!next) ensureRoad();
  advance(opt, null, 'jump');
}

function chooseFork(ch) {
  const R = S.R;
  const slot = R.slots[R.si];
  const c = ch.toLowerCase();
  const idx = slot.opts.findIndex(o => o.text[0].toLowerCase() === c);
  if (idx < 0) { mistake(); flash('rgba(224,72,78,0.18)', 0.12); return false; }
  R.pending = false;
  R.choice = idx;
  slot.opts[1 - idx].crumble = S.t;
  startJump(slot.opts[idx]);
  return true;
}

function typeChar(ch) {
  const R = S.R;
  if (R.pending) { if (chooseFork(ch)) typeChar(ch); return; }
  const opt = curOpt();
  if (!opt || R.ci >= opt.len || R.stunT > 0) return;
  const i = R.ci;
  const want = opt.text[i];
  const ok = ch.toLowerCase() === want.toLowerCase();
  const g = opt.guard;
  const inGuard = g && g.state === 'waiting' && i >= g.start && i < g.end;
  R.typed++;

  if (!ok) {
    mistake();
    opt.errs++;
    opt.flaw[i] = 1;
    opt.errT = S.t;
    opt.errI = i;
    if (inGuard && R.shadowT <= 0) { startEncounter(opt, g, false); return; }
    crack(opt);
    return;
  }

  opt.marks[i] = 1;
  goodKey();
  R.ci++;

  if (g && g.state === 'waiting' && R.ci === g.end) startEncounter(opt, g, true);
  const clean = (r) => { for (let k = r.start; k < r.end; k++) if (opt.flaw[k]) return false; return true; };
  const p = opt.power;
  if (p && p.state === 'pending' && R.ci === p.end) {
    p.state = clean(p) ? 'won' : 'lost';
    if (p.state === 'won') {
      R.segs = Math.min(4, R.segs + 1);
      R.powers++;
      R.score += 100;
      embers(charX(opt, (p.start + p.end) / 2), footY(opt) + 22, 12, COL.gold, 26);
    }
  }
  const sn = opt.snuff;
  if (sn && sn.state === 'pending' && R.ci === sn.end) {
    sn.state = clean(sn) ? 'out' : 'lost';
    sn.t = S.t;
    if (sn.state === 'out') {
      R.snuffed++;
      R.score += 200;
      embers(opt.x + 8, footY(opt) - 20, 10, COL.shade, 16);
    }
  }
  const e = opt.enemy;
  if (e && e.state === 'waiting' && R.ci >= e.at && !R.enc) {
    if (sn && sn.state === 'out') e.state = 'unaware';
    else startHazard(opt, e.hz);
  }
  const d = opt.drop;
  if (d && d.state === 'pending' && R.ci >= d.at && !R.enc && !R.hazard) startHazard(opt, d);
  if (R.ci >= opt.len) completeLine();
}

// ---------------------------------------------------------------- the ronin
function startEncounter(opt, g, win) {
  const R = S.R;
  g.state = 'fighting';
  R.enc = { opt, g, win, t0: S.t };
  R.hitstop = 0.12;
  if (win) R.anim = { clip: 'ninja_strike', t0: S.t, dur: 0.32 };
}

function updateEncounter() {
  const R = S.R;
  const e = R.enc;
  if (!e) return;
  const u = S.t - e.t0;
  const rx = charX(e.opt, e.g.end) + 16;
  const fy = footY(e.opt);
  if (e.win) {
    if (!e.slashed && u >= 0.1) {
      e.slashed = true;
      addFx('slash', rx - 8, fy - 20);
      addFx('blood_spray', rx + 2, fy - 18);
      shake(2);
    }
    if (u >= 0.55) {
      e.g.state = 'dead';
      e.g.corpseT = e.t0 + 0.12;
      R.kills++;
      logKill();
      R.score += 500 * (1 + R.tier * 0.5);
      R.enc = null;
      resumeLine(e.opt);
    }
  } else {
    if (!e.cut && u >= 0.16) {
      e.cut = true;
      addFx('slash', R.drawX + 10, fy - 20);
      if (R.D.roninKills) { die('CUT DOWN'); e.g.state = 'waiting'; }
      else loseHeart('CUT DOWN', 2);
    }
    if (!R.D.roninKills && !R.dead && u >= 0.62 && !e.riposte) {
      e.riposte = true;
      R.anim = { clip: 'ninja_strike', t0: S.t, dur: 0.32 };
      addFx('slash', rx - 8, fy - 20, { delay: 0.1 });
      addFx('blood_spray', rx + 2, fy - 18, { delay: 0.12 });
    }
    if (u >= 0.6 && (R.D.roninKills || R.dead)) R.enc = null;
    else if (u >= 1.0) {
      e.g.state = 'dead';
      e.g.corpseT = S.t - 0.25;
      R.kills++;
      logKill();
      R.enc = null;
      resumeLine(e.opt);
    }
  }
}
function logKill() { const L = S.R.worldLog; if (L.length) L[L.length - 1].kills++; }

// after any interruption, pick the line back up where it stands
function resumeLine(opt) {
  const R = S.R;
  if (R.dead || opt !== curOpt()) return;
  const e = opt.enemy;
  if (e && e.state === 'waiting' && R.ci >= e.at) {
    if (opt.snuff && opt.snuff.state === 'out') e.state = 'unaware';
    else { startHazard(opt, e.hz); return; }
  }
  const d = opt.drop;
  if (d && d.state === 'pending' && R.ci >= d.at) { startHazard(opt, d); return; }
  if (R.ci >= opt.len) completeLine();
}

// ---------------------------------------------------------------- hazards
function startHazard(opt, hz) {
  const R = S.R;
  hz.state = 'active';
  hz.t = 0;
  hz.typed = '';
  hz.opt = opt;
  hz.startT = S.t;
  R.hazard = hz;
  if (hz.owner) { hz.owner.state = 'attacking'; hz.owner.hidden = false; }
  hz.sx = enemyX(opt);
  hz.sy = footY(opt) - 22;
}

function hazardChar(ch) {
  const R = S.R;
  const hz = R.hazard;
  const need = hz.word[hz.typed.length];
  if (ch.toLowerCase() === need) {
    hz.typed += need;
    goodKey();
    if (hz.typed === hz.word) {
      // a flawless shuriken dodge in the first half of its flight: catch it
      resolveHazard(hz.kind === 'shuriken' && hz.t / hz.T < 0.5 && !hz.flawed ? 'catch' : true);
    }
  } else {
    hz.typed = '';
    hz.flawed = true;
    hz.badT = S.t;
    mistake();
  }
  R.typed++;
}

function resolveHazard(res) {
  const R = S.R;
  const hz = R.hazard;
  if (!hz) return;
  hz.state = 'done';
  hz.result = res;
  hz.doneT = S.t;
  R.hazard = null;
  const o = hz.opt, e = hz.owner;
  const nx = R.drawX, fy = footY(o);
  if (e && e.state === 'attacking') e.state = 'alive';
  if (res === true) {
    if (hz.kind === 'arrow') {
      R.anim = { clip: 'ninja_block', t0: S.t, dur: 0.34 };
      addFx('spark', nx + 10, fy - 22);
    } else if (hz.kind === 'icicle') {
      R.anim = { clip: 'ninja_slide', t0: S.t, dur: 0.5 };
      embers(nx + 6, fy - 2, 10, COL.ice, 20);
    } else {
      R.anim = { clip: 'ninja_slide', t0: S.t, dur: 0.5 };
      addFx('dust', nx, fy + 1);
    }
    R.dodges++;
    R.score += 150;
  } else if (res === 'catch' || res === 'parry') {
    R.anim = { clip: res === 'catch' ? 'ninja_catch' : 'ninja_block', t0: S.t, dur: 0.36 };
    addFx('spark', nx + 10, fy - 22);
    if (res === 'catch') R.catches++; else R.parries++;
    R.segs = Math.min(4, R.segs + 1);
    R.score += 400;
    flash('rgba(244,185,61,0.25)', 0.18);
    // the weapon goes back the way it came
    if (e) {
      e.state = 'dying';
      R.flying.push({ kind: hz.kind, from: nx + 4, fy: fy - 20, to: enemyX(o), t0: S.t, dur: 0.24, enemy: e, opt: o });
    }
  } else if (res === 'cancel') {
    // TIGER took the thrower
  } else {
    loseHeart('STRUCK DOWN', 1);
  }
  // later enemies do not stop at one
  if (e && e.hz2 && e.state === 'alive' && !R.dead) {
    e.hz = e.hz2;
    e.hz2 = null;
    e.hz.owner = e;
    e.at = Math.min(o.len - 2, R.ci + 3);
    e.state = 'waiting';
  }
  resumeLine(o);
}

function updateHazard(hdt) {
  const R = S.R;
  const hz = R.hazard;
  if (!hz) return;
  hz.t += hdt;
  if (hz.t >= hz.T) resolveHazard(false);
}

// ---------------------------------------------------------------- the duel
// Anyone still standing when you reach him attacks: type his word first.
function startDuel(opt) {
  const R = S.R, e = opt.enemy;
  R.duel = {
    opt, e, word: e.killWord, typed: '', t: 0,
    T: R.D.window + e.killWord.length * 0.16 + 0.5, phase: 'type', t0: S.t, badT: -9,
  };
  e.state = 'dueling';
  e.hidden = false;
  R.targetX = enemyX(opt) - 24;
}

function duelChar(ch) {
  const R = S.R, d = R.duel;
  if (d.phase !== 'type') return;
  const need = d.word[d.typed.length];
  R.typed++;
  if (ch.toLowerCase() === need) {
    d.typed += need;
    goodKey();
    if (d.typed === d.word) { d.phase = 'strike'; d.t0 = S.t; R.hitstop = 0.08; }
  } else {
    d.typed = '';
    d.badT = S.t;
    mistake();
    d.opt.errs++;
    crack(d.opt);
  }
}

function updateDuel(ddt) {
  const R = S.R, d = R.duel;
  if (!d || R.dead) return;
  const ex = enemyX(d.opt), fy = footY(d.opt);
  if (d.phase === 'type') {
    d.t += ddt;
    if (d.t >= d.T) {
      d.phase = 'hit'; d.t0 = S.t;
      addFx('slash', R.drawX + 8, fy - 20);
      loseHeart('CUT DOWN', R.D.hitCost);
    }
  } else if (d.phase === 'hit') {
    if (S.t - d.t0 > 0.5) { d.phase = 'strike'; d.t0 = S.t; }
  } else if (d.phase === 'strike') {
    const u = S.t - d.t0;
    if (!d.anim) { d.anim = true; R.anim = { clip: 'ninja_strike', t0: S.t, dur: 0.32 }; }
    if (!d.cut && u >= 0.1) {
      d.cut = true;
      addFx('slash', ex - 8, fy - 20);
      addFx('blood_spray', ex + 2, fy - 18);
      shake(2);
    }
    if (u >= 0.45) {
      d.e.state = 'dead';
      d.e.deadT = S.t - 0.3;
      R.kills++;
      logKill();
      R.score += 500 * (1 + R.tier * 0.5);
      R.duel = null;
      completeLine();
    }
  }
}

// ---------------------------------------------------------------- the hook
function hookRing(next) {
  const px = next.x - 44, py = footY(next) + 2 - 64;
  return { x: px + 5, y: py + 12, px, py };
}

function startGrapple(opt) {
  const R = S.R;
  const next = R.slots[R.si + 1].opts[0];
  R.grap = {
    opt, next, word: opt.grapple.word, typed: '', t: 0,
    T: R.D.window + opt.grapple.word.length * 0.16 + 0.6, phase: 'prompt', t0: S.t, badT: -9,
  };
  R.targetX = opt.x + opt.w - 6;
}

function grapChar(ch) {
  const R = S.R, gp = R.grap;
  if (gp.phase !== 'prompt') return;
  const need = gp.word[gp.typed.length];
  R.typed++;
  if (ch.toLowerCase() === need) {
    gp.typed += need;
    goodKey();
    if (gp.typed === gp.word) {
      gp.phase = 'throw'; gp.t0 = S.t;
      R.drawX = R.targetX;
      R.anim = { clip: 'ninja_throw', t0: S.t, dur: 0.3 };
    }
  } else {
    gp.typed = '';
    gp.badT = S.t;
    mistake();
  }
}

function updateGrapple(gdt) {
  const R = S.R, gp = R.grap;
  if (!gp || R.dead) return;
  const ring = hookRing(gp.next);
  if (gp.phase === 'prompt') {
    gp.t += gdt;
    if (gp.t >= gp.T) { gp.phase = 'fall'; gp.t0 = S.t; gp.x0 = R.drawX; gp.y0 = footY(gp.opt); }
  } else if (gp.phase === 'throw') {
    if (S.t - gp.t0 >= 0.3) {
      const hx = R.drawX, hy = footY(gp.opt) - 20;
      const lx = charX(gp.next, 0) + ADV / 2, ly = footY(gp.next) - 20;
      gp.phase = 'swing'; gp.t0 = S.t;
      gp.a0 = Math.atan2(hx - ring.x, hy - ring.y);
      gp.r0 = Math.hypot(hx - ring.x, hy - ring.y);
      gp.a1 = Math.atan2(lx - ring.x, ly - ring.y);
      gp.r1 = Math.hypot(lx - ring.x, ly - ring.y);
      gp.dur = 0.85;
    }
  } else if (gp.phase === 'swing') {
    const u = clamp((S.t - gp.t0) / gp.dur, 0, 1);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const a = lerp(gp.a0, gp.a1, e);
    const r = lerp(gp.r0, gp.r1, e) + Math.sin(u * Math.PI) * 8;
    R.drawX = ring.x + Math.sin(a) * r;
    R.jumpY = ring.y + Math.cos(a) * r + 20;
    if (u >= 1) land(gp, true);
  } else if (gp.phase === 'fall') {
    const u = S.t - gp.t0;
    R.drawX = gp.x0 + u * 30;
    R.jumpY = gp.y0 + u * u * 260;
    if (u >= 0.55 && !gp.hurt) { gp.hurt = true; loseHeart('FELL', 1); }
    if (u >= 0.7 && !R.dead) {
      gp.phase = 'climb'; gp.t0 = S.t;
    }
  } else if (gp.phase === 'climb') {
    const u = clamp((S.t - gp.t0) / 0.5, 0, 1);
    const lx = charX(gp.next, 0) + ADV / 2;
    R.drawX = lx;
    R.jumpY = lerp(LH + 20, footY(gp.next), 1 - Math.pow(1 - u, 3)) - Math.sin(u * Math.PI) * 16;
    if (u >= 1) land(gp, false);
  }
}

function land(gp, swung) {
  const R = S.R;
  gp.opt.grapple.done = true;
  R.grap = null;
  if (swung) { R.grapples++; R.score += 250; }
  R.drawX = R.targetX = charX(gp.next, 0) + ADV / 2;
  R.lastLandT = S.t;
  addFx('dust', R.drawX, footY(gp.next) + 1);
  advance(gp.opt, gp.next, 'landed');
}

// ---------------------------------------------------------------- kata
function openMenu() {
  const R = S.R;
  if (R.dead || R.enc || R.slam) return;
  R.menu = { buf: '', t0: S.t, deniedT: -9 };
}
function menuChar(ch) {
  const R = S.R;
  const m = R.menu;
  const buf = (m.buf + ch).toUpperCase();
  const avail = KATAS.filter(k => k.rank <= S.rankBest);
  const hits = avail.filter(k => k.name.startsWith(buf));
  if (!hits.length) { m.buf = ''; m.deniedT = S.t; return; }
  m.buf = buf;
  const exact = hits.find(k => k.name === buf);
  if (exact) cast(exact);
}
function cast(k) {
  const R = S.R;
  if (R.segs < k.cost) { R.menu.buf = ''; R.menu.deniedT = S.t; return; }
  R.segs -= k.cost;
  R.menu = null;
  R.slam = { k, t0: S.t };
  R.hitstop = 0.3;
  shake(4);
  flash('rgba(255,243,208,0.8)', 0.12);
  if (k.name === 'TIGER') tiger();
  if (k.name === 'STILL') R.stillT = 4;
  if (k.name === 'SHADOW') R.shadowT = 6;
  if (k.name === 'CRANE') { R.cam -= 110; R.craneT = S.t; }
}
function tiger() {
  const R = S.R;
  const lo = R.cam - 20, hi = R.cam + LW + 40;
  for (let si = Math.max(0, R.si - 2); si < Math.min(R.slots.length, R.si + 8); si++) {
    for (const o of R.slots[si].opts) {
      if (o.x > hi || o.x + o.w < lo || o.crumble) continue;
      const g = o.guard;
      if (g && (g.state === 'waiting' || g.state === 'fighting')) {
        g.state = 'dead';
        g.corpseT = S.t + 0.3;
        const rx = charX(o, g.end) + 16;
        addFx('slash', rx - 8, footY(o) - 20, { delay: 0.3 });
        addFx('blood_spray', rx + 2, footY(o) - 18, { delay: 0.34 });
        R.kills++; logKill();
        R.score += 300;
      }
      const e = o.enemy;
      if (e && e.state !== 'dead' && e.state !== 'dying') {
        e.state = 'dead';
        e.deadT = S.t + 0.3;
        if (e.hz.state === 'pending') { e.hz.state = 'done'; e.hz.result = 'cancel'; }
        addFx('slash', enemyX(o) - 8, footY(o) - 20, { delay: 0.3 });
        addFx('blood_spray', enemyX(o) + 2, footY(o) - 18, { delay: 0.34 });
        R.kills++; logKill();
        R.score += 300;
      }
    }
  }
  if (R.enc) R.enc = null;
  if (R.hazard) resolveHazard('cancel');
  if (R.duel) { R.duel = null; const o = curOpt(); if (o) setTimeoutLine(o); }
}
// TIGER can end a duel mid-word; the line completes on the next update
function setTimeoutLine(o) { S.R.resumeOpt = o; }

// ---------------------------------------------------------------- update
function updateRun(dt) {
  const R = S.R;
  const D = R.D;
  const slow = R.menu ? 0.12 : R.dead ? 0.35 : 1;
  R.hitstop = Math.max(0, R.hitstop - dt);
  const frozen = R.hitstop > 0;
  const wdt = frozen ? 0 : dt * slow;
  if (!R.menu) {
    R.stillT = Math.max(0, R.stillT - dt);
    R.shadowT = Math.max(0, R.shadowT - dt);
    R.stunT = Math.max(0, R.stunT - dt);
  }
  if (R.resumeOpt) { const o = R.resumeOpt; R.resumeOpt = null; resumeLine(o); }

  // the pursuit: faster every time the five roads come round again
  const pace = D.speed * (1 + 0.08 * R.tier);
  if (!R.dead && R.stillT <= 0) R.cam += pace * wdt;
  if (R.dead) R.cam += D.speed * 0.2 * wdt;

  const opt = curOpt();
  if (opt && !R.jump && !R.grap && !R.duel) {
    let tx = charX(opt, Math.min(R.ci, opt.len)) + ADV / 2;
    const g = opt.guard;
    if (g && g.state !== 'dead') tx = Math.min(tx, charX(opt, g.start) - 2);
    R.targetX = Math.min(tx, charX(opt, opt.len) - 2);
  }
  if (R.jump) {
    const j = R.jump;
    j.t += wdt;
    const u = clamp(j.t / j.dur, 0, 1);
    const y1 = footY(j.to);
    R.drawX = lerp(j.x0, j.x1, u);
    R.jumpY = lerp(j.y0, y1, u) - Math.sin(u * Math.PI) * j.h;
    if (u >= 1) {
      R.jump = null;
      R.drawX = j.x1;
      R.lastLandT = S.t;
      addFx('dust', j.x1, y1 + 1);
    }
  } else if (!R.grap || R.grap.phase === 'prompt') {
    const k = 1 - Math.exp(-wdt * 16);
    R.drawX += (R.targetX - R.drawX) * k;
    if (Math.abs(R.targetX - R.drawX) < 0.4) R.drawX = R.targetX;
  }
  R.cam = Math.max(R.cam, R.drawX - 232);

  if ((R.shadowT > 0 || R.tier >= 3) && !frozen) {
    R.trail.push({ x: R.drawX, t: S.t });
    while (R.trail.length && S.t - R.trail[0].t > 0.25) R.trail.shift();
  } else R.trail.length = 0;

  const sx = R.drawX - R.cam;
  if (sx < 4 && !R.dead) die('OVERRUN');

  // hearts on the roof
  if (opt && opt.heart && !opt.heart.taken && !R.jump) {
    const lx = charX(opt, opt.heart.i) + ADV / 2;
    if (R.drawX >= lx - 3) {
      opt.heart.taken = true;
      R.hearts = Math.min(R.maxHearts, R.hearts + 1);
      R.lanterns++;
      R.score += 200;
      addFx('spark', lx, footY(opt) - 26);
      embers(lx, footY(opt) - 26, 16, COL.lamp, 20);
    }
  }

  // bamboo does not hold a runner who lingers
  const busy = R.hazard || R.duel || R.grap || R.enc || R.menu || R.pending || R.jump || R.dead;
  if (opt && opt.world === 'grove' && !busy && S.mode === 'play') {
    R.idleT += wdt;
    if (R.idleT > 3.2) { crack(opt); R.idleT = 1.8; }
  } else if (busy) R.idleT = 0;

  updateEncounter();
  const tdt = R.menu || R.stillT > 0 ? 0 : wdt * (R.tier >= 3 ? 0.7 : 1);
  updateHazard(tdt);
  updateDuel(tdt);
  updateGrapple(R.grap && R.grap.phase === 'prompt' ? tdt : wdt);

  // weapons flying back to their owners
  for (let i = R.flying.length - 1; i >= 0; i--) {
    const f = R.flying[i];
    if (S.t - f.t0 >= f.dur) {
      R.flying.splice(i, 1);
      f.enemy.state = 'dead';
      f.enemy.deadT = S.t;
      R.kills++; logKill();
      R.score += 300;
      addFx('blood_spray', f.to + 2, footY(f.opt) - 20);
    }
  }

  for (let i = R.fx.length - 1; i >= 0; i--) {
    const f = R.fx[i];
    if (f.dot) {
      const age = S.t - f.t0;
      if (age > f.life) { R.fx.splice(i, 1); continue; }
      f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 50 * dt;
    } else {
      const c = S.M.clips[f.clip];
      const dur = c ? c.frames.length * c.ms / 1000 : 0.3;
      if (S.t - f.t0 - (f.delay || 0) > dur + (f.hold || 0)) R.fx.splice(i, 1);
    }
  }
  if (R.slam && S.t - R.slam.t0 > 0.9) R.slam = null;
  if (R.dead && S.t - R.dead.t0 > 1.8) goResults();
}

function goResults() {
  const R = S.R;
  const mins = Math.max(0.05, (R.end - R.start) / 60);
  const correct = Math.max(0, R.typed - R.errors);
  R.wpm = Math.round(correct / 5 / mins);
  R.acc = R.typed ? Math.round(100 * correct / R.typed) : 100;
  // the style score: what the leaderboard ranks
  R.style = Math.round(R.score * (0.5 + R.acc / 200) + R.roofs * 40);
  // rank is how far up the climb you got
  const st = R.stage;
  const rank = st >= MAX_STAGE && R.acc >= 90 ? 3 : st >= 7 ? 2 : st >= 4 ? 1 : 0;
  R.rank = rank;
  R.prevBest = S.rankBest;
  R.newRank = saveRank(rank);
  R.newStage = saveStage(st);
  R.newBest = saveBest(R.style);
  setMode('results');
}

function setMode(m) { S.mode = m; S.modeT = S.t; }

// ---------------------------------------------------------------- input
function handleInput(k) {
  const keys = k.keys || [];
  const has = code => keys.indexOf(code) >= 0;
  const m = S.mode;

  if (m === 'title') {
    if (has('ArrowDown')) S.sel = (S.sel + 1) % 4;
    if (has('ArrowUp')) S.sel = (S.sel + 3) % 4;
    if (k.enter) {
      if (S.sel === 0 || S.sel === 1) { S.daily = S.sel === 1; newRun(); setMode('count'); }
      else if (S.sel === 2) setMode('howto');
      else exitGame();
    }
    if (has('Escape')) exitGame();
    return;
  }
  if (m === 'howto') {
    if (k.enter || has('Escape')) setMode('title');
    return;
  }
  if (m === 'count') {
    if (has('Escape')) setMode('title');
    return;
  }
  if (m === 'results') {
    if (k.enter) { newRun(); setMode('count'); }
    if (has('Escape')) setMode('title');
    return;
  }
  if (m === 'play') {
    const R = S.R;
    if (has('Escape')) {
      if (R.menu) { R.menu = null; return; }
      R.end = S.t;
      if (!R.dead) R.dead = { cause: 'RUN ABANDONED', t0: S.t - 9 };
      goResults();
      return;
    }
    if (R.dead) return;
    if (R.menu) {
      if (k.enter) { R.menu = null; return; }
      for (const ch of k.chars || []) if (/[A-Za-z]/.test(ch)) menuChar(ch);
      return;
    }
    if (k.enter) { openMenu(); return; }
    if (R.enc || R.slam && S.t - R.slam.t0 < 0.3) return;
    if (R.hazard) {
      if (k.back && R.hazard.kind === 'arrow' && R.hazard.t / R.hazard.T >= 0.62) {
        resolveHazard('parry');
        return;
      }
      for (const ch of k.chars || []) { if (!R.hazard) break; if (ch !== ' ') hazardChar(ch); }
      return;
    }
    if (R.duel) { for (const ch of k.chars || []) { if (!R.duel || ch === ' ') continue; duelChar(ch); } return; }
    if (R.grap) { for (const ch of k.chars || []) { if (!R.grap || ch === ' ') continue; grapChar(ch); } return; }
    for (const ch of k.chars || []) {
      if (R.dead || R.enc || R.hazard || R.duel || R.grap) break;
      typeChar(ch);
    }
  }
}

function exitGame() {
  if (typeof window !== 'undefined') {
    if (window.TYPEMAXX) window.TYPEMAXX.pixel = null;
    if (typeof window.TYPEMAXX_SETGAME === 'function') window.TYPEMAXX_SETGAME(null);
    else if (typeof window.TYPEMAXX_RESTORE_MENU === 'function') window.TYPEMAXX_RESTORE_MENU();
  }
}

// ---------------------------------------------------------------- screens
const TITLE_ROOF = { city: 'temple', grove: 'hut', snow: 'snowtemple', castle: 'keep', harbour: 'warehouse' };

// the menus stand in each world in turn, crossfading
function drawTitleBackdrop(tt, scroll) {
  const period = 7, idx = Math.floor(tt / period) % WORLD_KEYS.length;
  const u = (tt % period) / period;
  const wk = WORLD_KEYS[idx], nk = WORLD_KEYS[(idx + 1) % WORLD_KEYS.length];
  BACKDROP[wk](scroll, tt);
  const fade = clamp((u - 0.88) / 0.12, 0, 1);
  if (fade > 0) {
    const g = ctx();
    g.globalAlpha = fade;
    BACKDROP[nk](scroll, tt);
    g.globalAlpha = 1;
  }
  return fade > 0.5 ? nk : wk;
}
const titleOpt = (wk, w) => ({ w, type: TITLE_ROOF[wk], seed: 7, world: wk });

function drawTitle() {
  const tt = S.t;
  const wk = drawTitleBackdrop(tt, tt * 14);
  drawRoof(titleOpt(wk, 368), -24, 196);
  const ft = tt % 2.9, NX = 104, EX = 196, FOOT = 191;
  let nClip, nF, nX = NX, nY = FOOT, eClip, eF;
  if (ft < 0.7) { nClip = 'ninja_idle'; nF = frameOf('ninja_idle', tt); eClip = 'kage_idle'; eF = frameOf('kage_idle', tt); }
  else if (ft < 1.15) { const p = (ft - 0.7) / 0.45; nClip = 'ninja_run'; nF = frameOf('ninja_run', tt); nX = lerp(NX, 162, p); eClip = 'kage_idle'; eF = frameOf('kage_idle', tt); }
  else if (ft < 1.6) { const s = (ft - 1.15) / 0.45; nClip = 'ninja_strike'; nF = Math.min(3, s * 5); nX = 162; eClip = 'kage_strike'; eF = Math.min(1, s * 2); }
  else if (ft < 2.0) { const q = (ft - 1.6) / 0.4; nClip = 'ninja_jump'; nF = q * 6; nX = lerp(162, NX, q); nY = FOOT - Math.sin(q * Math.PI) * 18; eClip = 'kage_throw'; eF = q * 3; }
  else { nClip = 'ninja_idle'; nF = frameOf('ninja_idle', tt); eClip = 'kage_idle'; eF = frameOf('kage_idle', tt); }
  put(eClip, eF, EX, FOOT);
  put(nClip, nF, nX, nY);
  if (ft >= 1.24 && ft < 1.52) put('slash', (ft - 1.24) / 0.28 * 3, 178, 172);
  drawWeather(wk, tt * 14, tt);

  const bob = Math.round(Math.sin(tt * 3.9) * 1.5);
  textC('large', 'KATA', 162, 16 + bob, 'verm', 3);
  textC('large', 'KATA', 160, 14 + bob, 'ink', 3);
  textC('small', 'One road. It never ends.', 160, 66, 'ink');
  const items = ['START', 'DAILY ROAD', 'HOW TO PLAY', 'BACK'];
  for (let i = 0; i < 4; i++) {
    const y = 78 + i * 16;
    const on = S.sel === i;
    rect(106, y + 1, 110, 15, 'rgba(4,6,12,0.55)');
    text('large', items[i], 118, y, on ? 'gold' : 'ink');
    if (on && ((tt * 2.4) | 0) % 2 === 0) text('large', '>', 106, y, 'hot');
  }
  if (S.sel === 1) textC('small', 'one road for every runner  ' + todayKey(), 160, 144, 'mute');
  else if (S.best > 0) textC('small', 'best ' + S.best + '   stage ' + (S.bestStage >= MAX_STAGE ? 'MAX' : S.bestStage), 160, 144, 'gold');
}

function todayKey() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function drawHowto() {
  const tt = S.t;
  drawTitleBackdrop(tt, tt * 8);
  rect(0, 0, LW, LH, 'rgba(4,6,12,0.74)');
  textC('large', 'THE WAY OF KATA', 160, 6, 'gold');
  const L = [
    ['ink', 'Type the words on the roofs to run.'],
    ['gold', 'The road never ends. It only gets harder.'],
    ['red', 'Wrong keys crack the tiles. Too many: fall.'],
    ['', ''],
    ['gold', 'A ronin guards a gold word: type it clean.'],
    ['red', 'Miss a key in it and his blade finds you.'],
    ['ink', 'Kage throw, archers shoot: type the word.'],
    ['hot', 'Dodge a star early and you catch it.'],
    ['ink', 'Backspace as an arrow lands to parry.'],
    ['red', 'Foes left standing attack: type first.'],
    ['sky', 'Blue words snuff lanterns: go unseen.'],
    ['', ''],
    ['ink', 'Wide gaps: type the hook word to swing.'],
    ['ink', 'Fall behind the pursuit and it ends.'],
    ['gold', 'Gold words charge kata: Enter, its name.'],
  ];
  let y = 24;
  for (const [c, s] of L) { if (s) text('small', s, 12, y, c); y += c ? 10 : 4; }
  for (let i = 0; i < KATAS.length; i++) {
    const K = KATAS[i], locked = K.rank > S.rankBest;
    const x = 12 + i * 76;
    text('small', K.name, x, 186, locked ? 'shade' : 'gold');
    text('small', locked ? RANKS[K.rank].name : 'cost ' + K.cost, x, 196, locked ? 'shade' : 'mute');
  }
  // licence: the character art is CC-BY and must be credited where players see it
  textC('small', 'art: Clint Bellanger CC-BY 3.0', 160, 216, 'shade');
  textC('small', 'type: Pixel Operator, Yuji Boku', 160, 227, 'shade');
}

function drawCount() {
  drawWorld(true);
  const u = S.t - S.modeT;
  const n = 3 - Math.floor(u / 0.7);
  const R = S.R;
  textC('large', 'STAGE 1', 160, 40, 'gold');
  textC('large', WORLDS[R.slots[0].world].name, 160, 56, 'ink');
  if (R.daily) textC('small', 'DAILY ROAD ' + todayKey(), 160, 74, 'gold');
  if (n >= 1) {
    const p = (u % 0.7) / 0.7;
    textC('large', String(n), 160, 90 - Math.round(p * 4), p < 0.5 ? 'gold' : 'ink', 3);
  }
  if (u >= 2.1) {
    R.start = S.t;
    setMode('play');
  }
}

function drawResults() {
  drawWorld(true, true);
  const R = S.R, u = S.t - S.modeT;
  rect(0, 0, LW, LH, 'rgba(4,6,12,' + Math.min(0.8, u * 2).toFixed(2) + ')');
  if (u < 0.2) return;
  const head = R.dead ? R.dead.cause : 'RUN ENDED';
  textC('large', head, 160, 8, 'red', 2);
  const rank = RANKS[R.rank];
  blitScaled(rank.tile, 14, 50, 2);
  textC('large', rank.name, 44, 116, 'gold');
  textC('small', 'stage ' + (R.stage >= MAX_STAGE ? 'MAX' : R.stage), 44, 134, 'ink');
  if (R.newStage) textC('small', 'furthest yet', 44, 146, 'hot');
  else if (R.newBest) textC('small', 'best score', 44, 146, 'gold');
  if (R.newRank) textC('small', 'new rank', 44, 158, 'hot');
  const rows = [
    ['STYLE', String(R.style)], ['WPM', String(R.wpm)], ['ACCURACY', R.acc + '%'],
    ['STAGE', R.stage >= MAX_STAGE ? 'MAX' : String(R.stage)], ['ROOFS', String(R.roofs)], ['KILLS', String(R.kills)],
    ['CAUGHT', String(R.catches + R.parries)],
    ['DODGED', String(R.dodges)], ['HOOKED', String(R.grapples)],
  ];
  for (let i = 0; i < rows.length; i++) {
    const y = 42 + i * 14;
    if (u < 0.3 + i * 0.06) break;
    text('small', rows[i][0], 96, y + 3, 'mute');
    textR('large', rows[i][1], 206, y, i < 3 ? 'ink' : 'dim');
  }
  // the scroll: every world this road passed through
  if (u > 0.9) {
    text('small', 'THE ROAD', 222, 45, 'gold');
    const log = R.worldLog.slice(-11);
    for (let i = 0; i < log.length; i++) {
      const L = log[i];
      text('small', WORLDS[L.wk].name.split(' ').pop(), 222, 58 + i * 11, 'ink');
      textR('small', L.roofs + (L.kills ? ' / ' + L.kills : ''), 314, 58 + i * 11, 'mute');
    }
  }
  textC('small', (R.daily ? 'daily road ' + todayKey() : 'road ' + (R.seed >>> 0).toString(36).toUpperCase()) + '   -   Enter runs again', 160, 222, 'shade');
}

// ---------------------------------------------------------------- the run
function drawWorld(still, noHud) {
  const R = S.R;
  const tt = S.t;
  const cam = R.cam;

  // the backdrop crossfades across a world's gate
  const { cur, next } = worldAt(cam + 160);
  let fade = 0;
  if (next) fade = clamp(1 - (next.x0 - (cam + 160)) / 220, 0, 1);
  BACKDROP[cur.wk](cam, tt);
  if (fade > 0) {
    const g = ctx();
    g.globalAlpha = fade;
    BACKDROP[next.wk](cam, tt);
    g.globalAlpha = 1;
  }
  const here = fade > 0.5 ? next.wk : cur.wk;
  drawVoid(here, cam, tt);

  const cu = curOpt();
  const lo = Math.max(0, R.si - 5), hi = Math.min(R.slots.length, R.si + 10);

  for (let si = lo; si < hi; si++) {
    const slot = R.slots[si];
    for (let oi = 0; oi < slot.opts.length; oi++) {
      const o = slot.opts[oi];
      const x = Math.round(o.x - cam);
      if (x + o.w < -60 || x > LW + 60) continue;
      let sink = 0;
      if (o.crumble) {
        const u = tt - o.crumble;
        if (u > 1.4) continue;
        sink = u * u * 140;
      }
      // bamboo sways under a runner who lingers
      if (o === cu && o.world === 'grove' && R.idleT > 1.6) sink += Math.round(Math.sin(tt * 18) * Math.min(2, R.idleT - 1.6));
      const ry = o.ry + bobOf(o);
      if (o.hookPost && !o.crumble) blit('hook_post', x - 44, ry + 2 - 64);
      const board = drawRoof(o, x, ry, sink);
      drawFooting(o, x, ry + sink);
      drawBoardText(o, board, si, cu, sink);
    }
  }

  for (let si = lo; si < hi; si++) {
    const slot = R.slots[si];
    for (const o of slot.opts) {
      if (o.crumble) continue;
      const x0 = o.x - cam;
      if (x0 + o.w < -60 || x0 > LW + 60) continue;
      drawLanternPost(o);
      drawGuard(o);
      drawEnemy(o);
      if (o.heart && !o.heart.taken) {
        const lx = charX(o, o.heart.i) + ADV / 2 - cam;
        put('lantern_pick', frameOf('lantern_pick', tt), lx, footY(o) - 26 + Math.sin(tt * 3 + o.seed) * 2);
      }
    }
    if (slot.kind === 'fork' && si === R.si && R.pending) drawForkSigns(slot);
  }

  drawRope();
  drawNinja();
  drawProjectile();

  for (const f of R.fx) {
    if (f.dot) {
      const age = tt - f.t0, a = 1 - age / f.life;
      rect(f.x - cam, f.y, 1, 1, a > 0.5 ? f.col : COL.shade);
      continue;
    }
    const age = tt - f.t0 - (f.delay || 0);
    if (age < 0) continue;
    const c = S.M.clips[f.clip];
    const i = Math.min(c.frames.length - 1, Math.floor(age * 1000 / c.ms));
    put(f.clip, i, f.x - cam, f.y);
  }

  if (fade > 0 && fade < 1) {
    const g = ctx();
    g.globalAlpha = 1 - fade; drawWeather(cur.wk, cam, tt);
    g.globalAlpha = fade; drawWeather(next.wk, cam, tt);
    g.globalAlpha = 1;
  } else drawWeather(here, cam, tt);

  if (R.tier >= 1 && !R.dead) {
    const nx = R.drawX - cam, o = hereOpt();
    const fy = R.jump || R.grap ? R.jumpY : footY(o);
    for (let i = 0; i < 4 + R.tier * 3; i++) {
      const lx = nx - 16 - wrapX(i * 23 + tt * 260, 90);
      const ly = fy - 6 - ((i * 7) % 26);
      rect(lx, ly, 6 + R.tier * 2, 1, R.tier >= 3 ? 'rgba(244,185,61,0.7)' : 'rgba(141,240,180,0.45)');
    }
  }
  if (R.stillT > 0) rect(0, 0, LW, LH, 'rgba(40,60,110,0.22)');

  if (!noHud) drawHud();
  if (!still) drawOverlays();
}

// cracks in the ridge, and the holes where it gave way
function drawFooting(o, x, ry) {
  for (let i = 0; i < o.crackXs.length; i++) blit(i % 2 ? 'crack_2' : 'crack_1', x + o.crackXs[i] - 4, ry - 3);
  for (const h of o.holes) blit('hole', x + h - 7, ry - 4);
}

function drawBoardText(o, board, si, cu, sink) {
  const R = S.R;
  const isCur = o === cu;
  const passed = si < R.si || (si === R.si && R.pending && !R.slots[si].opts.includes(o));
  const ty = board.textY;
  const g = o.guard;
  if (isCur && g && g.state !== 'dead') {
    const px = charX(o, g.start) - R.cam - 2, pw = (g.end - g.start) * ADV + 4;
    rect(px, ty - 2, pw, 12, '#05070B');
    frame1(px, ty - 2, pw, 12, ((S.t * 4) | 0) % 2 ? COL.gold : COL.red);
  }
  const inR = (r, i) => r && i >= r.start && i < r.end;
  const errFlash = isCur && S.t - o.errT < 0.22;
  for (let i = 0; i < o.len; i++) {
    const ch = o.text[i];
    if (ch === ' ') continue;
    let x = charX(o, i) - R.cam;
    if (x < -8 || x > LW + 8) continue;
    const inGuard = g && g.state !== 'dead' && inR(g, i);
    const inPower = o.power && o.power.state === 'pending' && inR(o.power, i);
    const inSnuff = o.snuff && o.snuff.state === 'pending' && inR(o.snuff, i);
    let c;
    if (isCur) {
      if (o.marks[i]) c = inGuard ? 'pale' : inPower ? 'lamp' : inSnuff ? 'sky' : o.flaw[i] ? 'mute' : 'dim';
      else c = inGuard ? 'gold' : inPower ? 'gold' : inSnuff ? 'sky' : 'ink';
      if (errFlash && i === R.ci) { c = 'red'; x += ((S.t * 60) | 0) % 2 ? 1 : -1; }
    } else if (passed) {
      c = 'shade';
    } else {
      c = inGuard || inPower ? 'lamp' : inSnuff ? 'sky' : 'mute';
    }
    cell(ch, x, ty, c);
  }
  if (isCur && R.ci < o.len && !R.dead) {
    const cx = charX(o, R.ci) - R.cam;
    const on = ((S.t * 5) | 0) % 2 === 0 || S.t - R.lastLandT < 0.4;
    rect(cx, ty + 9, ADV - 1, 1, errFlash ? COL.red : on ? COL.gold : COL.lamp);
  }
}

function drawForkSigns(slot) {
  const R = S.R;
  for (const o of slot.opts) {
    const x = Math.round(o.x - R.cam - 24), y = footY(o) - 12;
    const blink = ((S.t * 3) | 0) % 2;
    rect(x, y, 15, 15, '#05070B');
    frame1(x, y, 15, 15, blink ? COL.gold : COL.hot);
    textC('large', o.text[0].toUpperCase(), x + 8, y - 2, 'gold');
    if (o.route === 'high') put('lantern_pick', frameOf('lantern_pick', S.t), x + 7, y - 9);
    else put('shuriken', frameOf('shuriken', S.t), x + 7, y - 8);
  }
}

function drawLanternPost(o) {
  if (!o.snuff) return;
  const R = S.R;
  const x = Math.round(o.x + 3 - R.cam), y = footY(o) - 18;
  const out = o.snuff.state === 'out';
  if (!out) blit('lantern_glow', x - 6, y - 7);
  blit(out ? 'post_lantern_dark' : 'post_lantern_lit', x, y);
  if (out && S.t - o.snuff.t < 1.2) {
    const u = S.t - o.snuff.t;
    for (let k = 0; k < 4; k++) rect(x + 3 + Math.sin(u * 6 + k) * 2, y - 2 - u * 14 - k * 3, 1, 1, 'rgba(160,170,180,' + (0.6 - u * 0.45).toFixed(2) + ')');
  }
}

function drawGuard(o) {
  const R = S.R;
  const g = o.guard;
  if (!g) return;
  const rx = charX(o, g.end) + 16 - R.cam;
  const fy = footY(o);
  if (g.state === 'dead') {
    const age = S.t - (g.corpseT || S.t);
    if (age < 0) { put('enemy_idle', 0, rx, fy); return; }
    const c = S.M.clips.enemy_die;
    const i = Math.min(c.frames.length - 1, Math.floor(age * 1000 / c.ms));
    if (i >= 3) put('blood_pool', Math.min(3, (age - 0.35) * 8), rx + 2, fy + 2);
    put('enemy_die', i, rx, fy);
    return;
  }
  const e = R.enc;
  if (e && e.g === g) {
    const u = S.t - e.t0;
    if (e.win) {
      const c = S.M.clips.enemy_die;
      put(u < 0.12 ? 'enemy_wind' : 'enemy_die', u < 0.12 ? 1 : Math.min(c.frames.length - 1, (u - 0.12) * 1000 / c.ms), rx, fy);
    } else if (e.riposte && u >= 0.72) {
      const c = S.M.clips.enemy_die;
      put('enemy_die', Math.min(c.frames.length - 1, (u - 0.72) * 1000 / c.ms), rx, fy);
    } else {
      put(u < 0.12 ? 'enemy_wind' : 'enemy_strike', u < 0.12 ? u / 0.12 * 2 : Math.min(1, (u - 0.12) * 10), rx, fy);
    }
    return;
  }
  const isCur = o === curOpt();
  const near = isCur && R.ci >= g.start - 3;
  put(near ? 'enemy_wind' : 'enemy_idle', near ? 0 : frameOf('enemy_idle', S.t + o.seed), rx, fy);
  if (isCur) {
    const wx = charX(o, g.start) - R.cam + ((g.end - g.start) * ADV) / 2;
    for (let y = fy + 2; y < o.ry + 20; y += 2) rect(wx, y, 1, 1, 'rgba(244,185,61,0.55)');
  }
}

function drawEnemy(o) {
  const R = S.R, e = o.enemy;
  if (!e) return;
  const ex = enemyX(o) - R.cam, fy = footY(o);
  const K = e.kind;               // 'kage' or 'archer'
  if (K === 'archer') blit(((S.t * 6 + o.seed) | 0) % 2 ? 'torch_a' : 'torch_b', ex + 9, fy - 16);
  if (e.state === 'dead') {
    const age = S.t - (e.deadT || S.t);
    const clip = K + '_die';
    if (age < 0) { put(K + '_idle', 0, ex, fy); return; }
    const c = S.M.clips[clip];
    const i = Math.min(c.frames.length - 1, Math.floor(age * 1000 / c.ms));
    if (i >= 3) put('blood_pool', Math.min(3, (age - 0.35) * 8), ex + 2, fy + 2);
    put(clip, i, ex, fy);
    return;
  }
  if (e.hidden) {
    // waiting in the drift: only the eyes show
    if (((S.t * 1.3 + o.seed) | 0) % 4 !== 0) { rect(ex - 3, fy - 28, 1, 1, '#E83A36'); rect(ex - 1, fy - 28, 1, 1, '#E83A36'); }
    return;
  }
  const d = R.duel;
  if (d && d.e === e) {
    if (d.phase === 'hit') put(K + '_strike', Math.min(1, (S.t - d.t0) * 8), ex, fy);
    else if (d.phase === 'strike') put(K === 'kage' ? 'kage_strike' : 'archer_strike', 0, ex, fy);
    else put(K === 'kage' ? 'kage_strike' : 'archer_idle', 0, ex, fy);
    return;
  }
  const hz = e.hz;
  if (R.hazard === hz) {
    if (K === 'kage') put('kage_throw', Math.min(2, (S.t - hz.startT) / 0.1), ex, fy);
    else put('archer_draw', Math.min(2, (hz.t / hz.T) * 3.2), ex, fy);
    return;
  }
  if (hz.state === 'done' && S.t - hz.doneT < 0.2 && K === 'archer') { put('archer_loose', 0, ex, fy); return; }
  put(K + '_idle', frameOf(K + '_idle', S.t + o.seed), ex, fy);
  // unaware of you: the lantern is out
  if (e.state === 'unaware' && ((S.t * 2) | 0) % 2) text('small', 'z', ex + 4, fy - 40, 'mute');
}

function drawProjectile() {
  const R = S.R;
  const hz = R.hazard;
  const nx = R.drawX - R.cam;
  if (hz) {
    const u = clamp(hz.t / hz.T, 0, 1);
    const o = hz.opt, tx = nx + 4, ty = footY(o) - 20;
    if (hz.kind === 'shuriken') {
      const sx = hz.sx - R.cam - 8;
      put('shuriken', frameOf('shuriken', S.t), lerp(sx, tx, u), lerp(hz.sy, ty, u) - Math.sin(u * Math.PI) * 6);
    } else if (hz.kind === 'arrow') {
      const sx = hz.sx - R.cam - 10;
      blitFlip('arrow', lerp(sx - 14, tx, u), lerp(hz.sy, ty, u) - 1);
    } else if (hz.kind === 'icicle') {
      // it hangs and trembles overhead, then lets go
      const hang = 26 + (u < 0.62 ? Math.round(Math.sin(S.t * 40) * u) : 0);
      const y = u < 0.62 ? hang : lerp(hang, footY(o) - 30, Math.pow((u - 0.62) / 0.38, 2));
      if (u < 0.62) rect(tx - 5, hang - 3, 11, 3, COL.ice);
      const g = ctx();
      g.fillStyle = COL.ice;
      g.fillRect(Math.round(tx - 1), Math.round(y), 3, 7);
      g.fillRect(Math.round(tx), Math.round(y + 7), 1, 4);
      g.fillStyle = '#E8F4FF';
      g.fillRect(Math.round(tx - 1), Math.round(y), 1, 5);
    } else if (hz.kind === 'crate') {
      const px = tx + 8, py = -8, a = lerp(1.15, -0.05, u * u), r = footY(o) - 36;
      const cx = px + Math.sin(a) * r, cy = py + Math.cos(a) * r;
      drawLine(px, py, cx, cy, '#B89868');
      rect(cx - 6, cy, 12, 10, '#5A3822');
      frame1(cx - 6, cy, 12, 10, '#1E120E');
      rect(cx - 6, cy + 4, 12, 1, '#1E120E');
    }
  }
  for (const f of R.flying) {
    const u = clamp((S.t - f.t0) / f.dur, 0, 1);
    const x = lerp(f.from, f.to, u) - R.cam;
    if (f.kind === 'shuriken') put('shuriken', frameOf('shuriken', S.t), x, f.fy);
    else blit('arrow', x - 6, f.fy - 1);
  }
  // the moment after a dodge
  const o = hereOpt();
  for (const h of [o && o.enemy && o.enemy.hz, o && o.drop]) {
    if (!h || h.state !== 'done' || h.result !== true) continue;
    const age = S.t - h.doneT;
    if (age > 0.6) continue;
    const tx = nx + 4, ty = footY(o) - 20;
    if (h.kind === 'shuriken') put('shuriken', frameOf('shuriken', S.t), tx - age * 420, ty - 6);
    else if (h.kind === 'arrow') blit('arrow', tx + 6 - age * 30, ty + age * age * 220);
    else if (h.kind === 'crate') {
      const px = tx + 8, a = -0.05 - age * 3, r = footY(o) - 36;
      drawLine(px, -8, px + Math.sin(a) * r, -8 + Math.cos(a) * r, '#B89868');
      rect(px + Math.sin(a) * r - 6, -8 + Math.cos(a) * r, 12, 10, '#5A3822');
    }
  }
}

function drawLine(x0, y0, x1, y1, css) {
  const g = ctx();
  g.fillStyle = css;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    g.fillRect(Math.round(lerp(x0, x1, u)), Math.round(lerp(y0, y1, u)), 1, 1);
  }
}

// the kaginawa's rope, from the ring to the ninja's hand
function drawRope() {
  const R = S.R, gp = R.grap;
  if (!gp || (gp.phase !== 'throw' && gp.phase !== 'swing')) return;
  const ring = hookRing(gp.next);
  const hx = R.drawX - R.cam + 3, hy = (gp.phase === 'swing' ? R.jumpY : footY(gp.opt)) - 22;
  const rx = ring.x - R.cam, ry = ring.y;
  if (gp.phase === 'throw') {
    const u = clamp((S.t - gp.t0) / 0.3, 0, 1);
    const ex = lerp(hx, rx, u), ey = lerp(hy, ry, u) - Math.sin(u * Math.PI) * 10;
    drawLine(hx, hy, ex, ey, '#B89868');
    blit('hook', ex - 2, ey - 2);
  } else {
    drawLine(hx, hy, rx, ry, '#B89868');
    blit('hook', rx - 2, ry - 2);
  }
}

function drawNinja() {
  const R = S.R;
  const o = hereOpt();
  const x = R.drawX - R.cam;
  const gp = R.grap;
  let fy = R.jump || (gp && gp.phase !== 'prompt') ? R.jumpY : footY(o);
  let clip, fi;
  if (R.dead) {
    const age = S.t - R.dead.t0;
    const c = S.M.clips.ninja_die;
    clip = 'ninja_die';
    fi = Math.min(c.frames.length - 1, Math.floor(age * 1000 / c.ms));
    if (fi >= 3 && !R.jump && !gp) put('blood_pool', Math.min(3, (age - 0.4) * 8), x, footY(o) + 2);
    if (R.dead.cause === 'OVERRUN' || R.dead.cause === 'FELL') fy += age * age * 120;
  } else if (gp && gp.phase === 'swing') {
    clip = 'ninja_swing'; fi = frameOf('ninja_swing', S.t);
  } else if (gp && gp.phase === 'fall') {
    clip = 'ninja_stumble'; fi = 1;
  } else if (gp && gp.phase === 'climb') {
    clip = 'ninja_jump'; fi = 2;
  } else if (R.enc && R.enc.win) {
    clip = 'ninja_strike'; fi = Math.min(3, (S.t - R.enc.t0) / 0.3 * 4);
  } else if (R.anim && S.t - R.anim.t0 < R.anim.dur) {
    const c = S.M.clips[R.anim.clip];
    clip = R.anim.clip;
    fi = Math.min(c.frames.length - 1, (S.t - R.anim.t0) / R.anim.dur * c.frames.length);
  } else if (R.slam && S.t - R.slam.t0 < 0.4) {
    clip = 'ninja_strike'; fi = 3;
  } else if (R.jump) {
    clip = 'ninja_jump'; fi = Math.min(5, R.jump.t / R.jump.dur * 6);
  } else if (R.pending || gp || Math.abs(R.targetX - R.drawX) < 0.6 && S.t - R.lastLandT > 0.35 && R.hitstop <= 0) {
    clip = 'ninja_idle'; fi = frameOf('ninja_idle', S.t);
  } else {
    clip = 'ninja_run'; fi = frameOf('ninja_run', S.t);
  }
  for (let i = 0; i < R.trail.length; i += 2) {
    const tr = R.trail[i];
    put(clip, fi, tr.x - R.cam, fy, 0.18 + i * 0.03);
  }
  const alpha = R.shadowT > 0 ? (((S.t * 10) | 0) % 2 ? 0.45 : 0.7) : 1;
  put(clip, fi, x, fy, alpha);
}

function drawHud() {
  const R = S.R;
  const tt = S.t;
  const show = Math.max(R.hearts, 4);
  for (let i = 0; i < show; i++) blit(i < R.hearts ? 'kunai_full' : 'kunai_empty', 5 + i * 10, 4);
  if (R.hearts === 1 && ((tt * 4) | 0) % 2 === 0) frame1(0, 0, LW, LH, 'rgba(224,72,78,0.6)');
  // footing: the cracks on the roof underfoot
  const o = curOpt();
  const cracks = o ? o.cracks : 0;
  for (let i = 0; i < R.D.cracks; i++) {
    const on = i < cracks;
    rect(6 + i * 9, 24, 7, 3, on ? COL.red : '#1A222A');
    if (on && cracks === R.D.cracks - 1 && ((tt * 6) | 0) % 2) frame1(5 + i * 9, 23, 9, 5, COL.red);
  }
  const full = R.segs >= 2;
  for (let i = 0; i < 4; i++) {
    const on = i < R.segs;
    const lift = on && R.segs === 4 ? Math.round(Math.sin(tt * 6 + i) * 1) : 0;
    blit(on ? 'kata_seg_full' : 'kata_seg_empty', 112 + i * 23, 12 + lift);
  }
  text('small', 'KATA', 112, 2, full ? (((tt * 3) | 0) % 2 ? 'gold' : 'lamp') : 'shade');
  const mins = Math.max(1 / 60, ((R.dead ? R.end : tt) - (R.start || tt)) / 60);
  const wpm = S.mode === 'play' ? Math.round(Math.max(0, R.typed - R.errors) / 5 / mins) : 0;
  const acc = R.typed ? Math.round(100 * Math.max(0, R.typed - R.errors) / R.typed) : 100;
  textR('small', 'WPM ' + wpm, 314, 2, 'mute');
  textR('small', 'ACC ' + acc + '%', 314, 12, 'mute');
  textR('small', String(Math.round(R.score)), 314, 22, 'ink');
  const maxed = R.stage >= MAX_STAGE;
  textR('small', maxed ? 'STAGE MAX' : 'STAGE ' + R.stage, 314, 32, maxed ? 'red' : 'lamp');
  if (!maxed) {
    const into = (R.roofs % STAGE_ROOFS) / STAGE_ROOFS;
    rect(270, 42, 44, 1, '#1A222A');
    rect(270, 42, Math.round(44 * into), 1, COL.lamp);
  }
  if (R.tier > 0) {
    const col = R.tier >= 3 ? 'gold' : R.tier === 2 ? 'lamp' : 'hot';
    text('small', TIER_NAMES[R.tier] + '  ' + R.combo, 112, 20, col);
    if (R.tier >= 3) frame1(1, 1, LW - 2, LH - 2, ((tt * 6) | 0) % 2 ? 'rgba(244,185,61,0.5)' : 'rgba(244,185,61,0.25)');
  }
  if (R.stillT > 0) { text('small', 'STILL', 210, 2, 'sky'); rect(210, 11, R.stillT / 4 * 40, 1, COL.sky); }
  if (R.shadowT > 0) { text('small', 'SHADOW', 210, 14, 'steel'); rect(210, 23, R.shadowT / 6 * 40, 1, COL.steel); }
  const sx = R.drawX - R.cam;
  if (sx < 70 && !R.dead) {
    const k = 1 - sx / 70;
    rect(0, 0, Math.round(2 + k * 6), LH, 'rgba(224,40,50,' + (0.25 + k * 0.5).toFixed(2) + ')');
  }
}

// a word to type, in a box, with its countdown
function wordBox(x, y, w, word, typed, u, badT, icon, warnAt) {
  const tt = S.t;
  rect(x, y, w, 36, '#05070B');
  frame1(x, y, w, 36, tt - badT < 0.2 ? COL.red : COL.gold);
  if (icon) icon(x, y);
  const W = word.toUpperCase();
  const ww = textW('large', W, 2);
  let pen = x + 24 + Math.round((w - 28 - ww) / 2);
  for (let i = 0; i < W.length; i++) pen = text('large', W[i], pen, y + 2, i < typed.length ? 'hot' : 'ink', 2);
  rect(x + 4, y + 31, Math.round((w - 8) * (1 - u)), 2, u > (warnAt || 0.65) ? COL.red : COL.gold);
}

function drawOverlays() {
  const R = S.R;
  const tt = S.t;
  const hz = R.hazard;
  if (hz) {
    const u = clamp(hz.t / hz.T, 0, 1);
    const parryWin = hz.kind === 'arrow' && u >= 0.62;
    const catchWin = hz.kind === 'shuriken' && u < 0.5 && !hz.flawed;
    wordBox(90, 36, 140, hz.word, hz.typed, u, hz.badT, (x, y) => {
      if (hz.kind === 'shuriken') put('shuriken', frameOf('shuriken', tt), x + 14, y + 16);
      else if (hz.kind === 'arrow') blitFlip('arrow', x + 7, y + 15);
      else rect(x + 11, y + 10, 4, 14, COL.ice);
    });
    if (parryWin) frame1(89, 35, 142, 38, ((tt * 10) | 0) % 2 ? COL.hot : COL.gold);
    if (catchWin) textC('small', 'catch it', 160, 76, 'hot');
  }
  const d = R.duel;
  if (d && d.phase === 'type') {
    const ex = enemyX(d.opt) - R.cam, fy = footY(d.opt);
    const bw = Math.max(80, d.word.length * 16 + 36);
    const bx = clamp(Math.round(ex - bw / 2), 4, LW - bw - 4), by = clamp(fy - 82, 30, 150);
    wordBox(bx, by, bw, d.word, d.typed, clamp(d.t / d.T, 0, 1), d.badT, (x, y) => put('slash', 1, x + 12, y + 17), 0.6);
  }
  const gp = R.grap;
  if (gp && gp.phase === 'prompt') {
    const ring = hookRing(gp.next);
    const bw = Math.max(90, gp.word.length * 16 + 36);
    const bx = clamp(Math.round(ring.x - R.cam - bw / 2), 4, LW - bw - 4), by = clamp(ring.y - 44, 30, 140);
    wordBox(bx, by, bw, gp.word, gp.typed, clamp(gp.t / gp.T, 0, 1), gp.badT, (x, y) => blit('hook', x + 9, y + 15), 0.6);
    // the ring flashes so the eye knows where the rope goes
    if (((tt * 6) | 0) % 2) frame1(ring.x - R.cam - 5, ring.y - 5, 11, 11, COL.gold);
  }
  // a banner never covers a word the player must type: it waits
  const boxUp = R.hazard || (R.duel && R.duel.phase === 'type') || (R.grap && R.grap.phase === 'prompt') || R.menu;
  if (boxUp) {
    if (R.stageBanner) R.stageBanner.t0 += S.dt;
    if (R.banner && tt >= R.banner.t0) R.banner.t0 += S.dt;
  }
  if (R.banner && !boxUp) {
    const u = tt - R.banner.t0;
    if (u > 2.6) R.banner = null;
    else if (u >= 0) {
      const W = WORLDS[R.banner.wk];
      const a = u < 0.3 ? u / 0.3 : u > 2.1 ? (2.6 - u) / 0.5 : 1;
      const g = ctx();
      g.globalAlpha = clamp(a, 0, 1);
      rect(0, 76, LW, 28, 'rgba(4,6,12,0.55)');
      textC('large', W.name, 160, 75, 'ink');
      textC('small', W.sub, 160, 92, 'mute');
      g.globalAlpha = 1;
    }
  }
  if (R.stageBanner && !boxUp) {
    const u = tt - R.stageBanner.t0;
    if (u > 2.4) R.stageBanner = null;
    else {
      const a = u < 0.2 ? u / 0.2 : u > 1.9 ? (2.4 - u) / 0.5 : 1;
      const g = ctx();
      g.globalAlpha = clamp(a, 0, 1);
      const st = R.stageBanner.stage, maxed = st >= MAX_STAGE;
      const pop = u < 0.25 ? Math.round((0.25 - u) * 12) : 0;
      rect(0, 46, LW, 26, 'rgba(4,6,12,0.6)');
      textC('large', maxed ? 'STAGE MAX' : 'STAGE ' + st, 160, 44 - pop, maxed ? 'red' : 'gold');
      textC('small', STAGE_NOTES[st], 160, 62, maxed ? 'red' : 'ink');
      g.globalAlpha = 1;
    }
  }
  if (R.menu) {
    const m = R.menu;
    rect(0, 0, LW, LH, 'rgba(3,5,10,0.74)');
    textC('large', 'KATA', 160, 30, 'gold', 2);
    for (let i = 0; i < KATAS.length; i++) {
      const K = KATAS[i];
      const locked = K.rank > S.rankBest;
      const can = !locked && R.segs >= K.cost;
      const y = 70 + i * 34;
      const match = !locked && m.buf && K.name.startsWith(m.buf);
      let pen = 70;
      for (let c = 0; c < K.name.length; c++) {
        const typed = match && c < m.buf.length;
        pen = text('large', K.name[c], pen, y, locked ? 'shade' : typed ? 'hot' : can ? 'ink' : 'dim');
      }
      for (let s = 0; s < K.cost; s++) blit(s < R.segs && !locked ? 'kata_seg_full' : 'kata_seg_empty', 170 + s * 22, y + 5);
      text('small', locked ? 'reach ' + RANKS[K.rank].name : K.desc, 70, y + 17, locked ? 'shade' : 'mute');
    }
    if (tt - m.deniedT < 0.3) frame1(60, 64, 200, 140, COL.red);
  }
  if (R.slam) {
    const u = tt - R.slam.t0;
    const c = S.M.clips[R.slam.k.clip];
    const i = Math.min(c.frames.length - 1, u / 0.6 * c.frames.length);
    putScaled(R.slam.k.clip, i, 160, 104, 2);
  }
}

function drawLoading() {
  const g = ctx();
  g.fillStyle = '#05070E';
  g.fillRect(0, 0, LW, LH);
  g.fillStyle = S.error ? '#E0484E' : '#4F7A62';
  g.font = '10px monospace';
  g.textAlign = 'center';
  g.fillText(S.error ? 'KATA failed to load: ' + S.error : 'KATA', 160, 120);
  g.textAlign = 'left';
}

// ---------------------------------------------------------------- export
const KATA = {
  name: 'kata',
  title: 'KATA',
  // read-only handle for tooling; the game never reads it
  get state() { return S; },

  enter() {
    loadRank();
    loadAssets();
    S.mode = 'title';
    S.modeT = S.t;
    S.sel = 0;
    S.lastSec = null;
    S.flash = null;
    S.shake = 0;
  },

  exit() {
    if (typeof window !== 'undefined' && window.TYPEMAXX) window.TYPEMAXX.pixel = null;
  },

  draw(g, W, H, seconds, now, input) {
    if (typeof window !== 'undefined' && window.TYPEMAXX) {
      const p = window.TYPEMAXX.pixel;
      if (!p || p.width !== LW || p.height !== LH) window.TYPEMAXX.pixel = { width: LW, height: LH };
    }
    const k = input && typeof input.pull === 'function' ? input.pull() : { chars: [], keys: [], back: 0, enter: 0 };

    const sec = typeof seconds === 'number' ? seconds : performance.now() / 1000;
    S.dt = S.lastSec == null ? 0 : clamp(sec - S.lastSec, 0, 0.05);
    S.lastSec = sec;
    S.t += S.dt;

    S.ctx = g;
    g.save();
    g.imageSmoothingEnabled = false;
    g.scale(W / LW, H / LH);

    if (!S.ready) {
      if (!S.loading && !S.error) loadAssets();
      drawLoading();
      g.restore();
      return;
    }

    handleInput(k);
    if (S.mode === 'play') updateRun(S.dt);

    if (S.shake > 0) {
      const a = S.shake;
      g.translate(Math.round((hash((S.t * 60) | 0, 1) - 0.5) * a * 2), Math.round((hash((S.t * 60) | 0, 2) - 0.5) * a * 2));
      S.shake = Math.max(0, S.shake - S.dt * 14);
    }

    switch (S.mode) {
      case 'title': drawTitle(); break;
      case 'howto': drawHowto(); break;
      case 'count': drawCount(); break;
      case 'play': drawWorld(false); break;
      case 'results': drawResults(); break;
    }

    if (S.flash) {
      const u = (S.t - S.flash.t0) / S.flash.dur;
      if (u >= 1) S.flash = null;
      else {
        g.globalAlpha = 1 - u;
        g.fillStyle = S.flash.css;
        g.fillRect(-4, -4, LW + 8, LH + 8);
        g.globalAlpha = 1;
      }
    }
    g.restore();
  },
};

export default KATA;
export { KATA };
