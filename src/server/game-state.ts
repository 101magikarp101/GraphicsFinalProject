import { Actor } from "@cloudflare/actors";
import { eq } from "drizzle-orm";
import { type DrizzleSqliteDODatabase, drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { Vec3 } from "gl-matrix";
import migrations from "../../drizzle/migrations.js";
import { Player } from "../game/player.js";
import type { PlayerPosition } from "../shared/types.js";
import * as schema from "./schema.js";

export class GameState extends Actor<Env> {
  private db!: DrizzleSqliteDODatabase<typeof schema>;
  private playerCache = new Map<string, PlayerPosition>();

  override async onInit() {
    this.db = drizzle(this.ctx.storage, { schema });
    migrate(this.db, migrations);

    const rows = this.db.select().from(schema.players).all();
    for (const row of rows) {
      this.playerCache.set(row.id, row);
    }
  }

  async getPlayerPosition(playerId: string): Promise<PlayerPosition | null> {
    return this.playerCache.get(playerId) ?? null;
  }

  async setPlayerPosition(playerId: string, x: number, y: number, z: number): Promise<void> {
    const pos: PlayerPosition = { id: playerId, x, y, z };
    this.playerCache.set(playerId, pos);
    this.db
      .insert(schema.players)
      .values(pos)
      .onConflictDoUpdate({
        target: schema.players.id,
        set: { x, y, z },
      })
      .run();
  }

  async getPlayers(): Promise<PlayerPosition[]> {
    return [...this.playerCache.values()];
  }

  async removePlayer(playerId: string): Promise<void> {
    this.playerCache.delete(playerId);
    this.db.delete(schema.players).where(eq(schema.players.id, playerId)).run();
  }

  async movePlayer(playerId: string, dx: number, dy: number, dz: number): Promise<PlayerPosition> {
    const current = this.playerCache.get(playerId);
    if (!current) throw new Error(`Player ${playerId} not found`);

    const player = new Player(playerId, new Vec3([current.x, current.y, current.z]));
    player.move(new Vec3([dx, dy, dz]));

    const p = player.position;
    await this.setPlayerPosition(playerId, p.x, p.y, p.z);
    return { id: playerId, x: p.x, y: p.y, z: p.z };
  }
}
