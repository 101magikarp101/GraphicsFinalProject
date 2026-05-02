import type { CreatureSpeciesId } from "./creature-species";

export type CreatureBodyShape = "compact" | "serpentine" | "avian" | "quadruped" | "biped-heavy" | "biped-light";
export type CreatureSurfaceProfile = "smooth" | "plated" | "rocky" | "fluffy" | "leafy";
export type CreatureAnimationStyle = "idle-sway" | "bob" | "predatory-crouch" | "float" | "hopping";
export type CreatureAppendageKind = "horn" | "fin" | "tail-segment" | "wing" | "crest" | "spike";

interface CreatureAppendageDescriptor {
  kind: CreatureAppendageKind;
  scale: number;
  offset: readonly [number, number, number];
  yaw?: number;
  pitch?: number;
  roll?: number;
}

interface CreatureProportions {
  torso: number;
  head: number;
  limbLength: number;
  limbThickness: number;
  neckLength: number;
  tailLength: number;
}

export interface CreatureModelDescriptor {
  speciesId: CreatureSpeciesId;
  bodyShape: CreatureBodyShape;
  proportions: CreatureProportions;
  appendages: readonly CreatureAppendageDescriptor[];
  surfaceProfile: CreatureSurfaceProfile;
  animationStyle: CreatureAnimationStyle;
  render: {
    worldScale: number;
    primary: readonly [number, number, number];
    secondary: readonly [number, number, number];
    accent?: readonly [number, number, number];
    // bodyWidth, bodyHeight, bodyLength, headScale
    morphA: readonly [number, number, number, number];
    // legLength, legWidth, tailLength, tailHeight
    morphB: readonly [number, number, number, number];
    // headLift, headForward, legSpread, tailLift
    morphC: readonly [number, number, number, number];
    // stride, bob, tailSwing
    anim: readonly [number, number, number];
    // patternId, patternScale, accentStrength, emissiveStrength
    materialProfile?: readonly [number, number, number, number];
  };
}

export const CREATURE_MODEL_DESCRIPTORS = [
  {
    speciesId: "emberlynx",
    bodyShape: "quadruped",
    proportions: { torso: 1.02, head: 1.04, limbLength: 1, limbThickness: 0.95, neckLength: 0.95, tailLength: 1.2 },
    appendages: [{ kind: "crest", scale: 0.8, offset: [0, 0.18, 0.12] }],
    surfaceProfile: "smooth",
    animationStyle: "predatory-crouch",
    render: {
      worldScale: 1.05,
      primary: [0.92, 0.42, 0.24],
      secondary: [0.55, 0.18, 0.08],
      morphA: [0.98, 0.92, 1.08, 1.03],
      morphB: [1.0, 0.92, 1.25, 0.9],
      morphC: [0.02, 0.03, 0.03, 0.04],
      anim: [1.08, 0.9, 1.15],
    },
  },
  {
    speciesId: "cindercub",
    bodyShape: "compact",
    proportions: { torso: 1.05, head: 1.1, limbLength: 0.95, limbThickness: 1.1, neckLength: 0.85, tailLength: 1.05 },
    appendages: [{ kind: "spike", scale: 0.65, offset: [0, 0.16, -0.08] }],
    surfaceProfile: "fluffy",
    animationStyle: "bob",
    render: {
      worldScale: 1.08,
      primary: [0.96, 0.48, 0.2],
      secondary: [0.62, 0.23, 0.11],
      morphA: [1.06, 1.0, 0.95, 1.12],
      morphB: [0.94, 1.08, 1.0, 0.95],
      morphC: [0.04, 0.02, 0.04, 0.03],
      anim: [0.92, 1.1, 1.0],
    },
  },
  {
    speciesId: "pyrrat",
    bodyShape: "serpentine",
    proportions: { torso: 0.94, head: 0.9, limbLength: 0.88, limbThickness: 0.82, neckLength: 0.9, tailLength: 1.45 },
    appendages: [{ kind: "tail-segment", scale: 1.1, offset: [0, 0.02, -0.24] }],
    surfaceProfile: "smooth",
    animationStyle: "idle-sway",
    render: {
      worldScale: 0.92,
      primary: [0.88, 0.34, 0.22],
      secondary: [0.52, 0.14, 0.06],
      morphA: [0.86, 0.84, 1.22, 0.88],
      morphB: [0.86, 0.8, 1.38, 0.84],
      morphC: [0.0, 0.05, 0.02, 0.05],
      anim: [1.2, 0.78, 1.22],
    },
  },
  {
    speciesId: "forgepup",
    bodyShape: "biped-heavy",
    proportions: { torso: 1.18, head: 0.9, limbLength: 1.04, limbThickness: 1.2, neckLength: 0.8, tailLength: 0.95 },
    appendages: [{ kind: "spike", scale: 0.9, offset: [0, 0.1, 0] }],
    surfaceProfile: "plated",
    animationStyle: "predatory-crouch",
    render: {
      worldScale: 1.16,
      primary: [0.8, 0.38, 0.22],
      secondary: [0.38, 0.2, 0.16],
      morphA: [1.14, 1.12, 0.9, 0.9],
      morphB: [1.06, 1.2, 0.9, 1.02],
      morphC: [0.03, -0.01, 0.05, 0.01],
      anim: [0.82, 0.88, 0.76],
    },
  },
  {
    speciesId: "solflit",
    bodyShape: "avian",
    proportions: { torso: 0.9, head: 1.08, limbLength: 0.9, limbThickness: 0.78, neckLength: 1.08, tailLength: 1.1 },
    appendages: [{ kind: "wing", scale: 0.92, offset: [0.22, 0.12, -0.02] }],
    surfaceProfile: "smooth",
    animationStyle: "float",
    render: {
      worldScale: 0.88,
      primary: [0.96, 0.58, 0.26],
      secondary: [0.72, 0.26, 0.12],
      morphA: [0.84, 0.96, 1.02, 1.12],
      morphB: [0.9, 0.8, 1.1, 1.05],
      morphC: [0.06, 0.04, 0.02, 0.04],
      anim: [1.08, 1.18, 1.24],
    },
  },
  {
    speciesId: "rippletoad",
    bodyShape: "compact",
    proportions: { torso: 1.04, head: 1.02, limbLength: 0.9, limbThickness: 1.1, neckLength: 0.82, tailLength: 0.9 },
    appendages: [{ kind: "fin", scale: 0.78, offset: [0, 0.12, -0.1] }],
    surfaceProfile: "smooth",
    animationStyle: "hopping",
    render: {
      worldScale: 1.04,
      primary: [0.26, 0.58, 0.92],
      secondary: [0.16, 0.33, 0.6],
      morphA: [1.08, 0.92, 0.95, 1.02],
      morphB: [0.9, 1.12, 0.82, 0.9],
      morphC: [0.03, 0.0, 0.06, 0.0],
      anim: [0.94, 1.22, 0.88],
    },
  },
  {
    speciesId: "brookit",
    bodyShape: "biped-light",
    proportions: { torso: 0.96, head: 0.98, limbLength: 1.02, limbThickness: 0.86, neckLength: 0.94, tailLength: 1.18 },
    appendages: [{ kind: "fin", scale: 0.82, offset: [0, 0.11, -0.18] }],
    surfaceProfile: "smooth",
    animationStyle: "idle-sway",
    render: {
      worldScale: 0.96,
      primary: [0.32, 0.65, 0.9],
      secondary: [0.14, 0.28, 0.58],
      morphA: [0.9, 0.88, 1.12, 0.98],
      morphB: [1.04, 0.86, 1.2, 0.92],
      morphC: [0.02, 0.02, 0.03, 0.02],
      anim: [1.15, 0.94, 1.14],
    },
  },
  {
    speciesId: "mirefin",
    bodyShape: "serpentine",
    proportions: { torso: 1.02, head: 0.88, limbLength: 0.86, limbThickness: 0.82, neckLength: 0.9, tailLength: 1.42 },
    appendages: [{ kind: "fin", scale: 0.92, offset: [0, 0.08, -0.22] }],
    surfaceProfile: "smooth",
    animationStyle: "idle-sway",
    render: {
      worldScale: 1.02,
      primary: [0.24, 0.54, 0.76],
      secondary: [0.1, 0.22, 0.45],
      morphA: [0.92, 0.86, 1.25, 0.86],
      morphB: [0.82, 0.8, 1.4, 0.86],
      morphC: [0.0, 0.03, 0.02, 0.02],
      anim: [1.1, 0.86, 1.28],
    },
  },
  {
    speciesId: "glaciermink",
    bodyShape: "quadruped",
    proportions: { torso: 0.92, head: 0.94, limbLength: 0.98, limbThickness: 0.8, neckLength: 0.96, tailLength: 1.24 },
    appendages: [{ kind: "crest", scale: 0.72, offset: [0, 0.15, 0.04] }],
    surfaceProfile: "smooth",
    animationStyle: "float",
    render: {
      worldScale: 0.94,
      primary: [0.52, 0.82, 0.96],
      secondary: [0.22, 0.45, 0.68],
      morphA: [0.86, 0.9, 1.08, 0.96],
      morphB: [1.0, 0.78, 1.22, 0.92],
      morphC: [0.04, 0.02, 0.03, 0.03],
      anim: [1.12, 1.08, 1.18],
    },
  },
  {
    speciesId: "harborhog",
    bodyShape: "biped-heavy",
    proportions: { torso: 1.2, head: 0.86, limbLength: 1.06, limbThickness: 1.24, neckLength: 0.78, tailLength: 0.78 },
    appendages: [{ kind: "spike", scale: 0.86, offset: [0, 0.13, -0.06] }],
    surfaceProfile: "plated",
    animationStyle: "bob",
    render: {
      worldScale: 1.12,
      primary: [0.2, 0.42, 0.7],
      secondary: [0.14, 0.22, 0.38],
      morphA: [1.2, 1.1, 0.86, 0.84],
      morphB: [1.06, 1.24, 0.74, 0.96],
      morphC: [0.01, -0.02, 0.06, 0.0],
      anim: [0.76, 0.95, 0.72],
    },
  },
  {
    speciesId: "spriglyn",
    bodyShape: "quadruped",
    proportions: { torso: 1.0, head: 1.02, limbLength: 1.0, limbThickness: 0.95, neckLength: 0.95, tailLength: 1.12 },
    appendages: [{ kind: "crest", scale: 0.82, offset: [0, 0.14, -0.08] }],
    surfaceProfile: "leafy",
    animationStyle: "bob",
    render: {
      worldScale: 1,
      primary: [0.34, 0.74, 0.32],
      secondary: [0.18, 0.42, 0.12],
      morphA: [1.0, 0.94, 1.02, 1.02],
      morphB: [1.0, 0.94, 1.12, 0.92],
      morphC: [0.03, 0.01, 0.04, 0.03],
      anim: [0.98, 1.06, 1.0],
    },
  },
  {
    speciesId: "mossmole",
    bodyShape: "compact",
    proportions: { torso: 1.12, head: 0.92, limbLength: 0.92, limbThickness: 1.12, neckLength: 0.84, tailLength: 0.9 },
    appendages: [{ kind: "spike", scale: 0.74, offset: [0, 0.09, 0.02] }],
    surfaceProfile: "rocky",
    animationStyle: "predatory-crouch",
    render: {
      worldScale: 1.1,
      primary: [0.28, 0.62, 0.24],
      secondary: [0.16, 0.34, 0.12],
      morphA: [1.14, 1.06, 0.92, 0.9],
      morphB: [0.94, 1.12, 0.9, 0.96],
      morphC: [0.01, -0.01, 0.06, 0.01],
      anim: [0.82, 0.9, 0.82],
    },
  },
  {
    speciesId: "peatwing",
    bodyShape: "avian",
    proportions: { torso: 0.88, head: 1.08, limbLength: 0.9, limbThickness: 0.8, neckLength: 1.12, tailLength: 1.08 },
    appendages: [{ kind: "wing", scale: 1.02, offset: [0.24, 0.14, -0.02] }],
    surfaceProfile: "leafy",
    animationStyle: "float",
    render: {
      worldScale: 0.9,
      primary: [0.48, 0.82, 0.34],
      secondary: [0.22, 0.54, 0.2],
      morphA: [0.84, 0.94, 1.04, 1.12],
      morphB: [0.9, 0.8, 1.12, 1.04],
      morphC: [0.06, 0.04, 0.02, 0.04],
      anim: [1.1, 1.16, 1.24],
    },
  },
  {
    speciesId: "thorncub",
    bodyShape: "biped-heavy",
    proportions: { torso: 1.1, head: 0.95, limbLength: 1.02, limbThickness: 1.06, neckLength: 0.86, tailLength: 0.92 },
    appendages: [{ kind: "spike", scale: 0.88, offset: [0, 0.16, -0.03] }],
    surfaceProfile: "plated",
    animationStyle: "predatory-crouch",
    render: {
      worldScale: 1.06,
      primary: [0.38, 0.7, 0.28],
      secondary: [0.2, 0.38, 0.16],
      morphA: [1.08, 1.02, 0.95, 0.96],
      morphB: [1.02, 1.04, 0.92, 1.0],
      morphC: [0.02, 0.0, 0.06, 0.02],
      anim: [0.86, 0.92, 0.86],
    },
  },
  {
    speciesId: "lilypadra",
    bodyShape: "serpentine",
    proportions: { torso: 1.04, head: 0.96, limbLength: 0.88, limbThickness: 0.84, neckLength: 0.92, tailLength: 1.36 },
    appendages: [{ kind: "fin", scale: 0.84, offset: [0, 0.1, -0.2] }],
    surfaceProfile: "leafy",
    animationStyle: "idle-sway",
    render: {
      worldScale: 1.03,
      primary: [0.42, 0.78, 0.44],
      secondary: [0.16, 0.4, 0.2],
      morphA: [0.96, 0.9, 1.2, 0.96],
      morphB: [0.88, 0.84, 1.34, 0.9],
      morphC: [0.03, 0.01, 0.04, 0.02],
      anim: [1.08, 0.92, 1.22],
    },
  },
] as const satisfies readonly CreatureModelDescriptor[];

export const CREATURE_MODEL_DESCRIPTOR_BY_ID = Object.fromEntries(
  CREATURE_MODEL_DESCRIPTORS.map((entry) => [entry.speciesId, entry]),
) as unknown as Record<CreatureSpeciesId, CreatureModelDescriptor>;
