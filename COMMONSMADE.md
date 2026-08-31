# Building this on Commonsmade

Everything here is **code you paste**. There is no build step, no npm install, no
file to upload. Verified: served from a directory containing nothing but
`index.html`, the whole scene boots — 5 keyboards, the CRT, the sounds — with
**zero files loaded from the local origin**. three.js, the Draco decoder and both
3D models all come from CDNs.

So: paste the files, open the page. That is the whole deployment.

---

## 1. Paste these, in this order

Order matters only because a file should exist before another imports it.

| # | file | bytes | what it is | edit it? |
|---|---|---|---|---|
| 1 | `index.html` | 1.8 K | the shell: styles, import map, mount points | rarely |
| 2 | `packs.js` | 165 K | 4 mechanical switch sample sets, base64 MP3 | no |
| 3 | `tw-map.js` | 2.8 K | generated: key code → typewriter part | no |
| 4 | `crt-terminal.js` | 18 K | the CRT screen shader (ThreeUI, ported) | no |
| 5 | `screens.js` | 6 K | **what runs on the CRT — your game goes here** | YES |
| 6 | `props.js` | 4 K | **where objects sit** | YES |
| 7 | `themes.js` | 13 K | the 5 keyboards: colours, shapes, lighting, layout | yes |
| 8 | `typewriter.js` | 18 K | the Smith Corona rig | no |
| 9 | `crt.js` | 8 K | the television: finish, screen wiring, placement | rarely |
| 10 | `app.js` | 57 K | the engine: geometry, materials, camera, input, audio | no |

`packs.js` is the big one at 165 K and it is just base64 audio — paste it once
and forget it.

## 2. index.html must keep its import map

Without this, none of the `import ... from 'three'` lines resolve:

```html
<script type="importmap">
{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js",
  "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/"
}}
</script>
<script type="module" src="./app.js"></script>
```

The page also needs these four elements, which the styles and code both expect:
`<div id="err">`, `<div id="stage">`, `<div id="hud">`, `<div id="picker">`.

## 3. Writing the game

**All game code goes in `screens.js`.** A screen is one function:

```js
export function myGame(ctx, width, height, seconds, now){
  // plain canvas 2D. Whatever you draw is pushed through the CRT shader —
  // curvature, scanlines, aperture grille, halation, vignette — so it comes
  // out looking like a tube.
}
```

Then register it and switch to it:

```js
// screens.js
export const SCREENS = { terminal: 'terminal', typing: typingGame, mine: myGame };

// props.js
crt: { screen: 'mine', ... }
```

`screens.js` already contains a **working typing game** — target word, live WPM,
accuracy, per-letter feedback. Copy it as your starting point.

### Keyboard input

Use the `INPUT` object exported from `screens.js`:

```js
const k = INPUT.pull();   // everything typed since your last frame, then clears
k.chars   // ['a','b']  characters
k.back    // how many backspaces
k.enter   // how many returns
INPUT.down // Set of currently-held KeyboardEvent.code strings
```

**Do not add your own `keydown` listener.** `app.js` already owns one, and it
drives the 3D keycaps *and* `INPUT` from the same event — that is what keeps the
game on the tube in step with the keys moving on the board. A second listener
double-counts.

`pull()` returns everything since the previous frame rather than one key, so your
game is frame-rate independent.

## 4. Moving things

**All placement is in `props.js`** — no three.js maths, no dimensions:

```js
crt: {
  model: 'https://cdn.jsdelivr.net/gh/akash-mondal/typemaster@v1.1.0/crt.glb',
  screen: 'typing',
  anchor: 'behind',   // behind | infront | left | right
  widthFrac: 0.68,    // width as a fraction of the board's width
  gap: 0.34,          // space to the board, as a fraction of its depth
  lift: 0,            // raise off the ground
  hideOn: ['typewriter'],
}
```

Everything is **relative and measured at runtime**, which matters because the
boards are wildly different sizes — the 60% Platinum is 61 keys, the typewriter
is a different machine at 48. A prop re-measures and re-places itself on every
theme change.

To add a prop, copy the block, give it a new key and point `model` at any `.glb`
URL. An entry with a `screen` becomes a live CRT; anything else is a plain model.

## 5. The models are URLs, not files

```
https://cdn.jsdelivr.net/gh/akash-mondal/typemaster@v1.1.0/crt.glb          0.63 MB
https://cdn.jsdelivr.net/gh/akash-mondal/typemaster@v1.1.0/typewriter.glb   0.71 MB
```

Both are Draco-compressed; the decoder is fetched from the three.js CDN
automatically. jsDelivr caches a **tag** as immutable for a year — if a model is
ever rebuilt, cut a new tag and bump the version in the URL. Reusing a tag will
not pick up changes.

## 6. Four things that will waste your time

- **A background browser tab suspends `requestAnimationFrame`.** The scene stops
  and screenshots come back black or stale. It is not a bug in the code; check
  `document.hidden` before debugging anything else. This cost hours here.
- **Never dedup meshes by vertex position.** The typewriter's keycap legends live
  in its UVs, so merging identically-shaped caps collapses different letters onto
  one. It looks like a rendering bug and is not.
- **Don't render the CRT screen through a `WebGLRenderTarget`.** The screen
  material samples that texture every frame while the pass writes into it, and it
  reads back black. It keeps its own small WebGL context on purpose.
- **The tube deliberately has no environment reflection.** A real CRT catches the
  room, but the highlight sat over the middle of the picture and made it
  unreadable. If you re-enable `envMapIntensity` on `CRT_SCREEN`, that comes back.

## 7. Licences — read before publishing

Three separate obligations, none of them fully resolved:

- **`crt.glb`** — BlendSwap #92822, **CC-BY 3.0**, which *requires naming the
  author*. The name is not in the downloaded archive and is still a TODO.
- **`typewriter.glb`** — BlendSwap, Creative Commons, specific terms unverified.
- **`crt-terminal.js`** — ThreeUI. ThreeUI is a **paid product** whose terms say
  you may not "publish or redistribute Pro source". Whether the CRT component is
  free-tier was never confirmed.

Fine for private work. Resolve all three before anything ships publicly.
