import { Vec3 } from "gl-matrix";

export const SHADOW_VOLUME_EXTRUSION_DISTANCE = 220;
export const SHADOW_VOLUME_MAX_TRIANGLES = 32;
export const SHADOW_VOLUME_MAX_VERTEX_COUNT = SHADOW_VOLUME_MAX_TRIANGLES * 3;
export const SHADOW_VOLUME_INDEX_DATA = new Uint32Array(
  Array.from({ length: SHADOW_VOLUME_MAX_VERTEX_COUNT }, (_, index) => index),
);

type Vec = readonly [number, number, number];

interface Face {
  normal: Vec;
  vertices: readonly [number, number, number, number];
}

interface Edge {
  vertices: readonly [number, number];
  faces: readonly [number, number];
}

const CUBE_VERTICES: readonly Vec[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

const ORIGIN: Vec = [0, 0, 0];

const CUBE_FACES: readonly Face[] = [
  { normal: [1, 0, 0], vertices: [1, 5, 6, 2] },
  { normal: [-1, 0, 0], vertices: [0, 3, 7, 4] },
  { normal: [0, 1, 0], vertices: [3, 2, 6, 7] },
  { normal: [0, -1, 0], vertices: [0, 4, 5, 1] },
  { normal: [0, 0, 1], vertices: [4, 7, 6, 5] },
  { normal: [0, 0, -1], vertices: [0, 1, 2, 3] },
];

const CUBE_EDGES: readonly Edge[] = [
  { vertices: [0, 1], faces: [3, 5] },
  { vertices: [1, 2], faces: [0, 5] },
  { vertices: [2, 3], faces: [2, 5] },
  { vertices: [3, 0], faces: [1, 5] },
  { vertices: [4, 5], faces: [3, 4] },
  { vertices: [5, 6], faces: [0, 4] },
  { vertices: [6, 7], faces: [2, 4] },
  { vertices: [7, 4], faces: [1, 4] },
  { vertices: [0, 4], faces: [1, 3] },
  { vertices: [1, 5], faces: [0, 3] },
  { vertices: [2, 6], faces: [0, 2] },
  { vertices: [3, 7], faces: [1, 2] },
];

export function createDirectionalCubeShadowVolumeGeometry(
  lightDirectionInput: Readonly<Vec3>,
  extrusionDistance = SHADOW_VOLUME_EXTRUSION_DISTANCE,
): Float32Array {
  const lightDirection = Vec3.clone(lightDirectionInput).normalize();
  if (!Number.isFinite(lightDirection.x) || !Number.isFinite(lightDirection.y) || !Number.isFinite(lightDirection.z)) {
    lightDirection.set([0, 1, 0]);
  }

  const extruded = CUBE_VERTICES.map((vertex) => extrude(vertex, lightDirection, extrusionDistance));
  const volumeCenter = new Vec3([
    0.5 - lightDirection.x * extrusionDistance * 0.5,
    0.5 - lightDirection.y * extrusionDistance * 0.5,
    0.5 - lightDirection.z * extrusionDistance * 0.5,
  ]);
  const lightFacing = CUBE_FACES.map((face) => dot(face.normal, lightDirection) > 1e-5);
  const positions = new Float32Array(SHADOW_VOLUME_MAX_VERTEX_COUNT * 4);
  let cursor = 0;

  for (let faceIndex = 0; faceIndex < CUBE_FACES.length; faceIndex++) {
    if (!lightFacing[faceIndex]) continue;
    const face = CUBE_FACES[faceIndex];
    if (!face) continue;
    const [a, b, c, d] = face.vertices;
    cursor = emitQuadOriented(
      positions,
      cursor,
      CUBE_VERTICES[a] ?? ORIGIN,
      CUBE_VERTICES[b] ?? ORIGIN,
      CUBE_VERTICES[c] ?? ORIGIN,
      CUBE_VERTICES[d] ?? ORIGIN,
      volumeCenter,
    );
    cursor = emitQuadOriented(
      positions,
      cursor,
      extruded[a] ?? ORIGIN,
      extruded[d] ?? ORIGIN,
      extruded[c] ?? ORIGIN,
      extruded[b] ?? ORIGIN,
      volumeCenter,
    );
  }

  for (const edge of CUBE_EDGES) {
    const [faceA, faceB] = edge.faces;
    if (lightFacing[faceA] === lightFacing[faceB]) continue;
    const [a, b] = edge.vertices;
    cursor = emitQuadOriented(
      positions,
      cursor,
      CUBE_VERTICES[a] ?? ORIGIN,
      CUBE_VERTICES[b] ?? ORIGIN,
      extruded[b] ?? ORIGIN,
      extruded[a] ?? ORIGIN,
      volumeCenter,
    );
  }

  return positions;
}

function extrude(vertex: Vec, lightDirection: Readonly<Vec3>, distance: number): Vec {
  return [
    vertex[0] - lightDirection.x * distance,
    vertex[1] - lightDirection.y * distance,
    vertex[2] - lightDirection.z * distance,
  ];
}

function emitQuadOriented(
  out: Float32Array,
  cursor: number,
  a: Vec,
  b: Vec,
  c: Vec,
  d: Vec,
  volumeCenter: Readonly<Vec3>,
): number {
  if (isOutward(a, b, c, volumeCenter)) {
    cursor = emitTriangle(out, cursor, a, b, c);
    return emitTriangle(out, cursor, a, c, d);
  }
  cursor = emitTriangle(out, cursor, a, d, c);
  return emitTriangle(out, cursor, a, c, b);
}

function emitTriangle(out: Float32Array, cursor: number, a: Vec, b: Vec, c: Vec): number {
  writeVertex(out, cursor++, a);
  writeVertex(out, cursor++, b);
  writeVertex(out, cursor++, c);
  return cursor;
}

function writeVertex(out: Float32Array, vertexIndex: number, vertex: Vec): void {
  const offset = vertexIndex * 4;
  out[offset] = vertex[0];
  out[offset + 1] = vertex[1];
  out[offset + 2] = vertex[2];
  out[offset + 3] = 1;
}

function isOutward(a: Vec, b: Vec, c: Vec, volumeCenter: Readonly<Vec3>): boolean {
  const ab = new Vec3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const ac = new Vec3([c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
  const normal = Vec3.cross(new Vec3(), ab, ac);
  const centroid = new Vec3([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
  return Vec3.dot(normal, centroid.subtract(volumeCenter)) >= 0;
}

function dot(a: Vec, b: Readonly<Vec3>): number {
  return a[0] * b.x + a[1] * b.y + a[2] * b.z;
}
