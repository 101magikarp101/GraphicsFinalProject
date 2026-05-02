import { describe, expect, it } from "vitest";
import {
  estimateNearLodVertexCount,
  findHighOverlapPairs,
  silhouetteOverlapScore,
  validateCreatureModelDescriptors,
} from "@/game/creature-model-analysis";
import { CREATURE_MODEL_DESCRIPTORS } from "@/game/creature-model-descriptor";

describe("creature model descriptor validation", () => {
  it("has no schema or value validation issues", () => {
    const issues = validateCreatureModelDescriptors(CREATURE_MODEL_DESCRIPTORS);
    expect(issues).toEqual([]);
  });

  it("keeps pairwise silhouette overlap below hard threshold", () => {
    const riskyPairs = findHighOverlapPairs(CREATURE_MODEL_DESCRIPTORS, 0.999);
    expect(riskyPairs.length).toBeLessThanOrEqual(8);
  });

  it("maintains reasonable near LOD complexity", () => {
    for (const descriptor of CREATURE_MODEL_DESCRIPTORS) {
      expect(estimateNearLodVertexCount(descriptor)).toBeLessThanOrEqual(560);
    }
  });

  it("retains broad silhouette diversity", () => {
    const scores: number[] = [];
    for (let i = 0; i < CREATURE_MODEL_DESCRIPTORS.length; i++) {
      const a = CREATURE_MODEL_DESCRIPTORS[i];
      if (!a) continue;
      for (let j = i + 1; j < CREATURE_MODEL_DESCRIPTORS.length; j++) {
        const b = CREATURE_MODEL_DESCRIPTORS[j];
        if (!b) continue;
        scores.push(silhouetteOverlapScore(a, b));
      }
    }

    const avgOverlap = scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);
    expect(avgOverlap).toBeLessThan(0.99);
  });
});
