export interface MeshData {
  pos: Float32Array;
  idx: Uint16Array;
}

export type MeshId = 0 | 1 | 2 | 3 | 4;
export const MESH = { CUBE: 0, OCTA: 1, PYRAMID: 2, CYL: 3, ARCH: 4 } as const;

const mk = (pos: number[], idx: number[]): MeshData => ({ pos: new Float32Array(pos), idx: new Uint16Array(idx) });

export function cube(): MeshData {
  const p: number[] = [];
  for (let i = 0; i < 8; i++) p.push((i & 1 ? 0.5 : -0.5), (i & 2 ? 0.5 : -0.5), (i & 4 ? 0.5 : -0.5));
  const idx = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5];
  return mk(p, idx);
}

export function octa(): MeshData {
  const p = [0.5, 0, 0, -0.5, 0, 0, 0, 0.5, 0, 0, -0.5, 0, 0, 0, 0.5, 0, 0, -0.5];
  const idx = [0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5];
  return mk(p, idx);
}

export function pyramid(): MeshData {
  const p = [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0, 0.5, 0];
  const idx = [0, 1, 2, 0, 2, 3, 0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0];
  return mk(p, idx);
}

export function cylinder(sides = 8): MeshData {
  const p: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    p.push(Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5);
  }
  p.push(0, -0.5, 0, 0, 0.5, 0);
  const cb = sides * 2;
  const ct = cb + 1;
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const b0 = i * 2, t0 = i * 2 + 1, b1 = j * 2, t1 = j * 2 + 1;
    idx.push(b0, t0, b1, b1, t0, t1, cb, b1, b0, ct, t0, t1);
  }
  return mk(p, idx);
}

/** Half torus in the XY plane, the liturgical gate. Outer radius 0.5, tube radius 0.07. */
export function arch(seg = 12, tube = 5): MeshData {
  const p: number[] = [];
  const idx: number[] = [];
  const R = 0.43;
  const r = 0.07;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    for (let j = 0; j < tube; j++) {
      const b = (j / tube) * Math.PI * 2;
      const rr = R + Math.cos(b) * r;
      p.push(Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(b) * r);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < tube; j++) {
      const a = i * tube + j;
      const b = i * tube + ((j + 1) % tube);
      const c = (i + 1) * tube + j;
      const d = (i + 1) * tube + ((j + 1) % tube);
      idx.push(a, c, b, b, c, d);
    }
  }
  return mk(p, idx);
}

export const ALL_MESHES: MeshData[] = [cube(), octa(), pyramid(), cylinder(), arch()];
export const MESH_CAPACITY = [900, 320, 220, 220, 48];
