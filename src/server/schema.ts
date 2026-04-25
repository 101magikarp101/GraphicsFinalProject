import { blob, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createStarterInventory, PLAYER_MAX_HEALTH } from "../game/player";

const STARTER_INVENTORY_JSON = JSON.stringify(createStarterInventory());

export const roomConfig = sqliteTable("room_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const chunks = sqliteTable("chunks", {
  key: text("key").primaryKey(),
  data: blob("data").notNull().$type<Uint8Array>(),
  fluidLevels: blob("fluid_levels").$type<Uint8Array>(),
});

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  z: real("z").notNull(),
  yaw: real("yaw").notNull().default(0),
  pitch: real("pitch").notNull().default(0),
  health: integer("health").notNull().default(PLAYER_MAX_HEALTH),
  inventory: text("inventory").notNull().default(STARTER_INVENTORY_JSON),
  selectedHotbarSlot: integer("selected_hotbar_slot").notNull().default(0),
});

export const creatureSpecies = sqliteTable("creature_species", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  primaryType: text("primary_type").notNull(),
  secondaryType: text("secondary_type"),
  baseStatsJson: text("base_stats_json").notNull(),
  learnsetJson: text("learnset_json").notNull(),
});

export const creatureMoves = sqliteTable("creature_moves", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  category: text("category").notNull(),
  basePower: integer("base_power").notNull(),
  accuracy: integer("accuracy").notNull(),
  pp: integer("pp").notNull(),
  priority: integer("priority").notNull().default(0),
  effectId: text("effect_id"),
  statusChance: real("status_chance"),
});

export const creatures = sqliteTable("creatures", {
  id: text("id").primaryKey(),
  ownerPlayerId: text("owner_player_id"),
  speciesId: text("species_id").notNull(),
  nickname: text("nickname").notNull(),
  level: integer("level").notNull().default(1),
  experience: integer("experience").notNull().default(0),
  currentHp: integer("current_hp").notNull(),
  maxHp: integer("max_hp").notNull(),
  status: text("status").notNull().default("none"),
  growthCurve: text("growth_curve").notNull().default("medium"),
  knownMovesJson: text("known_moves_json").notNull(),
  x: real("x"),
  y: real("y"),
  z: real("z"),
  isWild: integer("is_wild").notNull().default(1),
});
