export class Program {
  readonly gl: WebGL2RenderingContext;
  readonly prog: WebGLProgram;
  private readonly cache = new Map<string, WebGLUniformLocation | null>();

  constructor(gl: WebGL2RenderingContext, vs: string, fs: string, name: string) {
    this.gl = gl;
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`[${name}] shader compile failed: ${log}`);
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`[${name}] link failed: ${gl.getProgramInfoLog(p)}`);
    gl.deleteShader(v);
    gl.deleteShader(f);
    this.prog = p;
  }

  use(): void {
    this.gl.useProgram(this.prog);
  }

  loc(name: string): WebGLUniformLocation | null {
    if (!this.cache.has(name)) this.cache.set(name, this.gl.getUniformLocation(this.prog, name));
    return this.cache.get(name) ?? null;
  }

  f1(n: string, v: number): void { this.gl.uniform1f(this.loc(n), v); }
  f2(n: string, a: number, b: number): void { this.gl.uniform2f(this.loc(n), a, b); }
  f3(n: string, v: ArrayLike<number>): void { this.gl.uniform3f(this.loc(n), v[0], v[1], v[2]); }
  m4(n: string, m: Float32Array): void { this.gl.uniformMatrix4fv(this.loc(n), false, m); }
  i1(n: string, v: number): void { this.gl.uniform1i(this.loc(n), v); }
}

export interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture[];
  depth: WebGLRenderbuffer | null;
  w: number;
  h: number;
}

export function createTarget(gl: WebGL2RenderingContext, w: number, h: number, colorCount: number, withDepth: boolean): Target {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const tex: WebGLTexture[] = [];
  const bufs: number[] = [];
  for (let i = 0; i < colorCount; i++) {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    tex.push(t);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  }
  gl.drawBuffers(bufs);
  let depth: WebGLRenderbuffer | null = null;
  if (withDepth) {
    depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  }
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer incomplete: ${status}`);
  return { fbo, tex, depth, w, h };
}

export function destroyTarget(gl: WebGL2RenderingContext, t: Target): void {
  gl.deleteFramebuffer(t.fbo);
  t.tex.forEach((x) => gl.deleteTexture(x));
  if (t.depth) gl.deleteRenderbuffer(t.depth);
}
