# TYPEMAXX — keyboards

Five 3D keyboards in three.js, built to be dropped into a page as code with no
asset to place by hand. Every board reacts to your real keyboard: keys press,
lights ripple, switches click.

| theme | what it is |
|---|---|
| **MOCHA** | AULA F75 — 75%, brown case, tan/cream two-tone, metal volume knob |
| **PLATINUM** | Apple M0110A — beige, boxy, barely-sculpted caps |
| **STONE AGE** | irregular hewn rock caps on a rough slab |
| **RGB** | per-key chroma with a wavefront that ripples out from each keystroke |
| **TYPEWRITER** | a Smith Corona: type bars, carriage, margin bell, carriage return |

Four of the five are pure procedural geometry — no model files at all. The
typewriter is the exception and is the only thing here that has to be hosted.

## Building on Commonsmade

**See [COMMONSMADE.md](COMMONSMADE.md).** It is the handoff: what to paste and in
what order, where the game code goes, where objects are placed, and the traps.

Verified from a directory containing only `index.html`: the whole scene boots
with **zero files loaded from the local origin**. Everything else is code you
paste or a CDN URL.

## Using it

Everything is ES modules with an import map, so there is no build step. Drop the
files in, open `index.html`, done. three.js comes from jsDelivr.

The one binary is `typewriter.glb`. It is Draco-compressed to **0.71 MB** (from
3.38 MB, with no geometry lost) and is loaded from a URL, so nothing needs
placing by hand:

```js
// themes.js
model: 'https://cdn.jsdelivr.net/gh/akash-mondal/typemaster@v1.0.1/typewriter.glb'
```

The Draco decoder is pulled from the three.js CDN by `typewriter.js`. Like three
itself, it is a library URL, not an asset.

## Files

```
index.html      shell: styles, import map, mount points
app.js          engine — geometry, materials, lighting, camera fit, input, audio
themes.js       the board registry: five lines, one per board
boards/         one file per keyboard, each standalone and importable on its own
packs.js        4 mechanical switch sample sets, base64 MP3 (see licence below)
typewriter.js   the Smith Corona rig: key levers, type bars, carriage, synth voice
tw-map.js       generated: key code -> keycap position + type bar
typewriter.glb  the model (Draco)
crt.js          the CRT television prop: finish, screen, placement
crt-terminal.js ThreeUI's CRT "terminal" screen effect, ported (see licences)
crt.glb         the television (Draco)
props.js        WHERE PROPS GO — edit this to move things around
tools/          Blender scripts that build the .glb, and why they do what they do
```

## How the typewriter works

The printing point of a typewriter is fixed — every type bar converges on one
spot and the carriage slides past it. So each bar is aimed at that point rather
than swung about a shared axis, and the line ends exactly when the carriage has
travelled the platen's half-width, because past that the printing point has run
off the paper and a bar would strike air. The margin bell rings six characters
before that, and after it the next space returns the carriage.

Sounds are synthesised, not sampled: a typewriter is a struck slug, a bell and a
ratcheting return, none of which are switch samples.

See `tools/README.md` for the model conversion pipeline.

## The CRT

A television stands behind whichever board is on screen (except the typewriter,
which is its own complete machine). It is a prop rather than a theme, so it
lives outside the per-theme scene graph and is re-placed and re-scaled against
each board's measured bounds. The tube shows whatever you type.

The source .blend is 56 MB but the television is only 8,959 polys — the weight
was an 8K world HDRI and five 3K Poliigon overlay maps that glTF cannot carry.
Stripped and Draco-compressed it is **0.63 MB**.

## Moving things around

`props.js` is the whole interface for placing objects. It holds a table of
props and nothing else you need to touch:

```js
crt: {
  model: './crt.glb',
  anchor: 'behind',   // behind | infront | left | right
  widthFrac: 0.68,    // width, as a fraction of the board's width
  gap: 0.34,          // space to the board, as a fraction of its depth
  lift: 0,            // raise off the ground
  hideOn: ['typewriter'],
}
```

Everything is relative and measured at runtime, so you never need a board's
dimensions or any three.js maths. The boards differ enormously — the 60%
Platinum is 61 keys, the typewriter is a different machine entirely — and a prop
re-measures and re-places itself whenever the theme changes. To add a prop, copy
the block, point `model` at a `.glb` and give it an anchor.

## The CRT screen

The tube runs ThreeUI's `CrtBackground`, variant `terminal`: the authored 19-row
Zion boot log typing itself onto green phosphor, through the authored curvature,
scanline, aperture-grille, halation and vignette shader.

It is mapped with UVs projected onto the tube's own face rather than the
model's authored UVs, which exist for the dust and smudge overlays and would put
the image somewhere arbitrary. The offscreen buffer is built at the tube's
measured aspect so nothing is stretched.

## Licences

- **`typewriter.glb`** is derived from *"Simple Typewriter"* on
  [BlendSwap](https://blendswap.com), converted to glTF and re-rigged. BlendSwap
  models are Creative Commons — **check the original model page and comply with
  its specific licence and attribution terms before using this commercially.**
  This has not been verified for this repository.
- **`crt.glb`** is derived from *"CRT TV"*,
  [BlendSwap blend #92822](https://www.blendswap.com/blends/view/92822), released
  under **Creative Commons Attribution 3.0**. That licence *requires* naming the
  author in copies and derivative works. **The author's name is not recorded in
  the downloaded archive and still needs to be filled in here** — take it from
  the blend page above before distributing. Its textures are from Poliigon and
  the original asks that they be credited too.
- **`crt-terminal.js`** is ThreeUI's `CrtBackground` component (variant
  `terminal`), ported from the registered source bundle at
  `https://threeui.com/source-code/crt.json`, revision `860a1eb1d4c9`. The
  shaders, boot log, colour table and style block are verbatim from that bundle
  and every file's SHA-256 was verified against the manifest before porting.
  **ThreeUI's own licence terms are not stated in that bundle — check them
  before distributing.**
- **`packs.js`** contains switch samples from
  [tplai/kbsim](https://github.com/tplai/kbsim) (MIT).
- The code in this repository is otherwise free to use.
