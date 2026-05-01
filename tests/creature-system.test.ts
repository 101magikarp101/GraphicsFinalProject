import { describe, expect, it } from "vitest";
import { Biome } from "@/game/biome";
import { CreatureSystem } from "@/game/creature-system";
import { PlacedObjectCategory, PlacedObjectType } from "@/game/object-placement";

function createSystem() {
  const fakeChunk = {
    placedObjects: () => [
      {
        type: PlacedObjectType.EnemySpawn,
        category: PlacedObjectCategory.Gameplay,
        x: 12,
        y: 70,
        z: 16,
        rotationY: 0,
        scale: 1,
        biome: Biome.Forest,
        chunkOriginX: 0,
        chunkOriginZ: 0,
        renderTypeIndex: 0,
        tags: [],
      },
    ],
  };

  const fakeChunkStorage = {
    loadedChunks: () => new Set([fakeChunk]),
  };

  const fakePlayerSystem = {
    getPlayerPosition: (_playerId: string) => ({ x: 10, y: 70, z: 10 }),
  };

  return new CreatureSystem(fakeChunkStorage as never, fakePlayerSystem as never);
}

describe("CreatureSystem", () => {
  it("spawns and replicates wild creatures for online players", () => {
    const system = createSystem();
    system.setOnlinePlayers(["p1"]);

    const changed = system.tick();
    expect(changed).toBe(true);

    const packets = system.packetsFor("p1", { onlinePlayerIds: new Set(["p1"]) });
    const spawnPacket = packets.find((packet) => packet.type === "creatureSpawn");

    expect(spawnPacket).toBeDefined();
    if (!spawnPacket || spawnPacket.type !== "creatureSpawn") return;
    expect(spawnPacket.creatures.length).toBeGreaterThan(0);
    expect(spawnPacket.creatures[0]?.isWild).toBe(true);
  });
});
