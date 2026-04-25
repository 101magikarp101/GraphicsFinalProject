import type { StatusCondition } from "./creature-moves";
import type { CreatureSpeciesId } from "./creature-species";

export interface CreaturePublicState {
  id: string;
  speciesId: CreatureSpeciesId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  level: number;
  hp: number;
  maxHp: number;
  isWild: boolean;
  status: StatusCondition;
}
