# VECTOR: design

An isometric light-cycle game driven by typing. Tile 4 of TYPEMAXX (RGB keyboard). It is endless: sectors of rising difficulty, with a boss every fifth sector. Our own designs throughout; no names, designs or music from any film.

## 1. The one rule
**Typing is the engine and the steering wheel.** Words make you fast, single keys turn you, and every typo shortens the wall of light behind you.

## 2. Controls
| Input | Effect |
|---|---|
| **Steer keys** | Two letter keycaps float beside the bike, left and right. Press one to turn 90° that way (relative to heading). The turn happens at the next cell centre. After every turn both letters are re-rolled. |
| **Word letters** | The current word floats just above the bike. Each correct letter feeds the engine. A finished word gives a speed pulse and +1 streak. |
| **Wrong letter** | Any letter that is neither the word's next letter nor a steer key is a typo. The wall is cut by 4 cells with a spark, the streak resets, and the engine sputters (0.3 s at cruise). |
| **Backspace** | Brake: speed × 0.55 while held. Draws on a 1.5 s brake reserve that refills in 4 s. |
| **Enter** | Fire the carried power cell. |

- Steer letters are never letters in the current word, and a new word never contains the current steer letters, so the two can't clash.
- **Steer letter pools:**
  - Sectors 1–3: home row (`asdfjkl` + `gh`).
  - Sectors 4–7: home and top rows.
  - Sector 8 on: all 26 letters.
  - Sector 12 on: a turn sometimes needs two letters in order.
- **Words:** 3–5 letters early, rising to 5–9. The pool is themed (grid, pulse, vector, cipher, …) plus common words.

## 3. Grid, movement and collision
- **Arena:** N×N cells (sector 1 is 18×18, growing to 30×30 by sector 12). A rim wall surrounds it.
- **Movement:** bikes move along cell centres in four directions and turn only at a cell centre. A turn queued mid-cell is applied at the next centre; a second queued turn waits for the centre after that.
- **Occupancy grid:** each cell stores `owner`, `laidAt` (a distance stamp) and `level` (0 floor, 1 deck).
  - A bike lays its wall into each cell it leaves.
  - A wall cell lives while `owner.distance − laidAt < owner.trailLength`, so a trail is a fixed-length snake that follows its bike.
- **Speed** is measured in cells per second:
  - Cruise 3.2.
  - Word pulse +1.6, decaying over 1.2 s.
  - Streak bonus +0.25 per streak, up to +3.
  - Grind up to +2.5.
  - Hard cap 10 (the sector's cap starts at 7).
- **Crash:** entering a live wall cell, the rim, or another bike's cell derezzes you. Two bikes entering the same cell together both derez.
- **Buffer (near-miss grace):**
  - When the next cell is blocked, the bike holds at the cell edge instead of dying, draining a buffer of 0.35 s.
  - Turn away within that window to survive, with sparks.
  - The buffer refills at 0.25 s per second.
  - Grinding and holds share the one buffer, so chaining close calls gets deadly.
- **Grind:**
  - Riding in a cell next to a parallel live wall (either side) grinds.
  - Speed rises by 0.9 per second of grinding (up to +2.5) and energy +12 per second, with sparks on that side.
  - Grinding between two walls doubles both, which is a slingshot.

## 4. Trails and streak
- Trail length in cells = 6 + 2 × streak, up to 40.
- A typo cuts 4 cells immediately; the tail cells vanish with a flicker.
- The streak also multiplies score: × (1 + streak / 10).

## 5. Energy and power cells
- **Energy** (0–100) comes from grinding, words (+4 each, +8 when flawless) and seals (+30).
  - When full, your next word turns gold, an **ability word** such as `pulse`, `derez` or `phase`.
  - Finish it without a typo to fire a **Pulse**: a ring that knocks every nearby bike off its line (they must turn at once) and wipes wall cells within 3 cells.
- **Power cells** spawn on free cells every 12–18 s, at most 2 on the board. You carry one; a pickup replaces what you hold.

| Cell | Effect |
|---|---|
| **Shield** | Pass through one wall cell; it shatters. Lasts until used. |
| **Lance** | A bolt flies straight ahead 12 cells, destroying walls and any bike it hits. |
| **Spike** | For 4 s, each cell you lay also raises short side walls one cell out. |
| **Phase** | For 3 s you pass through your own wall. |
| **Surge** | Every bike gets +3 speed for 3 s. You have 0.5 s warning; they don't. |
| **Reset** | Every wall on the board fades out over 0.4 s. |

## 6. Seal
- When a rival bike is enclosed in a region no larger than 60 cells, bounded only by walls, the rim or level edges, the region pulses and a SEAL is scored. The rival panics and must crash within the region.
- Scoring: +250 × sector, and energy +30.
- Detection is a flood fill from each rival every 0.25 s, capped at 61 cells.

## 7. Rival programs
Every rival is a bike from the same model family: colour variants plus added silhouette parts.

| Rival | Colour | First sector | Behaviour |
|---|---|---|---|
| **Drone** | pale blue-white | 1 | Wanders. Turns when the path ahead within 3 cells is blocked, or at random every 2–4 s. Doesn't hunt. |
| **Hunter** | orange | 2 | Predicts your position 1 s ahead and cuts across it. Grinds your wall when it's parallel. |
| **Sealer** | magenta, in pairs | 4 | One rides parallel to you, the other swings wide to close the box. |
| **Mirror** | violet | 6 | Repeats your turns 1 s later, from wherever it is. |
| **Glitch** | green | 8 | Every 5 s it teleports 4 cells ahead through anything, leaving a broken wall stub. |
| **Warden** | red, armoured | 10 | Slow (0.8×) with a trail twice as long. It takes two seals: the first breaks its armour. |

**AI:** every rival looks ahead 6 cells, scores its three options (straight, left, right) on free space (a capped flood fill), its goal, and randomness, then picks the best. Difficulty scales look-ahead and reaction time.

## 8. Arenas
Features unlock by sector:

| Sector | Unlocks |
|---|---|
| 1 | Flat floor and rim. |
| 3 | **Speed strips** (×1.5 while on them) and **slow strips** (×0.6). |
| 6 | **Decks:** raised platforms (level 1) reached by **ramps** from one side. Walls only block on their own level. A bike can ride under a deck on level 0; a deck bike can drop off an open edge. |
| 8 | **Portals:** paired rings that move a bike to the partner cell, keeping its heading. Walls don't pass through. |
| 10 | **Fault tiles:** cells that flash for 1 s, then fall away into the void for 6 s, killing any bike on them. |
| 12 | **Gates:** rotating bars that alternately block two lanes every 3 s. |

Layouts are generated from symmetrical templates (mirror or rotational) with a seeded RNG, and are checked by flood fill so every spawn can reach every other.

## 9. Sector flow
1. **Boot:** the grid draws itself outward from the centre over 1.2 s, the bikes rez in with a vertical scan, and a 3-2-1 count runs using the steer keys as a warm-up.
2. **Fight:** derez every rival.
3. **Exit:** when the arena is empty a gate lights on the rim for a 2-second victory ride, then the sector ends by itself with a time bonus and restores one core (up to the maximum).
4. **Compile:** choose 1 of 3 upgrades by typing its name. 20 upgrades exist; each can be taken up to 3 times.
- **Lives:** 3 cores. Lose one and you rez again at a free spawn with 2 s of shield. The rivals keep their walls.
- **Boss** every 5th sector.

**Upgrades (examples)**
- *Buffer+* (+0.1 s grace)
- *Long Wall* (+4 base trail)
- *Clean Code* (the first typo each sector costs nothing)
- *Pocket* (carry 2 cells)
- *Magnet* (pick up cells from 2 cells away)
- *Afterburn* (word pulse lasts longer)
- *Hardened* (+1 core, once)
- *Overclock* (+1 cap, +10% score, the whole run)
- *Sealant* (seal limit 80 cells)
- *Echo* (every 3rd word refunds 1 s of brake)

## 10. Boss: the Overseer
- **Design:** our own flying hexagonal warden with three tether arms. It hovers over the arena casting a real shadow.
- **Weak points:** three **anchor pylons** on the floor tie it down. Seal a box around a pylon, with your own walls around its cell region, to break that anchor. Break all three and it falls and derezzes.
- **Attacks (telegraphed 0.8 s, faster later):**
  - **Sweep:** a line of cells glows, then becomes lethal for 0.5 s.
  - **Drop:** shadows grow on 4–8 cells, then light pillars (walls) slam down for 5 s.
  - **Brood:** releases 2 drones.
- Each broken anchor makes it angrier: attacks come faster and more at once.
- **Later bosses** (sector 10, 15, …) repeat with more pylons, which also move.

## 11. Scoring
| Event | Score |
|---|---|
| Derez | 100 × sector |
| Seal | 250 × sector |
| Word | 10 |
| Grind | 2 per cell |
| Sector clear | Time bonus up to 1000 × sector, and one core restored |
| Boss | 5000 × tier |

All multiplied by the streak multiplier. Scores are kept in memory only.

## 12. Difficulty targets (verified by headless bot runs)
- **30 wpm:** clears sectors 1–3 reliably and dies around sector 5.
- **50 wpm:** reaches about sector 8–10.
- **80 wpm and accurate:** reaches the second boss or beyond.
- Sector 1 takes 45–90 s. Everything is endless: after sector 30 the ladder stops growing and only gets faster.

## 13. Presentation
- **Pixel grid:** 480×360. Cells are 48×24 diamonds. The camera follows the player smoothly with pixel-snapped offsets and leads in the heading direction.
- **Draw order, back to front:**
  1. Void and stars.
  2. Floor, with light pools from bikes and walls.
  3. Walls and bikes, depth-sorted per cell by (x + y), then level.
  4. Particles.
  5. Glow layer (additive).
  6. HUD.
- **Glow:** emissive pixels (bike light, walls, pickups) are drawn into a separate half-resolution canvas, blurred by a downsample chain, and added back.
- **Sprites:** pre-rendered from Blender models (`tools/vectorart`):
  - Bikes: 16 directions × 3 leans × 3 wheel frames, with glow masks.
  - Derez: 12 frames × 8 directions.
  - Overseer: 16 directions plus attack poses.
  - Power cells: 8-frame spins.
  - Pylons, gates and portals.
- **Crash (derez):** the bike breaks into glowing voxel shards that fly out and fall, the wall dissolves from the tail, and there's a short time-slow and camera kick.
- **HUD:**
  - Top: sector, score, cores, streak.
  - Bottom: energy bar, carried cell, speed readout.
  - Word and steer keys: over the bike.

## 14. Sound
- **Music:** original pieces in the TRON: Legacy style (see `tools/audio/vector/STYLE.md`).
  - Boot: a drone and pulse.
  - Sector: about 120 bpm filter-house with layers on speed and streak.
  - Boss: about 100 bpm, orchestral synth with timpani and brass.
  - Compile: arpeggio and pad.
  - Results: a slow brass swell.
- **Effects:**
  - Engine hum whose pitch follows speed.
  - Turn chirps (on the turn itself, never on the keystroke).
  - Grind hiss, sealing chord, derez shatter, pickups, pulse ring, boss attacks and warnings.
- **Nothing plays on a keystroke itself.**
