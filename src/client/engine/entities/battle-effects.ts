import { Quad } from "../render/quad";
import battleEffectFSText from "../render/shaders/battleEffect.frag";
import battleEffectVSText from "../render/shaders/battleEffect.vert";
import type { EntityPassDef, GpuBuffers } from "./pipeline";
import { ensureBuffer } from "./pipeline";

export interface BattleEffectInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  color: readonly [number, number, number, number];
}

const quad = new Quad();

export function packBattleEffects(effects: readonly BattleEffectInstance[], buffers: GpuBuffers): number {
  const count = effects.length;
  const offsets = ensureBuffer(buffers, "aOffset", count * 4);
  const colors = ensureBuffer(buffers, "aColor", count * 4);

  for (let i = 0; i < count; i++) {
    const effect = effects[i];
    if (!effect) continue;
    offsets[i * 4] = effect.x;
    offsets[i * 4 + 1] = effect.y;
    offsets[i * 4 + 2] = effect.z;
    offsets[i * 4 + 3] = effect.scale;

    colors[i * 4] = effect.color[0];
    colors[i * 4 + 1] = effect.color[1];
    colors[i * 4 + 2] = effect.color[2];
    colors[i * 4 + 3] = effect.color[3];
  }

  return count;
}

export const battleEffectPassDef: EntityPassDef = {
  key: "battle-effects",
  vertexShader: battleEffectVSText,
  fragmentShader: battleEffectFSText,
  geometry: {
    positions: quad.positionsFlat(),
    indices: quad.indicesFlat(),
    normals: quad.normalsFlat(),
    uvs: quad.uvFlat(),
  },
  instancedAttributes: [
    { name: "aOffset", size: 4 },
    { name: "aColor", size: 4 },
  ],
  cullFace: false,
  blendAlpha: true,
};
