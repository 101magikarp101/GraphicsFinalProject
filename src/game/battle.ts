import type { StatusCondition } from "./creature-moves";
import type { CreatureSpeciesId } from "./creature-species";

export interface StarterCreatureState {
  speciesId: CreatureSpeciesId;
  level: number;
  experience: number;
  hp: number;
  maxHp: number;
  knownMoves: string[];
  status: StatusCondition;
}

export interface BattleCreatureState {
  id: string;
  speciesId: CreatureSpeciesId;
  level: number;
  hp: number;
  maxHp: number;
  status: StatusCondition;
}

export interface BattleSessionState {
  active: boolean;
  battleId: string;
  turn: number;
  canSelectMove: boolean;
  availableMoves: string[];
  starter: BattleCreatureState;
  wild: BattleCreatureState;
  log: string[];
}
