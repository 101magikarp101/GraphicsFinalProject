import { Vec3 } from "gl-matrix";
import { describe, expect, it } from "vitest";
import { CubeType } from "@/client/engine/render/cube-types";
import {
  createDirectionalCubeShadowVolumeGeometry,
  SHADOW_VOLUME_EXTRUSION_DISTANCE,
} from "@/client/engine/render/shadow-volume";
import {
  buildShadowVolumeCasterPositions,
  shadowVolumeCasterDirectionKey,
} from "@/client/engine/render/shadow-volume-casters";

describe("directional shadow volume geometry", () => {
  it("builds a closed diagonal-light cube volume", () => {
    const lightDirection = new Vec3([1, 1, 1]).normalize();
    const geometry = createDirectionalCubeShadowVolumeGeometry(lightDirection);
    const triangles = nonDegenerateTriangles(geometry, lightDirection);

    expect(triangles.length).toBe(24);
    expect(allEdgesHaveTwoIncidentTriangles(triangles)).toBe(true);
  });

  it("orients volume faces outward for stencil front/back counting", () => {
    const lightDirection = new Vec3([1, 1, 1]).normalize();
    const geometry = createDirectionalCubeShadowVolumeGeometry(lightDirection);
    const triangles = nonDegenerateTriangles(geometry, lightDirection);
    const center = new Vec3([
      0.5 - lightDirection.x * SHADOW_VOLUME_EXTRUSION_DISTANCE * 0.5,
      0.5 - lightDirection.y * SHADOW_VOLUME_EXTRUSION_DISTANCE * 0.5,
      0.5 - lightDirection.z * SHADOW_VOLUME_EXTRUSION_DISTANCE * 0.5,
    ]);

    for (const [a, b, c] of triangles) {
      const normal = Vec3.cross(new Vec3(), subtract(b, a), subtract(c, a));
      const centroid = new Vec3([(a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3]);
      expect(Vec3.dot(normal, centroid.subtract(center))).toBeGreaterThanOrEqual(-1e-5);
    }
  });

  it("extrudes away from the directional light", () => {
    const lightDirection = new Vec3([0, 1, 0]);
    const geometry = createDirectionalCubeShadowVolumeGeometry(lightDirection);
    const vertices = nonDegenerateTriangles(geometry, lightDirection).flat();
    const minProjected = Math.min(...vertices.map((vertex) => Vec3.dot(vertex, lightDirection)));

    expect(minProjected).toBeCloseTo(1 - SHADOW_VOLUME_EXTRUSION_DISTANCE, 4);
  });

  it("encodes original cube corners plus extrusion distance for shader-side scaling", () => {
    const lightDirection = new Vec3([1, 0.4, -0.2]).normalize();
    const geometry = createDirectionalCubeShadowVolumeGeometry(lightDirection);

    for (let offset = 0; offset < geometry.length; offset += 4) {
      expect(geometry[offset]).toBeGreaterThanOrEqual(0);
      expect(geometry[offset]).toBeLessThanOrEqual(1);
      expect(geometry[offset + 1]).toBeGreaterThanOrEqual(0);
      expect(geometry[offset + 1]).toBeLessThanOrEqual(1);
      expect(geometry[offset + 2]).toBeGreaterThanOrEqual(0);
      expect(geometry[offset + 2]).toBeLessThanOrEqual(1);
      expect([0, SHADOW_VOLUME_EXTRUSION_DISTANCE]).toContain(geometry[offset + 3]);
    }
  });

  it("extrudes scaled caster rectangles from their scaled base corners", () => {
    const lightDirection = new Vec3([1, 1, 0]).normalize();
    const geometry = createDirectionalCubeShadowVolumeGeometry(lightDirection);
    const scale = new Vec3([4, 2, 3]);

    for (let offset = 0; offset < geometry.length; offset += 4) {
      const distance = geometry[offset + 3] ?? 0;
      if (distance === 0) continue;
      const base = new Vec3([
        (geometry[offset] ?? 0) * scale.x,
        (geometry[offset + 1] ?? 0) * scale.y,
        (geometry[offset + 2] ?? 0) * scale.z,
      ]);
      const reconstructed = vertexAt(geometry, offset, lightDirection, scale);
      const delta = reconstructed.subtract(base);

      expect(delta.x).toBeCloseTo(-lightDirection.x * SHADOW_VOLUME_EXTRUSION_DISTANCE, 4);
      expect(delta.y).toBeCloseTo(-lightDirection.y * SHADOW_VOLUME_EXTRUSION_DISTANCE, 4);
      expect(delta.z).toBeCloseTo(-lightDirection.z * SHADOW_VOLUME_EXTRUSION_DISTANCE, 4);
    }
  });

  it("keeps the same encoded topology while the light stays in the same octant", () => {
    const lowAngle = createDirectionalCubeShadowVolumeGeometry(new Vec3([0.1, 0.9, -0.2]).normalize());
    const steepAngle = createDirectionalCubeShadowVolumeGeometry(new Vec3([0.6, 0.3, -0.7]).normalize());

    expect([...lowAngle]).toEqual([...steepAngle]);
  });
});

describe("shadow volume caster selection", () => {
  it("keeps prominent and vegetation casters while skipping buried or fluid blocks", () => {
    const casters = buildShadowVolumeCasterPositions(
      cubePositions([
        [0, 1, 0, CubeType.Grass],
        [0, 4, 0, CubeType.Grass],
        [3, 2, 0, CubeType.OakLeaf],
        [4, 2, 0, CubeType.Water],
      ]),
    );

    expect(casters.count).toBe(3);
    expect([...casters.positions]).toEqual([0, 1, 0, 0, 0, 4, 0, 0, 3, 2, 0, 0]);
    expect([...casters.scales]).toEqual([1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0]);
  });

  it("merges connected terrain casters within the same visible layer", () => {
    const casters = buildShadowVolumeCasterPositions(
      cubePositions([
        [0, 4, 0, CubeType.Grass],
        [1, 4, 0, CubeType.Grass],
        [0, 4, 1, CubeType.Grass],
        [1, 4, 1, CubeType.Grass],
      ]),
    );

    expect(casters.count).toBe(1);
    expect([...casters.positions]).toEqual([0, 4, 0, 0]);
    expect([...casters.scales]).toEqual([2, 1, 2, 0]);
  });

  it("casts broad flat terrain as a single merged volume to avoid impossible light patches", () => {
    const casters = buildShadowVolumeCasterPositions(
      cubePositions([
        [0, 2, 0, CubeType.Grass],
        [1, 2, 0, CubeType.Grass],
        [0, 2, 1, CubeType.Grass],
        [1, 2, 1, CubeType.Grass],
      ]),
    );

    expect(casters.count).toBe(1);
    expect([...casters.positions]).toEqual([0, 2, 0, 0]);
    expect([...casters.scales]).toEqual([2, 1, 2, 0]);
  });

  it("does not merge terrain casters from different visible layers", () => {
    const casters = buildShadowVolumeCasterPositions(
      cubePositions([
        [0, 2, 0, CubeType.Grass],
        [1, 5, 0, CubeType.Grass],
      ]),
    );

    expect(casters.count).toBe(2);
    expect([...casters.positions]).toEqual([0, 2, 0, 0, 1, 5, 0, 0]);
    expect([...casters.scales]).toEqual([1, 1, 1, 0, 1, 1, 1, 0]);
  });

  it("keeps exposed lower blocks in the same column as casters", () => {
    const casters = buildShadowVolumeCasterPositions(
      cubePositions([
        [4, 1, 4, CubeType.Grass],
        [4, 3, 4, CubeType.Grass],
      ]),
    );

    expect(casters.count).toBe(2);
    expect([...casters.positions]).toEqual([4, 1, 4, 0, 4, 3, 4, 0]);
    expect([...casters.scales]).toEqual([1, 1, 1, 0, 1, 1, 1, 0]);
  });

  it("skips stacked blocks that have no exposed face toward the light", () => {
    const casters = buildShadowVolumeCasterPositions(
      cubePositions([
        [0, 0, 0, CubeType.Grass],
        [0, 1, 0, CubeType.Grass],
      ]),
      new Vec3([0, 1, 0]),
    );

    expect(casters.count).toBe(1);
    expect([...casters.positions]).toEqual([0, 1, 0, 0]);
    expect([...casters.scales]).toEqual([1, 1, 1, 0]);
  });

  it("keeps lower stacked blocks when a side face is exposed to slanted light", () => {
    const casters = buildShadowVolumeCasterPositions(
      cubePositions([
        [0, 0, 0, CubeType.Grass],
        [0, 1, 0, CubeType.Grass],
      ]),
      new Vec3([1, 1, 0]).normalize(),
    );

    expect(casters.count).toBe(2);
    expect([...casters.positions]).toEqual([0, 0, 0, 0, 0, 1, 0, 0]);
    expect([...casters.scales]).toEqual([1, 1, 1, 0, 1, 1, 1, 0]);
  });

  it("keys caster rebuilds by light-facing axis signs instead of continuous magnitude", () => {
    expect(shadowVolumeCasterDirectionKey(new Vec3([0.1, 0.9, -0.2]).normalize())).toBe(
      shadowVolumeCasterDirectionKey(new Vec3([0.6, 0.3, -0.7]).normalize()),
    );
    expect(shadowVolumeCasterDirectionKey(new Vec3([-0.1, 0.9, -0.2]).normalize())).not.toBe(
      shadowVolumeCasterDirectionKey(new Vec3([0.6, 0.3, -0.7]).normalize()),
    );
  });
});

function nonDegenerateTriangles(
  geometry: Float32Array,
  lightDirection: Readonly<Vec3>,
  scale = new Vec3([1, 1, 1]),
): [Vec3, Vec3, Vec3][] {
  const triangles: [Vec3, Vec3, Vec3][] = [];
  for (let offset = 0; offset < geometry.length; offset += 12) {
    const a = vertexAt(geometry, offset, lightDirection, scale);
    const b = vertexAt(geometry, offset + 4, lightDirection, scale);
    const c = vertexAt(geometry, offset + 8, lightDirection, scale);
    const normal = Vec3.cross(new Vec3(), subtract(b, a), subtract(c, a));
    if (Vec3.len(normal) > 1e-6) triangles.push([a, b, c]);
  }
  return triangles;
}

function allEdgesHaveTwoIncidentTriangles(triangles: readonly [Vec3, Vec3, Vec3][]): boolean {
  const edgeCounts = new Map<string, number>();
  for (const [a, b, c] of triangles) {
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = edgeKey(from, to);
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  return [...edgeCounts.values()].every((count) => count === 2);
}

function vertexAt(
  geometry: Float32Array,
  offset: number,
  lightDirection: Readonly<Vec3>,
  scale = new Vec3([1, 1, 1]),
): Vec3 {
  const extrusion = geometry[offset + 3] ?? 0;
  return new Vec3([
    (geometry[offset] ?? 0) * scale.x - lightDirection.x * extrusion,
    (geometry[offset + 1] ?? 0) * scale.y - lightDirection.y * extrusion,
    (geometry[offset + 2] ?? 0) * scale.z - lightDirection.z * extrusion,
  ]);
}

function subtract(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return new Vec3([a.x - b.x, a.y - b.y, a.z - b.z]);
}

function edgeKey(a: Readonly<Vec3>, b: Readonly<Vec3>): string {
  const ak = vertexKey(a);
  const bk = vertexKey(b);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function vertexKey(vertex: Readonly<Vec3>): string {
  return `${vertex.x.toFixed(5)},${vertex.y.toFixed(5)},${vertex.z.toFixed(5)}`;
}

function cubePositions(values: Array<[number, number, number, CubeType]>): Float32Array {
  return new Float32Array(values.flat());
}
