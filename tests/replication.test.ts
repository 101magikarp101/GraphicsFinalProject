import { describe, expect, it } from "vitest";
import { ClientEntity } from "../src/client/replication.js";
import { Player, playerDistanceSq } from "../src/game/player.js";

describe("ClientEntity", () => {
  it("leaves local state alone when authoritative matches", () => {
    const player = new Player({ id: "p1", x: 10, y: 100, z: 20 });
    const replicated = new ClientEntity(player, playerDistanceSq);

    replicated.reconcile({ id: "p1", x: 10, y: 100, z: 20 });

    expect(player.state.x).toBeCloseTo(10);
    expect(player.state.z).toBeCloseTo(20);
  });

  it("ignores small drift under the default threshold", () => {
    const player = new Player({ id: "p1", x: 0, y: 100, z: 0 });
    const replicated = new ClientEntity(player, playerDistanceSq);

    replicated.reconcile({ id: "p1", x: 1, y: 100, z: 1 });

    expect(player.state.x).toBeCloseTo(0);
    expect(player.state.z).toBeCloseTo(0);
  });

  it("snaps to authoritative state when drift exceeds threshold", () => {
    const player = new Player({ id: "p1", x: 0, y: 100, z: 0 });
    const replicated = new ClientEntity(player, playerDistanceSq);

    replicated.reconcile({ id: "p1", x: 50, y: 100, z: 50 });

    expect(player.state.x).toBeCloseTo(50);
    expect(player.state.z).toBeCloseTo(50);
  });

  it("respects a custom threshold", () => {
    const player = new Player({ id: "p1", x: 0, y: 100, z: 0 });
    const replicated = new ClientEntity(player, playerDistanceSq, 100);

    replicated.reconcile({ id: "p1", x: 5, y: 100, z: 5 });

    expect(player.state.x).toBeCloseTo(0);
    expect(player.state.z).toBeCloseTo(0);
  });
});
