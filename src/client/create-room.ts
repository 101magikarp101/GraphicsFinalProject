import { newWebSocketRpcSession } from "capnweb";
import { createSignal, onCleanup } from "solid-js";
import { Player } from "../game/player.js";
import type { GameApi, RoomState } from "../game/room.js";

export function createRoom(roomId: string, playerId: string) {
  const [state, setState] = createSignal<RoomState>({ players: {} });

  const player = new Player(false, playerId, 0, 100, 0);

  const api = newWebSocketRpcSession<GameApi>(`wss://${window.location.host}/api`);
  const room = api.join(roomId, player, (s: RoomState) => setState(s));

  onCleanup(() => {
    room.leave();
    api[Symbol.dispose]();
  });

  return { state, player, room } as const;
}
