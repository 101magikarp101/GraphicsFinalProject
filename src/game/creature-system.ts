import { eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { CHUNK_SIZE, chunkOrigin } from "@/game/chunk";
import type { ChunkStorage } from "@/game/chunk-storage";
import { CubeType } from "@/client/engine/render/cube-types";
import {
  createCreatureState,
  deriveStats,
  getMovesForLevel,
  type CreatureState,
} from "@/game/creature-progression";
import type { CreaturePublicState } from "@/game/creature";
import { CREATURE_SPECIES, type CreatureSpeciesId } from "@/game/creature-species";
import { PlacedObjectType } from "@/game/object-placement";
import * as schema from "../server/schema";
import type { GameSystem, SystemContext } from "./game-system";
import type { PlayerSystem } from "./player-system";
import type {
  CreatureDespawnPacket,
  CreatureSpawnPacket,
  CreatureStatePacket,
  ServerPacket,
} from "./protocol";

const GLOBAL_WILD_CAP = 5;
const PER_CHUNK_CAP = 2;
const PER_PLAYER_RADIUS = CHUNK_SIZE * 2;
const PER_PLAYER_CAP = 5;
const DESPAWN_RADIUS = CHUNK_SIZE * 3;
const RESPAWN_COOLDOWN_MS = 15_000;
const WANDER_STEP_MAX = 0.22;
const PLAYER_SPAWN_COOLDOWN_MS = 300;
const PLAYER_LOCAL_SPAWN_ATTEMPTS = 16;
const LOCAL_SPAWN_MIN_RADIUS = 4;
const LOCAL_SPAWN_MAX_RADIUS = 12;
const LOCAL_SPAWN_MIN_SEPARATION = 10;
const GOLDEN_ANGLE_RADIANS = 2.399963229728653;

interface CreatureInstance {
  state: CreatureState;
  x: number;
  y: number;
  z: number;
  yaw: number;
  chunkKey: string;
  spawnPointKey: string;
  removed: boolean;
}

interface SpawnPointCooldown {
  availableAt: number;
}

export class CreatureSystem implements GameSystem {
  readonly key = "creatures";

  private readonly chunkStorage: ChunkStorage;
  private readonly playerSystem: PlayerSystem;
  private creatures = new Map<string, CreatureInstance>();
  private dirtyIds = new Set<string>();
  private pendingDespawnIds = new Set<string>();
  private spawnCooldowns = new Map<string, SpawnPointCooldown>();
  private onlinePlayerIds = new Set<string>();
  private viewByPlayer = new Map<string, Set<string>>();
  private playerSpawnCooldownUntil = new Map<string, number>();
  private nextWildSerial = 1;

  constructor(chunkStorage: ChunkStorage, playerSystem: PlayerSystem) {
    this.chunkStorage = chunkStorage;
    this.playerSystem = playerSystem;
  }

  hydrate(db: DrizzleSqliteDODatabase<typeof schema>): void {
    for (const row of db.select().from(schema.creatures).all()) {
      const speciesId = row.speciesId as CreatureSpeciesId;
      if (!CREATURE_SPECIES.some((species) => species.id === speciesId)) continue;
      const level = Math.max(1, Math.min(100, row.level));
      const stats = deriveStats(speciesId, level);
      const knownMovesJson = parseMoves(row.knownMovesJson);
      const ownerPlayerId = row.ownerPlayerId ?? null;
      const isWild = Boolean(row.isWild);
      const state = createCreatureState({
        id: row.id,
        speciesId,
        level,
        ownerPlayerId,
        isWild,
      });
      state.stats.experience = row.experience;
      state.stats.maxHp = row.maxHp > 0 ? row.maxHp : stats.maxHp;
      state.stats.hp = Math.max(0, Math.min(state.stats.maxHp, row.currentHp));
      state.status = normalizeStatus(row.status);
      state.knownMoves = knownMovesJson.length > 0 ? knownMovesJson : getMovesForLevel(speciesId, level);
      const x = row.x ?? 0;
      const y = row.y ?? 0;
      const z = row.z ?? 0;
      this.creatures.set(row.id, {
        state,
        x,
        y,
        z,
        yaw: 0,
        chunkKey: chunkKeyFromPosition(x, z),
        spawnPointKey: `persisted:${row.id}`,
        removed: false,
      });
    }
  }

  setOnlinePlayers(ids: Iterable<string>): void {
    this.onlinePlayerIds = new Set(ids);
    for (const id of [...this.viewByPlayer.keys()]) {
      if (!this.onlinePlayerIds.has(id)) this.viewByPlayer.delete(id);
    }
  }

  tick(): boolean {
    const now = Date.now();
    let changed = false;

    changed = this.despawnFarCreatures() || changed;
    changed = this.spawnNearPlayers(now) || changed;
    changed = this.spawnFromLoadedChunks(now) || changed;
    changed = this.wanderWildCreatures() || changed;

    return changed;
  }

  packetsFor(playerId: string, _ctx: SystemContext): ServerPacket[] {
    const previousVisible = this.viewByPlayer.get(playerId) ?? new Set<string>();
    const nextVisible = new Set<string>();
    const spawns: CreaturePublicState[] = [];
    const updates: CreaturePublicState[] = [];
    const despawns: string[] = [];

    for (const [id, creature] of this.creatures) {
      if (!this.isVisibleToPlayer(creature, playerId)) continue;
      nextVisible.add(id);
      if (!previousVisible.has(id)) {
        spawns.push(toPublic(creature));
      } else {
        updates.push(toPublic(creature));
      }
    }

    for (const prevId of previousVisible) {
      if (!nextVisible.has(prevId)) despawns.push(prevId);
    }
    for (const removedId of this.pendingDespawnIds) {
      if (previousVisible.has(removedId) && !despawns.includes(removedId)) despawns.push(removedId);
    }

    this.viewByPlayer.set(playerId, nextVisible);

    const packets: ServerPacket[] = [];
    if (spawns.length > 0) {
      const packet: CreatureSpawnPacket = { type: "creatureSpawn", creatures: spawns };
      packets.push(packet);
    }
    if (updates.length > 0) {
      const packet: CreatureStatePacket = { type: "creatureState", creatures: updates };
      packets.push(packet);
    }
    if (despawns.length > 0) {
      const packet: CreatureDespawnPacket = { type: "creatureDespawn", ids: despawns };
      packets.push(packet);
    }
    return packets;
  }

  clearPending(): void {
    this.pendingDespawnIds.clear();
  }

  hasDirty(): boolean {
    return this.dirtyIds.size > 0;
  }

  flush(db: DrizzleSqliteDODatabase<typeof schema>): void {
    for (const id of this.dirtyIds) {
      const creature = this.creatures.get(id);
      if (!creature || creature.removed) {
        db.delete(schema.creatures).where(eq(schema.creatures.id, id)).run();
        continue;
      }
      const row = {
        ownerPlayerId: creature.state.ownerPlayerId,
        speciesId: creature.state.speciesId,
        nickname: creature.state.nickname,
        level: creature.state.stats.level,
        experience: creature.state.stats.experience,
        currentHp: creature.state.stats.hp,
        maxHp: creature.state.stats.maxHp,
        status: creature.state.status,
        growthCurve: creature.state.growthCurve,
        knownMovesJson: JSON.stringify(creature.state.knownMoves),
        x: creature.state.isWild ? creature.x : null,
        y: creature.state.isWild ? creature.y : null,
        z: creature.state.isWild ? creature.z : null,
        isWild: creature.state.isWild ? 1 : 0,
      };
      db.insert(schema.creatures)
        .values({ id, ...row })
        .onConflictDoUpdate({ target: schema.creatures.id, set: row })
        .run();
    }
    this.dirtyIds.clear();
  }

  private spawnFromLoadedChunks(nowMs: number): boolean {
    if (this.onlinePlayerIds.size === 0) return false;
    if (this.countWild() >= GLOBAL_WILD_CAP) return false;

    let changed = false;
    const chunkCounts = countByChunk(this.creatures);

    for (const chunk of this.chunkStorage.loadedChunks()) {
      const placed = chunk.placedObjects().filter((obj) => obj.type === PlacedObjectType.EnemySpawn);
      if (placed.length === 0) continue;

      for (const spawnPoint of placed) {
        if (this.countWild() >= GLOBAL_WILD_CAP) break;
        const spKey = `${spawnPoint.chunkOriginX}:${spawnPoint.chunkOriginZ}:${spawnPoint.x}:${spawnPoint.z}`;
        const cooldown = this.spawnCooldowns.get(spKey);
        if (cooldown && cooldown.availableAt > nowMs) continue;

        const chunkKey = chunkKeyFromPosition(spawnPoint.x, spawnPoint.z);
        const inChunk = chunkCounts.get(chunkKey) ?? 0;
        if (inChunk >= PER_CHUNK_CAP) continue;

        const nearbyPlayers = this.countPlayersWithinRadius(spawnPoint.x, spawnPoint.z, PER_PLAYER_RADIUS);
        if (nearbyPlayers === 0) continue;
        const nearbyWild = countWildWithinRadius(spawnPoint.x, spawnPoint.z, this.creatures, PER_PLAYER_RADIUS);
        if (nearbyWild >= PER_PLAYER_CAP) continue;
        if (
          countWildWithinRadius(
            spawnPoint.x + 0.5,
            spawnPoint.z + 0.5,
            this.creatures,
            LOCAL_SPAWN_MIN_SEPARATION,
          ) > 0
        ) {
          continue;
        }

        const species = pickSpeciesForSpawn(spawnPoint.x, spawnPoint.z);
        const level = 3 + ((Math.abs(Math.floor(spawnPoint.x) + Math.floor(spawnPoint.z)) % 7) + 1);
        const id = `wild_${chunkKey}_${this.nextWildSerial++}`;
        const state = createCreatureState({
          id,
          speciesId: species,
          level,
          isWild: true,
          ownerPlayerId: null,
        });
        const instance: CreatureInstance = {
          state,
          x: spawnPoint.x + 0.5,
          y: spawnPoint.y,
          z: spawnPoint.z + 0.5,
          yaw: 0,
          chunkKey,
          spawnPointKey: spKey,
          removed: false,
        };

        this.creatures.set(id, instance);
        this.dirtyIds.add(id);
        chunkCounts.set(chunkKey, inChunk + 1);
        changed = true;
      }
    }

    return changed;
  }

  private spawnNearPlayers(nowMs: number): boolean {
    if (this.onlinePlayerIds.size === 0) return false;
    if (this.countWild() >= GLOBAL_WILD_CAP) return false;

    let changed = false;
    const chunkCounts = countByChunk(this.creatures);

    for (const playerId of this.onlinePlayerIds) {
      if (this.countWild() >= GLOBAL_WILD_CAP) break;
      const pos = this.playerSystem.getPlayerPosition(playerId);
      if (!pos) continue;

      const nextAllowedAt = this.playerSpawnCooldownUntil.get(playerId) ?? 0;
      if (nextAllowedAt > nowMs) continue;

      const nearbyWild = countWildWithinRadius(pos.x, pos.z, this.creatures, PER_PLAYER_RADIUS);
      if (nearbyWild >= PER_PLAYER_CAP) continue;

      const spawn = this.pickLocalSurfaceSpawn(pos.x, pos.z, nowMs);
      this.playerSpawnCooldownUntil.set(playerId, nowMs + PLAYER_SPAWN_COOLDOWN_MS);
      if (!spawn) continue;

      const chunkKey = chunkKeyFromPosition(spawn.x, spawn.z);
      const inChunk = chunkCounts.get(chunkKey) ?? 0;
      if (inChunk >= PER_CHUNK_CAP) continue;

      const species = pickSpeciesForSpawn(spawn.x, spawn.z);
      const level = 3 + ((Math.abs(Math.floor(spawn.x) + Math.floor(spawn.z)) % 7) + 1);
      const id = `wild_local_${chunkKey}_${this.nextWildSerial++}`;
      const state = createCreatureState({
        id,
        speciesId: species,
        level,
        isWild: true,
        ownerPlayerId: null,
      });
      const instance: CreatureInstance = {
        state,
        x: spawn.x,
        y: spawn.y,
        z: spawn.z,
        yaw: spawn.yaw,
        chunkKey,
        spawnPointKey: `local:${Math.floor(spawn.x)},${Math.floor(spawn.z)}`,
        removed: false,
      };
      this.creatures.set(id, instance);
      this.dirtyIds.add(id);
      chunkCounts.set(chunkKey, inChunk + 1);
      changed = true;
    }

    return changed;
  }

  private pickLocalSurfaceSpawn(
    playerX: number,
    playerZ: number,
    nowMs: number,
  ): { x: number; y: number; z: number; yaw: number } | undefined {
    if (typeof (this.chunkStorage as { getChunk?: unknown }).getChunk !== "function") {
      return undefined;
    }

    const phase = hashTo01(`local-phase:${playerX.toFixed(2)}:${playerZ.toFixed(2)}`, nowMs) * Math.PI * 2;

    for (let attempt = 0; attempt < PLAYER_LOCAL_SPAWN_ATTEMPTS; attempt++) {
      const angle = phase + attempt * GOLDEN_ANGLE_RADIANS;
      const t = (attempt + 0.5) / PLAYER_LOCAL_SPAWN_ATTEMPTS;
      const radius = LOCAL_SPAWN_MIN_RADIUS + t * (LOCAL_SPAWN_MAX_RADIUS - LOCAL_SPAWN_MIN_RADIUS);

      const worldX = Math.floor(playerX + Math.cos(angle) * radius);
      const worldZ = Math.floor(playerZ + Math.sin(angle) * radius);
      const [originX, originZ] = chunkOrigin(worldX, worldZ);
      const chunk = this.chunkStorage.getChunk(originX, originZ);
      if (!chunk) continue;

      const localX = worldX - (originX - CHUNK_SIZE / 2);
      const localZ = worldZ - (originZ - CHUNK_SIZE / 2);
      if (localX < 0 || localX >= CHUNK_SIZE || localZ < 0 || localZ >= CHUNK_SIZE) continue;

      const idx = localZ * CHUNK_SIZE + localX;
      const terrainY =
        (chunk.terrainHeightMap.length > idx ? (chunk.terrainHeightMap[idx] as number) : (chunk.heightMap[idx] as number)) ?? 0;
      const surfaceBlock = chunk.getBlock(localX, terrainY, localZ);
      if (surfaceBlock === CubeType.Air || surfaceBlock === CubeType.Water || surfaceBlock === CubeType.Lava) continue;

      const above = chunk.getBlock(localX, terrainY + 1, localZ);
      if (above !== CubeType.Air) continue;

      const candidateX = worldX + 0.5;
      const candidateZ = worldZ + 0.5;
      if (countWildWithinRadius(candidateX, candidateZ, this.creatures, LOCAL_SPAWN_MIN_SEPARATION) > 0) continue;

      return { x: candidateX, y: terrainY + 0.5, z: candidateZ, yaw: angle + Math.PI };
    }
    return undefined;
  }

  private wanderWildCreatures(): boolean {
    let changed = false;
    const now = Date.now();
    for (const creature of this.creatures.values()) {
      if (!creature.state.isWild) continue;
      if (creature.state.stats.hp <= 0) continue;

      const n = hashTo01(creature.state.id, now);
      if (n < 0.82) continue;

      const angle = hashTo01(`${creature.state.id}:angle`, now) * Math.PI * 2;
      const step = WANDER_STEP_MAX * (0.4 + hashTo01(`${creature.state.id}:step`, now) * 0.6);
      const dx = Math.cos(angle) * step;
      const dz = Math.sin(angle) * step;

      const x = creature.x + dx;
      const z = creature.z + dz;
      creature.x = x;
      creature.z = z;
      creature.yaw = angle;
      creature.chunkKey = chunkKeyFromPosition(x, z);
      this.dirtyIds.add(creature.state.id);
      changed = true;
    }
    return changed;
  }

  private despawnFarCreatures(): boolean {
    if (this.onlinePlayerIds.size === 0) return false;
    let changed = false;
    for (const [id, creature] of [...this.creatures.entries()]) {
      if (!creature.state.isWild) continue;
      const nearPlayers = this.countPlayersWithinRadius(creature.x, creature.z, DESPAWN_RADIUS);
      if (nearPlayers > 0) continue;
      this.creatures.delete(id);
      this.pendingDespawnIds.add(id);
      this.dirtyIds.add(id);
      this.spawnCooldowns.set(creature.spawnPointKey, { availableAt: Date.now() + RESPAWN_COOLDOWN_MS });
      changed = true;
    }
    return changed;
  }

  private countWild(): number {
    let count = 0;
    for (const creature of this.creatures.values()) {
      if (creature.state.isWild) count++;
    }
    return count;
  }

  private countPlayersWithinRadius(x: number, z: number, radius: number): number {
    const r2 = radius * radius;
    let count = 0;
    for (const playerId of this.onlinePlayerIds) {
      const pos = this.playerSystem.getPlayerPosition(playerId);
      if (!pos) continue;
      const dx = pos.x - x;
      const dz = pos.z - z;
      if (dx * dx + dz * dz <= r2) count++;
    }
    return count;
  }

  private isVisibleToPlayer(creature: CreatureInstance, playerId: string): boolean {
    if (!this.onlinePlayerIds.has(playerId)) return false;
    const pos = this.playerSystem.getPlayerPosition(playerId);
    if (!pos) return false;
    const dx = pos.x - creature.x;
    const dz = pos.z - creature.z;
    return dx * dx + dz * dz <= DESPAWN_RADIUS * DESPAWN_RADIUS;
  }
}

function toPublic(creature: CreatureInstance): CreaturePublicState {
  return {
    id: creature.state.id,
    speciesId: creature.state.speciesId,
    x: creature.x,
    y: creature.y,
    z: creature.z,
    yaw: creature.yaw,
    level: creature.state.stats.level,
    hp: creature.state.stats.hp,
    maxHp: creature.state.stats.maxHp,
    isWild: creature.state.isWild,
    status: creature.state.status,
  };
}

function chunkKeyFromPosition(x: number, z: number): string {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  return `${cx},${cz}`;
}

function countByChunk(creatures: ReadonlyMap<string, CreatureInstance>): Map<string, number> {
  const map = new Map<string, number>();
  for (const creature of creatures.values()) {
    if (!creature.state.isWild) continue;
    map.set(creature.chunkKey, (map.get(creature.chunkKey) ?? 0) + 1);
  }
  return map;
}

function countWildWithinRadius(
  x: number,
  z: number,
  creatures: ReadonlyMap<string, CreatureInstance>,
  radius: number,
): number {
  let count = 0;
  const r2 = radius * radius;
  for (const creature of creatures.values()) {
    if (!creature.state.isWild) continue;
    const dx = creature.x - x;
    const dz = creature.z - z;
    if (dx * dx + dz * dz <= r2) count++;
  }
  return count;
}

function pickSpeciesForSpawn(x: number, z: number): CreatureSpeciesId {
  const fire = CREATURE_SPECIES.filter((species) => species.types[0] === "fire");
  const water = CREATURE_SPECIES.filter((species) => species.types[0] === "water");
  const grass = CREATURE_SPECIES.filter((species) => species.types[0] === "grass");
  const pools = [fire, water, grass];
  const biomeBucket = Math.abs(Math.floor(x * 0.31) + Math.floor(z * 0.17)) % pools.length;
  const pool = pools[biomeBucket] ?? grass;
  const idx = Math.abs(Math.floor(x) + Math.floor(z * 2)) % pool.length;
  return pool[idx]?.id ?? "spriglyn";
}

function parseMoves(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string").slice(-4);
  } catch {
    return [];
  }
}

function normalizeStatus(raw: string): CreatureState["status"] {
  if (raw === "burn" || raw === "poison" || raw === "paralysis" || raw === "sleep") return raw;
  return "none";
}

function hashTo01(seed: string, t: number): number {
  const s = `${seed}:${Math.floor(t / 1000)}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}
