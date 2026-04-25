import type { MoveId } from "./creature-moves";
import type { CreatureType } from "./creature-types";

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface LearnsetEntry {
  level: number;
  moveId: MoveId;
}

export interface CreatureSpecies {
  id: string;
  name: string;
  types: readonly [CreatureType, CreatureType?];
  baseStats: BaseStats;
  learnset: readonly LearnsetEntry[];
}

const SPECIES = [
  {
    id: "emberlynx",
    name: "Emberlynx",
    types: ["fire"] as const,
    baseStats: { hp: 44, attack: 56, defense: 40, specialAttack: 60, specialDefense: 42, speed: 64 },
    learnset: [
      { level: 1, moveId: "quick_tap" },
      { level: 1, moveId: "ember_jolt" },
      { level: 7, moveId: "smoke_veil" },
      { level: 12, moveId: "flame_rush" },
    ],
  },
  {
    id: "cindercub",
    name: "Cindercub",
    types: ["fire"] as const,
    baseStats: { hp: 49, attack: 58, defense: 45, specialAttack: 52, specialDefense: 45, speed: 50 },
    learnset: [
      { level: 1, moveId: "quick_tap" },
      { level: 1, moveId: "ember_jolt" },
      { level: 9, moveId: "flame_rush" },
      { level: 14, moveId: "steady_focus" },
    ],
  },
  {
    id: "pyrrat",
    name: "Pyrrat",
    types: ["fire"] as const,
    baseStats: { hp: 38, attack: 62, defense: 36, specialAttack: 48, specialDefense: 40, speed: 70 },
    learnset: [
      { level: 1, moveId: "quick_tap" },
      { level: 4, moveId: "ember_jolt" },
      { level: 10, moveId: "flame_rush" },
      { level: 16, moveId: "smoke_veil" },
    ],
  },
  {
    id: "forgepup",
    name: "Forgepup",
    types: ["fire"] as const,
    baseStats: { hp: 52, attack: 50, defense: 54, specialAttack: 48, specialDefense: 52, speed: 38 },
    learnset: [
      { level: 1, moveId: "ember_jolt" },
      { level: 1, moveId: "steady_focus" },
      { level: 11, moveId: "flame_rush" },
      { level: 15, moveId: "smoke_veil" },
    ],
  },
  {
    id: "solflit",
    name: "Solflit",
    types: ["fire"] as const,
    baseStats: { hp: 40, attack: 44, defense: 42, specialAttack: 66, specialDefense: 58, speed: 58 },
    learnset: [
      { level: 1, moveId: "ember_jolt" },
      { level: 6, moveId: "smoke_veil" },
      { level: 10, moveId: "flame_rush" },
      { level: 17, moveId: "steady_focus" },
    ],
  },
  {
    id: "rippletoad",
    name: "Rippletoad",
    types: ["water"] as const,
    baseStats: { hp: 48, attack: 44, defense: 52, specialAttack: 56, specialDefense: 55, speed: 45 },
    learnset: [
      { level: 1, moveId: "quick_tap" },
      { level: 1, moveId: "spark_splash" },
      { level: 8, moveId: "mist_shell" },
      { level: 12, moveId: "tidal_ram" },
    ],
  },
  {
    id: "brookit",
    name: "Brookit",
    types: ["water"] as const,
    baseStats: { hp: 42, attack: 46, defense: 44, specialAttack: 60, specialDefense: 53, speed: 62 },
    learnset: [
      { level: 1, moveId: "spark_splash" },
      { level: 5, moveId: "mist_shell" },
      { level: 11, moveId: "tidal_ram" },
      { level: 16, moveId: "steady_focus" },
    ],
  },
  {
    id: "mirefin",
    name: "Mirefin",
    types: ["water"] as const,
    baseStats: { hp: 50, attack: 54, defense: 47, specialAttack: 50, specialDefense: 49, speed: 56 },
    learnset: [
      { level: 1, moveId: "spark_splash" },
      { level: 1, moveId: "quick_tap" },
      { level: 9, moveId: "tidal_ram" },
      { level: 14, moveId: "mist_shell" },
    ],
  },
  {
    id: "glaciermink",
    name: "Glaciermink",
    types: ["water"] as const,
    baseStats: { hp: 46, attack: 40, defense: 48, specialAttack: 62, specialDefense: 61, speed: 58 },
    learnset: [
      { level: 1, moveId: "spark_splash" },
      { level: 7, moveId: "mist_shell" },
      { level: 13, moveId: "tidal_ram" },
      { level: 17, moveId: "steady_focus" },
    ],
  },
  {
    id: "harborhog",
    name: "Harborhog",
    types: ["water"] as const,
    baseStats: { hp: 55, attack: 60, defense: 58, specialAttack: 36, specialDefense: 50, speed: 34 },
    learnset: [
      { level: 1, moveId: "quick_tap" },
      { level: 3, moveId: "spark_splash" },
      { level: 10, moveId: "tidal_ram" },
      { level: 15, moveId: "mist_shell" },
    ],
  },
  {
    id: "spriglyn",
    name: "Spriglyn",
    types: ["grass"] as const,
    baseStats: { hp: 45, attack: 48, defense: 46, specialAttack: 58, specialDefense: 56, speed: 60 },
    learnset: [
      { level: 1, moveId: "vine_snap" },
      { level: 1, moveId: "quick_tap" },
      { level: 8, moveId: "bark_guard" },
      { level: 12, moveId: "spore_burst" },
    ],
  },
  {
    id: "mossmole",
    name: "Mossmole",
    types: ["grass"] as const,
    baseStats: { hp: 52, attack: 55, defense: 52, specialAttack: 40, specialDefense: 46, speed: 38 },
    learnset: [
      { level: 1, moveId: "vine_snap" },
      { level: 5, moveId: "bark_guard" },
      { level: 10, moveId: "spore_burst" },
      { level: 14, moveId: "steady_focus" },
    ],
  },
  {
    id: "peatwing",
    name: "Peatwing",
    types: ["grass"] as const,
    baseStats: { hp: 39, attack: 42, defense: 40, specialAttack: 64, specialDefense: 54, speed: 66 },
    learnset: [
      { level: 1, moveId: "spore_burst" },
      { level: 1, moveId: "vine_snap" },
      { level: 9, moveId: "bark_guard" },
      { level: 15, moveId: "steady_focus" },
    ],
  },
  {
    id: "thorncub",
    name: "Thorncub",
    types: ["grass"] as const,
    baseStats: { hp: 51, attack: 59, defense: 50, specialAttack: 43, specialDefense: 47, speed: 42 },
    learnset: [
      { level: 1, moveId: "vine_snap" },
      { level: 4, moveId: "bark_guard" },
      { level: 11, moveId: "spore_burst" },
      { level: 16, moveId: "quick_tap" },
    ],
  },
  {
    id: "lilypadra",
    name: "Lilypadra",
    types: ["grass"] as const,
    baseStats: { hp: 47, attack: 45, defense: 58, specialAttack: 52, specialDefense: 63, speed: 41 },
    learnset: [
      { level: 1, moveId: "vine_snap" },
      { level: 1, moveId: "bark_guard" },
      { level: 10, moveId: "spore_burst" },
      { level: 14, moveId: "steady_focus" },
    ],
  },
] as const satisfies readonly CreatureSpecies[];

export type CreatureSpeciesId = (typeof SPECIES)[number]["id"];

export const CREATURE_SPECIES: readonly (CreatureSpecies & { id: CreatureSpeciesId })[] = SPECIES;

export const CREATURE_SPECIES_BY_ID = Object.fromEntries(CREATURE_SPECIES.map((species) => [species.id, species])) as Record<
  CreatureSpeciesId,
  CreatureSpecies & { id: CreatureSpeciesId }
>;

export function isCreatureSpeciesId(value: string): value is CreatureSpeciesId {
  return value in CREATURE_SPECIES_BY_ID;
}

export function speciesCountByType() {
  const counts: Partial<Record<CreatureType, number>> = {};
  for (const species of CREATURE_SPECIES) {
    const type = species.types[0];
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}
