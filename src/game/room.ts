import { Actor } from "@cloudflare/actors";
import { RpcTarget } from "capnweb";
import { eq } from "drizzle-orm";
import { type DrizzleSqliteDODatabase, drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../../drizzle/migrations.js";
import * as schema from "../server/schema.js";
import { Player, type PlayerInput } from "./player.js";
import type { GameApi, RoomSessionApi, RoomSnapshot } from "./protocol.js";

export type { GameApi, RoomSessionApi, RoomSnapshot } from "./protocol.js";

const TICK_MS = 50;
const PERSIST_EVERY_N_TICKS = 50;
const SPAWN_POSITION = { x: 0, y: 100, z: 0 };

type SnapshotListener = (snap: RoomSnapshot) => unknown;

function notify(cb: SnapshotListener, snap: RoomSnapshot) {
  try {
    const result = cb(snap);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    // capnweb surfaces broken stubs via onRpcBroken elsewhere
  }
}

export class GameRoom extends Actor<Env> {
  private players = new Map<string, Player>();
  private inputs = new Map<string, PlayerInput>();
  private listeners = new Map<string, SnapshotListener>();
  private dirty = new Set<string>();
  private tick = 0;
  private db!: DrizzleSqliteDODatabase<typeof schema>;

  override async onInit() {
    this.db = drizzle(this.ctx.storage, { schema });
    migrate(this.db, migrations);

    for (const row of this.db.select().from(schema.players).all()) {
      this.players.set(row.id, new Player({ id: row.id, x: row.x, y: row.y, z: row.z }));
    }
  }

  join(playerId: string, onSnapshot: SnapshotListener) {
    if (!this.players.has(playerId)) {
      this.players.set(playerId, new Player({ id: playerId, ...SPAWN_POSITION }));
      this.dirty.add(playerId);
    }
    this.listeners.set(playerId, onSnapshot);
    notify(onSnapshot, this.snapshot());
    this.ensureAlarm();
  }

  sendInput(playerId: string, input: PlayerInput) {
    this.inputs.set(playerId, input);
  }

  leave(playerId: string) {
    this.listeners.delete(playerId);
    this.inputs.delete(playerId);
  }

  override async onAlarm(): Promise<void> {
    this.tick++;

    let changedThisTick = false;
    for (const [id, input] of this.inputs) {
      const player = this.players.get(id);
      if (!player) continue;
      const { x, z } = player.state;
      player.step(input);
      if (player.state.x !== x || player.state.z !== z) {
        this.dirty.add(id);
        changedThisTick = true;
      }
    }
    this.inputs.clear();

    if (changedThisTick && this.listeners.size > 0) {
      const snap = this.snapshot();
      for (const cb of this.listeners.values()) {
        notify(cb, snap);
      }
    }

    if (this.tick % PERSIST_EVERY_N_TICKS === 0 && this.dirty.size > 0) {
      this.flush();
    }

    if (this.listeners.size > 0) {
      this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    } else if (this.dirty.size > 0) {
      this.flush();
    }
  }

  private snapshot(): RoomSnapshot {
    const players: Record<string, Player["state"]> = {};
    for (const [id, player] of this.players) {
      players[id] = player.state;
    }
    return { tick: this.tick, players };
  }

  private flush() {
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

  private ensureAlarm() {
    this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }
}

interface GameRoomStub {
  join(playerId: string, onSnapshot: SnapshotListener): Promise<void>;
  sendInput(playerId: string, input: PlayerInput): Promise<void>;
  leave(playerId: string): Promise<void>;
}

export class RoomSession extends RpcTarget implements RoomSessionApi {
  #room: GameRoomStub;
  #playerId: string;
  #left = false;

  constructor(room: GameRoomStub, playerId: string) {
    super();
    this.#room = room;
    this.#playerId = playerId;
  }

  sendInput(input: PlayerInput) {
    this.#room.sendInput(this.#playerId, input);
  }

  leave() {
    if (this.#left) return;
    this.#left = true;
    this.#room.leave(this.#playerId);
  }

  [Symbol.dispose]() {
    this.leave();
  }
}

export class GameServer extends RpcTarget implements GameApi {
  #env: Env;

  constructor(env: Env) {
    super();
    this.#env = env;
  }

  async join(roomId: string, playerId: string, onSnapshot: SnapshotListener) {
    const id = this.#env.GameRoom.idFromName(roomId);
    const stub = this.#env.GameRoom.get(id) as unknown as GameRoomStub;
    await stub.join(playerId, onSnapshot);
    return new RoomSession(stub, playerId);
  }
}
