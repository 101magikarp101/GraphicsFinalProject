import { describe, expect, it } from "vitest";
import { calculateDamage, MOVE_LIBRARY_BY_ID, rollStatusApplication } from "@/game/creature-moves";
import { createCreatureState, experienceForLevel, gainExperience } from "@/game/creature-progression";
import { CREATURE_SPECIES, speciesCountByType } from "@/game/creature-species";

describe("creature species domain", () => {
  it("contains 15 original starter-phase species", () => {
    expect(CREATURE_SPECIES).toHaveLength(15);
    const counts = speciesCountByType();
    expect(counts.fire).toBe(5);
    expect(counts.water).toBe(5);
    expect(counts.grass).toBe(5);
  });
});

describe("move and damage domain", () => {
  it("calculates higher damage for super-effective moves", () => {
    const baseStats = {
      level: 10,
      attack: 22,
      defense: 18,
      specialAttack: 24,
      specialDefense: 20,
    };
    const fireIntoGrass = calculateDamage({
      attackerStats: baseStats,
      defenderStats: baseStats,
      moveId: "ember_jolt",
      attackerTypes: ["fire"],
      defenderTypes: ["grass"],
      randomFactor: 1,
    });
    const fireIntoWater = calculateDamage({
      attackerStats: baseStats,
      defenderStats: baseStats,
      moveId: "ember_jolt",
      attackerTypes: ["fire"],
      defenderTypes: ["water"],
      randomFactor: 1,
    });

    expect(fireIntoGrass).toBeGreaterThan(fireIntoWater);
  });

  it("supports status-roll helper", () => {
    expect(MOVE_LIBRARY_BY_ID.spore_burst.effectId).toBe("poison");
    expect(rollStatusApplication("spore_burst", 0.1)).toBe("poison");
    expect(rollStatusApplication("spore_burst", 0.9)).toBe("none");
  });
});

describe("creature progression domain", () => {
  it("uses monotonic xp curves", () => {
    expect(experienceForLevel(10, "fast")).toBeLessThan(experienceForLevel(10, "medium"));
    expect(experienceForLevel(10, "medium")).toBeLessThan(experienceForLevel(10, "slow"));
    expect(experienceForLevel(20, "medium")).toBeGreaterThan(experienceForLevel(10, "medium"));
  });

  it("levels creatures and learns moves", () => {
    const creature = createCreatureState({ id: "c1", speciesId: "emberlynx", level: 1, ownerPlayerId: "p1" });
    const beforeLevel = creature.stats.level;
    const targetXp = experienceForLevel(beforeLevel + 4, creature.growthCurve);
    const gain = gainExperience(creature, targetXp - creature.stats.experience);

    expect(creature.stats.level).toBeGreaterThan(beforeLevel);
    expect(gain.levelsGained).toBeGreaterThan(0);
    expect(creature.knownMoves.length).toBeGreaterThan(0);
    expect(creature.knownMoves.length).toBeLessThanOrEqual(4);
    expect(creature.stats.hp).toBeLessThanOrEqual(creature.stats.maxHp);
  });
});
