import { describe, expect, it } from "vitest";
import {
  getDualTypeEffectiveness,
  getTypeEffectiveness,
  isCreatureType,
  TYPE_EFFECTIVENESS_NEUTRAL,
  TYPE_EFFECTIVENESS_RESISTED,
  TYPE_EFFECTIVENESS_SUPER,
} from "@/game/creature-types";

describe("creature type chart", () => {
  it("validates known types", () => {
    expect(isCreatureType("fire")).toBe(true);
    expect(isCreatureType("water")).toBe(true);
    expect(isCreatureType("grass")).toBe(true);
    expect(isCreatureType("banana")).toBe(false);
  });

  it("applies fire-water-grass interactions", () => {
    expect(getTypeEffectiveness("fire", "grass")).toBe(TYPE_EFFECTIVENESS_SUPER);
    expect(getTypeEffectiveness("fire", "water")).toBe(TYPE_EFFECTIVENESS_RESISTED);
    expect(getTypeEffectiveness("water", "fire")).toBe(TYPE_EFFECTIVENESS_SUPER);
    expect(getTypeEffectiveness("grass", "water")).toBe(TYPE_EFFECTIVENESS_SUPER);
  });

  it("falls back to neutral for unimplemented interactions", () => {
    expect(getTypeEffectiveness("electric", "rock")).toBe(TYPE_EFFECTIVENESS_NEUTRAL);
  });

  it("combines dual typing multipliers", () => {
    expect(getDualTypeEffectiveness("fire", ["grass", "water"])).toBe(0.75);
  });
});
