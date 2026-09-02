// ═══════════════════════════════════════════════════════════ rain on the set
// Water running down the machine, patched into the materials it already has
// rather than laid over them as geometry. The field follows Steinrucken's
// "Heartfelt" (shadertoy ltffzl), which is the reference every other version
// descends from: tall non-square cells, a per-column vertical shift, a wiggle
// that tapers to nothing at the cell edge, and a trail that narrows AND dims
// behind the bead rather than running at constant width.
//
// Three things differ from that shader, because it is a full-screen effect and
// this is not:
//
//   The domain is a gravity frame, not screen UV. At each fragment gravity is
//   projected into the surface, giving a "downhill" axis and, for free, how
//   steep the surface is. Water then runs down whatever it is crossing — the
//   cabinet's face, the bezel, the side of a keycap — instead of running down
//   the screen. Mesh UVs are useless here: they are unwrapped for keycap
//   legends and cabinet grain, so the water would run sideways on half of them.
//
//   Surfaces are masked by facing. Undersides stay dry, and the flat deck gets
//   no streaks, since the steepness term falls to zero there. Without this the
//   field slides across horizontal surfaces as though gravity worked sideways.
//
//   The normal is perturbed through Mikkelsen's surface gradient and converted
//   to view space. three's `normal` at this point in the shader is VIEW space;
//   adding a world-space gradient to it happens to look right from one fixed
//   camera and lights the beads from the wrong side the moment it moves.

const CHUNK = /* glsl */`
float rnHash (float p){ return fract(sin(p * 78.233) * 43758.5453); }
vec3  rnHash3(float p){
  vec3 h = vec3(p, p + 41.3, p + 289.1);
  return fract(sin(h * vec3(78.233, 12.9898, 39.425)) * 43758.5453);
}
float rnSaw(float b, float t){
  return smoothstep(0.0, b, t) * smoothstep(1.0, b, t);
}

// Beads that sit still, appear and fade. Dense, small, isotropic. These are what
// a running drop appears to absorb once the sum is pushed past the threshold.
float rnStatic(vec2 uv, float t){
  uv *= 7.0;
  vec2 id = floor(uv);
  uv = fract(uv) - 0.5;
  vec3 n = rnHash3(id.x * 107.45 + id.y * 3543.654);
  vec2 p = (n.xy - 0.5) * 0.7;
  float d = length(uv - p);
  float fade = rnSaw(0.025, fract(t * 0.35 + n.z));
  return smoothstep(0.25, 0.0, d) * fract(n.z * 10.0) * fade;
}

// A drop arriving. Sparse cells, each firing on its own slow cycle so most of
// the surface is doing nothing at any moment: a bright core at the point of
// contact, then a ring that expands and fades over about a second. Without this
// the water only ever runs — it never lands, which is what makes a wet surface
// read as a still image with something sliding over it.
//
// Deliberately NOT scrolled with the falling field: an impact happens at a fixed
// spot on the object and stays there while it fades.
float rnImpact(vec2 uv, float t){
  uv *= 3.6;
  vec2 id = floor(uv);
  vec2 gv = fract(uv) - 0.5;
  vec3 n = rnHash3(id.x * 71.3 + id.y * 913.7);
  float fires = step(0.68, n.x);            // most cells never fire at all
  float k = fract(t * 0.20 + n.z);          // its own phase, so they scatter
  vec2  p = (n.xy - 0.5) * 0.66;
  float d = length(gv - p);
  float life = smoothstep(0.16, 0.0, k);    // the whole event is brief
  float ring = smoothstep(0.045, 0.0, abs(d - k * 1.5)) * life;
  float core = smoothstep(0.055, 0.0, d) * smoothstep(0.05, 0.0, k);
  return fires * max(ring * 0.65, core);
}

// One layer of falling beads with trails.
float rnLayer(vec2 uv, float t){
  vec2 a = vec2(5.0, 1.0);          // cell aspect: tall, so columns read as runs
  vec2 grid = a * 2.0;
  // The smooth part of the motion is HERE: the whole field slides, so a bead
  // keeps its place in its cell and travels continuously with it.
  uv.y += t * 0.52;
  vec2 id = floor(uv * grid);
  uv.y += rnHash(id.x * 31.7);      // shift each column, THEN re-floor, or the
  id = floor(uv * grid);            // seed and the cell space disagree
  vec3 n = rnHash3(id.x * 35.2 + id.y * 2376.1);
  vec2 st = fract(uv * grid) - vec2(0.5, 0.0);

  float x = n.x - 0.5;
  float wig = sin(st.y * 18.0 + sin(st.y * 9.0));
  x += wig * (0.5 - abs(x)) * (n.z - 0.5);   // wander, pinned at the cell edge
  x *= 0.7;

  // ...and this only VARIES that speed a little, per drop. At full amplitude it
  // walks the bead the whole height of its cell and snaps it back, which reads
  // as pause, inch, pause rather than as water running.
  float ti = fract(t * 0.30 + n.z);
  float y  = (rnSaw(0.85, ti) - 0.5) * 0.30 + 0.5;
  float d  = length((st - vec2(x, y)) * a.yx);
  float bead = smoothstep(0.4, 0.0, d) * step(0.86, n.y);   // most cells stay dry

  // trail: width and brightness both fall away with r, so it tapers to a point
  float r  = sqrt(smoothstep(1.0, y, st.y));
  float cd = abs(st.x - x);
  float trail = smoothstep(0.23 * r, 0.15 * r * r, cd);
  trail *= smoothstep(-0.02, 0.02, st.y - y) * r * r * 0.42;
  return max(bead, trail * step(0.86, n.y));
}

// height of the water film. Additive then thresholded, which is what makes a
// running bead look as though it swallows the still ones it passes over.
float rnField(vec2 uv, float t){
  float c = rnStatic(uv, t) * 0.55
          + rnLayer(uv, t)
          + rnLayer(uv * 1.85 + 7.3, t * 1.24) * 0.75
          + rnImpact(uv, t) * 0.85;
  return smoothstep(0.30, 1.0, c);
}
`;

const patched = new Set();

// The tube's face is never wet. It is the one surface here that is being READ,
// and beads sit at the same size as the text and fight it for the eye.
const DRY = new Set(['CRT_SCREEN']);

export function makeRainy(material){
  if(!material || !material.isMeshStandardMaterial || patched.has(material)) return;
  if(DRY.has(material.name)) return;
  patched.add(material);

  const uniforms = { uRainT: { value: 0 }, uRainA: { value: 0 }, uRainS: { value: 0.30 } };
  material.userData.rain = uniforms;

  material.onBeforeCompile = (shader) => {
    // assigned on EVERY compile: one material legitimately compiles more than
    // once, and a reference kept only from the first call goes stale
    shader.uniforms.uRainT = uniforms.uRainT;
    shader.uniforms.uRainA = uniforms.uRainA;
    shader.uniforms.uRainS = uniforms.uRainS;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vRainW;\nvarying vec3 vRainN;')
      // project_vertex always exists, and `transformed` is final by then.
      // worldpos_vertex is guarded on scene contents, so adding a shadow light
      // would silently change whether this compiles.
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 rainWP = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    rainWP = batchingMatrix * rainWP;
  #endif
  #ifdef USE_INSTANCING
    rainWP = instanceMatrix * rainWP;
  #endif
  vRainW = ( modelMatrix * rainWP ).xyz;
  vRainN = normalize( mat3( modelMatrix ) * objectNormal );`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vRainW;\nvarying vec3 vRainN;\n'
        + 'uniform float uRainT;\nuniform float uRainA;\nuniform float uRainS;\n' + CHUNK)
      // normal, roughnessFactor, metalnessFactor and diffuseColor all exist by
      // here, and nothing has consumed them yet
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if(uRainA > 0.001){
    vec3 N = normalize(vRainN);

    // gravity projected into the surface: a downhill axis, and how steep it is
    vec3  flow  = vec3(0.0, -1.0, 0.0) + N * N.y;
    float slope = length(flow);
    flow = slope > 1e-4 ? flow / slope : vec3(0.0, 0.0, 0.0);
    vec3  side  = slope > 1e-4 ? normalize(cross(N, flow)) : vec3(1.0, 0.0, 0.0);
    // The field is Heartfelt-derived and assumes v increases UPWARD, the way
    // screen UV does, while flow points downhill. Without this flip the beads
    // climb and their trails hang below them instead of behind them.
    vec3  climb = -flow;

    // a lip holds a little water just past vertical before it drips
    float dryUnder = smoothstep(-0.10, 0.05, N.y);
    float wet = uRainA * dryUnder * smoothstep(0.06, 0.45, slope);

    if(wet > 0.002){
      vec2 uv = vec2(dot(vRainW, side), dot(vRainW, climb)) * uRainS;
      float e = 0.012;
      float h  = rnField(uv, uRainT);
      float hx = rnField(uv + vec2(e, 0.0), uRainT);
      float hy = rnField(uv + vec2(0.0, e), uRainT);
      vec2  g  = vec2(hx - h, hy - h) / e;

      // Mikkelsen: build the gradient in world space, strip its normal
      // component, and resolve — no tangent frame, correct on any orientation
      vec3 gradW    = side * g.x + climb * g.y;
      vec3 surfGrad = gradW - dot(gradW, N) * N;
      vec3 dN = mat3(viewMatrix) * (-surfGrad * 0.16);
      normal = normalize(normal + dN);

      float film = clamp(h * 1.6, 0.0, 1.0) * wet;

      // Lagarde: water darkens by letting light take a second pass through the
      // substrate, so it depends on how porous that substrate is. A matte
      // keycap drinks it; the cabinet's gloss barely changes. Flat darkening on
      // everything is what reads as someone lowering the exposure.
      float porosity = clamp((roughnessFactor - 0.45) / 0.45, 0.0, 1.0)
                     * (1.0 - metalnessFactor);
      float factor = mix(1.0, 0.35, porosity);
      diffuseColor.rgb *= mix(1.0, factor, film);

      // the substrate goes glossier by the same factor at half strength; the
      // bead itself is separate, and 0.07 because r160 floors roughness at .0525
      roughnessFactor *= mix(1.0, factor, 0.5 * film);
      roughnessFactor  = mix(roughnessFactor, 0.07, clamp(h * 2.2, 0.0, 1.0) * wet);
    }
  }`);
  };

  // MeshStandardMaterial always hashes as shaderID 'standard', so the patched
  // GLSL is never part of the program cache key — without this, a patched and an
  // unpatched material share whichever program compiled first, silently.
  material.customProgramCacheKey = () => 'typemaxx-rain-1';
  material.needsUpdate = true;
}

export function rainOn(root){
  if(!root) return;
  root.traverse(o => {
    if(!o.isMesh || !o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for(const m of list) makeRainy(m);
  });
}

export function stepRain(seconds, amount){
  for(const m of patched){
    const u = m.userData.rain;
    if(!u) continue;
    u.uRainT.value = seconds;
    u.uRainA.value = amount;
  }
}
