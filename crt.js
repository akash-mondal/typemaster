// ═══════════════════════════════════════════════════════════════ CRT monitor
// A prop, not a theme: one television that stands behind whichever keyboard is
// on screen. Model is BlendSwap #92822 "CRT TV" (CC-BY 3.0), converted to glTF
// by tools/blend-to-crt-glb.py.
//
// The source .blend is 56 MB, but almost none of that is the television — the
// geometry is only 8,959 polys. The weight was an 8K world HDRI and five 3K
// Poliigon overlay maps (dust, smudges, fingerprints) mixed in Cycles nodes
// that glTF cannot carry anyway. Stripping those and keeping the one map that
// reads — the grille weave — gets the whole thing to 0.64 MB.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { createCrtTerminal } from './crt-terminal.js';
import { PROPS, placeProp } from './props.js';
import { SCREENS } from './screens.js';

const DRACO_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/libs/draco/';

let _loader = null;
function loader(){
  if(_loader) return _loader;
  _loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO_CDN));
  return _loader;
}

// ── planar UVs for the tube face ────────────────────────────────────────────
// The authored UVs on this mesh are whatever the modeller needed for the dust
// and smudge overlays; mapping a screen image through them puts the terminal
// somewhere arbitrary. Project instead: the set faces +Z, so measure the front
// of the mesh in its own XY and lay 0..1 across exactly that. The sidewall
// vertices behind it clamp to the edge, which is inside the cabinet and unseen.
function planarScreenUVs(mesh){
  const g = mesh.geometry, p = g.attributes.position;
  if(!p) return null;
  // Bounds over the WHOLE mesh footprint, not the front-most slice by depth: a
  // CRT face is curved, so "front-most" is only the central bulge and mapping
  // 0..1 across that left the rest of the glass clamped to dark edge pixels —
  // a small lit patch floating in black.
  let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i);
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
  }
  const w = x1-x0, h = y1-y0;
  if(!(w>0 && h>0)) return null;
  const uv = new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){
    uv[i*2]   = Math.min(1, Math.max(0, (p.getX(i)-x0)/w));
    uv[i*2+1] = Math.min(1, Math.max(0, (p.getY(i)-y0)/h));
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.attributes.uv.needsUpdate = true;
  return { width:w, height:h };
}

// A prop with no `screen` is just a model: load it, let it cast and receive
// shadows, and place it from its props.js entry. This is what makes props.js
// genuinely general rather than a CRT-shaped hole.
export async function buildPlainProp({ url, parent, spec = {} }){
  const gltf = await loader().loadAsync(url);
  const model = gltf.scene;
  model.traverse(o => { if(o.isMesh) o.castShadow = o.receiveShadow = true; });
  const pivot = new THREE.Group(); pivot.add(model);
  const group = new THREE.Group(); group.add(pivot);
  parent.add(group);
  return {
    group, model,
    place(boardBox, opts = {}){
      return placeProp(THREE, group, pivot, boardBox, { ...spec, ...opts });
    },
    dispose(){
      model.traverse(o => {
        if(!o.isMesh) return;
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m && m.dispose());
      });
    },
  };
}

// The props the brief configures <CrtBackground variant="terminal" ... /> with.
// hue / saturation / brightness / opacity are CSS filters on the authored
// component and have no meaning for a texture, so they are not carried here;
// speed, typeSpeed and motion drive the renderer exactly as authored.
export const OPTIONS = { speed: 1.00, typeSpeed: 1.00, motion: 1.00 };

export async function buildCRT({ url, parent }){
  const gltf = await loader().loadAsync(url);
  const model = gltf.scene;

  let screenMat = null, screenMesh = null;
  model.traverse(o => {
    if(o.isMesh && o.material && o.material.name === 'CRT_SCREEN') screenMesh = o;
  });

  // Give the offscreen buffer the tube's own aspect so nothing is stretched,
  // then lay the effect across the face with the projected UVs above.
  const face = screenMesh ? planarScreenUVs(screenMesh) : null;
  const aspect = face ? face.width/face.height : 4/3;
  const bufH = 768, bufW = Math.round(bufH*aspect);
  const screen = SCREENS[PROPS.crt.screen] ?? 'terminal';
  const crt = createCrtTerminal({ width:bufW, height:bufH, screen,
                                  getOptions: () => OPTIONS });
  const phosphor = new THREE.CanvasTexture(crt.canvas);
  phosphor.colorSpace = THREE.SRGBColorSpace;
  // the offscreen canvas is top-origin and these UVs put v=0 at the bottom of
  // the tube, so three's default flip is the correct one
  phosphor.flipY = true;

  // Same story as the typewriter: the Cycles shader graph does not survive the
  // export, so the finish is set here rather than in Blender.
  const graded = new Set();
  model.traverse(o => {
    if(!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const m = o.material;
    if(!m || graded.has(m)) return;
    graded.add(m);
    if(m.name === 'CRT_BODY'){
      m.color.setHex(0x141416); m.roughness = 0.52; m.metalness = 0.05;
      m.envMapIntensity = 0.55;
    } else if(m.name === 'CRT_GRILLE'){
      m.color.setHex(0x8A8378); m.roughness = 0.92; m.metalness = 0.0;
      m.envMapIntensity = 0.70;
      if(m.map) m.map.anisotropy = 8;
    } else if(m.name === 'CRT_SCREEN'){
      // No room reflection on the glass. A real tube does catch the room, but
      // the mirrored highlight sat straight over the middle of the picture and
      // made it unreadable — and this screen exists to be read. The shader's own
      // authored `sheen` term still gives it a little glass, without the blob.
      m.color.setHex(0x05070A); m.roughness = 0.62; m.metalness = 0.0;
      m.emissive = new THREE.Color(0xFFFFFF);
      m.emissiveMap = phosphor;
      m.map = phosphor;                 // the tube is its own light source
      m.emissiveIntensity = 1.55;
      m.envMapIntensity = 0.0;
      screenMat = m;
    }
    m.needsUpdate = true;
  });

  // The set already leaves Blender square-on and facing +Z: the artist's
  // 238.58 deg pose rotation is zeroed at export (tools/blend-to-crt-glb.py),
  // which is exact — inferring it here from averaged normals left it visibly
  // skewed when seen from above. The pivot stays only so `place` has a single
  // node to measure.
  const pivot = new THREE.Group();
  pivot.add(model);
  const group = new THREE.Group();
  group.add(pivot);
  parent.add(group);

  return {
    group, model, screenMat, options: OPTIONS,
    step(now){ crt.render(now); phosphor.needsUpdate = true; },

    // Placement is data, not code: see PROPS.crt in props.js.
    place(boardBox, opts = {}){
      return placeProp(THREE, group, pivot, boardBox, { ...PROPS.crt, ...opts });
    },
    spec: PROPS.crt,

    dispose(){
      model.traverse(o => {
        if(!o.isMesh) return;
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for(const m of mats){
          if(!m) continue;
          for(const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap'])
            if(m[k]) m[k].dispose();
          m.dispose();
        }
      });
      crt.dispose(); phosphor.dispose();
    },
  };
}
