import type { StatusCondition } from "./creature-moves";
import { CREATURE_SPECIES_BY_ID, type CreatureSpeciesId } from "./creature-species";
import type { CreatureType } from "./creature-types";

export type GrowthCurve = "fast" | "medium" | "slow";

export interface CreatureStats {
  level: number;
  experience: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface CreatureState {
  id: string;
  speciesId: CreatureSpeciesId;
  nickname: string;
  ownerPlayerId: string | null;
  isWild: boolean;
  types: readonly [CreatureType, CreatureType?];
  growthCurve: GrowthCurve;
  stats: CreatureStats;
  status: StatusCondition;
  knownMoves: string[];
}

export function experienceForLevel(level: number, curve: GrowthCurve): number {
  const l = Math.max(1, Math.min(100, Math.trunc(level)));
  if (curve === "fast") return Math.floor(0.8 * l * l * l);
  if (curve === "slow") return Math.floor(1.25 * l * l * l);
  return l * l * l;
}

export function createCreatureState(args: {
  id: string;
  speciesId: CreatureSpeciesId;
  level: number;
  ownerPlayerId?: string | null;
  nickname?: string;
  growthCurve?: GrowthCurve;
  isWild?: boolean;
}): CreatureState {
  const species = CREATURE_SPECIES_BY_ID[args.speciesId];
  const level = clampLevel(args.level);
  const stats = deriveStats(args.speciesId, level);
  return {
    id: args.id,
    speciesId: args.speciesId,
    nickname: args.nickname ?? species.name,
    ownerPlayerId: args.ownerPlayerId ?? null,
    isWild: args.isWild ?? args.ownerPlayerId == null,
    types: species.types,
    growthCurve: args.growthCurve ?? "medium",
    stats: {
      ...stats,
      level,
      experience: experienceForLevel(level, args.growthCurve ?? "medium"),
      hp: stats.maxHp,
    },
    status: "none",
    knownMoves: getMovesForLevel(args.speciesId, level),
  };
}

export function gainExperience(
  state: CreatureState,
  xp: number,
): {
  levelsGained: number;
  learnedMoves: string[];
} {
  const gained = Math.max(0, Math.trunc(xp));
  if (gained <= 0) return { levelsGained: 0, learnedMoves: [] };

  state.stats.experience += gained;
  let levelsGained = 0;
  const learnedMoves = new Set<string>();

  while (state.stats.level < 100) {
    const requiredForNext = experienceForLevel(state.stats.level + 1, state.growthCurve);
    if (state.stats.experience < requiredForNext) break;

    state.stats.level += 1;
    levelsGained += 1;
    const upgraded = deriveStats(state.speciesId, state.stats.level);
    const hpDelta = upgraded.maxHp - state.stats.maxHp;
    state.stats.maxHp = upgraded.maxHp;
    state.stats.attack = upgraded.attack;
    state.stats.defense = upgraded.defense;
    state.stats.specialAttack = upgraded.specialAttack;
    state.stats.specialDefense = upgraded.specialDefense;
    state.stats.speed = upgraded.speed;
    state.stats.hp = Math.min(state.stats.maxHp, state.stats.hp + Math.max(1, hpDelta));

    for (const move of getMovesLearnedAtLevel(state.speciesId, state.stats.level)) {
      learnedMoves.add(move);
    }
  }

  const orderedMoves = [...learnedMoves];
  if (orderedMoves.length > 0) {
    for (const move of orderedMoves) {
      if (!state.knownMoves.includes(move)) state.knownMoves.push(move);
    }
    if (state.knownMoves.length > 4) {
      state.knownMoves = state.knownMoves.slice(state.knownMoves.length - 4);
    }
  }

  return { levelsGained, learnedMoves: orderedMoves };
}

export function deriveStats(speciesId: CreatureSpeciesId, level: number) {
  const species = CREATURE_SPECIES_BY_ID[speciesId];
  const l = clampLevel(level);
  const hp = Math.floor((2 * species.baseStats.hp * l) / 100 + l + 10);
  const attack = Math.floor((2 * species.baseStats.attack * l) / 100 + 5);
  const defense = Math.floor((2 * species.baseStats.defense * l) / 100 + 5);
  const specialAttack = Math.floor((2 * species.baseStats.specialAttack * l) / 100 + 5);
  const specialDefense = Math.floor((2 * species.baseStats.specialDefense * l) / 100 + 5);
  const speed = Math.floor((2 * species.baseStats.speed * l) / 100 + 5);
  return {
    maxHp: Math.max(1, hp),
    attack: Math.max(1, attack),
    defense: Math.max(1, defense),
    specialAttack: Math.max(1, specialAttack),
    specialDefense: Math.max(1, specialDefense),
    speed: Math.max(1, speed),
  };
}

export function getMovesForLevel(speciesId: CreatureSpeciesId, level: number): string[] {
  const learned = new Set<string>();
  for (const entry of CREATURE_SPECIES_BY_ID[speciesId].learnset) {
    if (entry.level <= level) learned.add(entry.moveId);
  }
  return [...learned].slice(-4);
}

function getMovesLearnedAtLevel(speciesId: CreatureSpeciesId, level: number): string[] {
  return CREATURE_SPECIES_BY_ID[speciesId].learnset
    .filter((entry) => entry.level === level)
    .map((entry) => entry.moveId);
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(100, Math.trunc(level)));
}
