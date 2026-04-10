import { Actor } from "@cloudflare/actors";
import { RpcTarget } from "capnweb";
import { eq } from "drizzle-orm";
import { type DrizzleSqliteDODatabase, drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../../drizzle/migrations.js";
import * as schema from "../server/schema.js";
import { Player, type PlayerState } from "./player.js";

const FLUSH_DELAY_MS = 5_000;

// ---- Shared types (client imports via `import type`) ----

export interface RoomState {
  players: Record<string, PlayerState>;
}

export interface RoomSessionApi {
  leave(): void;
}

export interface GameApi {
  join(roomId: string, clientPlayer: Player, onUpdate: (state: RoomState) => void): RoomSessionApi;
}

// ---- Game Room (Durable Object) ----

export class GameRoom extends Actor<Env> {
  private players = new Map<string, Player>();
  private listeners = new Set<(state: RoomState) => void>();
  private dirty = new Set<string>();
  private db!: DrizzleSqliteDODatabase<typeof schema>;

  override async onInit() {
    this.db = drizzle(this.ctx.storage, { schema });
    migrate(this.db, migrations);

    for (const row of this.db.select().from(schema.players).all()) {
      this.players.set(
        row.id,
        new Player(true, row.id, row.x, row.y, row.z, () => {
          this.dirty.add(row.id);
          this.scheduleFlush();
          this.broadcast();
        }),
      );
    }
  }

  subscribe(onUpdate: (state: RoomState) => void): () => void {
    this.listeners.add(onUpdate);
    onUpdate(this.getRoomState());
    return () => {
      this.listeners.delete(onUpdate);
    };
  }

  joinPlayer(clientPlayer: Player, playerId: string, x: number, y: number, z: number) {
    const serverPlayer = new Player(true, playerId, x, y, z, () => {
      this.dirty.add(playerId);
      this.scheduleFlush();
      this.broadcast();
    });
    serverPlayer.setPeer(clientPlayer);
    clientPlayer.setPeer(serverPlayer);
    this.players.set(playerId, serverPlayer);
    this.dirty.add(playerId);
    this.scheduleFlush();
    this.broadcast();
    return serverPlayer;
  }

  leavePlayer(playerId: string) {
    this.players.delete(playerId);
    this.dirty.add(playerId);
    this.scheduleFlush();
    this.broadcast();
  }

  private getRoomState(): RoomState {
    const players: Record<string, PlayerState> = {};
    for (const [id, player] of this.players) {
      players[id] = player.state;
    }
    return { players };
  }

  private broadcast() {
    const state = this.getRoomState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        this.listeners.delete(listener);
      }
    }
  }

  private scheduleFlush() {
    this.ctx.storage.setAlarm(Date.now() + FLUSH_DELAY_MS);
  }

  override async onAlarm(): Promise<void> {
    for (const id of this.dirty) {
      const player = this.players.get(id);
      if (player) {
        this.db
          .insert(schema.players)
          .values(player.state)
          .onConflictDoUpdate({
            target: schema.players.id,
            set: { x: player.state.x, y: player.state.y, z: player.state.z },
          })
          .run();
      } else {
        this.db.delete(schema.players).where(eq(schema.players.id, id)).run();
      }
    }
    this.dirty.clear();
  }
}

// ---- RPC Layer (capnweb capability pattern) ----

interface GameRoomStub {
  subscribe(onUpdate: (state: RoomState) => void): Promise<() => void>;
  joinPlayer(
    clientPlayer: Player,
    playerId: string,
    x: number,
    y: number,
    z: number,
  ): Promise<Player>;
  leavePlayer(playerId: string): Promise<void>;
}

export class RoomSession extends RpcTarget {
  #stub: GameRoomStub;
  #playerId: string;
  #unsubscribe?: () => void;

  private constructor(stub: GameRoomStub, playerId: string) {
    super();
    this.#stub = stub;
    this.#playerId = playerId;
  }

  static async create(
    stub: GameRoomStub,
    clientPlayer: Player,
    playerId: string,
    onUpdate: (state: RoomState) => void,
  ) {
    const session = new RoomSession(stub, playerId);
    session.#unsubscribe = await stub.subscribe(onUpdate);
    await stub.joinPlayer(clientPlayer, playerId, 0, 100, 0);
    return session;
  }

  leave() {
    this.#unsubscribe?.();
    return this.#stub.leavePlayer(this.#playerId);
  }
}

export class GameServer extends RpcTarget {
  #env: Env;

  constructor(env: Env) {
    super();
    this.#env = env;
  }

  async join(roomId: string, clientPlayer: Player, onUpdate: (state: RoomState) => void) {
    const id = this.#env.GameRoom.idFromName(roomId);
    const stub = this.#env.GameRoom.get(id) as unknown as GameRoomStub;
    return RoomSession.create(stub, clientPlayer, clientPlayer.state.id, onUpdate);
  }
}
