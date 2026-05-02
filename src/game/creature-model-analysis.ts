import { CREATURE_MODEL_DESCRIPTORS, type CreatureModelDescriptor } from "./creature-model-descriptor";
import type { CreatureSpeciesId } from "./creature-species";

export interface ModelValidationIssue {
  speciesId: CreatureSpeciesId;
  field: string;
  message: string;
}

export interface ModelSilhouetteMetric {
  speciesId: CreatureSpeciesId;
  frontArea: number;
  sideArea: number;
  topArea: number;
  appendageComplexity: number;
}

export interface ModelQualityPair {
  a: CreatureSpeciesId;
  b: CreatureSpeciesId;
  overlap: number;
}

export function descriptorAppendageMask(descriptor: CreatureModelDescriptor): [number, number, number, number, number, number] {
  let horn = 0;
  let fin = 0;
  let tailSegment = 0;
  let wing = 0;
  let crest = 0;
  let spike = 0;

  for (const appendage of descriptor.appendages) {
    const amount = clamp01(appendage.scale);
    if (appendage.kind === "horn") horn = Math.max(horn, amount);
    if (appendage.kind === "fin") fin = Math.max(fin, amount);
    if (appendage.kind === "tail-segment") tailSegment = Math.max(tailSegment, amount);
    if (appendage.kind === "wing") wing = Math.max(wing, amount);
    if (appendage.kind === "crest") crest = Math.max(crest, amount);
    if (appendage.kind === "spike") spike = Math.max(spike, amount);
  }

  return [horn, fin, tailSegment, wing, crest, spike];
}

export function computeSilhouetteMetric(descriptor: CreatureModelDescriptor): ModelSilhouetteMetric {
  const [bodyW, bodyH, bodyL, headScale] = descriptor.render.morphA;
  const [legL, legW, tailL] = descriptor.render.morphB;
  const appendageComplexity = descriptor.appendages.reduce((acc, item) => acc + Math.max(0, item.scale), 0);

  const frontArea = Math.max(0.2, bodyW * bodyH + legW * legL * 0.6 + appendageComplexity * 0.08 + headScale * 0.12);
  const sideArea = Math.max(0.2, bodyL * bodyH + tailL * 0.18 + appendageComplexity * 0.1 + headScale * 0.1);
  const topArea = Math.max(0.2, bodyW * bodyL + appendageComplexity * 0.12 + legW * 0.1);

  return {
    speciesId: descriptor.speciesId,
    frontArea,
    sideArea,
    topArea,
    appendageComplexity,
  };
}

export function computeSilhouetteVector(descriptor: CreatureModelDescriptor): [number, number, number, number] {
  const metric = computeSilhouetteMetric(descriptor);
  const total = metric.frontArea + metric.sideArea + metric.topArea + metric.appendageComplexity;
  if (total <= 0) return [0.25, 0.25, 0.25, 0.25];
  return [
    metric.frontArea / total,
    metric.sideArea / total,
    metric.topArea / total,
    metric.appendageComplexity / total,
  ];
}

export function silhouetteOverlapScore(a: CreatureModelDescriptor, b: CreatureModelDescriptor): number {
  const av = computeSilhouetteVector(a);
  const bv = computeSilhouetteVector(b);
  const dot = av[0] * bv[0] + av[1] * bv[1] + av[2] * bv[2] + av[3] * bv[3];
  const an = Math.hypot(av[0], av[1], av[2], av[3]);
  const bn = Math.hypot(bv[0], bv[1], bv[2], bv[3]);
  if (an <= 0 || bn <= 0) return 1;
  return dot / (an * bn);
}

export function findHighOverlapPairs(
  descriptors: readonly CreatureModelDescriptor[] = CREATURE_MODEL_DESCRIPTORS,
  threshold = 0.96,
): ModelQualityPair[] {
  const pairs: ModelQualityPair[] = [];
  for (let i = 0; i < descriptors.length; i++) {
    const a = descriptors[i];
    if (!a) continue;
    for (let j = i + 1; j < descriptors.length; j++) {
      const b = descriptors[j];
      if (!b) continue;
      const overlap = silhouetteOverlapScore(a, b);
      if (overlap >= threshold) {
        pairs.push({ a: a.speciesId, b: b.speciesId, overlap });
      }
    }
  }
  return pairs;
}

export function estimateNearLodVertexCount(descriptor: CreatureModelDescriptor): number {
  // Base body+head+legs+tail+face count from procedural block model authoring.
  const baseBoxes = 15;
  const appendageBoxes = Math.max(0, descriptor.appendages.length) * 2;
  return (baseBoxes + appendageBoxes) * 24;
}

export function validateCreatureModelDescriptors(
  descriptors: readonly CreatureModelDescriptor[] = CREATURE_MODEL_DESCRIPTORS,
): ModelValidationIssue[] {
  const issues: ModelValidationIssue[] = [];
  const seen = new Set<string>();

  for (const descriptor of descriptors) {
    if (seen.has(descriptor.speciesId)) {
      issues.push({ speciesId: descriptor.speciesId, field: "speciesId", message: "Duplicate descriptor id." });
    }
    seen.add(descriptor.speciesId);

    validateFiniteTuple(descriptor.speciesId, "render.morphA", descriptor.render.morphA, issues);
    validateFiniteTuple(descriptor.speciesId, "render.morphB", descriptor.render.morphB, issues);
    validateFiniteTuple(descriptor.speciesId, "render.morphC", descriptor.render.morphC, issues);
    validateFiniteTuple(descriptor.speciesId, "render.anim", descriptor.render.anim, issues);

    for (const appendage of descriptor.appendages) {
      if (!Number.isFinite(appendage.scale) || appendage.scale <= 0) {
        issues.push({
          speciesId: descriptor.speciesId,
          field: "appendages.scale",
          message: `Invalid appendage scale for ${appendage.kind}.`,
        });
      }
      validateFiniteTuple(descriptor.speciesId, `appendages.${appendage.kind}.offset`, appendage.offset, issues);
    }

    const nearLod = estimateNearLodVertexCount(descriptor);
    if (nearLod > 560) {
      issues.push({
        speciesId: descriptor.speciesId,
        field: "lod.near",
        message: `Estimated near LOD vertex count too high (${nearLod}).`,
      });
    }
  }

  return issues;
}

function validateFiniteTuple(
  speciesId: CreatureSpeciesId,
  field: string,
  tuple: readonly number[],
  issues: ModelValidationIssue[],
): void {
  for (const value of tuple) {
    if (!Number.isFinite(value)) {
      issues.push({ speciesId, field, message: "Contains a non-finite value." });
      return;
    }
  }
}

export function modelMetricsToCsv(descriptors: readonly CreatureModelDescriptor[] = CREATURE_MODEL_DESCRIPTORS): string {
  const rows = ["speciesId,frontArea,sideArea,topArea,appendageComplexity,nearLodVertices"];
  for (const descriptor of descriptors) {
    const metric = computeSilhouetteMetric(descriptor);
    const nearLod = estimateNearLodVertexCount(descriptor);
    rows.push(
      [
        descriptor.speciesId,
        metric.frontArea.toFixed(4),
        metric.sideArea.toFixed(4),
        metric.topArea.toFixed(4),
        metric.appendageComplexity.toFixed(4),
        String(nearLod),
      ].join(","),
    );
  }
  return rows.join("\n");
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
