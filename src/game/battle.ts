import type { StatusCondition } from "./creature-moves";
import type { CreatureSpeciesId } from "./creature-species";

export type BattlePhase = "selecting" | "resolving";
export type BattleActor = "starter" | "wild";
export type BattleMoveVisualKind = "projectile" | "melee" | "status";

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
  experience?: number;
  nextLevelExperience?: number;
  hp: number;
  maxHp: number;
  status: StatusCondition;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface BattleTurnVisualAction {
  actor: BattleActor;
  moveId: string;
  moveName: string;
  visualKind: BattleMoveVisualKind;
  hit: boolean;
  damage: number;
  targetHpAfter: number;
  statusApplied: StatusCondition;
  startsAtMs: number;
  impactAtMs: number;
  endsAtMs: number;
}

export interface BattleTurnAnimation {
  sequence: number;
  turn: number;
  startedAtMs: number;
  durationMs: number;
  actions: BattleTurnVisualAction[];
}

export interface BattleSessionState {
  active: boolean;
  battleId: string;
  phase: BattlePhase;
  revision: number;
  serverNowMs: number;
  turn: number;
  canSelectMove: boolean;
  availableMoves: string[];
  starter: BattleCreatureState;
  wild: BattleCreatureState;
  lastTurnAnimation?: BattleTurnAnimation;
  log: string[];
}
