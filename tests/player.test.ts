import { describe, expect, it } from "vitest";
import { PLAYER_SPEED, Player } from "../src/game/player";

describe("Player", () => {
  it("initializes with given position", () => {
    const player = new Player({ id: "p1", x: 10, y: 20, z: 30 });
    expect(player.id).toBe("p1");
    expect(player.state.x).toBeCloseTo(10);
    expect(player.state.y).toBeCloseTo(20);
    expect(player.state.z).toBeCloseTo(30);
  });

  it("steps in the given direction", () => {
    const player = new Player({ id: "p1", x: 0, y: 0, z: 0 });
    player.step({ dx: 1, dz: 0 });
    expect(player.state.x).toBeCloseTo(PLAYER_SPEED);
    expect(player.state.y).toBeCloseTo(0);
    expect(player.state.z).toBeCloseTo(0);
  });

  it("normalizes direction so diagonal movement isn't faster", () => {
    const player = new Player({ id: "p1", x: 0, y: 0, z: 0 });
    player.step({ dx: 1, dz: 1 });
    const dist = Math.sqrt(player.state.x * player.state.x + player.state.z * player.state.z);
    expect(dist).toBeCloseTo(PLAYER_SPEED);
  });

  it("does not move on zero-length input", () => {
    const player = new Player({ id: "p1", x: 5, y: 10, z: 15 });
    player.step({ dx: 0, dz: 0 });
    expect(player.state.x).toBeCloseTo(5);
    expect(player.state.y).toBeCloseTo(10);
    expect(player.state.z).toBeCloseTo(15);
  });

  it("is deterministic across instances", () => {
    const a = new Player({ id: "p1", x: 0, y: 100, z: 0 });
    const b = new Player({ id: "p1", x: 0, y: 100, z: 0 });
    const input = { dx: 0.5, dz: -0.5 };
    a.step(input);
    b.step(input);
    expect(a.state.x).toBeCloseTo(b.state.x);
    expect(a.state.z).toBeCloseTo(b.state.z);
  });
});
