import { Vec3 } from "gl-matrix";
import { describe, expect, it } from "vitest";
import { PLAYER_SPEED, Player } from "../src/game/player.js";

describe("Player", () => {
  it("initializes with given position", () => {
    const player = new Player(false, "p1", 10, 20, 30);
    expect(player.id).toBe("p1");
    expect(player.state.x).toBeCloseTo(10);
    expect(player.state.y).toBeCloseTo(20);
    expect(player.state.z).toBeCloseTo(30);
  });

  it("moves in the given direction", () => {
    const player = new Player(false, "p1", 0, 0, 0);
    player.move(new Vec3([1, 0, 0]));
    expect(player.state.x).toBeCloseTo(PLAYER_SPEED);
    expect(player.state.y).toBeCloseTo(0);
    expect(player.state.z).toBeCloseTo(0);
  });

  it("zeroes the y component of movement direction", () => {
    const player = new Player(false, "p1", 0, 50, 0);
    player.move(new Vec3([0, 10, 0]));
    expect(player.state.x).toBeCloseTo(0);
    expect(player.state.y).toBeCloseTo(50);
    expect(player.state.z).toBeCloseTo(0);
  });

  it("normalizes direction so diagonal movement isn't faster", () => {
    const player = new Player(false, "p1", 0, 0, 0);
    player.move(new Vec3([1, 0, 1]));
    const dist = Math.sqrt(player.state.x * player.state.x + player.state.z * player.state.z);
    expect(dist).toBeCloseTo(PLAYER_SPEED);
  });

  it("does not move on zero-length direction", () => {
    const player = new Player(false, "p1", 5, 10, 15);
    player.move(new Vec3([0, 0, 0]));
    expect(player.state.x).toBeCloseTo(5);
    expect(player.state.y).toBeCloseTo(10);
    expect(player.state.z).toBeCloseTo(15);
  });

  it("produces identical results regardless of caller", () => {
    const clientPlayer = new Player(false, "p1", 0, 100, 0);
    const serverPlayer = new Player(true, "p1", 0, 100, 0);
    const direction = new Vec3([0.5, 0, -0.5]);

    clientPlayer.move(direction);
    serverPlayer.move(direction);

    expect(clientPlayer.state.x).toBeCloseTo(serverPlayer.state.x);
    expect(clientPlayer.state.y).toBeCloseTo(serverPlayer.state.y);
    expect(clientPlayer.state.z).toBeCloseTo(serverPlayer.state.z);
  });
});
