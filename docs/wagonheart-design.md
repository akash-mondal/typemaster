# WAGONHEART: game design

**Machine:** Game 3, the stone keyboard, beige CRT and open meadow.
**Inspired by:** The Oregon Trail (MECC, 1985). We keep its structure: a party, supplies, a trail of landmarks, rivers, hunting, illness, tombstones. We use none of its names, art, text or historical setting.
**Pitch:** Lead a wagon party across a land with no far edge. Every word you type moves the wheels. Type well and you travel far. Type carelessly and the land takes its toll.

---

## 1. Why this works as a typing game

The Oregon Trail is a game of steady travel broken by sudden choices and emergencies. That rhythm maps directly onto typing:

| Oregon Trail | WAGONHEART |
|---|---|
| Pace (steady, strenuous, grueling) | **Your typing speed** is the pace. Faster means more miles and more strain. |
| Rough trail, broken wagon parts | **Your mistakes.** Wrong keys jolt the wagon: wear on wheels, oxen and people. |
| Menu choices | **Typed commands:** `rest`, `hunt`, `trade`, `ford`, `ferry`. |
| Hunting with a gun | A typing shooting gallery. Every word is a shot. |
| River crossings | A timed steering challenge over rocks and debris. |
| Illness | Remedies typed against the clock, using medicine. |
| Tombstones and epitaphs | **You type the epitaph.** It stands on the trail. |
| The trail ends at a valley | **It never ends.** Past every horizon there is new land, and it gets harder. |

The player always has something to type: travel prose while moving, targets during events, commands at camp. There is never dead air.

---

## 2. The name and the setting

A fictional frontier continent: an invented land, not 1840s America. That avoids the Oregon Trail trademark and its historical problems (the portrayal of Native peoples), and lets the land be endless.

- **Name: WAGONHEART.**
- **Tone:** warm, pastoral and bittersweet. Wide skies, stone circles, oxen bells, graves by the road.
- **Visual style:** 320x240 pixel art, side-view parallax, like KATA. It is built to sit in front of the meadow backdrop with its green hills and boulders.
- **Stone keyboard link:** the land is scattered with ancient standing stones. They are the landmarks, the route markers, and in time the mystery of the trail (section 12).

---

## 3. A run, start to finish

### 3.1 Title → new run
1. **Title screen:** the wagon rolls across the horizon at dawn. Menu: `START`, `HOW TO PLAY`, `BACK`, driven by arrows and Enter like KATA and NOVA.
2. **Choose a trade** for your party leader. It sets starting money, a skill, and the score multiplier:

| Trade | Money | Skill | Score multiplier |
|---|---|---|---|
| **Merchant** | $1,200 | Buys and sells 15% better | ×1 |
| **Wheelwright** | $700 | Repairs use half the parts and take half the typing | ×2 |
| **Farmer** | $400 | Food lasts 20% longer; foraging finds more | ×3 |

3. **Name your party.** The player types five names: the leader and four companions. This is the first typing, and it makes every later event personal ("Mara has a fever").
4. **Companion traits** are dealt at random, one each, and shown on each person's card:
   - **Scout:** warns of hazards earlier; fewer "lost trail" events.
   - **Cook:** meals restore more health; food use −10%.
   - **Healer:** remedies need one fewer word; medicine goes further.
   - **Hunter:** animals linger longer in the hunt; +1 carry capacity.
   - **Smith:** can repair without a spare part once per region.
   - **Singer:** morale decays slower; camp rest gives more.
   - **Tough:** resists illness; recovers faster.
5. **The outfitter's store** at the trailhead (section 7). You buy oxen, food, clothing, shot, spare parts and medicine. The storekeeper gives advice in one line.
6. **Departure:** a short cutscene. The wagon rolls out, the date appears (first day of spring, Year 1), and travel begins.

### 3.2 The core cycle
```
TRAVEL ── typing the trail ──► miles, days, supplies drain
   │                                       │
   ├─ EVENT fires (illness, breakdown, weather, stranger, animal)
   │         └─ typing challenge / choice ──► back to TRAVEL
   ├─ RIVER reached ──► crossing choice + crossing challenge
   ├─ LANDMARK reached ──► view, rest, talk, (fort: trade/store)
   └─ player types `camp` (Enter) ──► CAMP menu:
            rest · hunt · forage · repair · heal · rations · map · talk · move on
```

### 3.3 End of a run
A run ends when:
- **the whole party has died**, or
- **the wagon can't move** (no living oxen and no money or trade to replace them) and nobody chooses to walk on (see "On Foot" in section 9).

Then the **Trail's End** screen: miles travelled, days on the trail, landmarks passed, regions crossed, survivors, WPM, accuracy, the tombstones you left, score, and a title (section 10).

---

## 4. Travel: the heart of the game

### 4.1 What the player sees
- **Top third:** sky with a sun or moon arc, weather, and a region-coloured palette cycling through day and night.
- **Middle:** parallax meadow (far hills, mid stones and trees, near grass). The wagon and oxen roll left to right on the trail. The party walk beside or ride inside, and their sprites show their health (a limp, a slump, a blanket when sick).
- **Horizon:** the next landmark grows as you approach.
- **Bottom band, the trail ribbon:** a line of text to type, like KATA's roof boards. Letters light up as you type them. The line scrolls with the wagon.
- **HUD:** date · weather · food (lbs) · oxen · miles to next landmark · party health pips.

### 4.2 What the player types while travelling
The ribbon is **trail prose**: short, calm, observational phrases that set the scene.
- *"the grass leans east"*, *"a hawk circles the stones"*, *"mara hums an old song"*, *"the axle creaks on the slope"*
- Phrases come from pools per region, weather, time of day and party state. When someone is sick the prose notices it.
- Party names are woven in, so people recognise their own characters.

### 4.3 Typing → movement (the pace system)
- Each correct letter advances the wagon a fixed distance. **One word ≈ 1 mile.** Base: **12 words ≈ one day of travel.**
- **Pace is the rolling WPM** over the last ~10 seconds, shown as an oxen-gait icon:

| Pace | Rolling WPM | Miles per word | Health drain | Oxen fatigue | Wear |
|---|---|---|---|---|---|
| **Easy** | under 25 | ×0.8 | low | low | low |
| **Steady** | 25–45 | ×1.0 | normal | normal | normal |
| **Hard** | 45–70 | ×1.2 | +50% | +50% | +25% |
| **Driven** | over 70 | ×1.35 | +120% | +100% | +60% |

Fast typists travel far, but the land makes them pay. Slow typists are safer but eat more food per mile, because more days pass. The best runs balance the two.

- **Mistakes = rough ground.** Each wrong key:
  - jolts the wagon (a small shake and a creak), and
  - adds **wear** to a random wagon part or ox.
  - Three wrong keys within one word **stumble** an ox (a brief stop; that ox's health −5).
  - At **Driven** pace, mistakes cost double.
- **Flawless lines** (a whole ribbon line without a mistake) give **morale +1**. The party cheers, and a banjo lick plays.

### 4.4 The daily tick
Every "day" (12 words, or rest and camp actions):
- **Food:** each living person eats their ration (section 6.2).
- **Health:** affected by pace, rations, weather, clothing (in the cold), illness and morale.
- **Oxen:** fatigue, and health is lost if they're overworked or underfed (grazing is automatic in lush regions).
- **Calendar** advances; the season changes every 90 days.
- **Event roll:** the chance of an event is based on region, season, pace, wear and the party's state (section 8).

---

## 5. The land: an endless map

### 5.1 Structure
- The trail is made of **legs**. Each leg runs from one landmark to the next, **60–180 miles** long, which is about 2–4 minutes of typing.
- A **region** holds 5–7 legs and ends at a **gateway landmark**, usually a fort or crossing.
- Regions follow a **loose ring of biomes**. After the last one, the land continues into a harsher version of the first (section 5.3), so the run never ends.

### 5.2 The biomes
| Region | Look | Travel prose feel | Special hazards | Opportunities |
|---|---|---|---|---|
| **Greenmeadow** | Rolling grass, wildflowers, stone circles (the backdrop) | gentle, hopeful | mild rain, snakes, sprains | plentiful game, grazing, friendly settlers |
| **River Country** | Wide rivers, willows, ferries | busy, watery | 2–3 river crossings per region, fever | fish, ferry work for money |
| **Stone Barrens** | Grey plateau, towering monoliths, dry wind | stark, quiet | thirst, broken wheels on rock, dust storms | rare minerals to sell, the standing stones (section 12) |
| **Highwood** | Pine forest, steep grades, fog | close, echoing | lost trail, falling trees, wolves at night | timber for repairs, herbs (medicine) |
| **The Pass** | Snow, cliffs, thin air | cold, urgent | snowstorms, frostbite, avalanche, oxen deaths | trapper huts, furs to sell |
| **Saltmere** | White salt flats, mirages, heat | shimmering, unreal | heat stroke, water scarcity, mirages that fake a landmark | salt to trade, fast flat travel |
| **Sunset Coast** | Cliffs, sea, orchards | relief, bittersweet | storms, tides at crossings | big trading town, rest, recruiting (section 9.3) |

Each biome has its own palette, parallax layers, weather, animals for hunting, prose pool, music and landmark silhouettes.

### 5.3 Endless: "The Far Land"
After the Sunset Coast, a boat or cliff road carries the party on to the **next crossing**:
- **Crossing count** (Crossing 1, 2, 3 …) is the difficulty dial, like KATA's stages. It rises until **Crossing 6** and then holds.
- Each new crossing shuffles the biome order a little (Greenmeadow always comes first, the Pass always before the Coast) and applies harsher settings:

| Setting | Crossing 1 | Crossing 3 | Crossing 6+ (cap) |
|---|---|---|---|
| Event chance per day | 8% | 12% | 16% |
| Illness severity | base | +1 stage | +2 stages |
| Game animals in hunts | many | fewer | scarce, faster |
| Prices at stores | ×1 | ×1.5 | ×2.2 |
| River current speed | slow | medium | fast |
| Prose word length | 3–6 letters | 4–8 | 5–10 |
| Winter length | 60 days | 80 | 100 |

- Every crossing gets a **name**, generated from region words ("The Crossing of Grey Winds"), for the Trail's End screen.

### 5.4 Landmarks
Every leg ends at one, and each is a moment to breathe:
- **Natural:** Chimney-style spires, a lone oak, a waterfall, a salt arch, a stone circle.
- **Forts and towns** (every 2–3 legs): store, trading, repairs, doctor, recruiting, rumours.
- **Arrival scene:** the wagon stops, the landmark name appears in big letters, a short stanza of prose plays, and the party comments.
- Options at a landmark, as typed commands: `look` (a view and hint), `talk` (a stranger's line: a tip, a trade or a quest), `rest`, `store` (forts), `move on`.

---

## 6. Resources

### 6.1 The wagon inventory
| Item | Use | Unit | Weight |
|---|---|---|---|
| **Oxen** | Pull the wagon; speed depends on healthy count (need ≥2) | head | – |
| **Food** | People eat daily | lbs | carried |
| **Water** | Only matters in the Barrens and Saltmere; refill at springs and rivers | casks | carried |
| **Clothing** | Protects from cold; wears out | sets | carried |
| **Shot** | Hunting ammunition; one shot per word fired | rounds | carried |
| **Spare parts** | Wheel, axle, tongue | pieces | carried |
| **Medicine** | Remedies; each typed treatment uses one | doses | carried |
| **Money** | Stores, ferries, doctors | $ | – |
| **Trade goods** | Furs, salt, minerals, timber, found along the way | pieces | carried |

**Wagon capacity:** 2,000 lbs. Overloading slows travel (miles per word ×0.8) and adds wear.

### 6.2 Rations
Set at camp: **Filling** (3 lbs per person per day, health up), **Meagre** (2 lbs, neutral), **Bare** (1 lb, health down, morale down).

### 6.3 Health
Each person has **Health 0–100**, shown as pips and posture. Stages: *Good* over 70, *Fair* 45–70, *Poor* 20–45, *Critical* under 20. At 0 they die.
**Oxen** have health too. A dead ox slows the wagon, and at fewer than 2 oxen the wagon stops.

### 6.4 Morale (new)
The party's shared **Morale 0–100**:
- **Up:** flawless lines, good hunts, landmarks, rest, filling meals, songs (the Singer), reunions.
- **Down:** deaths, hunger, bad weather streaks, arguments, wagon breakdowns.
- **Effects:** low morale raises illness chance and adds "hesitation" (the ribbon line briefly blurs before it shows). High morale gives a slight speed bonus and faster healing.

---

## 7. Stores and trading

### 7.1 The store (trailhead and forts)
- A shelf screen with pixel icons. To buy, **type the item and the amount**: `oxen 2`, `food 300`, `shot 60`. Backspace to correct; Enter to confirm the basket.
- The storekeeper comments on your choices ("That's thin for the Pass, friend").
- Prices rise with remoteness and crossing number (section 5.3).

| Item | Trailhead price |
|---|---|
| Yoke of oxen (2) | $40 |
| Food | $0.20/lb |
| Clothing set | $10 |
| Shot, box of 20 | $2 |
| Spare wheel / axle / tongue | $10 each |
| Medicine dose | $6 |
| Water cask | $3 |

### 7.2 Haggling (the typing twist)
At forts you can **haggle**. The trader says a phrase ("I won't go lower than eight") and you get a counter-phrase to type **fast and flawlessly** before their patience bar empties.
- **Clean and fast:** price −15%.
- **Mistakes:** the trader gets offended, and the price rises 10% for this visit.
- The **Merchant** trade gets a longer patience bar.

### 7.3 Trading with travellers
On the trail, strangers offer swaps ("2 spare wheels for 150 lbs of food"). You type `accept` or `refuse`, or `counter` to open a haggle.

---

## 8. Events: the moments that make a run

Events interrupt travel. The ribbon pauses, a **card** slides up with pixel art and a line of prose, and the player responds by typing. Each event is either a **choice** (type one of the words shown) or a **challenge** (a timed typing mini-game).

### 8.1 Health events
| Event | Challenge |
|---|---|
| **Fever, dysentery, cholera, measles, chill** (region and season weighted) | **Remedy:** a short chain of remedy words (`boil water`, `cool cloth`, `rest`) against a fading pulse bar. Uses 1 medicine. Clean: they recover over days. Failed or no medicine: health drain continues and a rest-days choice is offered. The **Healer** removes one word. |
| **Snakebite** | **Quick draw:** a 3–4 letter word must be typed in under 2 seconds, then a remedy chain. |
| **Broken arm / leg** | **Splint:** a sequence of words typed in order with no mistakes. The person can't walk; they ride in the wagon, which adds weight. |
| **Exhaustion** (from Hard/Driven pace) | **Choice:** `rest` (lose days) or `push on` (health risk). |
| **Frostbite** (the Pass, no clothing) | **Warm-up:** type fast to "rub hands"; each word restores warmth; clothing gives extra time. |

### 8.2 Wagon and oxen
| Event | Challenge |
|---|---|
| **Broken wheel / axle / tongue** (more likely with high wear) | **Repair:** type the repair steps in order (`lift`, `brace`, `fit`, `pin`, `drive`), using the spare part. No spare: `jury-rig` (a longer chain, and the part may fail again) or `wait` for a traveller. |
| **Ox injured / ox wanders off** | **Round-up:** the ox runs across the meadow; type its bell word as it passes. |
| **Wagon stuck in mud** | **Push:** type a fast burst; every word heaves the wagon; the pace drives the heave. |
| **Stampede** (herd crossing the trail) | **Dodge:** words appear left or right; type the one on the safe side as the herd passes. |

### 8.3 Weather and land
| Event | Effect / challenge |
|---|---|
| **Thunderstorm** | The ribbon flickers with the lightning, and travel is slower. |
| **Dust storm** (Barrens) | Letters in the ribbon are half-hidden by drifting dust, so you read through the storm. |
| **Snowstorm** (the Pass) | Words arrive slower, and the cold drains health. |
| **Fog / lost trail** (Highwood) | **Find the way:** three direction words appear (`north stone`, `creek bend`, `old oak`); the Scout's hint marks one; typing a wrong one costs days. |
| **Mirage** (Saltmere) | A false landmark: its name glows, and typing it wastes a day. A careful reader notices the letters are shimmering. |
| **Heatwave** | Water use ×2. |
| **Wildfire** | **Outrun:** a fast typing burst to reach the stones before the flames. |

### 8.4 People and creatures
| Event | Challenge |
|---|---|
| **Stranger on the trail** | Talk: a trade, a tip, a request ("my wagon's broken, help?"). Helping costs time or parts but earns morale and sometimes a reward later. |
| **Thieves in the night** | **Night watch:** shapes move at the camp edge; type their words before they reach the wagon, or lose supplies. |
| **Wolves** (Highwood / the Pass) | **Defend camp:** a mini-NOVA; words close in from the dark; each typed word is a shot and costs shot. |
| **Lost child / lost traveller** | **Search:** follow typed clue words through tall grass; finding them brings a new companion (section 9.3). |
| **Travelling musician** | Morale +20, and a new tune joins the soundtrack for this region. |

### 8.5 Good fortune
Wild berries (`forage` bonus), an abandoned wagon (salvage parts), a spring (water), a shortcut ("the old stone road": save 40 miles, but with a hazard roll), a trapper's cabin (trade furs).

---

## 9. Camp, hunting and rivers

### 9.1 Camp (press Enter while travelling)
The wagon stops, the campfire lights, crickets start, and the menu appears as words to type:

| Command | What happens |
|---|---|
| `rest` | Choose days (1–9) by typing a number; health and morale rise, food drains |
| `hunt` | Hunting ground (section 9.2) |
| `forage` | Short typing gather: plants and berries rise from the grass; type them to pick (food +, sometimes herbs → medicine) |
| `repair` | Spend parts to reduce wear before it breaks |
| `heal` | Treat a sick person proactively |
| `rations` | Filling / meagre / bare |
| `map` | The trail map (section 11.3) |
| `talk` | Party banter: lines that reveal traits and hints and build attachment |
| `move on` | Back to travel |

### 9.2 Hunting (the typing shooting gallery)
- **Scene:** the meadow at hunting time. Animals cross at different depths and speeds, with the region's fauna (hares, deer, bison-like grazers, wild boar, elk, mountain goats, sea birds).
- **Each animal carries a word.** Its length matches the animal: hare 3–4, deer 5–6, elk 7–8, a great ox-beast 9–11.
- **First letter locks on** (like NOVA), and each letter uses **1 shot**. Finish the word and it's a clean shot. A wrong key is a missed shot, and the animal bolts faster.
- **Limit: 60 seconds or out of shot.** Food carried back is capped at **100 lbs** (200 with the Hunter), so overhunting wastes meat, which the game points out.
- **Regional scarcity:** each hunt in the same region lowers the number of animals.
- **Special animals:** a rare white stag (big morale +, no meat, spare it by typing `spare` instead of shooting), and a charging boar (type fast or someone gets hurt).

### 9.3 Recruiting (needed for an endless run)
At towns, and through events, **travellers ask to join**:
- Each recruit has a name (pre-generated; the player can rename them by typing) and a trait.
- The party is capped at **6**.
- This is how a party survives across many crossings. Old companions can also **choose to settle** at a town they love: they leave the party but add a big score bonus and a "settled" record on the Trail's End screen.

### 9.4 Rivers
At a river landmark, **read the river**: depth (feet), width, current (slow / swift / raging), with weather affecting it.

Choices (typed):
| Choice | Cost | Challenge |
|---|---|---|
| `ford` | free | **Steer:** the wagon wades across; rocks and snags float at you with words; type to steer around them. Depth > 3 ft makes it long and hard. Failure: supplies wash away, oxen may drown, someone may be swept (rescue challenge). |
| `caulk` | free, 1 day | **Float:** seal the wagon (a short typing chain), then a longer steer challenge with calmer words; tipping loses more if it fails. |
| `ferry` | $5–$20, wait 1–3 days | Safe; a short cutscene. |
| `wait` | days pass | The river may drop or rise. |
| `guide` (where offered) | trade goods | Safer ford; the guide's word hints glow. |

**Swept away:** a companion drifts downstream while calling out. Type the rope words before they pass the bend to save them.

---

## 10. Death, tombstones and the Trail's End

### 10.1 Death
When someone dies:
- The run slows to a stop, the music drops to one instrument, and a grave is dug on the trail.
- **The player types the epitaph**: free text of up to 40 characters, or `skip`.
- The tombstone stays at that mile of the trail **for the rest of the run**, and the wagon passes it again only if the trail loops.
- **Later, with the database:** tombstones from other players' runs could appear along everyone's trails, just as Oregon Trail graves carried other players' epitaphs. That is a strong social hook once accounts and a database exist. No local storage until then.

### 10.2 Scoring
- **Miles** × 1
- **Landmarks reached** × 50
- **Regions crossed** × 500
- **Each crossing completed** × 2,000
- **Survivors at each gateway fort** × 100 each (health-weighted: Good ×1, Fair ×0.75, Poor ×0.5)
- **Companions settled** × 750
- **Flawless lines** × 5
- × the **trade multiplier** (Merchant ×1, Wheelwright ×2, Farmer ×3)
- × an **accuracy factor** (0.5 + accuracy/200, as in KATA)

### 10.3 Trail's End screen
A pixel diorama of the wagon at its last campsite, with:
- Miles, days, crossings, regions, landmarks, WPM, accuracy, score.
- **The Ledger:** every tombstone with its epitaph and the mile it stands at.
- **Your title** based on score and survival: *Greenhorn → Drover → Trailhand → Pathfinder → Wayfarer → Legend of the Far Land*.
- Menu: `RETRY` (a new party), `MENU`.

---

## 11. Presentation

### 11.1 Screens
1. Title (dawn wagon parallax, logo).
2. How to play: a 5-card storybook.
3. Trade select, then name party (typing), then traits reveal.
4. Store.
5. Travel (main).
6. Event cards.
7. Camp (campfire scene).
8. Hunt.
9. River.
10. Landmark arrival.
11. Map.
12. Grave (epitaph typing).
13. Trail's End.
14. Pause (Esc: resume, map, quit run).

### 11.2 Art direction
- **Palette:** meadow greens, warm canvas beige, ox browns, sunset golds; each biome shifts it.
- **Wagon:** a canvas-top wagon with 2–6 oxen. Walk cycles show health. Canvas colour fades and patches as wear rises, so the wagon's condition can be read at a glance.
- **Party:** five tiny walkers with distinct hats and clothes (by trait). Illness shows as posture.
- **Day/night:** a 24-step palette cycle over each travel day, with stars and a campfire glow at night.
- **Landmarks:** big silhouette sprites that grow on the horizon.
- **Tombstones:** carved stone sprites with a pixel-font epitaph when you pass close.
- **Assets:** generated plus CC0 references, like NOVA. We'd look for CC0 pixel wagon, oxen, animal and prairie packs first.

### 11.3 The map
- A parchment map, drawn as you go. The trail line inks itself mile by mile, with landmark icons, river marks, and tombstone crosses where people died.
- Unexplored land beyond shows as faint stones and question marks.
- On the map, `route` lets you choose between forks where the trail splits (the shortcut has more risk).

### 11.4 Sound (the same engine as KATA and NOVA)
- **Instruments:** folk chiptune: plucked banjo (Karplus-Strong), harmonica (reedy pulse), fiddle (bowed saw with vibrato), soft accordion pad, stompbox and shaker, an ox bell.
- **Songs:** one per biome with intensity layers (calm travel → event → danger), a campfire song, a river song, a hunting drum, a grave lament, and a Trail's End ballad.
- **Effects:** wheel creak on mistakes, ox moo and bell, a whip crack on pace up, a river rush, a shot, animal calls, the thunder crack, a quill scratch while typing the epitaph, a coin clink at the store.
- **Nothing sounds on a keystroke itself:** the stone keyboard already clicks.

---

## 12. The mystery: the standing stones (a reason to keep going)

An endless run needs a pull beyond survival. **Standing stones** appear in every region, carved with fragments of an old poem.
- At a stone landmark, `read` opens a **stanza challenge**: type the carved line **flawlessly** to "wake" the stone.
- Each woken stone adds one line to **The Wagonheart Poem**, shown in the map's margin.
- Every **7 lines** complete a verse, which gives a permanent run bonus (e.g. "The Verse of Rivers: crossings are calmer").
- Stones in later crossings carry later verses. Nobody reaches the end in one sitting, which gives long-term motivation. With a database later, the community's furthest verse could be shown.

---

## 13. Difficulty and balance (targets)

| Player | Expected outcome |
|---|---|
| 25 WPM, 90% accuracy, careful | Reaches Crossing 1's coast in about 25–35 minutes; loses 1–2 people |
| 45 WPM, 95% | Comfortably through Crossing 2; a real test in the Pass |
| 70+ WPM, 97%+, smart play | Crossings 4–6; runs of an hour or more |

- Leg length and event density are tuned so a player types continuously, with an event roughly every **45–90 seconds** of travel.
- **The Pass in winter must be dangerous**, the classic lesson. Players learn to time their crossings, which rewards planning beyond typing.
- **No soft-lock:** if stranded, "On Foot" mode lets the party walk to the next fort. Travel is at 50% speed, and they carry only 200 lbs.

---

## 14. The select-screen showcase (tile 3)

A 10-second loop like KATA and NOVA:
1. **0–2 s:** dawn over Greenmeadow; the wagon rolls in; the logo resolves in carved stone letters.
2. **2–4 s:** a jump cut to a river crossing; the wagon lurches, spray flies, words dodge rocks.
3. **4–6 s:** hunting in tall grass; a deer word is typed and it falls.
4. **6–8 s:** the Pass in a snowstorm, the oxen straining; then a tombstone with a typed epitaph.
5. **8–10 s:** the Sunset Coast; the party silhouettes at the cliff edge; cut back to dawn for a seamless loop.

- **App icon:** the wagon wheel crossed with a standing stone on a sunset gradient.
- **Music:** banjo and fiddle, with hits on each cut.

---

## 15. Build plan (milestones)

1. **M1: Travel core.** The ribbon, typing to movement, the pace system, the day tick, food and health, two biomes, landmarks, HUD, basic art. (Playable: walk and survive.)
2. **M2: Party and store.** Trade select, naming, traits, store with typed buying, rations, morale.
3. **M3: Events.** The card system plus 12 core events (illness, breakdowns, weather, strangers), with remedies and repairs.
4. **M4: Hunting and rivers.** Both mini-games fully juiced.
5. **M5: Death and Trail's End.** Graves, epitaphs, scoring, titles, the ledger.
6. **M6: Endless.** All 7 biomes, crossings difficulty, recruiting, settling, the map, route forks, On Foot.
7. **M7: The stones.** The poem system and verse bonuses.
8. **M8: Sound.** Folk chiptune rack, biome songs with layers, all effects.
9. **M9: Showcase and polish.** Trailer, logo, icon, tuning pass with a bot, performance.

Each milestone ships as a tagged release, testable in the local harness like NOVA.

---

## 16. Light and land: day/night and biome transitions (core system)

Every moment on the trail has a **light**, blended from two things: the **biome** (where you are) and the **time of day** (when you are). Nothing ever cuts.

### 16.1 Time of day
- A travel day is **12 words ≈ one day**, so a full day and night passes every ~20–40 seconds of typing. At camp the clock runs on its own (rest days fast-forward with a timelapse).
- The day is a loop of **8 keyframes**: `night → predawn → dawn → morning → noon → afternoon → dusk → twilight → night`.
- Blending between keyframes is smooth (eased, not linear), so the sky never steps.

### 16.2 What a keyframe defines, per biome
Each of the 7 biomes has **its own 8 keyframes**, hand-tuned. Each keyframe holds:
| Field | Meaning |
|---|---|
| `skyTop`, `skyMid`, `skyLow` | Three-stop sky gradient |
| `sun` / `moon` | Disc colour, glow colour, glow size, height on its arc |
| `stars` | Star alpha (0 by day), twinkle speed, aurora on/off (the Pass) |
| `clouds` | Tint and alpha of each cloud band |
| `far`, `mid`, `near` | Colour grade for each parallax depth (multiply tint + light lift), so distance reads through atmosphere |
| `rim` | Rim-light colour on the wagon, oxen and people (warm at dawn/dusk, blue by moon) |
| `fog` | Colour and density at the horizon |
| `ambient` | Sprite brightness at the lit and shaded ends |
| `lamps` | Lantern/campfire glow strength (0 by day, full by night) |
| `particles` | Biome ambience that changes with time: fireflies (Greenmeadow night), dust motes (Barrens noon), river mist (dawn), snow sparkle (the Pass by moon), heat shimmer (Saltmere noon), sea spray and gulls (Coast morning) |

### 16.3 The designed looks (summary)
- **Greenmeadow:** a lavender and peach dawn; soft gold noon; a long amber dusk that rims the grass; a deep blue night full of fireflies with the standing stones in silhouette.
- **River Country:** a pearl-grey misty dawn with the water catching pink; a bright noon with glints; dusk reflected in the river; a cool green night with frogs and moon ripples.
- **Stone Barrens:** a hard white-blue noon; ochre and violet dusk with monoliths casting long shadows; a black night with an enormous starfield and a cold moon.
- **Highwood:** god-rays through pines at morning; a green-gold afternoon; an early dusk under the canopy; a near-black night with lantern pools and owl eyes.
- **The Pass:** a blinding blue-white day; a rose-gold alpenglow dusk; a moonlit night where the snow glows and an aurora waves.
- **Saltmere:** a pastel mirage morning; a bleached white noon with heat shimmer; a dusk that is a single sheet of orange; a purple night where the flats mirror the stars.
- **Sunset Coast:** a silver sea morning; a turquoise noon; its famous dusk (red sun into the sea); a night of lighthouse beams and phosphor waves.

### 16.4 Weather layers on top
Rain, storms, snow, dust, fog and heat each multiply over the keyframe (darker sky, lower contrast, particle layers, lightning flashes that relight the scene for 2 frames). Weather changes also blend over ~8 seconds.

### 16.5 Biome transitions (never a cut)
- A transition happens over a **transition zone of ~30 miles** at the start of a new region, which is roughly 30 words of travel.
- **Terrain:** each parallax depth crossfades from old to new art on its own schedule. Far mountains change first, then mid trees and stones, and near ground last as the wheels roll onto it. It reads as travelling into new country.
- **Light:** the old biome's keyframe for the current time blends into the new biome's, so a meadow dusk melts into a barrens dusk, not into noon.
- **Details:** the prose shifts vocabulary halfway through; ambience particles hand over (fireflies thin out, dust motes drift in); the music crossfades on the bar line (the sound engine already does this).
- A **gateway landmark** (fort or crossing) sits at the midpoint of the zone, so the change feels earned.
- **Between crossings** (Coast → the next Greenmeadow), a short ferry or cliff-road sequence at dusk hands over the whole palette. The new crossing always begins at dawn.

### 16.6 Implementation notes
- Keyframes live in a data table per biome (`LIGHT[biome][8]`), easy to tune in a review page with a time-of-day slider and a biome picker.
- Grading is applied per layer by drawing each layer into an offscreen buffer and tinting (multiply + additive lift), cached per ~64 light steps so it costs nothing per frame.
- Sprites get a rim-light pass from pre-built rim masks (generated in the art pipeline), so wagons and oxen catch the dawn.
