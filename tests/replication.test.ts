import { describe, expect, it } from "vitest";
import { ClientEntity } from "../src/client/replication.js";
import { PLAYER_SPEED, Player, playerDistanceSq } from "../src/game/player.js";

function makeReplicated(x = 0, z = 0) {
  const player = new Player({ id: "p1", x, y: 100, z });
  return { player, replicated: new ClientEntity(player, playerDistanceSq) };
}

describe("ClientEntity", () => {
  it("leaves local state alone when authoritative matches", () => {
    const { player, replicated } = makeReplicated(10, 20);
    replicated.reconcile({ id: "p1", x: 10, y: 100, z: 20 }, 0);
    expect(player.state.x).toBeCloseTo(10);
    expect(player.state.z).toBeCloseTo(20);
  });

  it("ignores small drift under the default threshold", () => {
    const { player, replicated } = makeReplicated();
    replicated.reconcile({ id: "p1", x: 1, y: 100, z: 1 }, 0);
    expect(player.state.x).toBeCloseTo(0);
    expect(player.state.z).toBeCloseTo(0);
  });

  it("snaps to authoritative state when drift exceeds threshold", () => {
    const { player, replicated } = makeReplicated();
    replicated.reconcile({ id: "p1", x: 50, y: 100, z: 50 }, 0);
    expect(player.state.x).toBeCloseTo(50);
    expect(player.state.z).toBeCloseTo(50);
  });

  it("replays unacknowledged inputs after snap", () => {
    const { player, replicated } = makeReplicated();

    replicated.predict({ dx: 1, dz: 0 });
    replicated.predict({ dx: 1, dz: 0 });
    replicated.predict({ dx: 1, dz: 0 });

    // Server acks 1 input and says player is at PLAYER_SPEED
    // Client has 2 unacked inputs remaining — those get replayed
    replicated.reconcile({ id: "p1", x: PLAYER_SPEED, y: 100, z: 0 }, 1);

    expect(player.state.x).toBeCloseTo(PLAYER_SPEED * 3);
  });

  it("no-ops reconciliation when prediction matches server", () => {
    const { player, replicated } = makeReplicated();

    replicated.predict({ dx: 1, dz: 0 });
    replicated.predict({ dx: 1, dz: 0 });

    // Server acks both and agrees with client position — no snap
    replicated.reconcile({ id: "p1", x: PLAYER_SPEED * 2, y: 100, z: 0 }, 2);

    expect(player.state.x).toBeCloseTo(PLAYER_SPEED * 2);
  });

  it("corrects misprediction by resetting and replaying", () => {
    const { player, replicated } = makeReplicated();

    replicated.predict({ dx: 1, dz: 0 });
    replicated.predict({ dx: 1, dz: 0 });

    // Server says player was blocked at x=0 after first input (e.g. collision)
    // but acks 1 input — 1 unacked input remains
    replicated.reconcile({ id: "p1", x: 0, y: 100, z: 0 }, 1);

    // After replay of the 1 remaining input, player is at PLAYER_SPEED from 0
    expect(player.state.x).toBeCloseTo(PLAYER_SPEED);
  });

  it("trims history correctly across multiple reconciliations", () => {
    const { player, replicated } = makeReplicated();

    replicated.predict({ dx: 1, dz: 0 });
    replicated.predict({ dx: 0, dz: 1 });
    replicated.predict({ dx: 1, dz: 0 });

    // First reconciliation: server acks 1
    replicated.reconcile({ id: "p1", x: PLAYER_SPEED, y: 100, z: 0 }, 1);

    replicated.predict({ dx: 0, dz: 1 });

    // Second reconciliation: server acks 3 total (2 more since last)
    const expectedZ = PLAYER_SPEED;
    replicated.reconcile({ id: "p1", x: PLAYER_SPEED * 2, y: 100, z: expectedZ }, 3);

    // 1 unacked input remaining: {dx: 0, dz: 1}
    expect(player.state.x).toBeCloseTo(PLAYER_SPEED * 2);
    expect(player.state.z).toBeCloseTo(expectedZ + PLAYER_SPEED);
  });
});
