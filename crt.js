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

const DRACO_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/libs/draco/';

let _loader = null;
function loader(){
  if(_loader) return _loader;
  _loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO_CDN));
  return _loader;
}

// ── the phosphor ────────────────────────────────────────────────────────────
// A CRT that is simply black reads as a broken television. Even idle, the tube
// wants a faint centre glow, scanlines and a little noise.
function screenTexture(){
  const W = 512, H = 384;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  let text = '';
  function draw(t){
    x.fillStyle = '#050807'; x.fillRect(0,0,W,H);
    // the tube is brightest in the middle and falls off to the corners
    // ACES tone mapping crushes anything subtle, so a tube that should read as
    // "on" has to be driven a lot harder than it looks on the 2D canvas
    const g = x.createRadialGradient(W/2, H/2, 10, W/2, H/2, W*0.66);
    g.addColorStop(0,   'rgba(150,255,205,0.62)');
    g.addColorStop(0.45,'rgba(70,205,150,0.30)');
    g.addColorStop(1,   'rgba(0,20,12,0)');
    x.fillStyle = g; x.fillRect(0,0,W,H);

    if(text){
      x.font = '700 46px ui-monospace, Menlo, monospace';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = 'rgba(120,255,190,0.9)'; x.shadowBlur = 18;
      x.fillStyle = '#EAFFF2';
      x.fillText(text.slice(-16), W/2, H/2);
      x.shadowBlur = 0;
    }

    // scanlines, then a slow bright band rolling down the tube
    x.fillStyle = 'rgba(0,0,0,0.28)';
    for(let y=0;y<H;y+=3) x.fillRect(0,y,W,1.4);
    const band = ((t*0.045) % (H+180)) - 90;
    const bg = x.createLinearGradient(0, band-70, 0, band+70);
    bg.addColorStop(0,'rgba(255,255,255,0)');
    bg.addColorStop(0.5,'rgba(190,255,225,0.045)');
    bg.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle = bg; x.fillRect(0, band-70, W, 140);

    tex.needsUpdate = true;
  }
  draw(0);
  return { tex, draw, setText: v => { text = v; } };
}

export async function buildCRT({ url, parent }){
  const gltf = await loader().loadAsync(url);
  const model = gltf.scene;

  const phosphor = screenTexture();
  let screenMat = null;

  // The television is modelled facing -X: 374 of 441 face normals on the screen
  // point that way, and the speaker grille agrees, which settles it. (The
  // duplicate front panel that used to double-render the tube is removed at
  // export now — see tools/blend-to-crt-glb.py.)
  const triCount = o => o.geometry.index
    ? o.geometry.index.count/3 : o.geometry.attributes.position.count/3;
  let realScreen = null;
  model.traverse(o => {
    if(o.isMesh && o.material && o.material.name === 'CRT_SCREEN' &&
       (!realScreen || triCount(o) > triCount(realScreen))) realScreen = o;
  });

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
      m.envMapIntensity = 0.7;
      if(m.map) m.map.anisotropy = 8;
    } else if(m.name === 'CRT_SCREEN'){
      // shared material, but only the real screen mesh is left visible
      m.color.setHex(0x05070A); m.roughness = 0.10; m.metalness = 0.0;
      m.emissive = new THREE.Color(0xFFFFFF);
      m.emissiveMap = phosphor.tex;
      m.emissiveIntensity = 2.6;
      m.envMapIntensity = 1.4;          // glass should catch the room
      screenMat = m;
    }
    m.needsUpdate = true;
  });

  // pivot carries the orientation so `place` can measure the ROTATED bounds —
  // before rotating, the model's X extent is its depth, not its width
  const pivot = new THREE.Group();
  pivot.rotation.y = Math.PI/2;          // -X front -> +Z, facing the camera
  pivot.add(model);
  const group = new THREE.Group();
  group.add(pivot);
  parent.add(group);

  // The set was also posed at an angle for the original beauty render. Cancel
  // that from the geometry rather than a guessed constant: average the normals
  // of the front-most fifth of the screen's vertices — the rest of that mesh is
  // tube sidewall, which drags a naive average ~6 degrees off.
  if(realScreen){
    group.updateMatrixWorld(true);
    const g = realScreen.geometry, p = g.attributes.position, n = g.attributes.normal;
    if(p && n){
      const v = new THREE.Vector3(), zs = new Float32Array(p.count);
      for(let i=0;i<p.count;i++)
        zs[i] = v.set(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(realScreen.matrixWorld).z;
      const cut = [...zs].sort((a,b)=>b-a)[Math.floor(p.count*0.2)];
      const acc = new THREE.Vector3();
      for(let i=0;i<p.count;i++)
        if(zs[i] >= cut) acc.add(v.set(n.getX(i),n.getY(i),n.getZ(i)));
      if(acc.lengthSq() > 1e-9){
        acc.normalize().applyQuaternion(realScreen.getWorldQuaternion(new THREE.Quaternion()));
        pivot.rotation.y -= Math.atan2(acc.x, acc.z);
      }
    }
  }

  return {
    group, model, screenMat,
    setText: phosphor.setText,
    step: t => phosphor.draw(t),

    // Sit the television behind whatever board is on screen, scaled to it.
    // Boards differ a lot — a 60% is far smaller than the typewriter — so this
    // is measured per theme rather than hard-coded.
    place(boardBox, opts = {}){
      group.scale.setScalar(1);
      group.position.set(0,0,0);
      group.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(pivot);
      const size = b.getSize(new THREE.Vector3());
      const bs = boardBox.getSize(new THREE.Vector3());
      const ctr = boardBox.getCenter(new THREE.Vector3());

      // A CRT is deep: at 0.80 of board width the set's footprint (25 x 24)
      // was larger than the keyboard's (31 x 12) and dominated the plan view.
      // Scale to width but hold the total footprint in check.
      const s = (bs.x * (opts.widthFrac ?? 0.68)) / size.x;
      group.scale.setScalar(s);
      group.updateMatrixWorld(true);

      const b2 = new THREE.Box3().setFromObject(pivot);
      const c2 = b2.getCenter(new THREE.Vector3());
      group.position.set(
        ctr.x - c2.x,
        boardBox.min.y - b2.min.y + (opts.lift ?? 0),
        boardBox.min.z - b2.max.z - bs.z*(opts.gap ?? 0.34));
      return group;
    },

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
      phosphor.tex.dispose();
    },
  };
}
