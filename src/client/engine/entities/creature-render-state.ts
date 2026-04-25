import type { CreaturePublicState } from "@/game/creature";
import { lerp, lerpAngle } from "@/utils/interpolations";
import type { GpuBuffers } from "./pipeline";
import { ensureBuffer } from "./pipeline";

const TICK_SECONDS = 0.05;
const MAX_WALK_SPEED = 4;

export interface CreatureRenderState extends CreaturePublicState {
  walkSpeed: number;
  phaseOffset: number;
  scale: number;
  primaryColor: [number, number, number];
  secondaryColor: [number, number, number];
}

const TRAITS: Record<
  CreaturePublicState["speciesId"],
  { scale: number; primary: [number, number, number]; secondary: [number, number, number] }
> = {
  emberlynx: { scale: 1.05, primary: [0.92, 0.42, 0.24], secondary: [0.55, 0.18, 0.08] },
  cindercub: { scale: 1.08, primary: [0.96, 0.48, 0.2], secondary: [0.62, 0.23, 0.11] },
  pyrrat: { scale: 0.92, primary: [0.88, 0.34, 0.22], secondary: [0.52, 0.14, 0.06] },
  forgepup: { scale: 1.16, primary: [0.8, 0.38, 0.22], secondary: [0.38, 0.2, 0.16] },
  solflit: { scale: 0.88, primary: [0.96, 0.58, 0.26], secondary: [0.72, 0.26, 0.12] },

  rippletoad: { scale: 1.04, primary: [0.26, 0.58, 0.92], secondary: [0.16, 0.33, 0.6] },
  brookit: { scale: 0.96, primary: [0.32, 0.65, 0.9], secondary: [0.14, 0.28, 0.58] },
  mirefin: { scale: 1.02, primary: [0.24, 0.54, 0.76], secondary: [0.1, 0.22, 0.45] },
  glaciermink: { scale: 0.94, primary: [0.52, 0.82, 0.96], secondary: [0.22, 0.45, 0.68] },
  harborhog: { scale: 1.12, primary: [0.2, 0.42, 0.7], secondary: [0.14, 0.22, 0.38] },

  spriglyn: { scale: 1, primary: [0.34, 0.74, 0.32], secondary: [0.18, 0.42, 0.12] },
  mossmole: { scale: 1.1, primary: [0.28, 0.62, 0.24], secondary: [0.16, 0.34, 0.12] },
  peatwing: { scale: 0.9, primary: [0.48, 0.82, 0.34], secondary: [0.22, 0.54, 0.2] },
  thorncub: { scale: 1.06, primary: [0.38, 0.7, 0.28], secondary: [0.2, 0.38, 0.16] },
  lilypadra: { scale: 1.03, primary: [0.42, 0.78, 0.44], secondary: [0.16, 0.4, 0.2] },
};

export function interpolateCreatureRenderState(
  prev: CreaturePublicState,
  curr: CreaturePublicState,
  t: number,
): CreatureRenderState {
  const speed = Math.min(Math.hypot(curr.x - prev.x, curr.z - prev.z) / TICK_SECONDS, MAX_WALK_SPEED);
  const traits = TRAITS[curr.speciesId];
  return {
    ...curr,
    x: lerp(prev.x, curr.x, t),
    y: lerp(prev.y, curr.y, t),
    z: lerp(prev.z, curr.z, t),
    yaw: lerpAngle(prev.yaw, curr.yaw, t),
    walkSpeed: t < 1 ? speed : 0,
    phaseOffset: hashToPhase(curr.id),
    scale: traits.scale,
    primaryColor: traits.primary,
    secondaryColor: traits.secondary,
  };
}

export function packCreatureRenderStates(creatures: CreatureRenderState[], buffers: GpuBuffers): number {
  const count = creatures.length;
  const offsets = ensureBuffer(buffers, "aOffset", count * 4);
  const motion = ensureBuffer(buffers, "aMotion", count * 2);
  const scales = ensureBuffer(buffers, "aScale", count);
  const primary = ensureBuffer(buffers, "aPrimaryColor", count * 3);
  const secondary = ensureBuffer(buffers, "aSecondaryColor", count * 3);

  for (let i = 0; i < count; i++) {
    const c = creatures[i];
    if (!c) continue;
    offsets[i * 4] = c.x;
    offsets[i * 4 + 1] = c.y;
    offsets[i * 4 + 2] = c.z;
    offsets[i * 4 + 3] = c.yaw;

    motion[i * 2] = c.walkSpeed;
    motion[i * 2 + 1] = c.phaseOffset;

    scales[i] = c.scale;

    primary[i * 3] = c.primaryColor[0];
    primary[i * 3 + 1] = c.primaryColor[1];
    primary[i * 3 + 2] = c.primaryColor[2];

    secondary[i * 3] = c.secondaryColor[0];
    secondary[i * 3 + 1] = c.secondaryColor[1];
    secondary[i * 3 + 2] = c.secondaryColor[2];
  }

  return count;
}

function hashToPhase(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}
