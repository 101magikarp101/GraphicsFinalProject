import { CubeType } from "./cube-types";

export interface ShadowVolumeCasterSet {
  positions: Float32Array<ArrayBufferLike>;
  scales: Float32Array<ArrayBufferLike>;
  count: number;
}

export type ShadowVolumeLightDirection = Readonly<{ [index: number]: number }>;

const DEFAULT_LIGHT_DIRECTION: ShadowVolumeLightDirection = [0, 1, 0];
const LIGHT_FACE_EPSILON = 1e-6;

type OccupiedColumns = Map<number, Map<number, Set<number>>>;
type LayerRows = Map<number, Set<number>>;

export function buildShadowVolumeCasterPositions(
  cubePositions: Float32Array,
  lightDirection: ShadowVolumeLightDirection = DEFAULT_LIGHT_DIRECTION,
): ShadowVolumeCasterSet {
  const count = cubePositions.length / 4;
  if (count === 0) return emptyCasterSet();

  const occupied: OccupiedColumns = new Map();
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];

  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    const type = Math.round(cubePositions[offset + 3] ?? 0) as CubeType;
    if (!isShadowVolumeCasterType(type)) continue;

    const x = Math.round(cubePositions[offset] ?? 0);
    const y = Math.round(cubePositions[offset + 1] ?? 0);
    const z = Math.round(cubePositions[offset + 2] ?? 0);

    addOccupied(occupied, x, y, z);
    xs.push(x);
    ys.push(y);
    zs.push(z);
  }
  if (xs.length === 0) return emptyCasterSet();

  const groups = new Map<number, LayerRows>();
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] ?? 0;
    const y = ys[i] ?? 0;
    const z = zs[i] ?? 0;
    if (!hasExposedLightFacingFace(x, y, z, occupied, lightDirection)) continue;

    let group = groups.get(y);
    if (!group) {
      group = new Map();
      groups.set(y, group);
    }

    let row = group.get(z);
    if (!row) {
      row = new Set();
      group.set(z, row);
    }
    row.add(x);
  }

  if (groups.size === 0) return emptyCasterSet();

  const positions: number[] = [];
  const scales: number[] = [];
  for (const [y, rows] of groups.entries()) {
    for (const rect of mergeRowsIntoRectangles(rows)) {
      positions.push(rect.x, y, rect.z, 0);
      scales.push(rect.width, 1, rect.depth, 0);
    }
  }

  return { positions: new Float32Array(positions), scales: new Float32Array(scales), count: positions.length / 4 };
}

export function shadowVolumeCasterDirectionKey(lightDirection: ShadowVolumeLightDirection): string {
  return `${axisSign(lightDirection[0] ?? 0)},${axisSign(lightDirection[1] ?? 0)},${axisSign(lightDirection[2] ?? 0)}`;
}

function isShadowVolumeCasterType(type: CubeType): boolean {
  return type !== CubeType.Air && type !== CubeType.Water && type !== CubeType.Lava && type !== CubeType.Bedrock;
}

function hasExposedLightFacingFace(
  x: number,
  y: number,
  z: number,
  occupied: OccupiedColumns,
  lightDirection: ShadowVolumeLightDirection,
): boolean {
  const lightX = lightDirection[0] ?? 0;
  const lightY = lightDirection[1] ?? 0;
  const lightZ = lightDirection[2] ?? 0;

  return (
    (lightX > LIGHT_FACE_EPSILON && !hasOccupied(occupied, x + 1, y, z)) ||
    (lightX < -LIGHT_FACE_EPSILON && !hasOccupied(occupied, x - 1, y, z)) ||
    (lightY > LIGHT_FACE_EPSILON && !hasOccupied(occupied, x, y + 1, z)) ||
    (lightY < -LIGHT_FACE_EPSILON && !hasOccupied(occupied, x, y - 1, z)) ||
    (lightZ > LIGHT_FACE_EPSILON && !hasOccupied(occupied, x, y, z + 1)) ||
    (lightZ < -LIGHT_FACE_EPSILON && !hasOccupied(occupied, x, y, z - 1))
  );
}

function axisSign(value: number): -1 | 0 | 1 {
  if (value > LIGHT_FACE_EPSILON) return 1;
  if (value < -LIGHT_FACE_EPSILON) return -1;
  return 0;
}

function addOccupied(occupied: OccupiedColumns, x: number, y: number, z: number): void {
  let ys = occupied.get(x);
  if (!ys) {
    ys = new Map();
    occupied.set(x, ys);
  }
  let zs = ys.get(y);
  if (!zs) {
    zs = new Set();
    ys.set(y, zs);
  }
  zs.add(z);
}

function hasOccupied(occupied: OccupiedColumns, x: number, y: number, z: number): boolean {
  return occupied.get(x)?.get(y)?.has(z) ?? false;
}

function mergeRowsIntoRectangles(rows: LayerRows): Array<{
  x: number;
  z: number;
  width: number;
  depth: number;
}> {
  const remaining = new Map<number, Set<number>>();
  for (const [z, row] of rows.entries()) {
    remaining.set(z, new Set(row));
  }

  const rectangles: Array<{ x: number; z: number; width: number; depth: number }> = [];
  const sortedZ = [...remaining.keys()].sort((a, b) => a - b);

  for (const z of sortedZ) {
    const row = remaining.get(z);
    if (!row || row.size === 0) continue;
    const starts = [...row].sort((a, b) => a - b);

    for (const startX of starts) {
      const currentRow = remaining.get(z);
      if (!currentRow || !currentRow.has(startX)) continue;

      let width = 1;
      while (currentRow.has(startX + width)) width++;

      let depth = 1;
      while (rowContainsRange(remaining.get(z + depth), startX, width)) depth++;

      for (let dz = 0; dz < depth; dz++) {
        const sweepRow = remaining.get(z + dz);
        if (!sweepRow) continue;
        for (let dx = 0; dx < width; dx++) {
          sweepRow.delete(startX + dx);
        }
      }

      rectangles.push({ x: startX, z, width, depth });
    }
  }

  return rectangles;
}

function rowContainsRange(row: ReadonlySet<number> | undefined, x: number, width: number): boolean {
  if (!row) return false;
  for (let dx = 0; dx < width; dx++) {
    if (!row.has(x + dx)) return false;
  }
  return true;
}

function emptyCasterSet(): ShadowVolumeCasterSet {
  return { positions: new Float32Array(0), scales: new Float32Array(0), count: 0 };
}
