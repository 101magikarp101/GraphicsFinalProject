import type { CreaturePublicState } from "@/game/creature";
import creatureFSText from "../render/shaders/creature.frag";
import creatureHighlightFSText from "../render/shaders/creature-highlight.frag";
import creatureHighlightVSText from "../render/shaders/creature-highlight.vert";
import creatureVSText from "../render/shaders/creature.vert";
import { createCreatureModelGeometry } from "./creature-model";
import {
  interpolateCreatureRenderState,
  packCreatureRenderStates,
  type CreatureRenderState,
} from "./creature-render-state";
import type { EntityPassDef, EntityPipelineConfig } from "./pipeline";

const creatureGeometry = createCreatureModelGeometry();

export const creaturePipelineConfig: EntityPipelineConfig<CreaturePublicState, CreatureRenderState> = {
  interpolate: interpolateCreatureRenderState,
  pack: packCreatureRenderStates,
};

export const creaturePassDef: EntityPassDef = {
  key: "creatures",
  vertexShader: creatureVSText,
  fragmentShader: creatureFSText,
  geometry: creatureGeometry,
  instancedAttributes: [
    { name: "aOffset", size: 4 },
    { name: "aMotion", size: 2 },
    { name: "aScale", size: 1 },
    { name: "aPrimaryColor", size: 3 },
    { name: "aSecondaryColor", size: 3 },
  ],
};

export const creatureHighlightPassDef: EntityPassDef = {
  key: "creatures-highlight",
  vertexShader: creatureHighlightVSText,
  fragmentShader: creatureHighlightFSText,
  geometry: creatureGeometry,
  instancedAttributes: [
    { name: "aOffset", size: 4 },
    { name: "aMotion", size: 2 },
    { name: "aScale", size: 1 },
    { name: "aPrimaryColor", size: 3 },
    { name: "aSecondaryColor", size: 3 },
  ],
  cullFace: false,
  depthTest: false,
  blendAlpha: true,
};
