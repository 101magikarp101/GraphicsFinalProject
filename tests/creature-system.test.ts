import { describe, expect, it } from "vitest";
import { CubeType } from "@/client/engine/render/cube-types";
import { Biome } from "@/game/biome";
import { CHUNK_HEIGHT, CHUNK_SIZE } from "@/game/chunk";
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

  it("places spawned creatures on solid surfaces with air clearance", () => {
    const blocks = new Uint8Array(CHUNK_HEIGHT * CHUNK_SIZE * CHUNK_SIZE);
    const heightMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const localX = 12 + CHUNK_SIZE / 2;
    const localZ = 16 + CHUNK_SIZE / 2;
    const surfaceY = 69;
    heightMap[localZ * CHUNK_SIZE + localX] = surfaceY;
    blocks[surfaceY * CHUNK_SIZE * CHUNK_SIZE + localZ * CHUNK_SIZE + localX] = CubeType.Grass;

    const fakeChunk = {
      terrainHeightMap: heightMap,
      heightMap,
      getBlock: (x: number, y: number, z: number) =>
        (blocks[y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x] ?? CubeType.Air) as CubeType,
      placedObjects: () => [
        {
          type: PlacedObjectType.EnemySpawn,
          category: PlacedObjectCategory.Gameplay,
          x: 12,
          y: 0,
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
      getChunk: () => fakeChunk,
    };
    const fakePlayerSystem = {
      getPlayerPosition: (_playerId: string) => ({ x: 10, y: 70, z: 10 }),
    };
    const system = new CreatureSystem(fakeChunkStorage as never, fakePlayerSystem as never);
    system.setOnlinePlayers(["p1"]);

    expect(system.tick()).toBe(true);

    const packets = system.packetsFor("p1", { onlinePlayerIds: new Set(["p1"]) });
    const spawnPacket = packets.find((packet) => packet.type === "creatureSpawn");
    expect(spawnPacket).toBeDefined();
    if (!spawnPacket || spawnPacket.type !== "creatureSpawn") return;
    expect(spawnPacket.creatures[0]?.y).toBe(surfaceY + 1);
  });
});
