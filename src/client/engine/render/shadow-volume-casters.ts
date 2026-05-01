import { CubeType } from "./cube-types";

export interface ShadowVolumeCasterSet {
  positions: Float32Array<ArrayBufferLike>;
  scales: Float32Array<ArrayBufferLike>;
  count: number;
}

export function buildShadowVolumeCasterPositions(cubePositions: Float32Array): ShadowVolumeCasterSet {
  const count = cubePositions.length / 4;
  if (count === 0) return emptyCasterSet();

  const groups = new Map<string, { y: number; cells: Map<string, { x: number; z: number }> }>();
  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    const type = Math.round(cubePositions[offset + 3] ?? 0) as CubeType;
    if (!isShadowVolumeCasterType(type)) continue;
    const x = Math.round(cubePositions[offset] ?? 0);
    const y = Math.round(cubePositions[offset + 1] ?? 0);
    const z = Math.round(cubePositions[offset + 2] ?? 0);
    const key = `${y}`;
    let group = groups.get(key);
    if (!group) {
      group = { y, cells: new Map() };
      groups.set(key, group);
    }
    group.cells.set(`${x},${z}`, { x, z });
  }
  if (groups.size === 0) return emptyCasterSet();

  const positions: number[] = [];
  const scales: number[] = [];
  for (const { y, cells } of groups.values()) {
    for (const rect of mergeCellsIntoRectangles(cells)) {
      positions.push(rect.x, y, rect.z, 0);
      scales.push(rect.width, 1, rect.depth, 0);
    }
  }

  return { positions: new Float32Array(positions), scales: new Float32Array(scales), count: positions.length / 4 };
}

function isShadowVolumeCasterType(type: CubeType): boolean {
  return type !== CubeType.Air && type !== CubeType.Water && type !== CubeType.Lava && type !== CubeType.Bedrock;
}

function mergeCellsIntoRectangles(cells: Map<string, { x: number; z: number }>): Array<{
  x: number;
  z: number;
  width: number;
  depth: number;
}> {
  const remaining = new Set(cells.keys());
  const starts = [...cells.values()].sort((a, b) => a.z - b.z || a.x - b.x);
  const rectangles: Array<{ x: number; z: number; width: number; depth: number }> = [];

  for (const start of starts) {
    const startKey = `${start.x},${start.z}`;
    if (!remaining.has(startKey)) continue;

    let width = 1;
    while (remaining.has(`${start.x + width},${start.z}`)) width++;

    let depth = 1;
    while (rowExists(remaining, start.x, start.z + depth, width)) depth++;

    for (let dz = 0; dz < depth; dz++) {
      for (let dx = 0; dx < width; dx++) {
        remaining.delete(`${start.x + dx},${start.z + dz}`);
      }
    }
    rectangles.push({ x: start.x, z: start.z, width, depth });
  }

  return rectangles;
}

function rowExists(remaining: ReadonlySet<string>, x: number, z: number, width: number): boolean {
  for (let dx = 0; dx < width; dx++) {
    if (!remaining.has(`${x + dx},${z}`)) return false;
  }
  return true;
}

function emptyCasterSet(): ShadowVolumeCasterSet {
  return { positions: new Float32Array(0), scales: new Float32Array(0), count: 0 };
}
