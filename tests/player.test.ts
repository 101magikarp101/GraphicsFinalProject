import { Vec3 } from "gl-matrix";
import { describe, expect, it } from "vitest";
import { PLAYER_SPEED, Player } from "../src/game/player.js";

describe("Player", () => {
  it("initializes with given position", () => {
    const player = new Player("p1", new Vec3([10, 20, 30]));
    expect(player.id).toBe("p1");
    expect(player.position.x).toBeCloseTo(10);
    expect(player.position.y).toBeCloseTo(20);
    expect(player.position.z).toBeCloseTo(30);
  });

  it("moves in the given direction", () => {
    const player = new Player("p1", new Vec3([0, 0, 0]));
    player.move(new Vec3([1, 0, 0]));
    expect(player.position.x).toBeCloseTo(PLAYER_SPEED);
    expect(player.position.y).toBeCloseTo(0);
    expect(player.position.z).toBeCloseTo(0);
  });

  it("zeroes the y component of movement direction", () => {
    const player = new Player("p1", new Vec3([0, 50, 0]));
    player.move(new Vec3([0, 10, 0]));
    // y direction is zeroed, so no movement at all (zero-length dir)
    expect(player.position.x).toBeCloseTo(0);
    expect(player.position.y).toBeCloseTo(50);
    expect(player.position.z).toBeCloseTo(0);
  });

  it("normalizes direction so diagonal movement isn't faster", () => {
    const player = new Player("p1", new Vec3([0, 0, 0]));
    player.move(new Vec3([1, 0, 1]));
    const dist = Math.sqrt(
      player.position.x * player.position.x + player.position.z * player.position.z,
    );
    expect(dist).toBeCloseTo(PLAYER_SPEED);
  });

  it("does not move on zero-length direction", () => {
    const player = new Player("p1", new Vec3([5, 10, 15]));
    player.move(new Vec3([0, 0, 0]));
    expect(player.position.x).toBeCloseTo(5);
    expect(player.position.y).toBeCloseTo(10);
    expect(player.position.z).toBeCloseTo(15);
  });

  it("produces identical results regardless of caller", () => {
    const clientPlayer = new Player("p1", new Vec3([0, 100, 0]));
    const serverPlayer = new Player("p1", new Vec3([0, 100, 0]));
    const direction = new Vec3([0.5, 0, -0.5]);

    clientPlayer.move(direction);
    serverPlayer.move(direction);

    expect(clientPlayer.position.x).toBeCloseTo(serverPlayer.position.x);
    expect(clientPlayer.position.y).toBeCloseTo(serverPlayer.position.y);
    expect(clientPlayer.position.z).toBeCloseTo(serverPlayer.position.z);
  });
});
