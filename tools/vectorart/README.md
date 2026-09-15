# VECTOR art pipeline

Every sprite in `assets/vector` is rendered from models built in code here. No third-party
models, textures or effects are used.

- `common.py`: Blender helpers.
  - An orthographic 2:1 dimetric camera, 48×24 cells, 16.97 px per world unit.
  - Toon materials (Shader to RGB with a constant ramp).
  - Three aliased passes per frame:
    - body: the key light only
    - rim: a view-dependent Fresnel edge
    - ids: part ids and an emissive flag
- `bike.py`: our light bike, with variants `rider`, `warden` (armoured) and `derez` (voxel shards).
  - rider and warden: 16 directions × 3 leans × 3 wheel frames.
  - derez: 8 directions × 12 frames.
- `models.py`:
  - `boss`: the Overseer, 12 frames, idle and charged.
  - `cell`: the power cell, 8 frames.
  - `pylon`: the anchor pylon.
- `post.py`: the pixel pass.
  - Seams between parts get darkened.
  - A one-pixel outline goes round the silhouette.
  - A tint mask is written: R rim, G light, B outline. The game colours each atlas at load, so one render set serves every bike colour.
- `build.py`: renders everything (Blender 5.x on PATH), cleans it, trims and packs it into:
  - `sprites.png` and `mask.png`, which share one layout
  - `sprites.json`, holding `[x, y, w, h, originX, originY]` per sprite
  - the baked monogram font (CC0, datagoblin; the TTF is read from `tools/wagonart/ref`, which stays out of git)

To rebuild: `python3 tools/vectorart/build.py`. It takes about a minute. Raw renders go to `tools/vectorart/out`, which is gitignored.
