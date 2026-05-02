import type { CreaturePublicState } from "@/game/creature";
import creatureFSText from "../render/shaders/creature.frag";
import creatureVSText from "../render/shaders/creature.vert";
import creatureHighlightFSText from "../render/shaders/creature-highlight.frag";
import creatureHighlightVSText from "../render/shaders/creature-highlight.vert";
import { createCreatureModelGeometry } from "./creature-model";
import {
  type CreatureRenderState,
  interpolateCreatureRenderState,
  packCreatureRenderStates,
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
    { name: "aMotion", size: 3 },
    { name: "aScale", size: 1 },
    { name: "aPrimaryColor", size: 3 },
    { name: "aSecondaryColor", size: 3 },
    { name: "aMorphA", size: 4 },
    { name: "aMorphB", size: 4 },
    { name: "aMorphC", size: 4 },
    { name: "aAnimProfile", size: 3 },
  ],
};

export const creatureHighlightPassDef: EntityPassDef = {
  key: "creatures-highlight",
  vertexShader: creatureHighlightVSText,
  fragmentShader: creatureHighlightFSText,
  geometry: creatureGeometry,
  instancedAttributes: [
    { name: "aOffset", size: 4 },
    { name: "aMotion", size: 3 },
    { name: "aScale", size: 1 },
    { name: "aPrimaryColor", size: 3 },
    { name: "aSecondaryColor", size: 3 },
    { name: "aMorphA", size: 4 },
    { name: "aMorphB", size: 4 },
    { name: "aMorphC", size: 4 },
    { name: "aAnimProfile", size: 3 },
  ],
  cullFace: false,
  depthTest: false,
  blendAlpha: true,
};
