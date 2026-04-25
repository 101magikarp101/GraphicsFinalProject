export const CREATURE_TYPES = [
  "normal",
  "fire",
  "water",
  "grass",
  "electric",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

export type CreatureType = (typeof CREATURE_TYPES)[number];

export const TYPE_EFFECTIVENESS_SUPER = 1.5;
export const TYPE_EFFECTIVENESS_RESISTED = 0.5;
export const TYPE_EFFECTIVENESS_NEUTRAL = 1;

const FIRE_RULES: Partial<Record<CreatureType, number>> = {
  grass: TYPE_EFFECTIVENESS_SUPER,
  water: TYPE_EFFECTIVENESS_RESISTED,
  fire: TYPE_EFFECTIVENESS_RESISTED,
};

const WATER_RULES: Partial<Record<CreatureType, number>> = {
  fire: TYPE_EFFECTIVENESS_SUPER,
  grass: TYPE_EFFECTIVENESS_RESISTED,
  water: TYPE_EFFECTIVENESS_RESISTED,
};

const GRASS_RULES: Partial<Record<CreatureType, number>> = {
  water: TYPE_EFFECTIVENESS_SUPER,
  fire: TYPE_EFFECTIVENESS_RESISTED,
  grass: TYPE_EFFECTIVENESS_RESISTED,
};

const RULES_BY_ATTACK_TYPE: Partial<Record<CreatureType, Partial<Record<CreatureType, number>>>> = {
  fire: FIRE_RULES,
  water: WATER_RULES,
  grass: GRASS_RULES,
};

export function isCreatureType(value: string): value is CreatureType {
  return (CREATURE_TYPES as readonly string[]).includes(value);
}

export function getTypeEffectiveness(attackType: CreatureType, defenderType: CreatureType): number {
  const rules = RULES_BY_ATTACK_TYPE[attackType];
  if (!rules) return TYPE_EFFECTIVENESS_NEUTRAL;
  return rules[defenderType] ?? TYPE_EFFECTIVENESS_NEUTRAL;
}

export function getDualTypeEffectiveness(
  attackType: CreatureType,
  defenderTypes: readonly [CreatureType, CreatureType?],
): number {
  const [primary, secondary] = defenderTypes;
  const first = getTypeEffectiveness(attackType, primary);
  if (!secondary) return first;
  return first * getTypeEffectiveness(attackType, secondary);
}
