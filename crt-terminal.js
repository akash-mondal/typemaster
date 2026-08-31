// ══════════════════════════════════════════════════ CRT terminal screen effect
// ThreeUI `CrtBackground`, variant "terminal", ported from the registered source
// bundle at https://threeui.com/source-code/crt.json (revision 860a1eb1d4c9).
// Every SHA-256 in that manifest was verified before porting; the shaders, the
// 19-row Zion boot log, the colour table and the terminal style block below are
// verbatim from those files, and the renderer body follows the same code path.
//
// Two things differ from the authored component, both forced by the target:
//   * It is React and mounts a full-viewport <div>/<canvas>. Here the output has
//     to become a texture on a 3D screen, so the host is a plain object
//     supplying getBoundingClientRect() and the canvas is never in the DOM.
//   * The component's CSS filter (hue / saturation / brightness) and opacity
//     cannot apply to a texture, so they are not carried. speed, typeSpeed and
//     motion drive the renderer exactly as authored.
//
// This keeps its own WebGL context, as the original does. That is deliberate:
// running the pass through three's renderer into a WebGLRenderTarget instead
// reads back black, because the screen material samples that texture every
// frame while the pass writes into it.

const CRT_VERTEX_SHADER = "attribute vec2 aPos;\nvoid main(){ gl_Position = vec4(aPos,0.0,1.0); }";

const CRT_FRAGMENT_SHADER = `precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uMotion;
uniform vec2 uCurve;
uniform float uScan;
uniform float uScanDepth;
uniform float uTriad;
uniform float uGrille;
uniform float uChroma;
uniform float uBar;
uniform float uFlicker;
uniform float uGrain;
uniform float uNoise;
uniform float uVignette;
uniform float uMono;
uniform float uGain;
uniform float uHalo;
uniform vec3 uSheen;
uniform vec3 uRoom;

float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }

vec2 curve(vec2 uv){
  uv = uv*2.0-1.0;
  vec2 o = uv.yx*uv.yx;
  uv += uv * o * uCurve;
  uv = uv*0.5+0.5;
  return uv;
}

void main(){
  vec2 fuv = gl_FragCoord.xy / uRes;
  vec2 uv = curve(fuv);
  float t = uTime;

  /* analogue transport faults: per-row jitter, a rolling dropout band, and the
     head-switching scramble along the bottom edge of the raster */
  float band = 0.0;
  if (uNoise > 0.001){
    float row = floor(uv.y * 190.0);
    float gate = step(0.905, hash(vec2(row, floor(t*15.0))));
    uv.x += (hash(vec2(row*1.7, floor(t*15.0)+7.0)) - 0.5) * 0.052 * gate * uNoise;
    float pos = fract(uv.y * 0.8 - t * 0.17);
    band = smoothstep(0.075, 0.0, pos);
    uv.x += band * (hash(vec2(floor(uv.y*260.0), floor(t*26.0))) - 0.5) * 0.030 * uNoise;
    float head = smoothstep(0.030, 0.0, uv.y);
    uv.x += head * (hash(vec2(floor(uv.y*520.0), floor(t*22.0))) - 0.32) * 0.075 * uNoise;
    band = max(band, head);
  }

  vec2 inb = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  float inside = inb.x*inb.y;
  vec2 ed = min(uv, 1.0-uv);
  inside *= smoothstep(0.0,0.020, min(ed.x,ed.y));

  vec2 dir = uv-0.5;
  float d2 = dot(dir,dir);
  vec2 ao = dir * (0.0010 + 0.0075*d2) * uChroma;
  vec3 col;
  col.r = texture2D(uTex, uv + ao).r;
  col.g = texture2D(uTex, uv).g;
  col.b = texture2D(uTex, uv - ao).b;

  /* phosphor halation: a wide cheap tap ring so bright glyphs bloom into the
     glass instead of relying on the text canvas alone */
  if (uHalo > 0.001){
    float s = 0.0038;
    vec3 wide = texture2D(uTex, uv + vec2( s, 0.0)).rgb
              + texture2D(uTex, uv + vec2(-s, 0.0)).rgb
              + texture2D(uTex, uv + vec2(0.0,  s)).rgb
              + texture2D(uTex, uv + vec2(0.0, -s)).rgb
              + texture2D(uTex, uv + vec2( s,  s)*0.72).rgb
              + texture2D(uTex, uv + vec2(-s, -s)*0.72).rgb;
    col += wide * (uHalo / 6.0);
  }

  float sl = sin(uv.y*3.14159265*uScan + t*4.0*uMotion);
  col *= mix(1.0 - uScanDepth, 1.0, sl*sl);

  float gx = gl_FragCoord.x * (6.2831853/max(uTriad, 1.0));
  vec3 grille = (1.0-uGrille) + uGrille*cos(gx + vec3(0.0,2.094,4.188));
  col *= mix(vec3(1.0), grille, step(0.001, uGrille));
  col *= uGain;

  float bar = fract(uv.y*0.5 - t*0.07*uMotion);
  bar = smoothstep(0.0,0.05,bar)*smoothstep(0.18,0.05,bar);
  col += bar*uBar*uMotion;

  float sheen = smoothstep(0.55,0.0, distance(uv, vec2(0.50,0.15)));
  col += sheen*0.030*uSheen;

  float vig = smoothstep(0.98,0.30, length((uv-0.5)*vec2(1.05,1.0)));
  col *= mix(1.0-uVignette, 1.0, vig);
  col *= 1.0 - uFlicker*uMotion*sin(t*8.0);

  if (uNoise > 0.001){
    float st = hash(fuv*uRes*0.5 + vec2(floor(t*24.0), floor(t*24.0)*1.7));
    col += (st-0.5)*0.135*uNoise;
    col += band*0.085*uNoise;
  }
  col += (hash(fuv + fract(t*0.37)) - 0.5)*uGrain;

  float luma = dot(col, vec3(0.2126,0.7152,0.0722));
  col = mix(col, vec3(luma), uMono);

  float spill = smoothstep(0.85,0.18, length(fuv-0.5))*0.05;
  vec3 room = uRoom + uSheen*spill*0.42;
  col = mix(room, col, inside);
  col = max(col, uRoom*0.34);
  gl_FragColor = vec4(col,1.0);
}`;

const segment = (text, color = "p") => ({ t: text, c: color }); const dots = count => "·".repeat(count);
const LOG = [
  [segment("ZION MAINFRAME  v9.1.1"), segment("   (c) 2199 Nebuchadnezzar", "d")], [segment("CONSTRUCT Broadcast  Rev M  S/N NX-0101-0011", "d")], [],
  [segment("Hacking Matrix grid nodes "), segment(`${dots(14)} `, "d"), segment("OK", "a")], [segment("Neural Jack  0x000-0x0FF "), segment(`${dots(11)} `, "d"), segment("ONLINE "), segment("OK", "a")], [segment("Pinging agent signatures "), segment(`${dots(6)} `, "d"), segment("3 found")],
  [segment("nav0  OPERATOR UPLINK SECURE ", "d"), segment(`${dots(6)} `, "d"), segment("READY", "a")], [segment("vis0  CODE RAIN DECRYPT 256bit ", "d"), segment("READY", "a")], [segment("net0  HARDLINE CONNECTION MAX ", "d"), segment(`${dots(4)} `, "d"), segment("LINK", "a")], [segment("red0  RED PILL EXTRACTION ", "d"), segment(`${dots(4)} `, "d"), segment("READY", "a")],
  [segment("Mounting /dev/mind -> ROOT: "), segment(`${dots(6)} `, "d"), segment("OK", "a")], [segment("Loading weapon training program "), segment(`${dots(4)} `, "d"), segment("OK", "a")], [segment("Starting [ jmp spd str wpn ] "), segment(`${dots(4)} `, "d"), segment("OK", "a")], [segment("Locating the Oracle sector "), segment(`${dots(6)} `, "d"), segment("99.9%")], [],
  [segment("SYSTEM ANOMALY  "), segment("detected.", "h")], [segment("subject Thomas A. Anderson   status asleep ", "d"), segment("z", "d"), segment("Z", "d")], [], [segment("wake up: ")],
];
const COLORS = { p: { fill: "#8df0b4", glow: "rgba(28,236,132,0.95)" }, d: { fill: "#4f9a76", glow: "rgba(28,236,132,0.45)" }, a: { fill: "#ffba5e", glow: "rgba(255,150,52,0.95)" }, h: { fill: "#eafff3", glow: "rgba(120,255,190,0.95)" } };
const TERMINAL_STYLE = {
    curve: [0.115, 0.165], scanDensity: 0.44, scanDepth: 0.30, triadCss: 3.2, grille: 0.34, chroma: 1,
    bar: 0.045, flicker: 0.028, grain: 0.022, noise: 0, vignette: 0.58, mono: 0, gain: 1.34, halo: 0.10,
    sheen: [0.55, 1.0, 0.78], room: [0.012, 0.03, 0.022], background: "#03100a",
    filtering: "linear", surface: { mode: "buffer" }, redrawMs: 0,
};

const lineLength = (line) => line.reduce((total, item) => total + item.t.length, 0);
const TOTAL = LOG.reduce((total, line) => total + lineLength(line), 0);
const MAX_CHARS = Math.max(...LOG.map(lineLength));

/* backing-store ceiling: the composite is one triangle, so the cost that matters is
   the 2D screen redraw and its upload, not the fragment pass */
const MAX_BUFFER_WIDTH = 1920, MIN_BUFFER_WIDTH = 640, MAX_BUFFER_PIXELS = 2_400_000;

function compile(gl, type, source){
  const shader = gl.createShader(type);
  if(!shader) throw new Error("Unable to create CRT shader");
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader) ?? "CRT shader compilation failed");
  return shader;
}

export const CRT_DEFAULTS = { speed:1, typeSpeed:1, motion:1 };

// `width`/`height` are the offscreen backing store: give it the aspect of the
// screen mesh it will be mapped onto so nothing is stretched.
export function createCrtTerminal({ width = 1024, height = 768,
                                   getOptions = () => CRT_DEFAULTS } = {}){
  const canvas = document.createElement("canvas");
  const host = { getBoundingClientRect: () => ({ width, height }) };

  const gl = canvas.getContext("webgl", { antialias:false, alpha:false, depth:false, premultipliedAlpha:false });
  if(!gl) throw new Error("CRT requires WebGL");
  const textCanvas = document.createElement("canvas"), textContext = textCanvas.getContext("2d");
  if(!textContext) throw new Error("CRT text canvas unavailable");

  const vertex = compile(gl, gl.VERTEX_SHADER, CRT_VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, CRT_FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if(!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "CRT link failed");
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniform = n => gl.getUniformLocation(program, n);
  const uTexture=uniform("uTex"), uResolution=uniform("uRes"), uTime=uniform("uTime"),
        uMotion=uniform("uMotion"), uCurve=uniform("uCurve"), uScan=uniform("uScan"),
        uScanDepth=uniform("uScanDepth"), uTriad=uniform("uTriad"), uGrille=uniform("uGrille"),
        uChroma=uniform("uChroma"), uBar=uniform("uBar"), uFlicker=uniform("uFlicker"),
        uGrain=uniform("uGrain"), uNoise=uniform("uNoise"), uVignette=uniform("uVignette"),
        uMono=uniform("uMono"), uGain=uniform("uGain"), uHalo=uniform("uHalo"),
        uSheen=uniform("uSheen"), uRoom=uniform("uRoom");

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(uTexture, 0);

  let bw=1, bh=1, cssWidth=1, cssHeight=1, fontSize=14, lineHeight=20, startY=0,
      charWidth=8, caretX=0, caretY=0, typed=0, done=false, textDirty=true,
      lastTextAt=0, lastReveal=-1, lastBlink=-1;
  const style = TERMINAL_STYLE;
  const startedAt = performance.now();

  const applyStyle = () => {
    gl.useProgram(program);
    gl.uniform2f(uCurve, style.curve[0], style.curve[1]);
    gl.uniform1f(uScanDepth, style.scanDepth); gl.uniform1f(uGrille, style.grille);
    gl.uniform1f(uChroma, style.chroma); gl.uniform1f(uBar, style.bar);
    gl.uniform1f(uFlicker, style.flicker); gl.uniform1f(uGrain, style.grain);
    gl.uniform1f(uNoise, style.noise); gl.uniform1f(uVignette, style.vignette);
    gl.uniform1f(uMono, style.mono); gl.uniform1f(uGain, style.gain);
    gl.uniform1f(uHalo, style.halo);
    gl.uniform3f(uSheen, style.sheen[0], style.sheen[1], style.sheen[2]);
    gl.uniform3f(uRoom, style.room[0], style.room[1], style.room[2]);
    const filter = style.filtering === "nearest" ? gl.NEAREST : gl.LINEAR;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  };

  const layout = () => {
    startY = bh * 0.135;
    lineHeight = bh * 0.74 / LOG.length;
    fontSize = Math.max(5, Math.min(lineHeight * 0.8, bw * 0.88 / (Math.max(MAX_CHARS,1) * 0.62)));
    textContext.font = `600 ${fontSize.toFixed(2)}px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`;
    charWidth = textContext.measureText("M").width || fontSize * 0.6;
  };

  const setStyle = (key, glow) => {
    const color = COLORS[key];
    textContext.fillStyle = color.fill;
    textContext.shadowColor = glow ? color.glow : "transparent";
    textContext.shadowBlur = glow ? fontSize * 0.38 : 0;
  };

  /* two passes per glyph: a soft phosphor halo, then the same glyph re-filled with
     the shadow off so the stroke core stays crisp at any backing resolution */
  const drawScreen = (reveal) => {
    textContext.setTransform(1,0,0,1,0,0);
    textContext.fillStyle = "#03100a"; textContext.fillRect(0,0,bw,bh);
    textContext.textAlign = "left"; textContext.textBaseline = "top";
    textContext.font = `600 ${fontSize.toFixed(2)}px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`;
    let remaining = reveal, y = startY;
    caretX = Math.floor((bw - MAX_CHARS*charWidth)/2); caretY = startY;
    for(const line of LOG){
      const length = lineLength(line);
      const visible = reveal === Infinity ? Infinity : Math.min(remaining, length);
      let x = Math.floor((bw - MAX_CHARS*charWidth)/2), drawn = 0;
      for(const item of line){
        let text = item.t;
        if(visible !== Infinity){
          const left = visible - drawn;
          if(left <= 0) break;
          if(left < text.length) text = text.slice(0, left);
        }
        if(text.length){
          setStyle(item.c, true);  textContext.fillText(text, x, y);
          setStyle(item.c, false); textContext.fillText(text, x, y);
          x += charWidth * text.length;
        }
        drawn += item.t.length;
        if(visible !== Infinity && drawn >= visible) break;
      }
      caretX = x; caretY = y;
      if(visible !== Infinity) remaining -= visible;
      y += lineHeight;
      if(visible !== Infinity && remaining <= 0) break;
    }
  };

  const drawCursor = () => {
    textContext.shadowColor = COLORS.p.glow; textContext.shadowBlur = fontSize * 0.42;
    textContext.fillStyle = "#bdf8d2";
    textContext.fillRect(caretX, caretY + fontSize*0.06, Math.max(charWidth*0.92, 4), fontSize*0.96);
    textContext.shadowBlur = 0;
    textContext.fillRect(caretX, caretY + fontSize*0.06, Math.max(charWidth*0.92, 4), fontSize*0.96);
  };

  const uploadTexture = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    textDirty = false;
  };

  const resize = () => {
    const bounds = host.getBoundingClientRect();
    cssWidth = Math.max(1, bounds.width); cssHeight = Math.max(1, bounds.height);
    const density = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);
    let nextWidth = Math.max(MIN_BUFFER_WIDTH, Math.round(Math.min(cssWidth*density, MAX_BUFFER_WIDTH)));
    let nextHeight = Math.max(1, Math.round(nextWidth * cssHeight / cssWidth));
    if(nextWidth*nextHeight > MAX_BUFFER_PIXELS){
      const fit = Math.sqrt(MAX_BUFFER_PIXELS/(nextWidth*nextHeight));
      nextWidth = Math.round(nextWidth*fit); nextHeight = Math.round(nextHeight*fit);
    }
    const surface = style.surface;
    const screenWidth  = surface.mode === "fixed" ? surface.width
                       : surface.mode === "cap" ? Math.min(nextWidth, surface.width) : nextWidth;
    const screenHeight = surface.mode === "fixed" ? surface.height
                       : Math.max(1, Math.round(screenWidth * nextHeight / nextWidth));
    if(canvas.width !== nextWidth || canvas.height !== nextHeight){
      canvas.width = nextWidth; canvas.height = nextHeight;
    }
    if(textCanvas.width !== screenWidth || textCanvas.height !== screenHeight){
      textCanvas.width = screenWidth; textCanvas.height = screenHeight;
      bw = screenWidth; bh = screenHeight; layout();
      lastReveal = -1; lastBlink = -1; lastTextAt = 0; textDirty = true;
    }
    gl.useProgram(program);
    gl.viewport(0,0,nextWidth,nextHeight);
    gl.uniform2f(uResolution, nextWidth, nextHeight);
    gl.uniform1f(uScan, Math.max(120, Math.min(cssHeight*style.scanDensity, 900)));
    gl.uniform1f(uTriad, Math.max(2, style.triadCss * nextWidth / cssWidth));
  };

  const maybeRedrawText = (now) => {
    const reveal = done ? Infinity : Math.floor(typed);
    const blink = Math.floor((now - startedAt)/420) % 2 === 0 ? 1 : 0;
    const due = !done ? now - lastTextAt > 42 : blink !== lastBlink;
    if(reveal === lastReveal && blink === lastBlink && !due) return;
    if(!done && now - lastTextAt <= 42 && reveal === lastReveal && blink === lastBlink) return;
    drawScreen(reveal);
    if(blink) drawCursor();
    lastTextAt = now; lastReveal = reveal; lastBlink = blink; textDirty = true;
  };

  applyStyle(); resize();

  return {
    canvas,
    resize(w, h){ width = Math.max(1, w|0); height = Math.max(1, h|0); resize(); },
    render(now){
      const options = { ...CRT_DEFAULTS, ...getOptions() };
      const seconds = (now - startedAt) * 0.001 * options.speed;
      if(!done){
        typed += 4.4 * options.typeSpeed;
        if(typed >= TOTAL){ typed = TOTAL; done = true; }
      }
      maybeRedrawText(now);
      if(textDirty) uploadTexture();
      gl.useProgram(program);
      gl.uniform1f(uTime, seconds);
      gl.uniform1f(uMotion, options.motion);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose(){
      gl.deleteBuffer(buffer); gl.deleteTexture(texture);
      gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    },
  };
}
