import type { CreaturePublicState } from "@/game/creature";
import { CREATURE_MODEL_DESCRIPTOR_BY_ID } from "@/game/creature-model-descriptor";
import { lerp, lerpAngle } from "@/utils/interpolations";
import type { GpuBuffers } from "./pipeline";
import { ensureBuffer } from "./pipeline";

const TICK_SECONDS = 0.05;
const MAX_WALK_SPEED = 4;

export interface CreatureRenderState extends CreaturePublicState {
  walkSpeed: number;
  phaseOffset: number;
  moveDirLocal: number;
  scale: number;
  primaryColor: [number, number, number];
  secondaryColor: [number, number, number];
  morphA: [number, number, number, number];
  morphB: [number, number, number, number];
  morphC: [number, number, number, number];
  animProfile: [number, number, number];
}

export function interpolateCreatureRenderState(
  prev: CreaturePublicState,
  curr: CreaturePublicState,
  t: number,
): CreatureRenderState {
  const vx = (curr.x - prev.x) / TICK_SECONDS;
  const vz = (curr.z - prev.z) / TICK_SECONDS;
  const speed = Math.min(Math.hypot(vx, vz), MAX_WALK_SPEED);
  const forwardX = Math.sin(curr.yaw);
  const forwardZ = -Math.cos(curr.yaw);
  const rightX = Math.cos(curr.yaw);
  const rightZ = Math.sin(curr.yaw);
  const localForward = vx * forwardX + vz * forwardZ;
  const localStrafe = vx * rightX + vz * rightZ;
  const moveDirLocal = speed > 0.05 ? Math.atan2(localStrafe, localForward) : 0;
  const descriptor = CREATURE_MODEL_DESCRIPTOR_BY_ID[curr.speciesId];
  const render = descriptor.render;
  return {
    ...curr,
    x: lerp(prev.x, curr.x, t),
    y: lerp(prev.y, curr.y, t),
    z: lerp(prev.z, curr.z, t),
    yaw: lerpAngle(prev.yaw, curr.yaw, t),
    walkSpeed: t < 1 ? speed : 0,
    phaseOffset: hashToPhase(curr.id),
    moveDirLocal,
    scale: render.worldScale,
    primaryColor: [...render.primary],
    secondaryColor: [...render.secondary],
    morphA: [...render.morphA],
    morphB: [...render.morphB],
    morphC: [...render.morphC],
    animProfile: [...render.anim],
  };
}

export function packCreatureRenderStates(creatures: CreatureRenderState[], buffers: GpuBuffers): number {
  const count = creatures.length;
  const offsets = ensureBuffer(buffers, "aOffset", count * 4);
  const motion = ensureBuffer(buffers, "aMotion", count * 3);
  const scales = ensureBuffer(buffers, "aScale", count);
  const primary = ensureBuffer(buffers, "aPrimaryColor", count * 3);
  const secondary = ensureBuffer(buffers, "aSecondaryColor", count * 3);
  const morphA = ensureBuffer(buffers, "aMorphA", count * 4);
  const morphB = ensureBuffer(buffers, "aMorphB", count * 4);
  const morphC = ensureBuffer(buffers, "aMorphC", count * 4);
  const animProfile = ensureBuffer(buffers, "aAnimProfile", count * 3);

  for (let i = 0; i < count; i++) {
    const c = creatures[i];
    if (!c) continue;
    offsets[i * 4] = c.x;
    offsets[i * 4 + 1] = c.y;
    offsets[i * 4 + 2] = c.z;
    offsets[i * 4 + 3] = c.yaw;

    motion[i * 3] = c.walkSpeed;
    motion[i * 3 + 1] = c.phaseOffset;
    motion[i * 3 + 2] = c.moveDirLocal;

    scales[i] = c.scale;

    primary[i * 3] = c.primaryColor[0];
    primary[i * 3 + 1] = c.primaryColor[1];
    primary[i * 3 + 2] = c.primaryColor[2];

    secondary[i * 3] = c.secondaryColor[0];
    secondary[i * 3 + 1] = c.secondaryColor[1];
    secondary[i * 3 + 2] = c.secondaryColor[2];

    morphA[i * 4] = c.morphA[0];
    morphA[i * 4 + 1] = c.morphA[1];
    morphA[i * 4 + 2] = c.morphA[2];
    morphA[i * 4 + 3] = c.morphA[3];

    morphB[i * 4] = c.morphB[0];
    morphB[i * 4 + 1] = c.morphB[1];
    morphB[i * 4 + 2] = c.morphB[2];
    morphB[i * 4 + 3] = c.morphB[3];

    morphC[i * 4] = c.morphC[0];
    morphC[i * 4 + 1] = c.morphC[1];
    morphC[i * 4 + 2] = c.morphC[2];
    morphC[i * 4 + 3] = c.morphC[3];

    animProfile[i * 3] = c.animProfile[0];
    animProfile[i * 3 + 1] = c.animProfile[1];
    animProfile[i * 3 + 2] = c.animProfile[2];
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
