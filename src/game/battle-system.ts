import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import * as schema from "../server/schema";
import {
  type BattleSessionState,
  type StarterCreatureState,
} from "./battle";
import { createCreatureState, deriveStats, gainExperience } from "./creature-progression";
import type { CreatureState } from "./creature-progression";
import {
  calculateDamage,
  MOVE_LIBRARY_BY_ID,
  rollStatusApplication,
  type MoveId,
  type StatusCondition,
} from "./creature-moves";
import { CREATURE_SPECIES_BY_ID, isCreatureSpeciesId, type CreatureSpeciesId } from "./creature-species";
import { CreatureSystem } from "./creature-system";
import type { GameSystem, SystemContext } from "./game-system";
import { PlayerSystem } from "./player-system";
import type { BattleStatePacket, ServerPacket, StarterStatePacket } from "./protocol";

const STARTER_LEVEL = 5;
const STARTER_STORE_PREFIX = "starter:";

interface StarterRecord {
  speciesId: CreatureSpeciesId;
  level: number;
  experience: number;
  hp: number;
  maxHp: number;
  knownMoves: string[];
  status: StatusCondition;
}

interface BattleCreature {
  id: string;
  speciesId: CreatureSpeciesId;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  status: StatusCondition;
  knownMoves: MoveId[];
  types: readonly [import("./creature-types").CreatureType, import("./creature-types").CreatureType?];
}

interface BattleSession {
  battleId: string;
  playerId: string;
  turn: number;
  starter: BattleCreature;
  wild: BattleCreature;
  canSelectMove: boolean;
  pendingStarterMove?: MoveId;
  log: string[];
}

export class BattleSystem implements GameSystem {
  readonly key = "battle";

  private readonly playerSystem: PlayerSystem;
  private readonly creatureSystem: CreatureSystem;
  private readonly starters = new Map<string, StarterRecord>();
  private readonly activeBattles = new Map<string, BattleSession>();
  private readonly dirtyStarterPlayerIds = new Set<string>();
  private readonly pendingBattleSync = new Set<string>();
  private readonly pendingBattleStart = new Set<string>();
  private battleSerial = 1;

  constructor(playerSystem: PlayerSystem, creatureSystem: CreatureSystem) {
    this.playerSystem = playerSystem;
    this.creatureSystem = creatureSystem;
  }

  hydrate(db: DrizzleSqliteDODatabase<typeof schema>): void {
    const rows = db.select().from(schema.roomConfig).all();
    for (const row of rows) {
      if (!row.key.startsWith(STARTER_STORE_PREFIX)) continue;
      const playerId = row.key.slice(STARTER_STORE_PREFIX.length);
      const parsed = parseStarterRecord(row.value);
      if (!parsed) continue;
      this.starters.set(playerId, parsed);
    }
  }

  tick(): boolean {
    let changed = false;

    for (const [playerId, battle] of [...this.activeBattles.entries()]) {
      if (!battle.pendingStarterMove) continue;

      const starterMove = battle.pendingStarterMove;
      const wildMove = pickWildMove(battle.wild);
      battle.pendingStarterMove = undefined;
      battle.canSelectMove = false;
      battle.turn += 1;

      const starterDef = MOVE_LIBRARY_BY_ID[starterMove];
      const wildDef = MOVE_LIBRARY_BY_ID[wildMove];
      const starterFirst =
        starterDef.priority > wildDef.priority ||
        (starterDef.priority === wildDef.priority && battle.starter.speed >= battle.wild.speed);

      if (starterFirst) {
        applyMove(battle, "starter", starterMove);
        if (battle.wild.hp > 0) applyMove(battle, "wild", wildMove);
      } else {
        applyMove(battle, "wild", wildMove);
        if (battle.starter.hp > 0) applyMove(battle, "starter", starterMove);
      }

      const starterRecord = this.starters.get(playerId);
      if (!starterRecord) {
        this.activeBattles.delete(playerId);
        this.pendingBattleSync.add(playerId);
        changed = true;
        continue;
      }

      starterRecord.hp = Math.max(0, Math.min(starterRecord.maxHp, battle.starter.hp));
      starterRecord.status = battle.starter.status;

      if (battle.wild.hp <= 0) {
        const xpReward = 12 + battle.wild.level * 4;
        const starterState = starterRecordToCreatureState(playerId, starterRecord);
        const gain = gainExperience(starterState, xpReward);
        applyCreatureStateToStarterRecord(starterRecord, starterState);
        battle.log.push(`Victory! ${speciesName(battle.wild.speciesId)} fainted.`);
        battle.log.push(`Gained ${xpReward} XP.`);
        if (gain.levelsGained > 0) {
          battle.log.push(`${speciesName(starterRecord.speciesId)} grew to Lv ${starterRecord.level}.`);
        }
        starterRecord.hp = Math.min(starterRecord.maxHp, Math.max(1, starterRecord.hp + 4));
        this.activeBattles.delete(playerId);
        this.pendingBattleSync.add(playerId);
      } else if (battle.starter.hp <= 0) {
        battle.log.push(`${speciesName(starterRecord.speciesId)} fainted. Battle lost.`);
        starterRecord.hp = Math.max(1, Math.floor(starterRecord.maxHp * 0.35));
        starterRecord.status = "none";
        this.activeBattles.delete(playerId);
        this.pendingBattleSync.add(playerId);
      } else {
        battle.canSelectMove = true;
        this.pendingBattleSync.add(playerId);
      }

      this.dirtyStarterPlayerIds.add(playerId);
      changed = true;
    }

    return changed;
  }

  packetsFor(playerId: string, _ctx: SystemContext): ServerPacket[] {
    const packets: ServerPacket[] = [];
    const starterPacket: StarterStatePacket = {
      type: "starterState",
      starter: starterToPublic(this.starters.get(playerId)),
    };
    packets.push(starterPacket);

    const battle = this.activeBattles.get(playerId);
    if (battle || this.pendingBattleSync.has(playerId) || this.pendingBattleStart.has(playerId)) {
      const battlePacket: BattleStatePacket = {
        type: "battleState",
        battle: battle ? battleToPublic(battle) : null,
      };
      packets.push(battlePacket);
    }

    return packets;
  }

  clearPending(): void {
    this.pendingBattleSync.clear();
    this.pendingBattleStart.clear();
  }

  hasDirty(): boolean {
    return this.dirtyStarterPlayerIds.size > 0;
  }

  flush(db: DrizzleSqliteDODatabase<typeof schema>): void {
    for (const playerId of this.dirtyStarterPlayerIds) {
      const starter = this.starters.get(playerId);
      if (!starter) continue;
      db.insert(schema.roomConfig)
        .values({
          key: `${STARTER_STORE_PREFIX}${playerId}`,
          value: JSON.stringify(starter),
        })
        .onConflictDoUpdate({
          target: schema.roomConfig.key,
          set: { value: JSON.stringify(starter) },
        })
        .run();
    }
    this.dirtyStarterPlayerIds.clear();
  }

  chooseStarter(playerId: string, speciesId: CreatureSpeciesId): boolean {
    if (this.starters.has(playerId)) return false;
    const starter = createCreatureState({
      id: `starter:${playerId}`,
      speciesId,
      level: STARTER_LEVEL,
      ownerPlayerId: playerId,
      isWild: false,
    });
    this.starters.set(playerId, {
      speciesId,
      level: starter.stats.level,
      experience: starter.stats.experience,
      hp: starter.stats.hp,
      maxHp: starter.stats.maxHp,
      knownMoves: [...starter.knownMoves],
      status: starter.status,
    });
    this.dirtyStarterPlayerIds.add(playerId);
    this.pendingBattleSync.add(playerId);
    return true;
  }

  startBattle(playerId: string, creatureId: string): boolean {
    if (this.activeBattles.has(playerId)) return false;
    const starter = this.starters.get(playerId);
    if (!starter) return false;

    const pos = this.playerSystem.getPlayerPosition(playerId);
    if (!pos) return false;

    const wildState = this.creatureSystem.extractWildCreatureForBattle(creatureId, { x: pos.x, z: pos.z }, 8);
    if (!wildState) return false;

    const battleId = `battle_${this.battleSerial++}`;
    const session: BattleSession = {
      battleId,
      playerId,
      turn: 1,
      starter: starterRecordToBattleCreature(playerId, starter),
      wild: creatureStateToBattleCreature(wildState),
      canSelectMove: true,
      log: [`A wild ${speciesName(wildState.speciesId)} appeared!`],
    };

    this.activeBattles.set(playerId, session);
    this.pendingBattleStart.add(playerId);
    this.pendingBattleSync.add(playerId);
    return true;
  }

  chooseBattleMove(playerId: string, moveIdRaw: string): boolean {
    const battle = this.activeBattles.get(playerId);
    if (!battle || !battle.canSelectMove) return false;
    if (!isMoveId(moveIdRaw)) return false;
    const moveId = moveIdRaw as MoveId;
    if (!battle.starter.knownMoves.includes(moveId)) return false;

    battle.pendingStarterMove = moveId;
    battle.canSelectMove = false;
    this.pendingBattleSync.add(playerId);
    return true;
  }
}

function starterRecordToCreatureState(playerId: string, starter: StarterRecord): CreatureState {
  const base = createCreatureState({
    id: `starter:${playerId}`,
    speciesId: starter.speciesId,
    level: starter.level,
    ownerPlayerId: playerId,
    isWild: false,
  });
  base.stats.experience = starter.experience;
  base.stats.hp = starter.hp;
  base.stats.maxHp = starter.maxHp;
  base.knownMoves = [...starter.knownMoves];
  base.status = starter.status;
  return base;
}

function applyCreatureStateToStarterRecord(starter: StarterRecord, state: CreatureState): void {
  starter.level = state.stats.level;
  starter.experience = state.stats.experience;
  starter.maxHp = state.stats.maxHp;
  starter.hp = Math.max(1, Math.min(starter.maxHp, state.stats.hp));
  starter.knownMoves = [...state.knownMoves];
  starter.status = state.status;
}

function starterRecordToBattleCreature(playerId: string, starter: StarterRecord): BattleCreature {
  const stats = deriveStats(starter.speciesId, starter.level);
  return {
    id: `starter:${playerId}`,
    speciesId: starter.speciesId,
    level: starter.level,
    hp: starter.hp,
    maxHp: starter.maxHp,
    attack: stats.attack,
    defense: stats.defense,
    specialAttack: stats.specialAttack,
    specialDefense: stats.specialDefense,
    speed: stats.speed,
    status: starter.status,
    knownMoves: starter.knownMoves.filter(isMoveId),
    types: CREATURE_SPECIES_BY_ID[starter.speciesId].types,
  };
}

function creatureStateToBattleCreature(creature: CreatureState): BattleCreature {
  return {
    id: creature.id,
    speciesId: creature.speciesId,
    level: creature.stats.level,
    hp: creature.stats.hp,
    maxHp: creature.stats.maxHp,
    attack: creature.stats.attack,
    defense: creature.stats.defense,
    specialAttack: creature.stats.specialAttack,
    specialDefense: creature.stats.specialDefense,
    speed: creature.stats.speed,
    status: creature.status,
    knownMoves: creature.knownMoves.filter(isMoveId),
    types: creature.types,
  };
}

function starterToPublic(starter: StarterRecord | undefined): StarterCreatureState | null {
  if (!starter) return null;
  return {
    speciesId: starter.speciesId,
    level: starter.level,
    experience: starter.experience,
    hp: starter.hp,
    maxHp: starter.maxHp,
    knownMoves: [...starter.knownMoves],
    status: starter.status,
  };
}

function battleToPublic(battle: BattleSession): BattleSessionState {
  return {
    active: true,
    battleId: battle.battleId,
    turn: battle.turn,
    canSelectMove: battle.canSelectMove,
    availableMoves: [...battle.starter.knownMoves],
    starter: {
      id: battle.starter.id,
      speciesId: battle.starter.speciesId,
      level: battle.starter.level,
      hp: battle.starter.hp,
      maxHp: battle.starter.maxHp,
      status: battle.starter.status,
    },
    wild: {
      id: battle.wild.id,
      speciesId: battle.wild.speciesId,
      level: battle.wild.level,
      hp: battle.wild.hp,
      maxHp: battle.wild.maxHp,
      status: battle.wild.status,
    },
    log: battle.log.slice(-6),
  };
}

function parseStarterRecord(raw: string): StarterRecord | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<StarterRecord>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (!parsed.speciesId || !isCreatureSpeciesId(parsed.speciesId)) return undefined;
    const level = clampInt(parsed.level, 1, 100, STARTER_LEVEL);
    const maxHp = clampInt(parsed.maxHp, 1, 999, deriveStats(parsed.speciesId, level).maxHp);
    const hp = clampInt(parsed.hp, 1, maxHp, maxHp);
    const experience = Math.max(0, Math.trunc(parsed.experience ?? 0));
    return {
      speciesId: parsed.speciesId,
      level,
      experience,
      hp,
      maxHp,
      knownMoves: Array.isArray(parsed.knownMoves) ? parsed.knownMoves.filter((m): m is string => typeof m === "string") : [],
      status: normalizeStatus(parsed.status),
    };
  } catch {
    return undefined;
  }
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeStatus(status: unknown): StatusCondition {
  if (status === "burn" || status === "poison" || status === "paralysis" || status === "sleep") return status;
  return "none";
}

function isMoveId(value: string): value is MoveId {
  return value in MOVE_LIBRARY_BY_ID;
}

function pickWildMove(creature: BattleCreature): MoveId {
  const pool: MoveId[] = creature.knownMoves.length > 0 ? creature.knownMoves : ["quick_tap"];
  const idx = Math.max(0, Math.min(pool.length - 1, Math.floor(Math.random() * pool.length)));
  const selected = pool[idx];
  return selected ?? "quick_tap";
}

function applyMove(battle: BattleSession, attacker: "starter" | "wild", moveId: MoveId): void {
  const source = attacker === "starter" ? battle.starter : battle.wild;
  const target = attacker === "starter" ? battle.wild : battle.starter;
  const move = MOVE_LIBRARY_BY_ID[moveId];
  if (!move || source.hp <= 0 || target.hp <= 0) return;

  const hitRoll = Math.random() * 100;
  if (hitRoll > move.accuracy) {
    battle.log.push(`${speciesName(source.speciesId)} used ${move.name}, but it missed.`);
    return;
  }

  const damage = calculateDamage({
    attackerStats: {
      level: source.level,
      attack: source.attack,
      defense: source.defense,
      specialAttack: source.specialAttack,
      specialDefense: source.specialDefense,
    },
    defenderStats: {
      level: target.level,
      attack: target.attack,
      defense: target.defense,
      specialAttack: target.specialAttack,
      specialDefense: target.specialDefense,
    },
    moveId,
    attackerTypes: source.types,
    defenderTypes: target.types,
    attackerStatus: source.status,
    randomFactor: 0.9 + Math.random() * 0.1,
  });

  if (damage > 0) {
    target.hp = Math.max(0, target.hp - damage);
    battle.log.push(`${speciesName(source.speciesId)} used ${move.name} for ${damage} damage.`);
  } else {
    battle.log.push(`${speciesName(source.speciesId)} used ${move.name}.`);
  }

  if (target.hp > 0 && target.status === "none") {
    const status = rollStatusApplication(moveId, Math.random());
    if (status !== "none") {
      target.status = status;
      battle.log.push(`${speciesName(target.speciesId)} is now ${status}.`);
    }
  }
}

function speciesName(speciesId: CreatureSpeciesId): string {
  return CREATURE_SPECIES_BY_ID[speciesId].name;
}
