import { describe, expect, it } from "vitest";
import { SceneLighting } from "@/client/engine/scene-lighting";
import { DAY_LENGTH_S } from "@/game/time";

describe("SceneLighting", () => {
  it("aligns displayed noon with overhead daylight", () => {
    const lighting = new SceneLighting();

    lighting.update(DAY_LENGTH_S / 2);

    expect(lighting.lightDirection[1]).toBeGreaterThan(0.99);
    expect(Math.abs(lighting.lightDirection[2] ?? 0)).toBeLessThan(0.01);
    expect(lighting.ambientColor[0]).toBeGreaterThan(0.4);
    expect(lighting.sunColor[0]).toBeGreaterThan(0.9);
  });

  it("keeps displayed midnight dark instead of full daylight", () => {
    const lighting = new SceneLighting();

    lighting.update(0);

    expect(lighting.sunPosition[1]).toBeLessThan(-1900);
    expect(lighting.ambientColor[0]).toBeLessThan(0.1);
    expect(lighting.sunColor[0]).toBeLessThan(0.4);
  });
});
