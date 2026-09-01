// ═══════════════════════════════════════════════════ Smith Corona typewriter
// Model: "Simple Typewriter" from BlendSwap, converted to glTF. The Blender
// scene was pre-processed so every moving part carries a semantic name and an
// origin that sits on its real hinge:
//
//   KEY_<code>   47 key levers, origin at the BACK of the lever (the hinge),
//                so a press is a single rotation about X.
//   BAR_00..41   42 type bars, origin at the pivot in the basket. Each typing
//                key owns one, paired left-to-right so the basket fans out.
//   SPACEBAR_*   origin at its rear edge, same hinge idea as a key.
//   CARRIAGE     empty parenting platen, paper tensioner, tape and return
//                lever, so the whole assembly slides as one.
//
// Blender is Z-up and glTF is Y-up, so the export maps (x,y,z) -> (x,z,-y):
// the back of the machine is -Z here and "up" is +Y.

import * as THREE from 'three';
import { GLTFLoader }  from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader }  from 'three/addons/loaders/DRACOLoader.js';
import { KEY_MAP }      from './tw-map.js';

// Tunables live in one place; window.__TW aliases this for live calibration.
export const TW = {
  keyDrop:   0.30,   // rad, how far a key lever tips on a press
  printGap:  0.16,   // how far in front of the platen the ribbon sits
  barUpMs:    55,    // bars are fast: the whole strike is over inside 200ms
  barHoldMs:  30,
  barDownMs: 130,
  step:      0.135,  // carriage travel per character
  paperMargin: 0.55, // keep this much platen to the right of the printing point
  bellLead:    6,    // ring the bell this many characters before the line ends
  wrapOnSpace: true, // after the bell, return on the next space instead of mid-word
  returnMs:  480,
  // The return lever is a 3.10-unit arm that is itself only 0.435 thick, on a
  // machine 3.14 tall. At 0.85 rad its far end rose 2.33 — three quarters of the
  // whole typewriter — and read as a pin flying off the body. 0.22 lifts it
  // 0.68, about one and a half times its own thickness: a sweep you can see
  // that still looks hinged to something.
  leverSwing: 0.22,
  platenRoll: 0.55,  // rad the platen turns as it feeds one line
};

const clamp = (v,a,b) => v<a?a:v>b?b:v;
const easeOut  = t => 1-Math.pow(1-t,3);
const easeInOut= t => t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;

// ── sound ───────────────────────────────────────────────────────────────────
// A typewriter is percussive: a struck bar, a bell, a ratcheting return. None
// of that is a mechanical-switch sample, so it is synthesised rather than
// loaded — it also keeps the theme free of another megabyte of audio.
function makeNoise(ctx, secs){
  const n = Math.floor(ctx.sampleRate*secs);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<n;i++) d[i] = Math.random()*2-1;
  return buf;
}

export function makeVoice(ctx, dest){
  if(!ctx) return { strike(){}, space(){}, bell(){}, ret(){}, back(){} };
  const noise = makeNoise(ctx, 0.5);

  const burst = ({dur=0.06, freq=2600, q=1.1, gain=0.5, type='bandpass', rate=1}) => {
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t); s.stop(t+dur+0.02);
  };
  const tone = ({freq, dur, gain=0.25, type='sine', at=0}) => {
    const o = ctx.createOscillator(); o.type=type; o.frequency.value=freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + at;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t+0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t+dur+0.02);
  };

  return {
    // slug hitting the platen: a hard tick with a woody body under it
    strike(){
      const j = 0.9 + Math.random()*0.25;
      burst({dur:0.045, freq:3100*j, q:0.9, gain:0.55, rate:j});
      burst({dur:0.085, freq:620*j,  q:1.6, gain:0.30, rate:j});
    },
    space(){ burst({dur:0.075, freq:420, q:1.3, gain:0.42, rate:0.85}); },
    back(){  burst({dur:0.055, freq:1500, q:1.2, gain:0.34}); },
    // margin bell: a small struck bell is two close partials, not one sine
    bell(){ tone({freq:1180, dur:1.5, gain:0.20});
            tone({freq:2490, dur:1.1, gain:0.10});
            tone({freq:3130, dur:0.7, gain:0.05}); },
    // carriage return, the sound the whole machine is remembered for: the bell,
    // then the ratchet zipping back and accelerating, then the end-stop thunk
    // and the paper feeding one line.
    ret(){
      this.bell();
      const N = 22;
      for(let i=0;i<N;i++){
        const k = i/N;
        setTimeout(()=>burst({dur:0.020, freq:1900+k*1400+Math.random()*500,
                              q:2.4, gain:0.20*(1-k*0.45)}), 60 + k*k*330);
      }
      setTimeout(()=>{
        burst({dur:0.15, freq:230, q:1.0, gain:0.60, rate:0.65});   // end stop
        burst({dur:0.06, freq:1200, q:1.8, gain:0.22});             // line feed
      }, 430);
    },
  };
}

// The logo decals are pure white RGB with the letterforms carried entirely in
// the alpha channel. three ignores alpha in an emissive map, so used directly
// the whole body lights up instead of just the lettering. Bake coverage into
// luminance and the decal reads as the gold badge it is.
function alphaToLuma(tex){
  const img = tex.image;
  if(!img || !img.width) return null;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently:true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  for(let i=0;i<p.length;i+=4){ p[i]=p[i+1]=p[i+2]=p[i+3]; p[i+3]=255; }
  x.putImageData(d, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = THREE.SRGBColorSpace;
  out.flipY = tex.flipY;                 // glTF ships flipY=false; match it
  out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
  out.needsUpdate = true;
  return out;
}

// ── build ───────────────────────────────────────────────────────────────────
// Draco takes the model from 3.4 MB to 0.56 MB with no geometry lost, which is
// the difference between a hosted asset and a usable one. The decoder is a
// library URL like three itself, not something to place by hand.
const DRACO_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/libs/draco/';

let _loader = null;
function loader(){
  if(_loader) return _loader;
  const draco = new DRACOLoader().setDecoderPath(DRACO_CDN);
  _loader = new GLTFLoader().setDRACOLoader(draco);
  return _loader;
}

export async function buildTypewriter({ modelUrl, parent }){
  const gltf = await loader().loadAsync(modelUrl);
  const map = KEY_MAP;

  const model = gltf.scene;
  parent.add(model);

  const byName = new Map();
  model.traverse(o => { if(o.name) byName.set(o.name, o); });

  // Blender drives these materials from shader nodes, and glTF can only carry
  // the flat principled values — so every painted part exports as plain white.
  // The two body materials also carry their logo as the *base* map, which is
  // why the machine arrives white with an invisible logo. Re-grade them here:
  // black crinkle enamel, with the logo lifted into emissive so it reads as
  // the brushed-gold decal it is on the real machine.
  const FINISH = {
    // black crinkle enamel swallows light; a low env keeps it from going grey
    'Main Body Color ALT':          { colour:0x0E0F11, rough:0.44, metal:0.04, env:0.35, logo:0xB4892F },
    'Main Body Color. Platten Back':{ colour:0x0E0F11, rough:0.44, metal:0.04, env:0.35, logo:0xB4892F },
    // key levers share one material with the caps: a chrome-grey base keeps the
    // arms metallic while the atlas still prints black caps and pale legends
    'Brass - Matte':                { colour:0xBFC4CA, rough:0.30, metal:0.72 },
    'Steel - Satin':                { colour:0x6A6D72, rough:0.52, metal:1.0, env:0.8 },
    'Rubber - Bumpy':               { colour:0x1E1F21, rough:0.78, metal:0.0 },
    'Nylon 6-6 (White)':            { colour:0xCFC9BB, rough:0.66, metal:0.0, env:0.7 },
    'Aluminum - Satin':             { colour:0x76797E, rough:0.52, metal:0.85, env:0.8 },
  };
  const graded = new Set();
  model.traverse(o => {
    if(!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const m = o.material;
    if(!m || !m.isMeshStandardMaterial) return;
    if(m.map) m.map.anisotropy = 8;
    m.envMapIntensity = 1.15;
    if(graded.has(m)) return;
    graded.add(m);
    const f = FINISH[m.name];
    if(!f) return;
    if(f.colour !== undefined) m.color.setHex(f.colour);
    if(f.rough  !== undefined) m.roughness = f.rough;
    if(f.metal  !== undefined) m.metalness = f.metal;
    if(f.env    !== undefined) m.envMapIntensity = f.env;
    if(f.logo !== undefined && m.map){
      const mask = alphaToLuma(m.map);
      m.map = null;                 // the logo is a decal, not the body colour
      if(mask){
        m.emissiveMap = mask;
        m.emissive = new THREE.Color(f.logo);
        m.emissiveIntensity = 0.85;
      }
    }
    m.needsUpdate = true;
  });

  const carriage = byName.get('CARRIAGE');
  const carriageHome = carriage ? carriage.position.x : 0;

  // The platen exports with its origin at the world centre, so it cannot be
  // spun in place. Wrap it in a pivot sitting on its own axis instead of
  // re-exporting the model for one transform.
  let platenPivot = null;
  const platen = byName.get('PLATEN_0');
  if(platen && carriage && platen.parent === carriage){
    carriage.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(platen).getCenter(new THREE.Vector3());
    carriage.worldToLocal(c);
    platenPivot = new THREE.Group();
    platenPivot.position.copy(c);
    carriage.add(platenPivot);
    platen.position.sub(c);
    platenPivot.add(platen);
  }

  // every moving part remembers where it started, so a reset is exact
  const rest = new Map();
  const remember = o => { if(o) rest.set(o, o.rotation.x); };

  // The printing point of a typewriter is FIXED: every type bar converges on
  // the same spot and the carriage slides past it, which is why the machine can
  // print a line at all. Swinging each bar about a shared X axis — as this rig
  // first did — only works for the one bar already on the centre line; the rest
  // rise into empty air either side of the platen.
  //
  // So aim each bar instead. The rotation is whatever minimal turn points that
  // bar's own tip at the printing point, and since the model's outer bars are a
  // decorative fan rather than the real bent linkage (the outermost has 0.44 of
  // lateral bend but sits 1.6 off centre) they cannot physically reach. A small
  // slide along the aim closes that shortfall; on a thin bar it is invisible.
  const printPoint = new THREE.Vector3();
  let platenHalfW = 6;
  if(platen){
    model.updateMatrixWorld(true);
    const pb = new THREE.Box3().setFromObject(platen);
    printPoint.set(0, (pb.min.y+pb.max.y)/2, pb.max.z + TW.printGap);
    platenHalfW = (pb.max.x - pb.min.x)/2;
  }

  // Where a line has to end is not a number to pick — it falls out of the
  // geometry. The printing point is fixed at machine centre while the paper
  // travels left with the carriage, so once the carriage has moved by the
  // platen's half-width the printing point has run off the end of the paper and
  // the next bar would swing up into thin air. That is the stop.
  const usableTravel = Math.max(TW.step*4, platenHalfW - TW.paperMargin);
  const HARD_STOP = Math.max(4, Math.floor(usableTravel / TW.step));
  const BELL_COL  = Math.max(1, HARD_STOP - TW.bellLead);

  // the tip is the far end of the bar's longest axis, measured from its pivot
  function tipOf(mesh){
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    const s = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    const ax = (s.x > s.y && s.x > s.z) ? 'x' : (s.y > s.z ? 'y' : 'z');
    const far = Math.abs(bb.max[ax]) > Math.abs(bb.min[ax]) ? bb.max[ax] : bb.min[ax];
    const tip = c.clone(); tip[ax] = far;
    return tip;
  }

  const bars = [];
  for(let i=0;i<42;i++){
    const b = byName.get('BAR_' + String(i).padStart(2,'0'));
    if(!b) continue;
    const restQ = b.quaternion.clone();
    const restP = b.position.clone();
    // the bars carry a 0.394 node scale, so the tip has to be pushed through
    // scale AND rotation to be comparable with a distance measured in the
    // parent's units. Direction survives a uniform scale; length does not.
    const tip = tipOf(b).multiply(b.scale).applyQuaternion(restQ);
    const from = tip.clone().normalize();

    b.parent.updateMatrixWorld(true);
    const target = b.parent.worldToLocal(printPoint.clone());
    const aim = target.clone().sub(restP);
    const dist = aim.length();
    aim.normalize();

    bars.push({
      obj:b, t:-1, restQ, restP, aim,
      hitQ: new THREE.Quaternion().setFromUnitVectors(from, aim).multiply(restQ),
      // signed: bars nearer than their own length are eased back so the tip
      // stops on the ribbon rather than punching through the platen
      reach: dist - tip.length(),
    });
  }
  const barByName = new Map(bars.map(b => [b.obj.name, b]));

  const spacebars = [];
  model.traverse(o => { if(o.name.startsWith('SPACEBAR')){ remember(o); spacebars.push(o); } });
  const levers = [];
  model.traverse(o => { if(o.name.startsWith('LEVER')){ remember(o); levers.push(o); } });

  // ── key records, in the shape app.js already steps ──
  const keys = [], byCode = new Map();
  for(const [code, info] of Object.entries(map)){
    const lever = byName.get('KEY_'+code);
    if(!lever) continue;
    remember(lever);
    const bar = info.bar ? barByName.get(info.bar) : null;
    const rec = {
      code, lever, bar, t:-1, dir:0, hit:-1e9, energy:0,
      px:0, pz:0, gx:0, gz:0,          // ripple fields app.js expects
      apply(depth){ lever.rotation.x = rest.get(lever) + TW.keyDrop*depth; },
    };
    keys.push(rec); byCode.set(code, rec);
  }

  // the space bar is one wide lever, not part of the legend map
  if(spacebars.length){
    const rec = {
      code:'Space', lever:null, bar:null, t:-1, dir:0, hit:-1e9, energy:0,
      px:0, pz:0, gx:0, gz:0,
      apply(depth){ for(const s of spacebars) s.rotation.x = rest.get(s) + TW.keyDrop*0.75*depth; },
    };
    keys.push(rec); byCode.set('Space', rec);
  }

  // ── carriage state ──
  let col = 0, belled = false, roll = 0;
  let ret = -1;             // carriage-return animation clock, ms
  let retFrom = 0;
  let voice = makeVoice(null, null);

  const setCarriage = () => {
    if(carriage) carriage.position.x = carriageHome - col*TW.step;
  };

  function typed(rec, code){
    if(rec.bar){ rec.bar.t = 0; }
    if(ret >= 0) return;
    // Once the bell has rung, a typist finishes the word and returns on the next
    // space. Wrapping there reads far better than being snapped back mid-word,
    // and it means the hard stop below is only ever a backstop for one very long
    // unbroken run of characters.
    if(TW.wrapOnSpace && belled && code === 'Space'){ api.carriageReturn(); return; }
    col = clamp(col+1, 0, HARD_STOP);
    setCarriage();
    if(col >= BELL_COL && !belled){ belled = true; voice.bell(); }
    // at the stop the paper has run out from under the printing point, so the
    // machine throws the carriage back rather than letting a bar hit nothing
    if(col >= HARD_STOP) api.carriageReturn();
  }

  const api = {
    model, keys, byCode,
    maxTravel: HARD_STOP * TW.step,     // so the camera can frame the full line
    cols: HARD_STOP, bellAt: BELL_COL,
    setVoice(v){ voice = v; },

    press(code){
      const rec = byCode.get(code);
      if(code === 'Enter'){ api.carriageReturn(); return true; }
      if(code === 'Backspace'){
        if(ret < 0 && col > 0){ col--; setCarriage(); belled = col >= BELL_COL; }
        voice.back();
        return !!rec;
      }
      if(!rec) return false;
      typed(rec, code);
      if(code === 'Space') voice.space(); else voice.strike();
      return true;
    },

    carriageReturn(){
      if(ret >= 0) return;              // already on its way home
      retFrom = col; ret = 0; belled = false;
      voice.ret();
    },

    step(dt){
      const ms = dt*1000;

      for(const b of bars){
        if(b.t < 0) continue;
        b.t += ms;
        const { barUpMs:U, barHoldMs:H, barDownMs:D } = TW;
        let p;
        if(b.t < U)            p = easeOut(b.t/U);
        else if(b.t < U+H)     p = 1;
        else if(b.t < U+H+D)   p = 1 - easeInOut((b.t-U-H)/D);
        else { p = 0; b.t = -1; }
        b.obj.quaternion.slerpQuaternions(b.restQ, b.hitQ, p);
        b.obj.position.copy(b.restP).addScaledVector(b.aim, b.reach*p);
      }

      if(ret >= 0){
        ret += ms;
        const p = Math.min(1, ret/TW.returnMs);
        const e = easeInOut(p);
        col = retFrom*(1-e);
        setCarriage();
        // the return lever sweeps across and springs back
        const sw = Math.sin(Math.min(1,p*1.15)*Math.PI);
        for(const l of levers) l.rotation.x = rest.get(l) + TW.leverSwing*sw;
        // the same stroke feeds the paper up one line
        if(platenPivot) platenPivot.rotation.x = roll + TW.platenRoll*e;
        if(p >= 1){
          ret = -1; col = 0; setCarriage();
          if(platenPivot){ roll += TW.platenRoll; platenPivot.rotation.x = roll; }
        }
      }
    },

    dispose(){
      model.traverse(o => {
        if(!o.isMesh) return;
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for(const m of mats){
          if(!m) continue;
          for(const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'])
            if(m[k]) m[k].dispose();
          m.dispose();
        }
      });
    },
  };

  setCarriage();
  return api;
}
