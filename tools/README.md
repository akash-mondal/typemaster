# typewriter model pipeline

`typewriter.glb` is built from **"Simple Typewriter"** (a Smith Corona) downloaded
from BlendSwap. BlendSwap models carry a Creative Commons licence — check the
model page and keep whatever attribution it requires before shipping.

The raw .blend is not in this repo (it is ~18 MB and only needed to re-export).
To rebuild the model from it:

```sh
blender -b "Simple Typewriter.blend" --python tools/blend-to-glb.py   # writes /tmp/tw_prepped.blend + tw_map.json
blender -b /tmp/tw_prepped.blend     --python tools/export-glb.py     # writes /tmp/typewriter.glb
cp /tmp/typewriter.glb /tmp/tw_map.json .
```

`blend-to-glb.py` is the important half. The stock file has 107 meshes named
`Body1`, `Body2.003` and so on, with every origin at the world centre — useless
for animation. It:

* drops the cameras and backdrop planes,
* buckets the 48 key levers into 4 rows by their cap position and names them
  `KEY_<KeyboardEvent.code>` using the order read off the baked legend atlas
  (`Keys Layout-01.png`), leaving the wide flat one as `KEYPLATE`,
* moves each key's origin onto its hinge at the back of the lever, so a press
  is one rotation about X,
* names the 42 type bars `BAR_00..41` sorted by x and pivots them in the basket,
  then pairs each typing key with the bar at the same relative position so the
  basket fans naturally (this is not the real mechanical linkage, but it reads
  correctly and no two keys share a bar),
* renames the platen / paper tensioner / tape / return lever and parents them to
  a new `CARRIAGE` empty so the assembly slides as one,
* writes `tw_map.json`: `code -> { cap:[x,y,z], bar:"BAR_nn" }`.

`typewriter.js` depends on exactly these names. If you re-export, keep them.

Materials are *not* worth fixing in Blender: they are shader-node driven and
glTF can only carry flat principled values, so everything arrives white. The
re-grade lives in the `FINISH` table in `typewriter.js`.
