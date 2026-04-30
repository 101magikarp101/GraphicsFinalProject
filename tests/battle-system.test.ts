import { describe, expect, it } from "vitest";
import { BattleSystem } from "@/game/battle-system";

function createSystem() {
  const fakePlayerSystem = {
    getPlayerPosition: (_playerId: string) => ({ x: 0, y: 70, z: 0 }),
  };

  const fakeCreatureSystem = {
    extractWildCreatureForBattle: (_creatureId: string) => ({
      id: "wild_1",
      speciesId: "mossmole",
      nickname: "Mossmole",
      ownerPlayerId: null,
      isWild: true,
      types: ["grass"] as const,
      growthCurve: "medium" as const,
      stats: {
        level: 5,
        experience: 125,
        hp: 20,
        maxHp: 20,
        attack: 15,
        defense: 12,
        specialAttack: 14,
        specialDefense: 12,
        speed: 10,
      },
      status: "none" as const,
      knownMoves: ["vine_snap", "quick_tap"],
    }),
  };

  return new BattleSystem(fakePlayerSystem as never, fakeCreatureSystem as never);
}

describe("BattleSystem", () => {
  it("enforces starter-first flow before battle", () => {
    const system = createSystem();

    expect(system.startBattle("p1", "wild_1")).toBe(false);
    expect(system.chooseBattleMove("p1", "ember_jolt")).toBe(false);
    expect(system.chooseStarter("p1", "emberlynx")).toBe(true);
    expect(system.chooseStarter("p1", "rippletoad")).toBe(false);

    const packets = system.packetsFor("p1", { onlinePlayerIds: new Set(["p1"]) });
    const starterPacket = packets.find((packet) => packet.type === "starterState");
    expect(starterPacket).toBeDefined();
    if (!starterPacket || starterPacket.type !== "starterState") return;
    expect(starterPacket.starter?.speciesId).toBe("emberlynx");
  });

  it("starts encounter and exposes actionable battle state", () => {
    const system = createSystem();

    expect(system.chooseStarter("p1", "emberlynx")).toBe(true);
    expect(system.startBattle("p1", "wild_1")).toBe(true);
    expect(system.startBattle("p1", "wild_1")).toBe(false);

    const packets = system.packetsFor("p1", { onlinePlayerIds: new Set(["p1"]) });
    const battlePacket = packets.find((packet) => packet.type === "battleState");
    expect(battlePacket).toBeDefined();
    if (!battlePacket || battlePacket.type !== "battleState") return;
    expect(battlePacket.battle?.active).toBe(true);
    expect(battlePacket.battle?.canSelectMove).toBe(true);
    expect((battlePacket.battle?.availableMoves.length ?? 0) > 0).toBe(true);
  });

  it("resolves a selected turn and syncs packets without soft-locking", () => {
    const system = createSystem();

    expect(system.chooseStarter("p1", "emberlynx")).toBe(true);
    expect(system.startBattle("p1", "wild_1")).toBe(true);
    expect(system.chooseBattleMove("p1", "not_a_real_move")).toBe(false);
    expect(system.chooseBattleMove("p1", "ember_jolt")).toBe(true);

    const changed = system.tick();
    expect(changed).toBe(true);

    const packets = system.packetsFor("p1", { onlinePlayerIds: new Set(["p1"]) });
    const starterPacket = packets.find((packet) => packet.type === "starterState");
    const battlePacket = packets.find((packet) => packet.type === "battleState");

    expect(starterPacket).toBeDefined();
    expect(battlePacket).toBeDefined();
    if (!battlePacket || battlePacket.type !== "battleState") return;
    expect(battlePacket.battle === null || battlePacket.battle.active).toBe(true);
  });
});
