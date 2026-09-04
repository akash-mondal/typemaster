
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment }    from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls }      from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass }         from 'three/addons/postprocessing/GTAOPass.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { PACKS }  from './packs.js';
import { THEMES } from './themes.js';
import { buildTypewriter, makeVoice, TW } from './typewriter.js';
import { buildCRT, buildPlainProp } from './crt.js';
import { PROPS, SHOT, BOARD, SCENE } from './props.js';
import { rainOn, stepRain } from './rain.js';
import { TEXT } from './text.js';

// A page can override SCENE without copying props.js into the project, which
// keeps a simple project to a single index.html:
//   <script>window.TYPEMAXX = { floor:false, fog:false, background:{...} }</script>
if(typeof window !== 'undefined'){
  // Take whatever the page set before this module ran, then hand the page the
  // real object. Copying alone made every later write — rain, sun, sky,
  // exposure, shadowFloor — land on a detached literal that nothing reads, so
  // anything set on a menu change silently did nothing.
  if(window.TYPEMAXX) Object.assign(SCENE, window.TYPEMAXX);
  window.TYPEMAXX = SCENE;
}
// Reachable from a plain <script> in the page, for screens written inline.
if(typeof window !== 'undefined'){
  window.TYPEMAXX_INPUT = INPUT;
  window.TYPEMAXX_THREE = THREE;   // for backgrounds written in the page
  window.TYPEMAXX_TEXT = TEXT;     // font/spacing order, fit, glow, safe width
  // The board a screen is showing, and how to change it. showBoard(name, dir)
  // slides the current keyboard off in -dir and rides the new one in from +dir,
  // so a menu moving right feels like the boards moving right. Returns false if
  // the name is unknown, it is already showing, or a swap is still running.
  window.TYPEMAXX_BOARDS = Object.keys(THEMES);
  window.TYPEMAXX_SHOW_BOARD = (name, dir) => showBoard(name, dir);
}
import { INPUT } from './screens.js';

const showErr = m => { const e=document.getElementById('err'); e.textContent=m; e.style.display='block'; };
window.onerror = (m,s,l,c,e) => showErr(e&&e.stack ? e.stack : `${m} @ ${s}:${l}`);
window.addEventListener('unhandledrejection', e => showErr(String(e.reason&&e.reason.stack || e.reason)));

// ══════════════════════════════════════════════════════════ shared constants
const CFG = {
  u: 1.905, w: 1.80, d: 1.80,           // key pitch and cap footprint
  press: { travel:0.38, downMs:42, upMs:105, overshoot:0.04 },
  cameraElevation: 15,                  // degrees above the desk; 38 looked down on it
  master: 0.55,
};

// ══════════════════════════════════════════════════════════ renderer
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
// Resolution multiplier. Left at 2 so nothing looks different by default, but
// exposed: on a Retina panel this is 4x the fragments, and the tube shader
// hides a drop to 1.5 well if more headroom is ever needed.
renderer.setPixelRatio(Math.min(devicePixelRatio, SCENE.pixelRatio ?? 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// a composer resets renderer.info on every internal pass, so the last thing
// counted is the fullscreen output quad. Drive the reset per frame instead and
// the stats stay honest whichever render path a theme uses.
renderer.info.autoReset = false;
stage.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, innerWidth/innerHeight, 2, 200);
scene.environment = new THREE.PMREMGenerator(renderer)
  .fromScene(new RoomEnvironment(renderer), 0.04).texture;

const MSAA = 4;
function msaaTarget(){
  return new THREE.WebGLRenderTarget(innerWidth, innerHeight,
    { type: THREE.HalfFloatType, samples: MSAA });
}

let composer = null, bloomPass = null;
function ensureComposer(){
  if(composer) return composer;
  composer = new EffectComposer(renderer, msaaTarget());
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.55, 0.72);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  return composer;
}

// The scene is lit largely by an environment map, which is unoccluded by
// definition — so every cavity (under the carriage, inside the shell, behind
// the type-bar basket) receives full ambient and the machine reads as if light
// passes straight through it. Screen-space AO is what puts the contact
// darkening back. Only model themes pay for it.
let aoComposer = null, gtaoPass = null, aoBroken = false;
function ensureAO(){
  if(aoComposer || aoBroken) return aoComposer;
  try {
    const c = new EffectComposer(renderer, msaaTarget());
    c.addPass(new RenderPass(scene, camera));
    gtaoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    c.addPass(gtaoPass);
    c.addPass(new OutputPass());
    aoComposer = c;
  } catch(e){
    aoBroken = true;                 // never let a missing pass kill the render
    console.warn('GTAO unavailable, falling back to direct render:', e.message);
  }
  return aoComposer;
}
function configureAO(ao){
  if(!gtaoPass || !ao) return;
  gtaoPass.blendIntensity = ao.intensity ?? 1.0;
  // radius is in world units and the typewriter is ~10 across, so this wants to
  // be small enough to catch panel gaps rather than shade whole surfaces
  gtaoPass.updateGtaoMaterial({
    radius: ao.radius ?? 0.45, distanceExponent: 1.6, thickness: 0.4,
    scale: ao.scale ?? 1.4, samples: 16, screenSpaceRadius: false });
  if(fitBox && !fitBox.isEmpty()) gtaoPass.setSceneClipBox(fitBox);
}

const controls = new OrbitControls(camera, renderer.domElement);
// The shot is fixed. Nothing rotates, nothing drifts, nothing is draggable —
// the camera is composed once by fitCamera and then left alone.
controls.enabled = false;              // re-enabled below when SHOT.free is set
controls.enableDamping = true; controls.dampingFactor = 0.06; controls.enablePan = false;
controls.minPolarAngle = THREE.MathUtils.degToRad(14);
controls.maxPolarAngle = THREE.MathUtils.degToRad(78);

// ══════════════════════════════════════════════════════════ procedural maps
// A height field turned into a tangent-space normal map by Sobel. Roughness alone
// gives you dull-vs-shiny; only normals give the surface actual tooth.
function normalFromHeight(h, size, strength){
  const c=document.createElement('canvas'); c.width=c.height=size;
  const x=c.getContext('2d'), img=x.createImageData(size,size), d=img.data;
  const at=(i,j)=>h[((j+size)%size)*size + ((i+size)%size)];
  for(let j=0;j<size;j++) for(let i=0;i<size;i++){
    const dx = (at(i+1,j-1)+2*at(i+1,j)+at(i+1,j+1)) - (at(i-1,j-1)+2*at(i-1,j)+at(i-1,j+1));
    const dy = (at(i-1,j+1)+2*at(i,j+1)+at(i+1,j+1)) - (at(i-1,j-1)+2*at(i,j-1)+at(i+1,j-1));
    let nx=-dx*strength, ny=-dy*strength, nz=1;
    const L=Math.hypot(nx,ny,nz); nx/=L; ny/=L; nz/=L;
    const k=(j*size+i)*4;
    d[k]=(nx*0.5+0.5)*255; d[k+1]=(ny*0.5+0.5)*255; d[k+2]=(nz*0.5+0.5)*255; d[k+3]=255;
  }
  x.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

function heightToRough(h, size, base, amount){
  const c=document.createElement('canvas'); c.width=c.height=size;
  const x=c.getContext('2d'), img=x.createImageData(size,size), d=img.data;
  for(let i=0;i<size*size;i++){
    const v=Math.max(0,Math.min(255,(base + (h[i]-0.5)*amount)*255));
    d[i*4]=d[i*4+1]=d[i*4+2]=v; d[i*4+3]=255;
  }
  x.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}

// Value noise. Per-pixel static averages back to flat once it's smaller than a
// screen pixel — grain only reads if the cells are big enough to catch a highlight.
function valueNoise(size, cells, seed){
  const g = new Float32Array(cells*cells);
  for(let i=0;i<g.length;i++) g[i] = Math.random();
  const sm = t => t*t*(3-2*t);
  const at = (i,j) => g[((j%cells)+cells)%cells*cells + ((i%cells)+cells)%cells];
  const out = new Float32Array(size*size);
  const step = cells/size;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const fx=x*step, fy=y*step, ix=Math.floor(fx), iy=Math.floor(fy);
    const tx=sm(fx-ix), ty=sm(fy-iy);
    const a=at(ix,iy), b=at(ix+1,iy), c=at(ix,iy+1), d=at(ix+1,iy+1);
    out[y*size+x] = (a*(1-tx)+b*tx)*(1-ty) + (c*(1-tx)+d*tx)*ty;
  }
  return out;
}
function octaves(size, specs){
  const out = new Float32Array(size*size);
  let total = 0;
  for(const [cells, amp] of specs){
    const n = valueNoise(size, cells);
    for(let i=0;i<out.length;i++) out[i] += n[i]*amp;
    total += amp;
  }
  for(let i=0;i<out.length;i++) out[i] /= total;
  return out;
}

// PBT is sandblasted: a coarse pebbled tooth with finer speckle riding on it
const pbtHeight  = size => octaves(size, [[64,1.0],[128,0.55],[256,0.25]]);
// anodised aluminium keeps a directional tooth from the extrusion
function anodHeight(size){
  const base = octaves(size, [[96,1.0],[192,0.45]]);
  const out = new Float32Array(size*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const streak = Math.sin(y*1.7 + Math.sin(y*0.09)*3)*0.5+0.5;
    out[y*size+x] = base[y*size+x]*0.62 + streak*0.38;
  }
  return out;
}

// A surface is described, not hardcoded: octave sizes set how coarse the tooth is,
// strength how deep, streak how directional. Cached so themes can share where equal.
const GRAIN = 512;
const _surfaces = new Map();
function getSurface(spec){
  const key = JSON.stringify(spec);
  if(_surfaces.has(key)) return _surfaces.get(key);
  // channel 1 is the width-corrected uv1 that only the keycaps carry; the case
  // comes from ExtrudeGeometry and has uv only, so it must stay on channel 0
  const {octaves:oct=[[64,1],[128,0.5]], strength=5, repeat=3,
         roughBase=0.6, roughVar=0.4, streak=0, channel=0} = spec;
  let h = octaves(GRAIN, oct);
  if(streak){
    const out = new Float32Array(GRAIN*GRAIN);
    for(let y=0;y<GRAIN;y++) for(let x=0;x<GRAIN;x++){
      const st = Math.sin(y*1.7 + Math.sin(y*0.09)*3)*0.5+0.5;
      out[y*GRAIN+x] = h[y*GRAIN+x]*(1-streak) + st*streak;
    }
    h = out;
  }
  const n = normalFromHeight(h, GRAIN, strength);
  const r = heightToRough(h, GRAIN, roughBase, roughVar);
  n.repeat.set(repeat,repeat); r.repeat.set(repeat,repeat);
  n.channel = channel; r.channel = channel;
  const out = {normalMap:n, roughnessMap:r};
  _surfaces.set(key, out);
  return out;
}

// sensible fallbacks for any theme that doesn't describe its own
const DEFAULT_SURFACE = {
  cap : { octaves:[[64,1.0],[128,0.55],[256,0.25]], strength:5.5, repeat:3,
          roughBase:0.68, roughVar:0.42, normalScale:1.05, channel:1 },
  case: { octaves:[[96,1.0],[192,0.45]], strength:4.2, repeat:4,
          roughBase:0.46, roughVar:0.34, streak:0.38, normalScale:1.10 },
};

function woodTexture(w=512,h=512){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const x=c.getContext('2d');
  x.fillStyle='#8C4E2E'; x.fillRect(0,0,w,h);
  for(let i=0;i<26;i++){
    const y=Math.random()*h, band=10+Math.random()*46;
    x.fillStyle = Math.random()<0.5 ? `rgba(84,40,20,${0.10+Math.random()*0.18})`
                                    : `rgba(196,124,78,${0.08+Math.random()*0.16})`;
    x.beginPath(); x.moveTo(0,y);
    for(let px=0;px<=w;px+=24) x.lineTo(px, y+Math.sin(px*0.008+i)*7);
    for(let px=w;px>=0;px-=24) x.lineTo(px, y+band+Math.sin(px*0.008+i)*7);
    x.closePath(); x.fill();
  }
  for(let i=0;i<340;i++){
    const y=Math.random()*h;
    x.strokeStyle = Math.random()<0.55 ? `rgba(58,26,12,${0.10+Math.random()*0.22})`
                                       : `rgba(214,146,98,${0.06+Math.random()*0.16})`;
    x.lineWidth = 0.6+Math.random()*3.0;
    x.beginPath(); x.moveTo(0,y);
    for(let px=0;px<=w;px+=14) x.lineTo(px, y+Math.sin(px*0.013+y*0.04)*4.0+(Math.random()-0.5)*1.8);
    x.stroke();
  }
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}
const woodMap = woodTexture();

function contactShadowTexture(size=512){
  const c=document.createElement('canvas'); c.width=c.height=size;
  const x=c.getContext('2d');
  const g=x.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0,'rgba(0,0,0,0.50)'); g.addColorStop(0.45,'rgba(0,0,0,0.26)');
  g.addColorStop(0.75,'rgba(0,0,0,0.07)'); g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g; x.fillRect(0,0,size,size);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
const shadowMap = contactShadowTexture();

function glowTexture(size=256){
  const c=document.createElement('canvas'); c.width=c.height=size;
  const x=c.getContext('2d');
  const g=x.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0,'rgba(255,255,255,1)');   g.addColorStop(0.35,'rgba(255,255,255,0.55)');
  g.addColorStop(0.68,'rgba(255,255,255,0.16)'); g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g; x.fillRect(0,0,size,size);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
const glowMap = glowTexture();

// ══════════════════════════════════════════════════════════ keycap geometry
// Outline is a squircle whose exponent the theme controls: 2 is a circle,
// 5 reads as a modern keycap, 8 is nearly square. Wobble adds irregularity.
function outline(a, b, sq, wobble, seedFn, wobX=1){
  const m = Math.max(Math.abs(a), Math.abs(b));
  if (m < 1e-9) return [0,0];
  const dx=a/m, dy=b/m;
  let t = 1/Math.pow(Math.pow(Math.abs(dx),sq)+Math.pow(Math.abs(dy),sq), 1/sq);
  let fx = 1, fy = 1;
  if (wobble){
    // The wobble is a fraction of the cap's own half-width, so on a 6.25u
    // spacebar it grew to six times the bulge of a 1u key and swallowed Alt
    // and Fn. Scaling it down by the width keeps every bump the same physical
    // size — which is also how real rock behaves.
    const w = (seedFn(Math.atan2(dy,dx))-0.5)*2*wobble;
    fx = 1 + w*wobX;
    fy = 1 + w;
  }
  return [m*t*dx*fx, m*t*dy*fy];
}

function keycapGeometry(widthU, h, T, variant){
  const N = T.cap.grid, sq = T.cap.sq, wob = T.cap.wobble||0;
  const wobX = 1/Math.max(1, widthU);        // keep bumps a constant size
  const gap = CFG.u - CFG.w;
  // Irregular caps need room to bulge into. The stock gap between keys is only
  // 0.105 units, so a rocky cap with wobble + lumps + jitter will always foul
  // its neighbour unless the footprint is pulled in to pay for it.
  const inset = T.cap.inset || 0;
  const wBot = widthU*CFG.u - gap - inset, dBot = CFG.d - inset;
  const k = 1 - T.cap.taper, wTop = wBot*k, dTop = dBot*k, yTop = h/2;
  // one stable pseudo-random profile per geometry, so a cap doesn't shimmer
  const seed = (variant||0)*137.51 + 11.3;
  const wf = ang => (Math.sin(ang*3.1+seed)*0.5 + Math.sin(ang*5.7+seed*1.7)*0.3
                   + Math.sin(ang*9.3+seed*2.3)*0.2)*0.5 + 0.5;

  const pos=[],uvs=[],uv1=[],idx=[];
  const push=(x,y,z,u,v)=>{
    pos.push(x,y,z); uvs.push(u,v);
    uv1.push(u*widthU, v);          // width-corrected, for normal/roughness
    return pos.length/3-1;
  };
  const UVX = 0.78, SIDE_U = 0.90, SIDE_V = 0.50;

  const grid=[];
  for(let j=0;j<=N;j++){ const row=[];
    for(let i=0;i<=N;i++){
      const [sx,sy]=outline((i/N)*2-1,(j/N)*2-1,sq,wob,wf,wobX);
      const r=Math.min(1,Math.hypot(sx,sy));
      // UV follows the cap's actual plan position, NOT the parametric grid.
      // The grid step is uniform but `outline` remaps it through the squircle
      // and the wobble, so a parametric UV stretches the legend wherever the
      // silhouette bulges — which is why letters rippled on every board and
      // turned to mush on the wobbled stone caps. Dividing by (1+wob) keeps
      // the result inside the top-face region however irregular the outline.
      const inv = 0.5/(1+wob);
      row.push(push(sx*wTop/2, yTop-T.cap.dish*(1-r*r), sy*dTop/2,
                    (sx*inv+0.5)*UVX, 1-(sy*inv+0.5)));
    } grid.push(row);
  }
  for(let j=0;j<N;j++) for(let i=0;i<N;i++){
    const a=grid[j][i],b=grid[j][i+1],c=grid[j+1][i+1],d=grid[j+1][i];
    idx.push(a,c,b, a,d,c);
  }

  const ring=[];
  for(let i=0;i<N;i++) ring.push([(i/N)*2-1,-1]);
  for(let j=0;j<N;j++) ring.push([1,(j/N)*2-1]);
  for(let i=N;i>0;i--) ring.push([(i/N)*2-1,1]);
  for(let j=N;j>0;j--) ring.push([-1,(j/N)*2-1]);

  const RINGS=[{s:1.000,y:yTop},{s:1.030,y:yTop-0.018},{s:1.065,y:yTop-0.052},
               {s:1.085,y:yTop-0.105},{s:1/k,y:-h/2}];
  const rows=RINGS.map(R=>ring.map(([a,b])=>{
    const [sx,sy]=outline(a,b,sq,wob,wf,wobX);
    return push(sx*(wTop/2)*R.s, R.y, sy*(dTop/2)*R.s, SIDE_U, SIDE_V);
  }));
  for(let r=0;r<rows.length-1;r++){
    const A=rows[r],B=rows[r+1];
    for(let i=0;i<A.length;i++){ const n=(i+1)%A.length;
      idx.push(A[i],B[n],B[i], A[i],A[n],B[n]); }
  }
  const cen=push(0,-h/2,0,SIDE_U,SIDE_V), last=rows[rows.length-1];
  for(let i=0;i<last.length;i++) idx.push(cen,last[i],last[(i+1)%last.length]);

  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.setAttribute('uv1',new THREE.Float32BufferAttribute(uv1,2));
  g.setIndex(idx);
  if(T.cap.lumps){
    // carve the whole cap, so it reads as a struck pebble rather than a soft blob
    const pa = g.attributes.position, L = T.cap.lumps, off = (variant||0)*7.3;
    for(let i=0;i<pa.count;i++){
      const x=pa.getX(i), y=pa.getY(i), z=pa.getZ(i);
      const n = rockNoise((x+off)*2.1, y*2.6, (z+off)*2.1);
      const shell = Math.min(1, Math.abs(y)/(h*0.5) + 0.35);   // ease it at the seams
      pa.setXYZ(i, x + n*L, y + n*L*0.45*shell, z + n*L);
    }
    pa.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

function capTexture(label, sub, base, ink, T, forceLeft){
  const W=640,H=512,c=document.createElement('canvas'); c.width=W;c.height=H;
  const x=c.getContext('2d');
  x.fillStyle=base; x.fillRect(0,0,W,H);
  const faceW=W*0.78, fit=faceW*(forceLeft ? 0.94 : 0.72);
  const font = s => T.legendFont.replace('{S}', s);
  if (T.legendTrack) { x.letterSpacing = T.legendTrack; }
  const TL = T.legendAlign === 'topleft' || !!forceLeft;
  x.fillStyle=ink; x.textAlign = TL ? 'left' : 'center'; x.textBaseline='middle';
  const LX = TL ? faceW*0.09 : faceW*0.5;
  const fitText=(txt,start)=>{ let s=start;
    do{ x.font=font(s); if(x.measureText(txt).width<=fit) break; s-=2; }while(s>(forceLeft?26:8)); return s; };
  const draw = (txt, cx, cy) => {
    if(T.legendStyle === 'engrave'){
      // A cut into stone reads as one crisp dark glyph with a lit bevel along
      // its top edge — not a scatter of offset stamps, which is just mush.
      x.save();
      x.fillStyle = 'rgba(255,252,244,0.55)';
      x.fillText(txt, cx, cy - H*0.008);        // sun catching the upper lip
      x.fillStyle = 'rgba(0,0,0,0.30)';
      x.fillText(txt, cx, cy + H*0.010);        // shadow pooling in the cut
      x.fillStyle = ink;
      x.fillText(txt, cx, cy);                  // the cut itself, sharp
      x.restore();
    } else x.fillText(txt, cx, cy);
  };
  const S1 = T.legendSize || 0.30, S2 = T.legendSubSize || 0.21;
  if(sub){ fitText(sub,  Math.round(H*S2)); draw(sub,   LX, TL ? H*0.26 : H*0.30);
           fitText(label,Math.round(H*S2)); draw(label, LX, TL ? H*0.60 : H*0.68); }
  else   { fitText(label,Math.round(H*S1)); draw(label, LX, TL ? H*0.28 : H*0.50); }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=renderer.capabilities.getMaxAnisotropy();
  if(!T.backlit) return {map:t};

  const mc=document.createElement('canvas'); mc.width=W; mc.height=H;
  const mx=mc.getContext('2d');
  if (T.legendTrack) { mx.letterSpacing = T.legendTrack; }
  mx.fillStyle='#000'; mx.fillRect(0,0,W,H);
  mx.fillStyle='#fff'; mx.textAlign='center'; mx.textBaseline='middle';
  const mfit=(txt,start)=>{ let sz=start;
    do{ mx.font=font(sz); if(mx.measureText(txt).width<=fit) break; sz-=3; }while(sz>8); };
  if(!label && !sub){
    // no legend to shine through — light the whole cap like a real diffused spacebar
    const gr = mx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0,   'rgba(255,255,255,0.30)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.62)');
    gr.addColorStop(1,   'rgba(255,255,255,0.30)');
    mx.fillStyle = gr;
    mx.fillRect(faceW*0.04, H*0.10, faceW*0.92, H*0.80);
  }
  else if(sub){ mfit(sub,Math.round(H*0.21));   mx.fillText(sub,   faceW*0.5, H*0.30);
                mfit(label,Math.round(H*0.21)); mx.fillText(label, faceW*0.5, H*0.68); }
  else        { mfit(label,Math.round(H*0.30)); mx.fillText(label, faceW*0.5, H*0.50); }
  const mt=new THREE.CanvasTexture(mc);
  mt.colorSpace=THREE.SRGBColorSpace;
  return {map:t, emissiveMap:mt};
}

// ══════════════════════════════════════════════════════════ 75% ANSI layout
const K=(l,s,w,c,st,gap)=>({l,s,w:w||1,c,st:st||'a',gap:gap||0});
const LAYOUT = [
 // F-row: Esc, then F1-F4 / F5-F8 / F9-F12 clusters. No Delete up here.
 [ K('Esc',null,1,'Escape','x'),
   K('F1',null,1,'F1','a',0.5),K('F2',null,1,'F2'),K('F3',null,1,'F3'),K('F4',null,1,'F4'),
   K('F5',null,1,'F5','m',0.5),K('F6',null,1,'F6','m'),K('F7',null,1,'F7','m'),K('F8',null,1,'F8','m'),
   K('F9',null,1,'F9','a',0.5),K('F10',null,1,'F10'),K('F11',null,1,'F11'),K('F12',null,1,'F12') ],
 [ K('`','~',1,'Backquote'),K('1','!',1,'Digit1'),K('2','@',1,'Digit2'),K('3','#',1,'Digit3'),
   K('4','$',1,'Digit4'),K('5','%',1,'Digit5'),K('6','^',1,'Digit6'),K('7','&',1,'Digit7'),
   K('8','*',1,'Digit8'),K('9','(',1,'Digit9'),K('0',')',1,'Digit0'),K('-','_',1,'Minus'),
   K('=','+',1,'Equal'),K('Backspace',null,2,'Backspace','m') ],
 [ K('Tab',null,1.5,'Tab','m'),K('Q',null,1,'KeyQ'),K('W',null,1,'KeyW'),K('E',null,1,'KeyE'),
   K('R',null,1,'KeyR'),K('T',null,1,'KeyT'),K('Y',null,1,'KeyY'),K('U',null,1,'KeyU'),
   K('I',null,1,'KeyI'),K('O',null,1,'KeyO'),K('P',null,1,'KeyP'),K('[','{',1,'BracketLeft'),
   K(']','}',1,'BracketRight'),K('\\','|',1.5,'Backslash') ],
 [ K('Caps Lock',null,1.75,'CapsLock','m'),K('A',null,1,'KeyA'),K('S',null,1,'KeyS'),K('D',null,1,'KeyD'),
   K('F',null,1,'KeyF'),K('G',null,1,'KeyG'),K('H',null,1,'KeyH'),K('J',null,1,'KeyJ'),
   K('K',null,1,'KeyK'),K('L',null,1,'KeyL'),K(';',':',1,'Semicolon'),K("'",'"',1,'Quote'),
   K('Enter',null,2.25,'Enter','x') ],
 [ K('Shift',null,2.25,'ShiftLeft','m'),K('Z',null,1,'KeyZ'),K('X',null,1,'KeyX'),K('C',null,1,'KeyC'),
   K('V',null,1,'KeyV'),K('B',null,1,'KeyB'),K('N',null,1,'KeyN'),K('M',null,1,'KeyM'),
   K(',','<',1,'Comma'),K('.','>',1,'Period'),K('/','?',1,'Slash'),
   K('Shift',null,1.75,'ShiftRight','m'),K('↑',null,1,'ArrowUp','m') ],
 [ K('Ctrl',null,1.25,'ControlLeft','m'),K('Win',null,1.25,'MetaLeft','m'),K('Alt',null,1.25,'AltLeft','m'),
   K('',null,6.25,'Space','x'),K('Fn',null,1,'Fn','m'),K('Ctrl',null,1,'ControlRight','m'),
   K('←',null,1,'ArrowLeft','m'),K('↓',null,1,'ArrowDown','m'),K('→',null,1,'ArrowRight','m') ],
];
// right column: nothing beside the F-row (the knob lives there), then Del/PgUp/PgDn/End
const RIGHT_COL  = [null,'Delete','PgUp','PgDn','End',null];
const RIGHT_CODE = [null,'Delete','PageUp','PageDown','End',null];
const RIGHT_X = 15.18;

// ══════════════════════════════════════════════════════════ scene assembly
let root = null, keys = [], byCode = new Map(), fitBox = new THREE.Box3();
// Props live outside `root` because root is torn down and rebuilt on every
// theme switch; the television is not a theme, it stands behind all of them.
const props = new THREE.Group(); scene.add(props);
let crt = null;
const propObjects = new Map();      // id -> built prop, from the PROPS table

const _bb = new THREE.Box3();
function boardBounds(){
  _bb.makeEmpty();
  if(!root) return _bb;
  root.updateMatrixWorld(true);
  root.traverse(o=>{
    if(o.userData.noFit) return;
    if(o.isMesh && o.material && o.material.depthWrite) _bb.expandByObject(o);
  });
  return _bb;
}
// Moves the finished board per BOARD in props.js. Measured after the build,
// because the offsets are fractions of the board's own width and no board knows
// its size until it exists. Props place against the moved bounds, so the CRT
// follows the keyboard rather than being left behind.

// ── swapping the board, as a slide ──────────────────────────────────────────
// A menu picks the keyboard, so the swap has to read as one board leaving and
// the next arriving rather than a cut. The old one runs off the way you came
// from, the new one is built off-screen on the far side and rides in.
let boardBaseX = 0, boardSpan = 1, boardSlideX = 0, swap = null, refBoardWidth = 0;
let refCentreX = null, refCentreZ = null;

let boardCleared = false, queued = null;
export function showBoard(name, dir){
  // Arrowing through the menu faster than a swap takes used to drop the request
  // outright, so boards were skipped. Remember the latest one instead and run it
  // when the current swap lands — only the newest matters, since anything in
  // between was passed through rather than chosen.
  if(swap){ queued = { name, dir }; return true; }
  // null or 'none' runs the current board off and leaves the desk empty, which
  // is what the credits want: the television, and nothing in front of it.
  const clearing = (name === null || name === 'none');
  if(!clearing && !THEMES[name]) return false;
  if(!clearing && name === activeTheme && !boardCleared) return false;
  if(clearing && boardCleared) return false;
  swap = { name: clearing ? null : name, dir: (dir < 0 ? -1 : 1), t: 0, phase: 'out' };
  return true;
}

function stepSwap(dt){
  if(!swap) return;
  const OUT = 0.22, IN = 0.30, travel = boardSpan * 1.6;
  swap.t += dt;
  if(swap.phase === 'out'){
    const k = Math.min(1, swap.t / OUT);
    boardSlideX = -swap.dir * travel * (k*k);           // accelerate away
    if(root) root.position.x = boardBaseX + boardSlideX;
    if(k >= 1){
      if(swap.name === null){                    // credits: leave the desk empty
        if(root) root.visible = false;
        boardCleared = true; boardSlideX = 0; swap = null;
        if(queued){ const q = queued; queued = null; showBoard(q.name, q.dir); }
        return;
      }
      // buildTheme resets the root and re-places everything, so the offset has
      // to be in place before it runs or the new board appears at centre for a
      // frame and the swap flickers.
      boardSlideX = swap.dir * travel;
      buildTheme(swap.name);
      if(root) root.visible = true;
      boardCleared = false;
      swap.phase = 'in'; swap.t = 0;
    }
  } else {
    const k = Math.min(1, swap.t / IN);
    boardSlideX = swap.dir * travel * (1 - easeOut(k)); // settle in
    if(root) root.position.x = boardBaseX + boardSlideX;
    if(k >= 1){
      boardSlideX = 0; if(root) root.position.x = boardBaseX; swap = null;
      if(queued){ const q = queued; queued = null; showBoard(q.name, q.dir); }
    }
  }
}

function placeBoard(){
  if(!root) return;
  root.position.set(0,0,0); root.rotation.set(0,0,0); root.scale.setScalar(1);
  root.updateMatrixWorld(true);

  const b = BOARD || {};
  const o = (b.offsetFor && b.offsetFor[activeTheme]) || b.offset || [0,0,0];
  const natural = boardBounds().getSize(new THREE.Vector3()).x || 1;

  // Every board is normalised to the width of the first one. The camera is a
  // single locked pose now that a menu swaps boards under it, and these machines
  // are nothing like each other in world units — the typewriter came out a
  // fraction of the size of the keyboards and sat in the corner of frame.
  if(!refBoardWidth) refBoardWidth = natural;
  const perBoard = (b.scaleFor && b.scaleFor[activeTheme]) ?? b.scale ?? 1;
  root.scale.setScalar(perBoard * (refBoardWidth / natural));
  root.rotation.y = THREE.MathUtils.degToRad(b.rotate || 0);

  const span = refBoardWidth * perBoard;
  root.position.set((o[0]||0)*span, (o[1]||0)*span, (o[2]||0)*span);
  root.updateMatrixWorld(true);

  // Sit it on the ground and centre it on the aim point. Boards are modelled
  // with their own idea of where the origin is — some centred, some cornered —
  // so without this each one lands somewhere different and walking through the
  // menu looks like the keyboard creeping steadily off to one side.
  const bb = boardBounds();
  if(!bb.isEmpty()){
    root.position.y -= bb.min.y;
    // Line every board up on where the FIRST one sat, not on the world origin.
    // The shot was composed around the Mocha, which happens to stand near
    // x = 14 — centring on zero dragged the whole scene out of frame to the
    // left. So the first board is the reference and never moves; the others are
    // brought to meet it, which is all the drift ever needed.
    const cx = (bb.min.x + bb.max.x)/2, cz = (bb.min.z + bb.max.z)/2;
    if(refCentreX === null){ refCentreX = cx; refCentreZ = cz; }
    root.position.x -= cx - refCentreX;
    root.position.z -= cz - refCentreZ;
    root.updateMatrixWorld(true);
  }

  boardBaseX = root.position.x;
  boardSpan  = span;
  root.position.x += boardSlideX;
  root.updateMatrixWorld(true);
}

let crtPlaced = false;
// A ground plane that draws only the shadow falling on it. Everything else
// about it is invisible, so it grounds the board on whatever backdrop is behind
// without covering it.
let shadowFloor = null;
// Point the shadow-casting light wherever the backdrop's own sun is, so the
// board and the set are lit by the same thing the scene behind them is. A
// keyboard lit from the left in front of a sunrise coming from the right is the
// single loudest tell that it was pasted on.
let sunLight = null;
const sunAim = new THREE.Vector3();
function applySunOverride(){
  if(!sunLight) return;
  const S = SCENE.sun;
  if(!S) return;
  if(S.colour    !== undefined) sunLight.color.setHex(S.colour);
  if(S.intensity !== undefined) sunLight.intensity = S.intensity;
  if(S.az !== undefined || S.el !== undefined){
    const a = THREE.MathUtils.degToRad(S.az ?? 40);
    const e = THREE.MathUtils.degToRad(S.el ?? 35);
    const d = 45;
    sunLight.position.set(sunAim.x + Math.sin(a) * d * Math.cos(e),
                          Math.max(2, Math.sin(e) * d),
                          sunAim.z + Math.cos(a) * d * Math.cos(e));
  }
  const K = SCENE.sky;
  if(K){
    scene.traverse(o => {
      if(!o.isHemisphereLight) return;
      if(K.top       !== undefined) o.color.setHex(K.top);
      if(K.bottom    !== undefined) o.groundColor.setHex(K.bottom);
      if(K.intensity !== undefined) o.intensity = K.intensity;
    });
  }
  if(SCENE.exposure !== undefined) renderer.toneMappingExposure = SCENE.exposure;
}

// Water on the machine, eased rather than switched. It belongs to a scene, not
// to a board — the temple is raining and nothing else is — so the page moves the
// target and this closes the gap over about a second. Swapping boards, or
// escaping to the title and coming back, therefore dries off and wets up rather
// than cutting.
let rainNow = 0;
function stepRainAmount(now, dt){
  const target = Math.max(0, Math.min(1, SCENE.rain || 0));
  if(rainNow !== target){
    // Asymmetric, and deliberately so: water arriving is weather setting in and
    // wants a moment, water leaving is a scene that is simply no longer wet and
    // should not linger. Rate-based either way, so frame rate does not change it.
    const rate = (target < rainNow) ? 7.0 : 2.2;
    rainNow += (target - rainNow) * Math.min(1, dt * rate);
    if(Math.abs(target - rainNow) < 0.002) rainNow = target;
  }
  stepRain(now * 0.001, rainNow);
}

function ensureShadowFloor(){
  const want = SCENE.shadowFloor === true;
  if(want && !shadowFloor){
    shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.ShadowMaterial({ opacity: SCENE.shadowOpacity ?? 0.34 }));
    shadowFloor.rotation.x = -Math.PI/2;
    shadowFloor.position.y = 0.001;      // just clear of the boards' own base
    shadowFloor.receiveShadow = true;
    shadowFloor.userData.noFit = true;   // must not drive the camera fit
    scene.add(shadowFloor);
  }
  if(shadowFloor){
    shadowFloor.visible = want;
    shadowFloor.material.opacity = SCENE.shadowOpacity ?? 0.34;
  }
}

function placeCRT(){
  if(!crt) return;
  // the typewriter is its own complete machine; a monitor behind it makes no sense
  // a prop hides itself on the themes listed in props.js
  const hide = (PROPS.crt.hideOn || []).includes(activeTheme);
  crt.group.visible = !hide;
  if(crt.setBodyColor)
    crt.setBodyColor((PROPS.crt.bodyFor && PROPS.crt.bodyFor[activeTheme]) ?? PROPS.crt.body ?? 0x141416,
                     PROPS.crt.bodyFade ?? 0.6);
  // The television is furniture. It is placed once, against the first board, and
  // then left alone: re-placing it per board sent it off-screen with the
  // keyboard during a swap, because the board's bounds carry the slide offset.
  if(crtPlaced) return;
  if(crt.group.visible && root && !boardBounds().isEmpty()){
    crt.place(boardBounds());
    crtPlaced = true;
  }
}
let activeTheme = null;

function disposeTree(obj){
  obj.traverse(o=>{
    if(o.geometry) o.geometry.dispose();
    if(o.material){
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      // shared maps (wood, contact shadow, grain) outlive the theme — don't dispose them
      const SHARED = [woodMap, shadowMap, glowMap];   // surfaces are cached in _surfaces
      for(const m of ms){
        if(m.map && !SHARED.includes(m.map)) m.map.dispose();
        m.dispose();
      }
    }
  });
}

// Cheap 3D value noise from summed sines — enough character for rock, no tables.
function rockNoise(x,y,z){
  return Math.sin(x*1.00 + Math.sin(z*0.70)*1.7) * 0.50
       + Math.sin(z*1.30 + Math.sin(y*0.90)*1.3) * 0.32
       + Math.sin(y*1.70 + x*0.60)               * 0.22
       + Math.sin(x*2.90 + z*2.30)               * 0.14
       + Math.sin(z*4.70 - x*3.10)               * 0.08
       + Math.sin(x*8.30 + y*7.10)               * 0.05;
}

// A wedge straight out of ExtrudeGeometry has a few dozen vertices — displacing it
// does nothing. Subdivide until the triangles are small, THEN carve.
function hewn(g, opts){
  const {edge=0.55, iterations=7, amp=0.42, freq=0.42, chunk=0.0} = opts;
  g = new TessellateModifier(edge, iterations).modify(g);
  const p = g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const n  = rockNoise(x*freq, y*freq, z*freq);
    // a second, slower band knocks big facets out of the mass
    const big = chunk ? Math.sin(x*0.21+z*0.13)*Math.cos(z*0.17-y*0.11)*chunk : 0;
    p.setXYZ(i,
      x + n*amp        + big,
      y + n*amp*0.62   + big*0.5,
      z + n*amp*0.85   + big);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function wedgeGeometry(width, depth, hFront, hBack, bevel=0.10){
  const sh = new THREE.Shape();
  sh.moveTo(0,0); sh.lineTo(depth,0); sh.lineTo(depth,hFront); sh.lineTo(0,hBack); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth:width, bevelEnabled:true,
    bevelThickness:bevel, bevelSize:bevel, bevelSegments:3, curveSegments:2});
  g.rotateY(-Math.PI/2); g.translate(width,0,0);
  return g;
}

let typewriter = null;

function resetRoot(name){
  activeTheme = name;
  if(typewriter){ typewriter.dispose(); typewriter = null; }
  if(root){ scene.remove(root); disposeTree(root); }
  root = new THREE.Group(); scene.add(root);
  keys = []; byCode = new Map();
}

// At a low camera angle the floor plane's far edge draws a hard line across the
// backdrop. Fog tinted to the same grey dissolves that horizon instead of
// needing an ever-larger plane.
function applyFog(T){
  scene.fog = T.fog ? new THREE.Fog(T.fog.colour, T.fog.near, T.fog.far) : null;
}

function markPicker(name){
  document.querySelectorAll('#picker button').forEach(b =>
    b.classList.toggle('on', b.dataset.k === name));
}

// A themed machine rather than a themed keyboard: geometry comes from a glTF
// and the moving parts are driven by typewriter.js.
async function buildModelTheme(name){
  const T = THEMES[name];
  resetRoot(name);
  renderer.toneMappingExposure = T.env.exposure;
  document.body.style.background = SCENE.background ? 'transparent' : T.page;
  applyFog(SCENE.fog === false ? {} : T);
  markPicker(name);

  const E = T.env;
  const hemi = new THREE.HemisphereLight(E.hemiSky, E.hemiGround, E.hemiInt);
  const key  = new THREE.DirectionalLight(E.keyCol, E.keyInt);
  key.position.set(-9, 16, 12); key.castShadow = true;
  sunLight = key; sunAim.set(0, 0, 0);
  key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 60;
  key.shadow.camera.left = -12; key.shadow.camera.right = 12;
  key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
  key.shadow.bias = -0.0012;
  const fill = new THREE.DirectionalLight(E.fillCol, E.fillInt);
  fill.position.set(14, 9, -10);
  const rim  = new THREE.DirectionalLight(E.rakeCol, E.rakeInt);
  rim.position.set(2, 7, -18);
  root.add(hemi, key, key.target, fill, rim);

  if(T.floor && SCENE.floor !== false){
    const f = new THREE.Mesh(new THREE.PlaneGeometry(400,400),
      new THREE.MeshStandardMaterial({color:T.floor.colour, roughness:T.floor.rough,
        metalness:T.floor.metal, envMapIntensity:T.floor.env}));
    f.rotation.x = -Math.PI/2; f.position.y = T.floor.y ?? 0;
    f.receiveShadow = true; f.userData.noFit = true;   // must not drive the camera fit
    root.add(f);
  }

  const built = name;
  const tw = await buildTypewriter({modelUrl:T.model, parent:root});
  if(activeTheme !== built){ tw.dispose(); return; }   // theme switched mid-load
  typewriter = tw;
  keys = tw.keys; byCode = tw.byCode;
  root.userData.step = dt => tw.step(dt);
  root.userData.fitPadX = tw.maxTravel;
  tw.setVoice(makeVoice(AC, master || undefined));
  placeBoard();
  placeCRT();
  fitCamera();
  rainOn(root); if(crt) rainOn(crt.model);
  if(T.ao && ensureAO()) configureAO(T.ao);
}

function buildTheme(name){
  const T = THEMES[name];
  if(!T) return;
  if(T.model){ buildModelTheme(name).catch(e => showErr('typewriter: '+(e.stack||e.message))); return; }
  resetRoot(name);

  const SURF = {
    cap : Object.assign({}, DEFAULT_SURFACE.cap,  (T.surface&&T.surface.cap)  || {}),
    case: Object.assign({}, DEFAULT_SURFACE.case, (T.surface&&T.surface.case) || {}),
  };
  const capSurf  = getSurface(SURF.cap);
  const caseSurf = getSurface(SURF.case);

  renderer.toneMappingExposure = T.env.exposure;
  document.body.style.background = SCENE.background ? 'transparent' : T.page;
  applyFog(SCENE.fog === false ? {} : T);

  // ---- keycaps
  const board = new THREE.Group();
  const hex = n => '#'+n.toString(16).padStart(6,'0');
  const geoCache = new Map();
  const VARIANTS = T.cap.variants || 1;
  let vIdx = 0;
  const getCap = (w,h) => {
    const v = VARIANTS === 1 ? 0 : (vIdx++ % VARIANTS);
    const k2 = w.toFixed(2)+'|'+h.toFixed(2)+'|'+v;
    if(!geoCache.has(k2)) geoCache.set(k2, keycapGeometry(w,h,T,v));
    return geoCache.get(k2);
  };
  const J = T.jitter, rad = Math.PI/180;

  function addKey(spec, xU, ri){
    const row = T.rows[ri];
    let base = spec.st==='x' ? T.colour.accent : spec.st==='m' ? T.colour.mod : T.colour.alpha;
    if(T.lightKeys && spec.c && T.lightKeys.includes(spec.c)) base = T.colour.alpha;
    // Some boards light ONLY the letters: numbers, punctuation and modifiers
    // all take the darker cap, which is what makes the set read two-tone
    // rather than uniformly pale.
    if(T.lettersOnlyAlpha && spec.c && !/^Key[A-Z]$/.test(spec.c) && spec.c !== 'Space')
      base = T.colour.mod;
    if(T.altKeys && spec.c && T.altKeys.includes(spec.c)) base = T.colour.alt ?? base;
    const ink  = spec.st==='x' ? T.colour.legendAccent : T.colour.legend;
    const modLeft = T.legendModLeft && !spec.s && spec.l && spec.l.length > 2;
    const tex = capTexture(spec.l, spec.s, hex(base), ink, T, modLeft);
    const mesh = new THREE.Mesh(getCap(spec.w,row.h), new THREE.MeshStandardMaterial({
      map: tex.map,
      emissiveMap: tex.emissiveMap || null,
      emissive: tex.emissiveMap ? new THREE.Color(0x000000) : new THREE.Color(0x000000),
      emissiveIntensity: 1.0,
      roughness:T.capRough, metalness:T.capMetal,
      flatShading: !!T.cap.lumps,
      roughnessMap: capSurf.roughnessMap,
      normalMap: capSurf.normalMap,
      envMapIntensity: T.envCap ?? 1.0,
      normalScale: new THREE.Vector2(SURF.cap.normalScale, SURF.cap.normalScale) }));
    mesh.castShadow = mesh.receiveShadow = true;

    const holder = new THREE.Group();
    holder.position.set((xU + spec.w/2)*CFG.u - CFG.u/2, row.h/2, ri*CFG.u);
    holder.rotation.x = row.tilt*rad + (Math.random()-0.5)*2*J.rot*rad;
    holder.rotation.z = (Math.random()-0.5)*2*J.rot*rad;
    holder.position.x += (Math.random()-0.5)*2*J.pos;
    holder.position.z += (Math.random()-0.5)*2*J.pos;
    holder.add(mesh);
    let pad = null;
    if(T.fx === 'rgb'){
      pad = new THREE.Mesh(
        new THREE.PlaneGeometry(spec.w*CFG.u*1.55, CFG.d*1.55),
        new THREE.MeshBasicMaterial({map:glowMap, color:0x000000, transparent:true,
          blending:THREE.AdditiveBlending, depthWrite:false, opacity:1}));
      pad.rotation.x = -Math.PI/2;
      pad.position.y = -row.h/2 + 0.05;
      pad.renderOrder = 2;
      holder.add(pad);
    }
    board.add(holder);
    const rec = {holder, mesh, pad, rest:row.h/2, t:-1, dir:0,
                 px:(xU+spec.w/2)*CFG.u - CFG.u/2, pz:ri*CFG.u,   // board-space, for ripples
                 gx:(xU+spec.w/2), gz:ri, hit:-1e9, energy:0};
    keys.push(rec);
    if(spec.c) byCode.set(spec.c, rec);
  }
  const LAY = T.layout || LAYOUT;
  LAY.forEach((row,ri)=>{
    let xU=0; row.forEach(s=>{ xU+=s.gap; addKey(s,xU,ri); xU+=s.w; });
    const knobHere = T.caseStyle.knob && (T.caseStyle.knob.row ?? 0) === ri
                     && (T.caseStyle.knob.col ?? RIGHT_X) === RIGHT_X;
    if(!T.layout && RIGHT_COL[ri] && !knobHere)
      addKey(K(RIGHT_COL[ri],null,1,RIGHT_CODE[ri],'a'), RIGHT_X, ri);
  });

  // ---- case
  const cs = T.caseStyle;
  const capsBox = new THREE.Box3().setFromObject(board);
  const capsSize = capsBox.getSize(new THREE.Vector3());
  const capsCtr  = capsBox.getCenter(new THREE.Vector3());
  const zB = capsBox.min.z - cs.bezel, zF = capsBox.max.z + cs.bezel;
  const DEPTH = zF - zB, WIDTH = capsSize.x + cs.bezel*2;
  const incline = Math.atan2(cs.hBack - cs.hFront, DEPTH);
  const caseGroup = new THREE.Group();

  const trayInset = 0.34;
  const shellW = WIDTH + (cs.side ?? 0.34);
  const shell = new THREE.Mesh(
    wedgeGeometry(shellW, DEPTH, cs.hFront, cs.hBack, 0.14),
    new THREE.MeshStandardMaterial({color:T.colour.case, roughness:cs.caseRough,
      metalness:cs.caseMetal, roughnessMap:caseSurf.roughnessMap,
      normalMap:caseSurf.normalMap,
      envMapIntensity: T.envCase ?? 1.0,
      normalScale:new THREE.Vector2(SURF.case.normalScale, SURF.case.normalScale)}));
  if(cs.rough){
    shell.geometry.dispose();
    shell.geometry = hewn(wedgeGeometry(shellW, DEPTH, cs.hFront, cs.hBack, 0.14),
                          {edge:cs.hewEdge||0.55, iterations:cs.hewIter||8, amp:cs.rough,
                           freq:cs.hewFreq||0.42, chunk:cs.chunk||0});
    shell.material.flatShading = true;      // facets, not a smooth blob
    shell.material.needsUpdate = true;
  }
  shell.position.set(capsCtr.x - shellW/2, 0, zB);
  shell.castShadow = shell.receiveShadow = true;
  caseGroup.add(shell);

  const tray = new THREE.Mesh(
    wedgeGeometry(WIDTH, DEPTH-0.30, cs.hFront-trayInset, cs.hBack-trayInset, 0.06),
    new THREE.MeshStandardMaterial({color:T.colour.tray, roughness:cs.caseRough+0.12,
      metalness:Math.max(0,cs.caseMetal-0.3), roughnessMap:caseSurf.roughnessMap,
      normalMap:caseSurf.normalMap,
      envMapIntensity: T.envCase ?? 1.0,
      normalScale:new THREE.Vector2(SURF.case.normalScale*1.2, SURF.case.normalScale*1.2)}));
  tray.position.set(capsCtr.x - WIDTH/2, 0.06, zB+0.15);   // proud of the shell: seam line
  tray.receiveShadow = true;
  caseGroup.add(tray);

  if(cs.slot){
    // the thin dark status slot the F75 carries between Esc and F1
    const S = cs.slot;
    const deckY = cs.hBack - trayInset - 0.055;
    const sz = (S.row ?? 0)*CFG.u;
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(S.w ?? 0.16, 0.06, S.d ?? 0.62),
      new THREE.MeshStandardMaterial({color:S.colour ?? 0x1C130C, roughness:0.55, metalness:0.0,
                                      envMapIntensity:(T.envCase ?? 1.0)*0.4}));
    slot.position.set((S.col + 0.5)*CFG.u - CFG.u/2,
                      deckY - Math.sin(incline)*sz, sz*Math.cos(incline));
    slot.rotation.x = incline;
    caseGroup.add(slot);
  }

  if(cs.knob){
    const K = cs.knob;
    const knobGrp = new THREE.Group();
    // seated in the key grid: col/row are in layout units like any other key
    const kCol = K.col ?? RIGHT_X, kRow = K.row ?? 0;
    const kx = (kCol + 0.5)*CFG.u - CFG.u/2;
    const kz = kRow*CFG.u;
    const deckY = cs.hBack - trayInset - 0.06;
    knobGrp.position.set(kx, deckY + Math.sin(incline)*0 + (K.rise ?? 0.55), kz);
    knobGrp.position.y = deckY - Math.sin(incline)*kz + (K.rise ?? 0.55);
    knobGrp.position.z = kz*Math.cos(incline);
    knobGrp.rotation.x = incline;

    // polished aluminium. no roughness map and a hot env, or it reads as dark plastic
    const knurl = new THREE.MeshStandardMaterial({color:K.colour ?? 0xB9BEC6,
      roughness:0.14, metalness:1.0, envMapIntensity: K.env ?? 2.4});
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(K.r ?? 1.05, K.r ?? 1.05, K.h ?? 0.95, 48), knurl);
    body.castShadow = body.receiveShadow = true;
    knobGrp.add(body);
    // the knob sits in a raised boss with a dark gap ring round it, as on the F75
    if(K.housing !== false){
      const bossMat = new THREE.MeshStandardMaterial({color:T.colour.case,
        roughness:cs.caseRough, metalness:cs.caseMetal,
        envMapIntensity:T.envCase ?? 1.0});
      const boss = new THREE.Mesh(
        new THREE.CylinderGeometry((K.r ?? 1.05)*1.34, (K.r ?? 1.05)*1.42, (K.h ?? 0.95)*0.9, 40), bossMat);
      boss.position.y = -(K.h ?? 0.95)*0.62;
      boss.receiveShadow = true;
      knobGrp.add(boss);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry((K.r ?? 1.05)*1.02, (K.r ?? 1.05)*1.30, 40),
        new THREE.MeshBasicMaterial({color:0x1A1108, side:THREE.DoubleSide}));
      ring.rotation.x = -Math.PI/2;
      ring.position.y = -(K.h ?? 0.95)*0.5 + 0.02;
      knobGrp.add(ring);
    }
    // knurled grip: fine vertical ridges round the barrel
    const ridge = new THREE.BoxGeometry(0.045, (K.h ?? 0.95)*0.86, 0.10);
    for(let i=0;i<44;i++){
      const a = (i/44)*Math.PI*2;
      const m = new THREE.Mesh(ridge, knurl);
      m.position.set(Math.cos(a)*(K.r ?? 1.05), 0, Math.sin(a)*(K.r ?? 1.05));
      m.rotation.y = -a;
      knobGrp.add(m);
    }
    const capTop = new THREE.Mesh(
      new THREE.CylinderGeometry((K.r ?? 1.05)*0.92, (K.r ?? 1.05)*0.92, 0.06, 40),
      new THREE.MeshStandardMaterial({color:K.top ?? 0xD8DCE2, roughness:0.30,
        metalness:1.0, envMapIntensity:(K.env ?? 2.4)*0.8}));
    capTop.position.y = (K.h ?? 0.95)/2 + 0.02;
    knobGrp.add(capTop);
    caseGroup.add(knobGrp);
    root.userData.knob = knobGrp;
  }

  if(cs.rim){
    // moulded lip standing proud of the case around the key well
    const rimMat = new THREE.MeshStandardMaterial({color:T.colour.case, roughness:cs.caseRough,
      metalness:cs.caseMetal, roughnessMap:caseSurf.roughnessMap, normalMap:caseSurf.normalMap,
      normalScale:new THREE.Vector2(SURF.case.normalScale, SURF.case.normalScale)});
    const rw = WIDTH + cs.rim*2, rd = DEPTH - 0.10;
    const outer = new THREE.Mesh(wedgeGeometry(rw, rd, cs.hFront-0.12, cs.hBack-0.12, 0.10), rimMat);
    outer.position.set(capsCtr.x - rw/2, 0.03, zB + 0.05);
    outer.castShadow = outer.receiveShadow = true;
    caseGroup.add(outer);
  }

  if(cs.wood){
    const woodMat  = new THREE.MeshStandardMaterial({color:0xFFFFFF, map:woodMap,
      roughness:0.58, metalness:0, roughnessMap:woodMap});
    const screwMat = new THREE.MeshStandardMaterial({color:T.colour.screw, roughness:0.30, metalness:0.90});
    for(const side of [-1,1]){
      const blk = new THREE.Mesh(wedgeGeometry(cs.woodW, DEPTH+0.10, cs.hFront+0.16, cs.hBack+0.16, 0.08), woodMat);
      const bx = capsCtr.x + side*(shellW/2 + 0.02);
      blk.position.set(side<0 ? bx-cs.woodW : bx, 0, zB-0.05);
      blk.castShadow = blk.receiveShadow = true;
      caseGroup.add(blk);
      if(cs.screws) for(const f of [0.28,0.72]){
        const y = cs.hBack+0.16 - (cs.hBack-cs.hFront)*f;
        const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.05,20), screwMat);
        sc.position.set(bx + side*(cs.woodW+0.012), y*0.52, zB + DEPTH*f);
        sc.rotation.z = Math.PI/2;
        caseGroup.add(sc);
      }
    }
  }

  // period-correct moulded ribs down the front lip
  if(cs.ribs){
    const ribMat = new THREE.MeshStandardMaterial({color:T.colour.tray, roughness:0.85, metalness:0});
    for(let i=0;i<28;i++){
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.30, 0.10), ribMat);
      rib.position.set(capsCtr.x - shellW/2 + 0.9 + i*((shellW-1.8)/27), cs.hFront*0.42, zF+0.02);
      caseGroup.add(rib);
    }
  }

  if(cs.pebbles){
    const pmat = new THREE.MeshStandardMaterial({color:T.colour.tray, roughness:0.92, metalness:0,
      normalMap:caseSurf.normalMap, normalScale:new THREE.Vector2(SURF.case.normalScale*1.5, SURF.case.normalScale*1.5)});
    // Three different solids, each squashed on its own axes and then carved
    // with the same rock noise as the caps, so no two stones share a
    // silhouette. Per-vertex displacement is a pure function of position, so
    // the duplicated verts of a non-indexed polyhedron stay welded.
    const SOLIDS = [
      d => new THREE.IcosahedronGeometry(1, d),
      d => new THREE.DodecahedronGeometry(1, d),
      d => new THREE.OctahedronGeometry(1, d+1),
    ];
    const SZ = cs.pebbleSize ?? 0.5;
    for(let i=0;i<cs.pebbles;i++){
      const r = SZ*(0.6 + Math.random()*1.7);
      const g = SOLIDS[(Math.random()*SOLIDS.length)|0](cs.pebbleDetail ?? 2);
      const sx=0.62+Math.random()*0.8, sy=0.45+Math.random()*0.65, sz=0.62+Math.random()*0.8;
      const seed=Math.random()*40, amp=0.14+Math.random()*0.26, frq=0.8+Math.random()*1.9;
      const pp = g.attributes.position;
      for(let v=0; v<pp.count; v++){
        const x=pp.getX(v)*sx, y=pp.getY(v)*sy, z=pp.getZ(v)*sz;
        const n = rockNoise((x+seed)*frq, (y+seed)*frq, (z+seed)*frq);
        pp.setXYZ(v, (x+n*amp)*r, (y+n*amp)*r, (z+n*amp)*r);
      }
      g.computeVertexNormals();
      const pb = new THREE.Mesh(g, pmat);
      const side = Math.random()<0.5 ? -1 : 1;
      pb.position.set(capsCtr.x + side*(shellW/2 + 0.5 + Math.random()*4.0),
                      r*0.42,                       // half-buried, not resting on top
                      zB - DEPTH*0.12 + Math.random()*DEPTH*1.24);
      pb.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
      pb.castShadow = pb.receiveShadow = true;
      caseGroup.add(pb);
    }
  }

  board.rotation.x = incline;
  board.position.y = cs.hBack - trayInset - 0.06;

  if(T.floor && SCENE.floor !== false){
    const F = T.floor;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshStandardMaterial({color:F.colour ?? 0xE8E6E2,
        roughness:F.rough ?? 0.22, metalness:F.metal ?? 0.10,
        envMapIntensity:F.env ?? 1.0}));
    floor.rotation.x = -Math.PI/2;
    floor.position.set(capsCtr.x, -0.02, zB + DEPTH/2);
    floor.receiveShadow = true;
    floor.userData.noFit = true;      // a 260-unit plane must never drive the camera fit
    root.add(floor);
  }

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(shellW*1.7, DEPTH*2.2),
    new THREE.MeshBasicMaterial({map:shadowMap, transparent:true, depthWrite:false}));
  shadowPlane.rotation.x = -Math.PI/2;
  shadowPlane.position.set(capsCtr.x, -0.03, zB + DEPTH/2);

  if(T.fx === 'rgb'){
    const ug = new THREE.Mesh(
      new THREE.PlaneGeometry(shellW*1.35, DEPTH*1.45),
      new THREE.MeshBasicMaterial({map:glowMap, color:0x2A1040, transparent:true,
        blending:THREE.AdditiveBlending, depthWrite:false}));
    ug.rotation.x = -Math.PI/2;
    ug.position.set(capsCtr.x, 0.06, zB + DEPTH/2);
    root.userData.underglow = ug;
    root.add(ug);
  }

  root.add(board, caseGroup, shadowPlane);

  // ---- lighting
  const E = T.env;
  RectAreaLightUniformsLib.init();
  const kl = new THREE.RectAreaLight(E.keyCol, E.keyInt, 46, 20);
  kl.position.set(capsCtr.x+14, 20, capsCtr.z+16); kl.lookAt(capsCtr.x,0,capsCtr.z);
  const fl = new THREE.RectAreaLight(E.fillCol, E.fillInt, 30, 16);
  fl.position.set(capsCtr.x-18, 9, capsCtr.z+12); fl.lookAt(capsCtr.x,0,capsCtr.z);
  const hemi = new THREE.HemisphereLight(E.hemiSky, E.hemiGround, E.hemiInt);
  const sun = new THREE.DirectionalLight(0xFFFFFF, 0.85);
  sun.position.set(capsCtr.x+12, 26, capsCtr.z+14);
  sunLight = sun; sunAim.set(capsCtr.x, 0, capsCtr.z);
  sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
  const S = Math.max(capsSize.x, capsSize.z)*0.75 + 3;
  Object.assign(sun.shadow.camera,{left:-S,right:S,top:S,bottom:-S,near:1,far:80});
  sun.shadow.bias=-0.0005; sun.shadow.normalBias=0.02;
  sun.target.position.set(capsCtr.x,0,capsCtr.z);
  // grazing light across the deck — this is what makes grain read as relief
  if(E.rakeInt){
    const rake = new THREE.DirectionalLight(E.rakeCol || 0xFFFFFF, E.rakeInt);
    const a = THREE.MathUtils.degToRad(E.rakeAz ?? -62);
    const el = THREE.MathUtils.degToRad(E.rakeEl ?? 11);
    rake.position.set(capsCtr.x + Math.sin(a)*40*Math.cos(el), Math.sin(el)*40,
                      capsCtr.z + Math.cos(a)*40*Math.cos(el));
    rake.target.position.set(capsCtr.x, 0, capsCtr.z);
    root.add(rake, rake.target);
  }

  const gl = new THREE.PointLight(E.glowCol, E.glowInt, 55);
  gl.position.set(capsCtr.x + capsSize.x*0.55, 6, capsCtr.z - capsSize.z*0.7);
  root.add(kl, fl, hemi, sun, sun.target, gl);

  placeBoard();
  placeCRT();
  fitCamera();
  rainOn(root); if(crt) rainOn(crt.model);
  setPack(T.audio, T.rate);
  markPicker(name);
}

// ══════════════════════════════════════════════════════════ RGB / Chroma
// A struck key spawns a wavefront that travels outward across the board, so
// neighbours light in sequence rather than the one key just flashing.
const RIPPLE = { speed: 26, width: 2.9, life: 1.25 };
let ripples = [];
function spawnRipple(rec){
  ripples.push({x:rec.px, z:rec.pz, born:performance.now()});
  if(ripples.length > 24) ripples.shift();
}

const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _white = new THREE.Color(1,1,1);
function stepFX(now){
  if(!activeTheme) return;
  const T = THEMES[activeTheme];
  if(T.fx !== 'rgb') return;
  const t = now*0.001;

  // retire spent wavefronts once per frame rather than per key
  if(ripples.length) ripples = ripples.filter(r => (now-r.born)/1000 < RIPPLE.life);

  for(const r of keys){
    if(!r.pad) continue;

    // base: spectrum cycling diagonally across the board
    const h = ((r.gx*0.040 + r.gz*0.070 - t*0.13) % 1 + 1) % 1;
    _c1.setHSL(h, 1.0, 0.52);
    let bright = 0.26;                       // idle glow, not a floodlight

    // travelling wavefronts
    let wave = 0;
    for(const rp of ripples){
      const age = (now - rp.born)/1000;
      const front = age * RIPPLE.speed;
      const d = Math.hypot(r.px - rp.x, r.pz - rp.z);
      const band = Math.exp(-((d - front)*(d - front))/(2*RIPPLE.width*RIPPLE.width));
      wave += band * (1 - age/RIPPLE.life);
    }
    wave = Math.min(1.25, wave);

    // reactive: the struck key itself flares hot and decays
    const age = (now - r.hit)/1000;
    const react = age < 0.5 ? Math.pow(1 - age/0.5, 1.7) : 0;
    r.energy += (0 - r.energy)*0.12;

    const hot = Math.min(1, wave*0.80 + react);
    // only the very core goes white — the wavefront must stay coloured
    _c1.lerp(_white, Math.pow(hot,2.2)*0.55);
    bright += wave*0.52 + react*0.85;

    _c2.copy(_c1).multiplyScalar(bright);
    r.pad.material.color.copy(_c2);
    if(r.mesh.material.emissiveMap){
      r.mesh.material.emissive.copy(_c1);
      r.mesh.material.emissiveIntensity = 2.10 + hot*3.4;
    }
  }
}

// ══════════════════════════════════════════════════════════ camera fit
const _v=new THREE.Vector3(), _r=new THREE.Vector3(), _u=new THREE.Vector3(),
      _dir=new THREE.Vector3(), _ctr=new THREE.Vector3(), _UP=new THREE.Vector3(0,1,0);
// Frame one object at a chosen size, dead-on, and let everything closer to the
// lens fall where it falls. This is a composed shot rather than a fit: the
// keyboard is *meant* to be cut off by the bottom edge.
function composeShot(){
  // A composed shot imposes no distance limits. The full-scene fit sets
  // min/maxDistance from what it measured, and that runs once on first load
  // before the props exist — leaving its clamps behind and pinning the zoom.
  controls.minDistance = 0;
  controls.maxDistance = Infinity;

  // An explicit pose is the whole answer: use it exactly as given. Poses are
  // per board, because a shot is composed against one board's size and the
  // boards differ enormously — the 60% Platinum is half the Mocha. A board with
  // no pose of its own falls through to the framing numbers, which fit it.
  const pose = (SHOT.poses && SHOT.poses[activeTheme]) || SHOT.pose;
  if(pose && pose.position && pose.target){
    // controls.update() re-derives the camera from its own spherical state and
    // applies the polar clamp, which silently pulled a locked 86 degree shot
    // back to the 78 degree limit. A pose is authoritative, so drop the limits.
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    camera.position.fromArray(pose.position);
    controls.target.fromArray(pose.target);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix(); controls.update();
    return true;
  }
  const obj = SHOT.focus && propObjects.get(SHOT.focus);
  if(!obj || !obj.group.visible) return false;
  props.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj.group);
  if(b.isEmpty()) return false;
  const size = b.getSize(new THREE.Vector3());
  const el = THREE.MathUtils.degToRad(SHOT.elevation);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);

  const target = new THREE.Vector3(
    (b.min.x + b.max.x)/2,
    b.min.y + size.y*(SHOT.aim ?? 0.5),
    (b.min.z + b.max.z)/2);
  const dist = (size.y / Math.max(0.05, SHOT.fill)) / (2*tanV);

  camera.position.set(
    target.x,
    target.y + Math.sin(el)*dist + dist*2*tanV*(SHOT.lift ?? 0),
    target.z + Math.cos(el)*dist);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  controls.target.copy(target); controls.update();
  return true;
}

function fitCamera(){
  if(!root) return;
  if(composeShot()) return;
  // Box3.expandByObject refreshes only the object's own world matrix, not its
  // ancestors'. A freshly-added glTF hierarchy has never been rendered, so its
  // parent matrices are still identity and every leaf lands in the wrong place.
  root.updateMatrixWorld(true);
  fitBox.makeEmpty();
  root.traverse(o=>{
    if(o.userData.noFit) return;
    if(o.isMesh && o.material && o.material.depthWrite) fitBox.expandByObject(o);
  });
  // A machine with a moving part must be framed for its whole range, not just
  // its rest pose — the typewriter carriage slides most of a platen-width left
  // and would otherwise walk straight out of shot mid-line.
  // Pad BOTH sides: widening only the side the carriage travels towards would
  // drag the orbit target off the machine's centre and throw the whole shot
  // oblique. Symmetric padding keeps the machine centred and simply pulls the
  // camera back far enough that the carriage never leaves frame.
  const pad = root.userData.fitPadX;
  if(pad){ fitBox.min.x -= pad; fitBox.max.x += pad; }
  props.updateMatrixWorld(true);
  props.traverse(o=>{
    if(!o.visible) return;                       // hidden props must not widen the shot
    if(o.isMesh && o.material && o.material.depthWrite) fitBox.expandByObject(o);
  });
  fitBox.getCenter(_ctr);
  const el = THREE.MathUtils.degToRad(CFG.cameraElevation);
  _dir.set(0, Math.sin(el), Math.cos(el)).normalize();
  _r.crossVectors(_dir,_UP).normalize(); _u.crossVectors(_r,_dir).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);
  let need = 0;
  for(const x of [fitBox.min.x,fitBox.max.x])
  for(const y of [fitBox.min.y,fitBox.max.y])
  for(const z of [fitBox.min.z,fitBox.max.z]){
    _v.set(x,y,z).sub(_ctr);
    const dz=_v.dot(_dir), dy=Math.abs(_v.dot(_u)), dx=Math.abs(_v.dot(_r));
    need = Math.max(need, dz + dy/tanV, dz + dx/(tanV*camera.aspect));
  }
  need *= 1.05;
  // limits first: update() clamps against them, so stale ones from a larger
  // previous fit would pin the camera too far out
  controls.minDistance = need*0.70; controls.maxDistance = need*1.40;
  camera.position.copy(_ctr).addScaledVector(_dir, need);
  camera.lookAt(_ctr);
  camera.updateProjectionMatrix();
  controls.target.copy(_ctr); controls.update();
}
addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight;
  renderer.setSize(innerWidth, innerHeight);
  if(composer) composer.setSize(innerWidth, innerHeight);
  if(aoComposer) aoComposer.setSize(innerWidth, innerHeight);
  sizeBackgroundQuad();
  fitCamera();
});

// ══════════════════════════════════════════════════════════ audio
let AC=null, master=null, BUF={}, ready=false, packName=null, packRate=1;
const b64 = s => { const b=atob(s), n=b.length, a=new Uint8Array(n);
  for(let i=0;i<n;i++) a[i]=b.charCodeAt(i); return a.buffer; };

async function initAudio(){
  if(!AC){
    AC = new (window.AudioContext||window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = CFG.master; master.connect(AC.destination);
  }
  if(AC.state === 'suspended') await AC.resume();
  if(typewriter) typewriter.setVoice(makeVoice(AC, master));
  await loadPack();
}
async function loadPack(){
  if(!AC || !packName || BUF.__name === packName) return;
  const P = PACKS[packName]; if(!P) return;
  const next = {__name: packName};
  await Promise.all(Object.entries(P).map(async ([k,v]) => { next[k] = await AC.decodeAudioData(b64(v)); }));
  BUF = next; ready = true;
}
function setPack(name, rate){ packName = name; packRate = rate||1; ready=false; loadPack(); }

function play(key, gain=1){
  if(!ready || !BUF[key]) return;
  const src = AC.createBufferSource(); src.buffer = BUF[key];
  src.playbackRate.value = packRate * (1 + (Math.random()*2-1)*0.06);
  const g = AC.createGain(); g.gain.value = gain*(0.88+Math.random()*0.24);
  src.connect(g); g.connect(master); src.start();
}
const RND = ['p0','p1','p2','p3','p4'];
const voice = {
  down:  ()=>play(RND[(Math.random()*RND.length)|0]),
  up:    ()=>play('r0',0.75),
  space: ()=>play('pSpace'),  spaceUp:()=>play('rSpace',0.75),
  enter: ()=>play('pEnter'),  enterUp:()=>play('rEnter',0.75),
  back:  ()=>play('pBack'),   backUp: ()=>play('rBack',0.75),
};

// ══════════════════════════════════════════════════════════ key press
function press(code){
  if(typewriter){
    initAudio();
    typewriter.press(code);
    const rec = byCode.get(code);
    if(rec && rec.dir!==1){ rec.dir=1; rec.t=0; rec.hit=performance.now(); }
    return;
  }
  const rec = byCode.get(code); if(!rec || rec.dir===1) return;
  rec.dir=1; rec.t=0; rec.hit=performance.now(); spawnRipple(rec); initAudio();
  if(code==='Space') voice.space(); else if(code==='Enter') voice.enter();
  else if(code==='Backspace') voice.back(); else voice.down();
}
function release(code){
  const rec = byCode.get(code); if(!rec) return;
  rec.dir=-1; rec.t=0;
  if(typewriter) return;                       // its own voice handles release
  if(code==='Space') voice.spaceUp(); else if(code==='Enter') voice.enterUp();
  else if(code==='Backspace') voice.backUp(); else voice.up();
}
// One keydown drives both the 3D keycaps and whatever is running on the CRT,
// so a game on the tube can never drift out of step with the board.
addEventListener('keydown', e=>{
  press(e.code);
  INPUT.down.add(e.code);
  if(e.code === 'Backspace') INPUT.backspace();
  else if(e.code === 'Enter') INPUT.enter();
  else if(e.key && e.key.length === 1) INPUT.push(e.key);
  INPUT.key(e.code);
  if(e.code==='Space'||e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => INPUT.down.delete(e.code));
addEventListener('keyup',   e=>{ release(e.code); });
addEventListener('pointerdown', ()=>initAudio());

const easeOut = t => 1-Math.pow(1-t,3);
function stepKeys(dt){
  for(const r of keys){
    if(r.t<0) continue;
    r.t += dt*1000;
    let depth;
    if(r.dir===1){
      const p=Math.min(1,r.t/CFG.press.downMs);
      depth = easeOut(p);
      if(p>=1) r.t=-1;
    } else {
      const p=Math.min(1,r.t/CFG.press.upMs), e=easeOut(p);
      depth = (1-e) - Math.sin(p*Math.PI)*(CFG.press.overshoot/CFG.press.travel);
      if(p>=1){ depth=0; r.t=-1; }
    }
    if(r.apply) r.apply(depth);
    else r.holder.position.y = r.rest - CFG.press.travel*depth;
  }
}

// ── shot tuning ──────────────────────────────────────────────────────────────
// With SHOT.free the camera is draggable and the exact pose is printed live, so
// an angle found by hand can be pasted straight back into props.js. Click the
// readout to copy it.
const poseLine = () => {
  const r = v => Math.round(v*100)/100;
  const p = camera.position, t = controls.target;
  return `pose: { position:[${r(p.x)}, ${r(p.y)}, ${r(p.z)}], `
       + `target:[${r(t.x)}, ${r(t.y)}, ${r(t.z)}] },`;
};
if(SHOT.free){
  controls.enabled = true;
  controls.enableZoom = true;
  controls.enablePan = true;           // needed to compose, not just orbit
  controls.minDistance = 0;
  controls.maxDistance = Infinity;
  // The 14-78 degree polar clamp keeps the boards from being viewed from silly
  // angles in normal use, but 90 degrees is level with the tube — so the cap sat
  // 12 degrees short of the dead-on shot. Open it right up while composing.
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  const hudEl = document.getElementById('hud');
  hudEl.style.pointerEvents = 'auto';
  hudEl.style.cursor = 'pointer';
  hudEl.title = 'click to copy this pose';
  hudEl.addEventListener('click', () => {
    const line = poseLine();
    navigator.clipboard?.writeText(line);
    hudEl.dataset.copied = '1';
    setTimeout(()=>{ delete hudEl.dataset.copied; }, 1200);
  });
}

// ══════════════════════════════════════════════════════════ theme picker
const picker = document.getElementById('picker');
// with a single board there is nothing to pick between
// The picker is a development affordance. A screen drives the board now, so
// it stays hidden unless a page explicitly asks for it.
if(SCENE.picker !== true || Object.keys(THEMES).length < 2) picker.style.display = 'none';
// The stats readout is a development aid, not part of the piece. It only
// appears while the shot is being composed, where it prints the live pose.
document.getElementById('hud').style.display = SHOT.free ? 'block' : 'none';
for(const [k,T] of Object.entries(THEMES)){
  const b = document.createElement('button');
  b.textContent = T.label; b.dataset.k = k;
  b.onclick = () => buildTheme(k);
  picker.appendChild(b);
}
buildTheme(Object.keys(THEMES)[0]);

// Build everything the PROPS table lists. An entry with a `screen` is a CRT
// (it has a live tube); anything else is a plain model.
(async () => {
  for(const [id, spec] of Object.entries(PROPS)){
    const built = spec.screen !== undefined
      ? await buildCRT({ url: spec.model, parent: props })
      : await buildPlainProp({ url: spec.model, parent: props, spec });
    propObjects.set(id, built);
    if(spec.screen !== undefined) crt = built;   // the one with a step()
  }
  placeBoard(); placeCRT(); fitCamera();
  rainOn(root); if(crt) rainOn(crt.model);
})().catch(e => showErr('props: ' + (e.stack || e.message)));

// ══════════════════════════════════════════════════════════ loop
window.__TW = TW;
window.__DBG = {scene, camera, renderer, controls, THREE, buildTheme, press, release, stepFX,
  get crt(){return crt}, props, placeCRT,
  get typewriter(){return typewriter},
  get ripples(){return ripples},
  get keys(){return keys}, get byCode(){return byCode}, get theme(){return activeTheme},
  audio:()=>({state:AC&&AC.state, ready, pack:BUF.__name, decoded:Object.keys(BUF).length-1})};
let last=performance.now(), frames=0, t0=performance.now();

// Frame cap. The scene is a static machine with a shader on it, but every drawn
// frame costs a full 3D pass AND a canvas-to-GPU upload of the phosphor texture.
// On a 144Hz display that is roughly five times the work for no visible gain, and
// it is what spins the fans. 30 is plenty for this; the page can override with
// window.TYPEMAXX.fps, and 0 means uncapped.
let lastDraw = 0;
function frameBudget(){
  const f = SCENE.fps;
  if(f === 0) return 0;                    // explicit opt-out
  return 1000 / (typeof f === 'number' && f > 0 ? f : 30);
}
// three.js re-requests the frame AFTER the callback, so an uncaught throw here
// silently kills the loop forever. Never let that happen quietly again.
let loopDead = false;
// ── live backgrounds, swappable ─────────────────────────────────────────────
// A background is any factory taking a canvas and returning
// { render, resize, dispose } — the shape ThreeUI's renderers already have.
// It draws into its own hidden canvas; we copy that into a compositor and use
// the compositor as the scene's backdrop. See the note on SCENE.background in
// props.js for why this is a background and not a second canvas underneath.
//
// Two can be alive at once, and only ever during a crossfade: the outgoing one
// is disposed the moment the fade completes, so nothing is left running behind
// a background you can no longer see.
let bgLayers = [];                       // [current] or [outgoing, incoming]
let bgTexture = null, bgComposite = null, bgCtx = null, bgQuad = null;
let bgFadeT = 0, bgFadeDur = 0.8;

function bgMakeCanvas(){
  const c = document.createElement('canvas');
  // It has to be IN the document: these renderers size themselves from
  // canvas.clientWidth, and a detached canvas measures 0 and clamps to 1x1 —
  // rendering a whole scene into a single pixel, silently and for free.
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;'
                  + 'visibility:hidden;pointer-events:none';
  document.body.appendChild(c);
  return c;
}

async function bgCreate(spec){
  const canvas = bgMakeCanvas();
  let make = spec.factory;
  if(typeof make !== 'function'){
    // Resolve against the PAGE, not this file: app.js is served from a CDN, so
    // '/x.js' would otherwise resolve against the CDN origin and 404.
    const url = new URL(spec.module, document.baseURI).href;
    const mod = await import(/* @vite-ignore */ url);
    make = mod[spec.export] || mod.default;
  }
  if(typeof make !== 'function')
    throw new Error('background: no factory (need `factory`, or `module` + `export`)');
  // Awaited, so a factory may be async — which is how a background written in
  // the page reaches the addons: `await import('three/addons/...')` resolves
  // through the page's import map even from a classic <script>.
  const inst = await make(canvas, THREE);
  if(inst && inst.resize) inst.resize();
  return { inst, canvas, spec };
}

function bgDestroy(layer){
  if(!layer) return;
  try { if(layer.inst && layer.inst.dispose) layer.inst.dispose(); } catch(e){}
  if(layer.canvas.parentNode) layer.canvas.parentNode.removeChild(layer.canvas);
}

// Fill the frustum at a fixed distance, so the quad reads as an infinite
// backdrop however the window is shaped.
function sizeBackgroundQuad(){
  if(!bgQuad) return;
  const d = Math.min(400, camera.far * 0.5);
  const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d;
  bgQuad.scale.set(h * camera.aspect, h, 1);
  bgQuad.position.set(0, 0, -d);
}

function stepBackground(now, dt){
  if(!bgLayers.length) return;
  for(const L of bgLayers) L.inst.render(now);

  const src = bgLayers[0].canvas;
  const w = src.width, h = src.height;
  if(!(w > 1 && h > 1)) return;

  if(!bgComposite){ bgComposite = document.createElement('canvas');
                    bgCtx = bgComposite.getContext('2d'); }
  if(bgComposite.width !== w || bgComposite.height !== h){
    // A renderer that resizes itself — these carry an adaptive quality scaler,
    // and a tab returning from the background trips it — leaves its bloom
    // pyramid holding pre-resize frames. Rebuilding the texture at the new size
    // clears the stale composite that otherwise shows as a doubled image.
    bgComposite.width = w; bgComposite.height = h;
    if(bgTexture){ bgTexture.dispose(); bgTexture = null; }
  }
  if(!bgTexture){
    bgTexture = new THREE.CanvasTexture(bgComposite);
    bgTexture.colorSpace = THREE.SRGBColorSpace;
    // NOT scene.background. Three tone-maps the background along with
    // everything else, and these canvases arrive already tone-mapped and
    // sRGB-encoded by their own renderer — running ACES over them a second time
    // crushes the mid-tones, which is where a night scene keeps its lit grass
    // and foliage. A quad with toneMapped:false hands the picture through
    // untouched.
    if(!bgQuad){
      bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ toneMapped: false, depthTest: false,
                                      depthWrite: false, fog: false }));
      bgQuad.frustumCulled = false;
      bgQuad.renderOrder = -1000;      // before anything else, and it writes no depth
      camera.add(bgQuad);
      scene.add(camera);               // camera children only render once it is in the graph
    }
    bgQuad.material.map = bgTexture;
    bgQuad.material.needsUpdate = true;
    sizeBackgroundQuad();
  }

  bgCtx.globalAlpha = 1;
  bgCtx.drawImage(src, 0, 0, w, h);

  if(bgLayers[1]){
    bgFadeT = Math.min(1, bgFadeT + dt / Math.max(0.01, bgFadeDur));
    bgCtx.globalAlpha = bgFadeT;
    bgCtx.drawImage(bgLayers[1].canvas, 0, 0, w, h);
    bgCtx.globalAlpha = 1;
    if(bgFadeT >= 1){
      bgDestroy(bgLayers[0]);            // the old one stops running here
      bgLayers = [bgLayers[1]];
      bgFadeT = 0;
    }
  }
  if(bgQuad){
    sizeBackgroundQuad();
    // A backdrop arrives already graded by its own renderer, and how bright that
    // reads against the lit scene in front of it is a judgement call, not a
    // calculation. `brightness` on the spec multiplies it: 1 is untouched.
    const front = bgLayers[bgLayers.length - 1];
    const b = (front && front.spec && front.spec.brightness) || 1;
    if(bgQuad.material.color.r !== b) bgQuad.material.color.setScalar(b);
  }
  bgTexture.needsUpdate = true;
}

function bgPointer(x, y, inside){
  for(const L of bgLayers)
    if(L.inst && typeof L.inst.setPointer === 'function') L.inst.setPointer(x, y, inside);
}

if(typeof window !== 'undefined'){
  // Swap the backdrop at runtime. Pass null to clear it. The outgoing scene is
  // disposed as soon as the fade ends, never left running out of sight.
  // Wrapped so a failure is visible. A page calls this and usually does not
  // await it, so a rejection went nowhere — a background that failed to build
  // just silently left the previous one showing, which is indistinguishable
  // from never having asked for it.
  window.TYPEMAXX_SET_BACKGROUND = (spec, fadeSeconds) =>
    setBackground(spec, fadeSeconds).catch(e => {
      showErr('background: ' + (e && (e.stack || e.message) || e));
      return false;
    });
  const setBackground = async (spec, fadeSeconds) => {
    bgFadeDur = (fadeSeconds == null) ? 0.8 : Math.max(0, fadeSeconds);
    if(bgLayers[1]){ bgDestroy(bgLayers[1]); bgLayers.length = 1; bgFadeT = 0; }
    if(!spec){
      bgLayers.forEach(bgDestroy); bgLayers = [];
      if(bgQuad) bgQuad.visible = false;
      if(bgTexture){ bgTexture.dispose(); bgTexture = null; }
      return true;
    }
    if(bgQuad) bgQuad.visible = true;
    const layer = await bgCreate(spec);
    if(!bgLayers.length || bgFadeDur === 0){
      bgLayers.forEach(bgDestroy);
      bgLayers = [layer];
    } else {
      bgLayers[1] = layer; bgFadeT = 0;
    }
    return true;
  };
}

addEventListener('resize', () => {
  for(const L of bgLayers) if(L.inst && L.inst.resize) L.inst.resize();
});
document.addEventListener('visibilitychange', () => {
  if(document.hidden) return;
  for(const L of bgLayers){
    if(L.inst && L.inst.resize) L.inst.resize();
    for(let i = 0; i < 3; i++) L.inst.render(performance.now());
  }
  if(bgTexture) bgTexture.needsUpdate = true;
});
// The backdrop is drawn into a hidden canvas and shown as the scene's
// background, so it never receives pointer events of its own. Forward them in
// normalised device coordinates (-1..1, y up), which map straight to the
// backdrop's camera because that canvas is full-bleed like the viewport. A
// background can then raycast and be genuinely interactive.
const bgNdc = e => [(e.clientX/innerWidth)*2 - 1, -((e.clientY/innerHeight)*2 - 1)];

addEventListener('pointermove', e => {
  const [x, y] = bgNdc(e);
  if(SCENE.background && SCENE.background.pointer === true) bgPointer(x, y, true);
  for(const L of bgLayers) if(L.inst && L.inst.onPointerMove) L.inst.onPointerMove(x, y);
});

addEventListener('click', e => {
  // Only the newest layer answers. Mid-crossfade that is the one arriving, and
  // clicking what is fading out would act on something the eye has left behind.
  const L = bgLayers[bgLayers.length - 1];
  if(!L || !L.inst || !L.inst.onPointerDown) return;
  const [x, y] = bgNdc(e);
  L.inst.onPointerDown(x, y);
});

if(SCENE.background)
  window.TYPEMAXX_SET_BACKGROUND(SCENE.background, 0)
    .catch(e => showErr('background: ' + (e.stack || e.message)));

renderer.setAnimationLoop(now=>{
 try {
  // Skip whole frames rather than doing less work in each one. Everything below
  // — input rotation included — must stay on the drawn side of this gate:
  // rotating the input buffer on a skipped frame would discard keystrokes that
  // nothing had a chance to read.
  const budget = frameBudget();
  if(budget && now - lastDraw < budget - 0.5) return;
  lastDraw = now;

  renderer.info.reset();
  INPUT._rotate();          // one rotation per frame, before anything reads
  const dt = Math.min(0.05,(now-last)/1000); last=now;
  stepKeys(dt); stepFX(now); stepSwap(dt); ensureShadowFloor(); applySunOverride();
  stepRainAmount(now, dt);
  stepBackground(now, dt);
  // (the volume knob used to idle-spin here; the scene is static now)
  if(root && root.userData.step) root.userData.step(dt);
  for(const p of propObjects.values()) if(p.step) p.step(now);
  controls.update();
  const T = THEMES[activeTheme];
  if(T && T.bloom){
    const c = ensureComposer();
    bloomPass.strength = T.bloom.strength; bloomPass.radius = T.bloom.radius;
    bloomPass.threshold = T.bloom.threshold;
    c.render();
  } else if(T && T.ao && ensureAO()){
    aoComposer.render();
  } else renderer.render(scene,camera);
  if(++frames===60){
    const hudEl = document.getElementById('hud');
    hudEl.textContent = SHOT.free
      ? `DRAG TO SET THE ANGLE — click here to copy\n${poseLine()}` +
        (hudEl.dataset.copied ? '\ncopied' : '')
      : `TYPEMAXX · ${THEMES[activeTheme].label} · type on your real keyboard\n`+
        `${Math.round(60000/(performance.now()-t0))} fps · ${renderer.info.render.calls} calls · `+
        `${renderer.info.render.triangles} tris · ${keys.length} keys`;
    frames=0; t0=performance.now();
  }
 } catch(e){
   if(!loopDead){ loopDead = true; showErr('render loop: ' + (e.stack||e.message)); }
 }
});
