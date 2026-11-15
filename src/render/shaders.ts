const V = '#version 300 es\n';
const P = 'precision highp float;\n';

/** Instanced, flat shaded scene geometry. Writes colour and a separate glow target (MRT). */
export const SCENE_VS = V + P + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aA;  // xyz position, yaw
layout(location=2) in vec4 aB;  // xyz scale, roll
layout(location=3) in vec4 aC;  // rgb, emissive
layout(location=4) in vec4 aD;  // flash, pitch, -, -
uniform mat4 uVP;
out vec3 vW;
out vec4 vC;
out float vF;
vec3 rot(vec3 p, float yaw, float roll, float pitch){
  float cr = cos(roll), sr = sin(roll);
  p = vec3(cr*p.x - sr*p.y, sr*p.x + cr*p.y, p.z);
  float cp = cos(pitch), sp = sin(pitch);
  p = vec3(p.x, cp*p.y - sp*p.z, sp*p.y + cp*p.z);
  float cy = cos(yaw), sy = sin(yaw);
  return vec3(cy*p.x + sy*p.z, p.y, -sy*p.x + cy*p.z);
}
void main(){
  vec3 w = rot(aPos * aB.xyz, aA.w, aB.w, aD.y) + aA.xyz;
  vW = w; vC = aC; vF = aD.x;
  gl_Position = uVP * vec4(w, 1.0);
}`;

export const SCENE_FS = V + P + `
in vec3 vW;
in vec4 vC;
in float vF;
uniform vec3 uCam, uLightDir, uLight, uFog, uAmb;
uniform float uFogD;
layout(location=0) out vec4 oC;
layout(location=1) out vec4 oG;
void main(){
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 V = normalize(uCam - vW);
  if (dot(n, V) < 0.0) n = -n;
  float ndl = max(dot(n, uLightDir), 0.0);
  float fill = max(dot(n, V), 0.0);
  float fres = pow(1.0 - fill, 3.0);
  vec3 alb = vC.rgb;
  float emis = vC.a;
  vec3 col = alb * (uAmb + uLight * (ndl * 0.8 + fill * 0.3));
  col += uLight * fres * (0.2 + 0.7 * ndl) * 0.55;
  col += alb * emis;
  col = mix(col, vec3(1.0, 0.97, 0.92), vF);
  float dist = length(uCam - vW);
  float f = 1.0 - exp(-dist * dist * uFogD * uFogD);
  f = clamp(f + smoothstep(0.0, -16.0, vW.y) * 0.5, 0.0, 1.0);
  float keep = 1.0 - clamp(emis * 0.6, 0.0, 0.8);
  col = mix(col, uFog, f * keep);
  oC = vec4(col, 1.0);
  oG = vec4((alb * emis + uLight * fres * ndl * 0.12) * (1.0 - f), 1.0);
}`;

export const FULL_VS = V + `
out vec2 vUV;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Sky and abyss: gradient, drifting mist, and the Tidal Halo (a ring with an eclipse). */
export const SKY_FS = V + P + `
in vec2 vUV;
uniform vec2 uRes, uHalo;
uniform float uTime, uHaloI, uHorizon, uScroll, uStress, uHaloR;
uniform vec3 uTop, uMid, uHor, uAbyss, uLight;
layout(location=0) out vec4 oC;
layout(location=1) out vec4 oG;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec2 uv = vUV;
  float asp = uRes.x / uRes.y;
  float hy = uHorizon;
  float up = clamp((uv.y - hy) / max(0.001, 1.0 - hy), 0.0, 1.0);
  float dn = clamp((hy - uv.y) / max(0.001, hy), 0.0, 1.0);
  vec3 sky = mix(uHor, uMid, smoothstep(0.0, 0.4, up));
  sky = mix(sky, uTop, smoothstep(0.3, 1.0, up));
  vec3 abyss = mix(uHor * 0.85, uAbyss, smoothstep(0.0, 0.7, dn));
  vec3 col = mix(abyss, sky, smoothstep(hy - 0.01, hy + 0.01, uv.y));

  vec2 p = uv - uHalo; p.x *= asp;
  float r = length(p);
  float R = uHaloR;
  float ring = exp(-pow((r - R) / 0.0055, 2.0)) * 0.95 + exp(-pow((r - R * 1.3) / 0.0022, 2.0)) * 0.35 + exp(-pow((r - R * 0.64) / 0.0018, 2.0)) * 0.3;
  vec2 q = p - vec2(0.02, -0.012);
  float disk = smoothstep(R * 0.99, R * 0.93, length(q));
  float ang = atan(p.y, p.x);
  float ticks = step(0.9, fract(ang * 36.0 / 6.2832 + uTime * 0.004)) * exp(-pow((r - R * 1.62) / 0.006, 2.0)) * 0.5;
  float glow = exp(-r * 3.0) * 0.5 + exp(-r * 9.0) * 0.55;
  float L = uHaloI * (1.0 + uStress * 0.35);
  col += uLight * (glow * (1.0 - disk * 0.85) + (ring + ticks) * (1.0 - disk * 0.3)) * L * 0.8;
  col = mix(col, uAbyss, disk * 0.8);

  float band = exp(-pow((uv.y - hy) * 5.0, 2.0));
  float m = fbm(vec2(uv.x * asp * 2.4 + uTime * 0.012, uv.y * 7.0 - uScroll * 0.00045));
  col = mix(col, uHor * 1.5 + uLight * 0.05, clamp(m * band * 0.7, 0.0, 0.6));
  float m2 = fbm(vec2(uv.x * asp * 1.2 - uTime * 0.006, uv.y * 3.0 + 7.0));
  col += uLight * 0.02 * m2 * dn;

  vec2 sg = floor(uv * vec2(asp, 1.0) * 220.0);
  float st = step(0.9985, hash(sg)) * smoothstep(hy, hy + 0.25, uv.y);
  col += uLight * st * (0.35 + 0.35 * sin(uTime * 1.5 + hash(sg + 3.0) * 30.0));

  oC = vec4(col, 1.0);
  oG = vec4(uLight * ((glow * 0.25 + ring * 0.9) * (1.0 - disk)) * L * 0.5, 1.0);
}`;

export const PARTICLE_VS = V + P + `
layout(location=0) in vec4 aP;  // xyz, size
layout(location=1) in vec4 aC;  // rgb, alpha
uniform mat4 uV, uProj;
out vec2 vQ;
out vec4 vCol;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vQ = c; vCol = aC;
  vec4 vp = uV * vec4(aP.xyz, 1.0);
  vp.xy += c * aP.w;
  gl_Position = uProj * vp;
}`;

export const PARTICLE_FS = V + P + `
in vec2 vQ;
in vec4 vCol;
layout(location=0) out vec4 oC;
layout(location=1) out vec4 oG;
void main(){
  float d = dot(vQ, vQ);
  if (d > 1.0) discard;
  float a = pow(1.0 - d, 2.0) * vCol.a;
  vec3 c = vCol.rgb * a;
  oC = vec4(c * 0.8, 1.0);
  oG = vec4(c, 1.0);
}`;

export const DOWN_FS = V + P + `
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
layout(location=0) out vec4 oC;
void main(){
  vec3 s = texture(uTex, vUV + uTexel * vec2(-1.0, -1.0)).rgb + texture(uTex, vUV + uTexel * vec2(1.0, -1.0)).rgb
         + texture(uTex, vUV + uTexel * vec2(-1.0, 1.0)).rgb + texture(uTex, vUV + uTexel * vec2(1.0, 1.0)).rgb;
  oC = vec4(s * 0.25, 1.0);
}`;

export const BLUR_FS = V + P + `
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
layout(location=0) out vec4 oC;
void main(){
  vec3 s = texture(uTex, vUV).rgb * 0.2270;
  s += (texture(uTex, vUV + uDir * 1.3846).rgb + texture(uTex, vUV - uDir * 1.3846).rgb) * 0.3162;
  s += (texture(uTex, vUV + uDir * 3.2308).rgb + texture(uTex, vUV - uDir * 3.2308).rgb) * 0.0703;
  oC = vec4(s, 1.0);
}`;

export const COMPOSITE_FS = V + P + `
in vec2 vUV;
uniform sampler2D uScene, uBloom;
uniform vec2 uRes;
uniform float uTime, uGrain, uVig, uFlash, uBloomI, uFade;
layout(location=0) out vec4 oC;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  vec2 px = 1.0 / uRes;
  vec3 c = texture(uScene, vUV).rgb;
  // edge aware smoothing, a light FXAA
  float lc = luma(c);
  float ln = luma(texture(uScene, vUV + vec2(0.0, px.y)).rgb);
  float ls = luma(texture(uScene, vUV - vec2(0.0, px.y)).rgb);
  float le = luma(texture(uScene, vUV + vec2(px.x, 0.0)).rgb);
  float lw = luma(texture(uScene, vUV - vec2(px.x, 0.0)).rgb);
  float contrast = max(max(ln, ls), max(le, lw)) - min(min(ln, ls), min(le, lw));
  if (contrast > 0.08) {
    vec3 avg = (texture(uScene, vUV + vec2(px.x, 0.0)).rgb + texture(uScene, vUV - vec2(px.x, 0.0)).rgb
              + texture(uScene, vUV + vec2(0.0, px.y)).rgb + texture(uScene, vUV - vec2(0.0, px.y)).rgb) * 0.25;
    c = mix(c, avg, 0.4);
  }
  c += texture(uBloom, vUV).rgb * uBloomI;
  c = c / (1.0 + c * 0.12) * 1.1;
  vec2 d = vUV - 0.5;
  float v = smoothstep(0.95, 0.25, length(d * vec2(0.9, 1.1)));
  c *= mix(1.0, v, uVig);
  c = mix(c, vec3(0.9, 0.9, 0.86), uFlash * 0.4);
  float g = ign(gl_FragCoord.xy + floor(uTime * 10.0) * 37.0) - 0.5;
  c += g * uGrain * (0.5 + 0.8 * (1.0 - clamp(lc * 2.0, 0.0, 1.0)));
  c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  oC = vec4(c * uFade, 1.0);
}`;
