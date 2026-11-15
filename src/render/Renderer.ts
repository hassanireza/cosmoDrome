import { mat4, multiply } from '../core/math.ts';
import type { Mat4 } from '../core/math.ts';
import { LIGHT_DIR } from '../core/config.ts';
import { Program, createTarget, destroyTarget } from './gl.ts';
import type { Target } from './gl.ts';
import { ALL_MESHES, MESH_CAPACITY } from './meshes.ts';
import type { MeshId } from './meshes.ts';
import { COMPOSITE_FS, BLUR_FS, DOWN_FS, FULL_VS, PARTICLE_FS, PARTICLE_VS, SCENE_FS, SCENE_VS, SKY_FS } from './shaders.ts';

export const FLOATS = 16;
const PARTICLE_FLOATS = 8;
const MAX_PARTICLES = 600;

export interface FrameParams {
  view: Mat4;
  proj: Mat4;
  cam: [number, number, number];
  time: number;
  scroll: number;
  stress: number;
  top: number[]; mid: number[]; horizon: number[]; abyss: number[]; fog: number[]; light: number[];
  halo: number;
  haloUV: [number, number];
  horizonY: number;
  flash: number;
  grain: number;
  bloom: number;
  fade: number;
}

interface MeshGL {
  vao: WebGLVertexArrayObject;
  count: number;
  buf: WebGLBuffer;
  data: Float32Array;
  n: number;
}

/**
 * Render graph, in the spirit of a TouchDesigner network:
 *
 *   sky ──┐
 *   scene (instanced meshes, MRT: colour + glow) ─┤ particles ─> [sceneTarget]
 *   glow ─> downsample ─> blur H ─> blur V ─> [bloomTarget]
 *   sceneTarget + bloomTarget ─> composite (smoothing, tone, vignette, grain, dither) ─> screen
 *
 * Each node is a small pass with explicit inputs, so effects can be added or reordered
 * without touching the simulation.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  gl!: WebGL2RenderingContext;
  lost = false;
  private progs!: { scene: Program; sky: Program; particle: Program; down: Program; blur: Program; comp: Program };
  private meshes: MeshGL[] = [];
  private emptyVao!: WebGLVertexArrayObject;
  private pVao!: WebGLVertexArrayObject;
  private pBuf!: WebGLBuffer;
  private pData = new Float32Array(MAX_PARTICLES * PARTICLE_FLOATS);
  private pCount = 0;
  private sceneT!: Target;
  private bloomA!: Target;
  private bloomB!: Target;
  private w = 2;
  private h = 2;
  scale = 0.85;
  private readonly vp = mat4();
  onRestore: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false, desynchronized: true,
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.init();
      this.onRestore?.();
    });
    this.init();
  }

  private init(): void {
    const gl = this.gl;
    this.progs = {
      scene: new Program(gl, SCENE_VS, SCENE_FS, 'scene'),
      sky: new Program(gl, FULL_VS, SKY_FS, 'sky'),
      particle: new Program(gl, PARTICLE_VS, PARTICLE_FS, 'particle'),
      down: new Program(gl, FULL_VS, DOWN_FS, 'down'),
      blur: new Program(gl, FULL_VS, BLUR_FS, 'blur'),
      comp: new Program(gl, FULL_VS, COMPOSITE_FS, 'composite'),
    };
    this.emptyVao = gl.createVertexArray()!;

    this.meshes = ALL_MESHES.map((m, i) => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const pos = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, pos);
      gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const idx = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
      const buf = gl.createBuffer()!;
      const data = new Float32Array(MESH_CAPACITY[i] * FLOATS);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
      for (let a = 0; a < 4; a++) {
        gl.enableVertexAttribArray(1 + a);
        gl.vertexAttribPointer(1 + a, 4, gl.FLOAT, false, FLOATS * 4, a * 16);
        gl.vertexAttribDivisor(1 + a, 1);
      }
      gl.bindVertexArray(null);
      return { vao, count: m.idx.length, buf, data, n: 0 };
    });

    this.pVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.pVao);
    this.pBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.pData.byteLength, gl.DYNAMIC_DRAW);
    for (let a = 0; a < 2; a++) {
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 4, gl.FLOAT, false, PARTICLE_FLOATS * 4, a * 16);
      gl.vertexAttribDivisor(a, 1);
    }
    gl.bindVertexArray(null);
    this.allocTargets();
  }

  /** (Re)allocates framebuffers. Called on resize and whenever the governor changes scale. */
  private allocTargets(): void {
    const gl = this.gl;
    for (const t of [this.sceneT, this.bloomA, this.bloomB]) if (t) destroyTarget(gl, t);
    const sw = Math.max(2, Math.round(this.w * this.scale));
    const sh = Math.max(2, Math.round(this.h * this.scale));
    this.sceneT = createTarget(gl, sw, sh, 2, true);
    const bw = Math.max(2, sw >> 2);
    const bh = Math.max(2, sh >> 2);
    this.bloomA = createTarget(gl, bw, bh, 1, false);
    this.bloomB = createTarget(gl, bw, bh, 1, false);
  }

  /** `w` and `h` are device pixels of the visible canvas. */
  resize(w: number, h: number): void {
    const cw = Math.max(2, Math.round(w));
    const ch = Math.max(2, Math.round(h));
    if (cw === this.w && ch === this.h && this.sceneT) return;
    this.w = cw;
    this.h = ch;
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.allocTargets();
  }

  setScale(s: number): void {
    if (Math.abs(s - this.scale) < 0.01) return;
    this.scale = s;
    this.allocTargets();
  }

  get aspect(): number {
    return this.w / this.h;
  }

  begin(): void {
    for (const m of this.meshes) m.n = 0;
    this.pCount = 0;
  }

  add(
    mesh: MeshId, x: number, y: number, z: number, yaw: number,
    sx: number, sy: number, sz: number, roll: number,
    r: number, g: number, b: number, emis: number, flash = 0, pitch = 0,
  ): void {
    const m = this.meshes[mesh];
    if (m.n >= MESH_CAPACITY[mesh]) return;
    const o = m.n * FLOATS;
    const d = m.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = yaw;
    d[o + 4] = sx; d[o + 5] = sy; d[o + 6] = sz; d[o + 7] = roll;
    d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = emis;
    d[o + 12] = flash; d[o + 13] = pitch; d[o + 14] = 0; d[o + 15] = 0;
    m.n++;
  }

  particle(x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number): void {
    if (this.pCount >= MAX_PARTICLES) return;
    const o = this.pCount * PARTICLE_FLOATS;
    const d = this.pData;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a;
    this.pCount++;
  }

  render(f: FrameParams): void {
    if (this.lost) return;
    const gl = this.gl;
    const P = this.progs;
    multiply(this.vp, f.proj, f.view);

    // pass 1: sky, meshes, particles into the scene target
    const st = this.sceneT;
    gl.bindFramebuffer(gl.FRAMEBUFFER, st.fbo);
    gl.viewport(0, 0, st.w, st.h);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    P.sky.use();
    P.sky.f2('uRes', st.w, st.h);
    P.sky.f2('uHalo', f.haloUV[0], f.haloUV[1]);
    P.sky.f1('uTime', f.time);
    P.sky.f1('uHaloI', f.halo);
    P.sky.f1('uHorizon', f.horizonY);
    P.sky.f1('uScroll', f.scroll);
    P.sky.f1('uStress', f.stress);
    P.sky.f1('uHaloR', 0.17);
    P.sky.f3('uTop', f.top);
    P.sky.f3('uMid', f.mid);
    P.sky.f3('uHor', f.horizon);
    P.sky.f3('uAbyss', f.abyss);
    P.sky.f3('uLight', f.light);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    P.scene.use();
    P.scene.m4('uVP', this.vp);
    P.scene.f3('uCam', f.cam);
    P.scene.f3('uLightDir', LIGHT_DIR.map((v) => v / Math.hypot(...LIGHT_DIR)));
    P.scene.f3('uLight', f.light);
    P.scene.f3('uFog', f.fog);
    P.scene.f3('uAmb', [f.fog[0] * 1.6 + 0.07, f.fog[1] * 1.6 + 0.07, f.fog[2] * 1.6 + 0.07]);
    P.scene.f1('uFogD', 1 / 150);
    gl.disable(gl.CULL_FACE); // normals come from derivatives and face the viewer, so winding is irrelevant
    for (const m of this.meshes) {
      if (m.n === 0) continue;
      gl.bindVertexArray(m.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.data, 0, m.n * FLOATS);
      gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0, m.n);
    }

    if (this.pCount > 0) {
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      P.particle.use();
      P.particle.m4('uV', f.view);
      P.particle.m4('uProj', f.proj);
      gl.bindVertexArray(this.pVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pData, 0, this.pCount * PARTICLE_FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.pCount);
      gl.disable(gl.BLEND);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // pass 2: bloom chain from the glow attachment
    gl.bindVertexArray(this.emptyVao);
    const a = this.bloomA;
    const b = this.bloomB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.viewport(0, 0, a.w, a.h);
    P.down.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, st.tex[1]);
    P.down.i1('uTex', 0);
    P.down.f2('uTexel', 1 / st.w, 1 / st.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    P.blur.use();
    P.blur.i1('uTex', 0);
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.bindTexture(gl.TEXTURE_2D, a.tex[0]);
      P.blur.f2('uDir', 1 / a.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
      gl.bindTexture(gl.TEXTURE_2D, b.tex[0]);
      P.blur.f2('uDir', 0, 1 / a.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // pass 3: composite to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    P.comp.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, st.tex[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, a.tex[0]);
    P.comp.i1('uScene', 0);
    P.comp.i1('uBloom', 1);
    P.comp.f2('uRes', st.w, st.h);
    P.comp.f1('uTime', f.time);
    P.comp.f1('uGrain', f.grain);
    P.comp.f1('uVig', 0.55);
    P.comp.f1('uFlash', f.flash);
    P.comp.f1('uBloomI', f.bloom);
    P.comp.f1('uFade', f.fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }
}
