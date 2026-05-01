import { type CreatureType, getDualTypeEffectiveness } from "./creature-types";

export type MoveCategory = "physical" | "special" | "status";
export type StatusCondition = "none" | "burn" | "poison" | "paralysis" | "sleep";

export interface BattleStats {
  level: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
}

export interface MoveDefinition {
  id: string;
  name: string;
  type: CreatureType;
  category: MoveCategory;
  basePower: number;
  accuracy: number;
  pp: number;
  priority: number;
  effectId?: string;
  statusChance?: number;
}

const MOVES = [
  {
    id: "ember_jolt",
    name: "Ember Jolt",
    type: "fire",
    category: "special",
    basePower: 40,
    accuracy: 100,
    pp: 25,
    priority: 0,
    effectId: "burn",
    statusChance: 0.1,
  },
  {
    id: "flame_rush",
    name: "Flame Rush",
    type: "fire",
    category: "physical",
    basePower: 55,
    accuracy: 95,
    pp: 20,
    priority: 0,
  },
  {
    id: "smoke_veil",
    name: "Smoke Veil",
    type: "fire",
    category: "status",
    basePower: 0,
    accuracy: 100,
    pp: 20,
    priority: 0,
    effectId: "evade_up",
  },
  {
    id: "spark_splash",
    name: "Spark Splash",
    type: "water",
    category: "special",
    basePower: 42,
    accuracy: 100,
    pp: 25,
    priority: 0,
  },
  {
    id: "tidal_ram",
    name: "Tidal Ram",
    type: "water",
    category: "physical",
    basePower: 50,
    accuracy: 95,
    pp: 20,
    priority: 0,
  },
  {
    id: "mist_shell",
    name: "Mist Shell",
    type: "water",
    category: "status",
    basePower: 0,
    accuracy: 100,
    pp: 20,
    priority: 0,
    effectId: "def_up",
  },
  {
    id: "vine_snap",
    name: "Vine Snap",
    type: "grass",
    category: "physical",
    basePower: 45,
    accuracy: 100,
    pp: 25,
    priority: 0,
  },
  {
    id: "spore_burst",
    name: "Spore Burst",
    type: "grass",
    category: "special",
    basePower: 48,
    accuracy: 95,
    pp: 20,
    priority: 0,
    effectId: "poison",
    statusChance: 0.15,
  },
  {
    id: "bark_guard",
    name: "Bark Guard",
    type: "grass",
    category: "status",
    basePower: 0,
    accuracy: 100,
    pp: 20,
    priority: 0,
    effectId: "def_up",
  },
  {
    id: "quick_tap",
    name: "Quick Tap",
    type: "normal",
    category: "physical",
    basePower: 35,
    accuracy: 100,
    pp: 30,
    priority: 1,
  },
  {
    id: "steady_focus",
    name: "Steady Focus",
    type: "normal",
    category: "status",
    basePower: 0,
    accuracy: 100,
    pp: 20,
    priority: 0,
    effectId: "atk_up",
  },
] as const satisfies readonly MoveDefinition[];

export type MoveId = (typeof MOVES)[number]["id"];

export const MOVE_LIBRARY: readonly (MoveDefinition & { id: MoveId })[] = MOVES;

export const MOVE_LIBRARY_BY_ID = Object.fromEntries(MOVE_LIBRARY.map((move) => [move.id, move])) as Record<
  MoveId,
  MoveDefinition & { id: MoveId }
>;

export function isMoveId(value: string): value is MoveId {
  return value in MOVE_LIBRARY_BY_ID;
}

export interface DamageArgs {
  attackerStats: BattleStats;
  defenderStats: BattleStats;
  moveId: MoveId;
  attackerTypes: readonly [CreatureType, CreatureType?];
  defenderTypes: readonly [CreatureType, CreatureType?];
  attackerStatus?: StatusCondition;
  randomFactor?: number;
}

export function calculateDamage(args: DamageArgs): number {
  const move = MOVE_LIBRARY_BY_ID[args.moveId];
  if (move.category === "status" || move.basePower <= 0) return 0;

  const level = Math.max(1, Math.trunc(args.attackerStats.level));
  const attackStat = move.category === "physical" ? args.attackerStats.attack : args.attackerStats.specialAttack;
  const defenseStat = move.category === "physical" ? args.defenderStats.defense : args.defenderStats.specialDefense;

  const base = (((2 * level) / 5 + 2) * move.basePower * Math.max(1, attackStat)) / Math.max(1, defenseStat) / 50 + 2;
  const stab = args.attackerTypes.includes(move.type) ? 1.2 : 1;
  const effectiveness = getDualTypeEffectiveness(move.type, args.defenderTypes);
  const randomFactor = clampRandomFactor(args.randomFactor ?? 1);
  const burnPenalty = args.attackerStatus === "burn" && move.category === "physical" ? 0.5 : 1;

  return Math.max(1, Math.floor(base * stab * effectiveness * randomFactor * burnPenalty));
}

export function rollStatusApplication(moveId: MoveId, rng01: number): StatusCondition {
  const move = MOVE_LIBRARY_BY_ID[moveId];
  if (!move.effectId || move.statusChance == null || move.statusChance <= 0) return "none";
  if (rng01 > move.statusChance) return "none";
  if (move.effectId === "burn") return "burn";
  if (move.effectId === "poison") return "poison";
  return "none";
}

function clampRandomFactor(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value < 0.85) return 0.85;
  if (value > 1) return 1;
  return value;
}
