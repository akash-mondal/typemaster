/*
 * wagonheart-text.js - everything WAGONHEART says.
 *
 * Trail prose is what the player types while the wagon rolls. It is lower case
 * letters and spaces only, so any keyboard types it cleanly. {a} and {b} are
 * party members (the game fills them with living companions' names).
 */

// ---------------------------------------------------------------- trail prose
// per biome: calm lines any time; and lines only for a time of day
export const PROSE = {
  meadow: {
    any: [
      'the grass leans east', 'a hawk circles the stones', 'wildflowers brush the wheels', 'the horses find their pace',
      'a lark rises singing', 'the trail bends past a stone ring', 'the canvas snaps in the wind', 'clover sweetens the air',
      'a hare bolts from the ruts', 'the axle hums along', '{a} walks beside the lead horse', '{a} hums an old song',
      'the hills roll on like water', 'a creek glints far off', 'bees work the thistles', 'the wagon rocks gently',
      'a lone oak marks the rise', 'the ruts run straight and true', 'cloud shadows cross the green', 'the bells keep time',
      '{a} counts the standing stones', 'the grass is up to the hubs', 'a fox watches from the rise', 'the wind smells of rain',
      'old ruts from wagons before', 'the land opens wide', '{b} picks a sprig of mint', 'the stones wear moss like coats',
    ],
    dawn: ['dew soaks the canvas', 'the sun climbs over the stones', 'mist lifts from the hollows', 'birdsong wakes the party'],
    dusk: ['the stones throw long shadows', 'the sky turns to honey', 'the horses slow at sundown', '{a} points at the first star'],
    night: ['fireflies drift over the grass', 'the moon silvers the stones', 'crickets fill the dark', 'the lantern sways and glows'],
  },
  river: {
    any: [
      'the river runs wide and brown', 'willows trail in the current', 'a heron stands in the shallows', 'the wheels spray mud',
      'frogs plop into the reeds', 'the bank is soft and slick', 'a ferry rope sags across', 'fish rise at the eddies',
      '{a} fills the water casks', 'the horses want to drink', 'reeds whisper by the ford', 'a kingfisher flashes blue',
      'driftwood piles on the bend', 'the current tugs at roots', 'the trail follows the water', '{b} skips a flat stone',
      'mud dries on the spokes', 'the air is cool and damp', 'a beaver slaps the water', 'the far bank looks close',
      'the river sings over stones', 'ducks lift in a rush', 'wet sand holds old tracks', 'the wagon tilts on the bank',
    ],
    dawn: ['mist lies on the water', 'the river blushes pink', 'a doe drinks and vanishes'],
    dusk: ['the water turns to copper', 'midges dance over the reeds', 'the far shore goes dark'],
    night: ['the moon ripples in the river', 'frogs chorus in the dark', 'the water talks all night'],
  },
  barrens: {
    any: [
      'grey stone stretches to the sky', 'the monoliths stand silent', 'dust rises from every step', 'the wheels grind on rock',
      'a lizard basks on a slab', 'the wind moans through the stones', 'there is no shade here', '{a} shades their eyes',
      'bones bleach beside the trail', 'the horses tongues hang low', 'a buzzard rides the heat', 'the ground cracks like glass',
      'water is worth gold here', '{a} rations the water', 'strange carvings mark a stone', 'the silence is enormous',
      'a dry creek bed winds away', 'the canvas is grey with dust', '{b} spots a spring ahead', 'the sky is hard and blue',
      'the stones seem to watch', 'pebbles rattle in the wind', 'the horizon wavers', 'a spire of rock leans east',
    ],
    dawn: ['cold light on the stones', 'the monoliths glow red', 'the air is still and sharp'],
    dusk: ['the stones burn orange', 'long shadows cross the plain', 'the heat breaks at last'],
    night: ['stars crowd the black sky', 'the cold bites after sundown', 'the moon makes the stones pale'],
  },
  highwood: {
    any: [
      'pines close over the trail', 'needles hush the wheels', 'the grade grows steep', 'a woodpecker knocks somewhere',
      'roots cross the path like ropes', 'the air smells of resin', 'a stream crosses under ferns', '{a} leads the horses by hand',
      'light falls in long beams', 'moss swallows old stumps', 'a deer freezes then flees', 'the brakes creak downhill',
      'ferns brush the canvas', '{b} gathers dry kindling', 'the trail is soft and dark', 'a squirrel scolds from above',
      'the forest breathes around us', 'a fallen trunk blocks half the way', 'mushrooms ring an old pine', 'the wind combs the treetops',
      '{a} cuts a walking stick', 'the horses lean into the hill', 'a creek chatters down the slope', 'the shade is cool and green',
    ],
    dawn: ['fog hangs in the pines', 'the forest drips with dew', 'sunbeams pierce the mist'],
    dusk: ['the shadows come early here', 'an owl calls in the gloom', 'the pines turn black'],
    night: ['eyes shine beyond the lantern', 'the forest creaks in the dark', 'wolves call far away'],
  },
  pass: {
    any: [
      'snow squeaks under the wheels', 'the peaks cut the sky', 'breath smokes in the cold', 'the trail clings to the cliff',
      'ice glitters on the rocks', 'the horses struggle on the grade', '{a} wraps a scarf tighter', 'a hawk hangs in the thin air',
      'the wind bites through wool', 'every step is uphill', 'snow slides from a ledge', 'the wagon slips and holds',
      '{b} checks the chains', 'the valley falls away below', 'a frozen falls hangs silent', 'the sky is deep and hard',
      'the cold makes the axle groan', 'tracks of a mountain goat', 'the pass is almost ours', 'drifts pile at the bends',
      'the sun has no warmth here', '{a} rubs frozen fingers', 'the summit hides in cloud', 'pines give way to bare rock',
    ],
    dawn: ['the peaks catch fire with light', 'frost furs the canvas', 'the snow turns rose'],
    dusk: ['alpenglow paints the summits', 'the cold deepens fast', 'the ridge goes purple'],
    night: ['the snow glows under the moon', 'green light ripples in the sky', 'the stars feel close enough to touch'],
  },
  saltmere: {
    any: [
      'white salt runs to the edge of sight', 'the wheels crunch on the crust', 'heat shimmers over the flats', 'there is nothing to hide behind',
      'the glare hurts the eyes', 'a mirage of a lake dances', '{a} wets a cloth for their head', 'the horses walk with heads low',
      'salt crusts the spokes', 'the sky and ground are one white', 'a lone post marks the trail', 'water sloshes in the cask',
      'the distance never closes', '{b} sees a town that is not there', 'cracked hexagons pattern the ground', 'the air tastes of salt',
      'footprints fill with brine', 'the canvas bakes', 'a dust devil spins far off', 'the flats ring underfoot',
    ],
    dawn: ['pastel light spills over the salt', 'the flats glow pink and gold', 'the cool will not last'],
    dusk: ['the flats turn to a sheet of fire', 'the heat lets go', 'long shadows streak the white'],
    night: ['the salt mirrors every star', 'the flats are silver and silent', 'the cold comes fast at night'],
  },
  coast: {
    any: [
      'the sea breaks white below', 'gulls wheel over the cliffs', 'salt spray beads the canvas', 'orchards line the coast road',
      'the wind smells of the sea', 'waves boom in the caves', '{a} laughs at the gulls', 'a fishing boat rides the swell',
      'the trail winds along the bluff', 'apples fall by the road', 'the horses find sweet grass', 'a lighthouse stands on the point',
      'the sea stretches forever', '{b} waves at the fishermen', 'kelp tangles on the rocks', 'the town bells ring below',
      'seals bark on the rocks', 'the air is soft and warm', 'a cove shelters blue water', 'we have come so far',
    ],
    dawn: ['the sea turns silver', 'fog rolls in off the water', 'boats slip out with the tide'],
    dusk: ['the sun sinks into the sea', 'the sky burns red over the water', 'the lighthouse wakes'],
    night: ['the lighthouse beam sweeps the dark', 'waves glow faintly green', 'the sea whispers all night'],
  },
};

// lines that answer the party's state or the weather
export const PROSE_STATE = {
  sick: ['{a} coughs in the wagon', '{a} is pale and quiet', 'we walk slower for {a}', '{a} sleeps under a blanket'],
  hungry: ['bellies ache on bare rations', '{a} saves a crust for later', 'we tighten our belts', 'the food box sounds hollow'],
  happy: ['{a} and {b} sing together', 'laughter carries down the trail', '{a} tells a tall tale', 'spirits are high today'],
  grief: ['nobody speaks for a mile', '{a} looks back down the trail', 'an empty place by the fire', 'we carry our loss onward'],
  rain: ['rain drums on the canvas', 'mud sucks at the wheels', 'water runs off every hat', 'the ruts fill with rain'],
  storm: ['thunder rolls across the land', 'lightning splits the sky', 'the horses shy at the thunder', 'wind shakes the wagon'],
  snow: ['snow blinds the trail', 'flakes catch in the horses manes', 'the world goes white and quiet', 'drifts slow every step'],
  dust: ['dust hides the lead horse', 'grit in every mouth', 'the sun is a pale coin', 'we walk with scarves up'],
  fog: ['fog swallows the trail', 'the bells sound close and far', 'shapes loom and fade', 'we follow the ruts by feel'],
  heat: ['the heat presses down', 'the air wavers', 'every breath is hot', 'the horses pant'],
};

// ---------------------------------------------------------------- biomes
export const BIOMES = {
  meadow:   { name: 'GREENMEADOW', sub: 'where every trail begins' },
  river:    { name: 'RIVER COUNTRY', sub: 'wide water, soft banks' },
  barrens:  { name: 'THE STONE BARRENS', sub: 'the old stones keep watch' },
  highwood: { name: 'HIGHWOOD', sub: 'pines older than memory' },
  pass:     { name: 'THE PASS', sub: 'cross before the snows' },
  saltmere: { name: 'SALTMERE', sub: 'white to the edge of the world' },
  coast:    { name: 'SUNSET COAST', sub: 'the land meets the sea' },
};

// landmark names, by biome: natural sights and the forts/towns among them
export const LANDMARKS = {
  meadow:   { sights: ['Ring of Nine', 'Lone Oak Rise', 'Larksong Hill', 'The Tall Stone', 'Clover Hollow', 'Bellwether Knoll'], forts: ['Fort Greenwell', 'Meadowgate', 'Stonecross Post'] },
  river:    { sights: ['Willow Ford', 'Heron Bend', 'Twin Rivers', 'Ferryman Rock', 'Otter Falls', 'Silt Island'], forts: ['Ferrytown', 'Fort Brackwater', 'Mill Landing'] },
  barrens:  { sights: ['The Leaning Spire', 'Hollow Monolith', 'Buzzard Table', 'Whisper Stones', 'Dry Sorrow Creek', 'The Old Circle'], forts: ['Fort Cinder', 'Wellspring Post', 'Graystone'] },
  highwood: { sights: ['Cathedral Pines', 'Owl Creek', 'The Fallen Giant', 'Resin Falls', 'Mossbarrow', 'Timberline Gap'], forts: ['Fort Pinehold', 'Sawmill Camp', 'Hearthwood'] },
  pass:     { sights: ['Frost Gate', 'The Hanging Falls', 'Goat Ledge', 'Widow Drift', 'Cloudshoulder', 'The Last Summit'], forts: ['Trapper Hut', 'Fort Snowhaven', 'Summit Lodge'] },
  saltmere: { sights: ['The White Mirror', 'Salt Arch', 'Mirage Lake', 'Bone Post', 'The Crackled Sea', 'Glass Dunes'], forts: ['Saltworks', 'Fort Brine', 'Oasis Well'] },
  coast:    { sights: ['Gull Point', 'Orchard Bluff', 'Seal Rocks', 'The Lighthouse', 'Blue Cove', 'Sunset Cliffs'], forts: ['Harbor Town', 'Fort Landsend', 'Applecross'] },
};

// ---------------------------------------------------------------- hunting
// word length follows the animal: small and quick, or big and slow
export const ANIMALS = {
  meadow:   [['rabbit', 'rabbit_hop', 3, 4, 2], ['deer', 'deer_run', 5, 6, 60], ['fox', 'fox_run', 4, 5, 12], ['boar', 'boar_run', 6, 7, 90]],
  river:    [['rabbit', 'rabbit_run', 3, 4, 2], ['deer', 'deer_run', 5, 6, 60], ['fox', 'fox_run', 4, 5, 12], ['bear', 'bear_run', 8, 10, 220]],
  barrens:  [['rabbit', 'rabbit_hop', 3, 4, 2], ['fox', 'fox_run', 4, 5, 12], ['boar', 'boar_run', 6, 7, 90]],
  highwood: [['deer', 'deer_run', 5, 6, 60], ['boar', 'boar_run', 6, 7, 90], ['bear', 'bear_run', 8, 10, 220], ['rabbit', 'rabbit_hop', 3, 4, 2]],
  pass:     [['rabbit', 'rabbit_run', 3, 4, 2], ['deer', 'deer_run', 5, 6, 60], ['bear', 'bear_run', 8, 10, 220]],
  saltmere: [['rabbit', 'rabbit_hop', 3, 4, 2], ['fox', 'fox_run', 4, 5, 12]],
  coast:    [['rabbit', 'rabbit_hop', 3, 4, 2], ['deer', 'deer_run', 5, 6, 60], ['boar', 'boar_run', 6, 7, 90]],
};
// name, sprite, min word length, max, pounds of meat

// ---------------------------------------------------------------- events
// remedies: typed in order; each a short phrase
export const REMEDIES = {
  fever: ['cool cloth', 'boil water', 'willow bark', 'rest easy'],
  dysentery: ['boil water', 'clean hands', 'salt broth', 'rest easy'],
  chill: ['warm blanket', 'hot broth', 'dry clothes', 'near the fire'],
  cough: ['steam kettle', 'honey tea', 'warm blanket', 'rest easy'],
  snakebite: ['tie above', 'clean wound', 'draw poison', 'keep still'],
  fracture: ['straight limb', 'two splints', 'bind tight', 'sling arm'],
  frostbite: ['warm slowly', 'wrap hands', 'no rubbing', 'hot water'],
  exhaustion: ['sit down', 'drink water', 'shade', 'sleep'],
};
export const ILLNESS_NAME = {
  fever: 'a fever', dysentery: 'dysentery', chill: 'a chill', cough: 'a bad cough',
  snakebite: 'a snakebite', fracture: 'a broken arm', frostbite: 'frostbite', exhaustion: 'exhaustion',
};
export const REPAIRS = {
  wheel: ['lift wagon', 'pull pin', 'swap wheel', 'drive pin', 'grease hub'],
  axle: ['lift wagon', 'unbolt axle', 'fit new axle', 'bolt tight', 'test roll'],
  tongue: ['unhitch horses', 'saw splinters', 'fit new tongue', 'lash it', 'hitch horses'],
};
export const JURY_RIG = ['cut a sapling', 'strip bark', 'shape it', 'bind with rope', 'wrap wet hide', 'let it set', 'test it slowly'];

export const EVENT_TEXT = {
  illness: '{a} has come down with {ill}.',
  snakebite: 'A rattler strikes at {a}!',
  fracture: '{a} falls from the wagon.',
  wheel: 'A wheel cracks on a rut.', axle: 'The axle splits with a bang.', tongue: 'The wagon tongue snaps.',
  oxlost: 'One of the horses has wandered off.', mud: 'The wagon sinks into deep mud.', stampede: 'A herd thunders toward the trail!',
  storm: 'A storm rolls over the land.', fog: 'Fog swallows the trail.', lost: 'The ruts have vanished. Which way?',
  thieves: 'Shapes creep toward the wagon in the night.', wolves: 'Wolves circle the camp.',
  stranger: 'A traveller hails you from the road.', berries: 'Bushes heavy with berries line the trail.',
  wagon: 'An abandoned wagon lies by the trail.', spring: 'Clear water bubbles from the rocks.',
  musician: 'A fiddler joins your fire for the night.', wildfire: 'Smoke on the horizon. The grass is burning!',
  mirage: 'A town shimmers ahead. Is it real?', stag: 'A white stag watches from the rise.',
};
export const STRANGER_OFFERS = [
  ['I will trade you two spare wheels for food.', { give: { food: 120 }, get: { wheel: 2 } }],
  ['Salt for your medicine? I have plenty.', { give: { medicine: 1 }, get: { money: 25 } }],
  ['I have a horse too many. Buy her?', { give: { money: 30 }, get: { oxen: 1 } }],
  ['I am starving. Spare some food?', { give: { food: 40 }, get: { morale: 15 } }],
  ['Take these clothes, I am settling here.', { give: {}, get: { clothing: 2 } }],
  ['A shortcut lies over the ridge, if you dare.', { give: {}, get: { shortcut: 1 } }],
];

// ---------------------------------------------------------------- the store
export const STORE = [
  { key: 'oxen', label: 'HORSES', unit: 'pair', price: 40, step: 2 },
  { key: 'food', label: 'FOOD', unit: 'lbs', price: 0.2, step: 50 },
  { key: 'clothing', label: 'CLOTHING', unit: 'sets', price: 10, step: 1 },
  { key: 'shot', label: 'SHOT', unit: 'rounds', price: 0.1, step: 20 },
  { key: 'wheel', label: 'WHEEL', unit: 'spare', price: 10, step: 1 },
  { key: 'axle', label: 'AXLE', unit: 'spare', price: 10, step: 1 },
  { key: 'tongue', label: 'TONGUE', unit: 'spare', price: 10, step: 1 },
  { key: 'medicine', label: 'MEDICINE', unit: 'doses', price: 6, step: 1 },
  { key: 'water', label: 'WATER', unit: 'casks', price: 3, step: 1 },
];
export const HAGGLE = [
  ['i will not go lower', 'fair price for honest folk'],
  ['that is my best offer', 'surely you can do better'],
  ['take it or leave it', 'we have come a long way'],
  ['prices are high out here', 'split the difference friend'],
  ['you drive a hard bargain', 'and you a harder one'],
];

export const TRADES = [
  { key: 'merchant', name: 'MERCHANT', money: 1200, mult: 1, skill: 'buys and sells 15% better' },
  { key: 'wheelwright', name: 'WHEELWRIGHT', money: 700, mult: 2, skill: 'repairs use half the parts' },
  { key: 'farmer', name: 'FARMER', money: 400, mult: 3, skill: 'food lasts 20% longer' },
];
export const TRAITS = {
  scout: 'warns of trouble early', cook: 'meals go further', healer: 'remedies need fewer words',
  hunter: 'carries more meat home', smith: 'can mend without spares', singer: 'keeps spirits up', tough: 'shrugs off illness',
};
export const RECRUITS = [
  'ada', 'bram', 'cora', 'dell', 'edie', 'finn', 'greta', 'hal', 'iris', 'jonah', 'kit', 'lena', 'milo', 'nell', 'otis',
  'pearl', 'quill', 'rosa', 'silas', 'tess', 'ulla', 'vern', 'wren', 'yara', 'zeke', 'abel', 'bess', 'clem', 'dora', 'eli',
];
export const DEFAULT_NAMES = ['mara', 'john', 'ruth', 'sam', 'lily'];

// ---------------------------------------------------------------- the stones
// The Wagonheart Poem: one line carved on each standing stone, seven lines a verse
export const POEM = [
  // i. the verse of leaving
  'we left the hearth before the frost', 'with all we owned and all we lost', 'the road was grass and then was stone',
  'and none of us would walk alone', 'the horses bowed their patient heads', 'the canvas held our hopes and beds', 'and morning called us on',
  // ii. the verse of rivers
  'the water knows no hurry', 'it carries what we cannot', 'we crossed where herons waited', 'and learned the river patient',
  'the far bank always nearer', 'than the fear we brought to it', 'so the river let us pass',
  // iii. the verse of stones
  'the stones were here before us', 'they watched the first wheel turn', 'they do not ask where we are going',
  'they only ask that we remember', 'carve your name in passing', 'and the stone will keep it', 'longer than the road',
  // iv. the verse of pines
  'beneath the pines the light goes green', 'the oldest trees have always seen', 'the ones who stopped and the ones who kept',
  'the ones who sang and the ones who wept', 'the forest does not choose', 'it only holds the path', 'for those who walk it',
  // v. the verse of snow
  'the mountain does not hate us', 'it simply does not care', 'so we cared for one another', 'and shared the thinning air',
  'the summit was a promise', 'the descent was a reward', 'and the snow forgot our tracks',
  // vi. the verse of salt
  'white to the edge of seeing', 'the world became a mirror', 'we saw ourselves as strangers', 'and walked toward the shimmer',
  'the thirst taught us to share', 'the silence taught us listening', 'the salt kept all the rest',
  // vii. the verse of the sea
  'at last the land ran out', 'and still the wheel would turn', 'for the heart of every wagon', 'is the need to see beyond',
  'so we built another road', 'across another morning', 'and the trail began again',
];
export const VERSE_NAMES = ['LEAVING', 'RIVERS', 'STONES', 'PINES', 'SNOW', 'SALT', 'THE SEA'];
export const VERSE_BONUS = [
  'morale falls slower', 'crossings are calmer', 'carvings wake with one less mistake',
  'the lost trail is found sooner', 'the cold bites less', 'water lasts longer', 'every crossing begins with a gift',
];

// ---------------------------------------------------------------- party talk
export const BANTER = [
  ['{a}: my feet have walked a thousand miles', '{b}: and they will walk a thousand more'],
  ['{a}: do you think the stones remember us', '{b}: i think they remember everyone'],
  ['{a}: i miss bread that is not burnt', '{b}: you burnt it yourself'],
  ['{a}: tell me about the sea again', '{b}: it goes on until it touches the sky'],
  ['{a}: the horses like you better', '{b}: i talk to them'],
  ['{a}: what will you build when we stop', '{b}: a porch facing west'],
];

export const TITLES = [
  [0, 'GREENHORN'], [2500, 'DROVER'], [8000, 'TRAILHAND'], [20000, 'PATHFINDER'], [45000, 'WAYFARER'], [90000, 'LEGEND OF THE LONG ROAD'],
];
export const EPITAPHS = ['gone ahead', 'rest easy friend', 'loved and walked', 'the trail was kind', 'miles well walked'];

export default { PROSE, PROSE_STATE, BIOMES, LANDMARKS, ANIMALS, REMEDIES, ILLNESS_NAME, REPAIRS, JURY_RIG, EVENT_TEXT, STRANGER_OFFERS, STORE, HAGGLE, TRADES, TRAITS, RECRUITS, DEFAULT_NAMES, POEM, VERSE_NAMES, VERSE_BONUS, BANTER, TITLES, EPITAPHS };
