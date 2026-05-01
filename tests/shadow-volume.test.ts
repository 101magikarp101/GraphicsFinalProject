import { Vec3 } from "gl-matrix";
import { describe, expect, it } from "vitest";
import {
  createDirectionalCubeShadowVolumeGeometry,
  SHADOW_VOLUME_EXTRUSION_DISTANCE,
} from "@/client/engine/render/shadow-volume";

describe("directional shadow volume geometry", () => {
  it("builds a closed diagonal-light cube volume", () => {
    const lightDirection = new Vec3([1, 1, 1]).normalize();
    const geometry = createDirectionalCubeShadowVolumeGeometry(lightDirection);
    const triangles = nonDegenerateTriangles(geometry);

    expect(triangles.length).toBe(24);
    expect(allEdgesHaveTwoIncidentTriangles(triangles)).toBe(true);
  });

  it("orients volume faces outward for stencil front/back counting", () => {
    const lightDirection = new Vec3([1, 1, 1]).normalize();
    const geometry = createDirectionalCubeShadowVolumeGeometry(lightDirection);
    const triangles = nonDegenerateTriangles(geometry);
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
    const vertices = nonDegenerateTriangles(geometry).flat();
    const minProjected = Math.min(...vertices.map((vertex) => Vec3.dot(vertex, lightDirection)));

    expect(minProjected).toBeCloseTo(1 - SHADOW_VOLUME_EXTRUSION_DISTANCE, 4);
  });
});

function nonDegenerateTriangles(geometry: Float32Array): [Vec3, Vec3, Vec3][] {
  const triangles: [Vec3, Vec3, Vec3][] = [];
  for (let offset = 0; offset < geometry.length; offset += 12) {
    const a = vertexAt(geometry, offset);
    const b = vertexAt(geometry, offset + 4);
    const c = vertexAt(geometry, offset + 8);
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

function vertexAt(geometry: Float32Array, offset: number): Vec3 {
  return new Vec3([geometry[offset] ?? 0, geometry[offset + 1] ?? 0, geometry[offset + 2] ?? 0]);
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
