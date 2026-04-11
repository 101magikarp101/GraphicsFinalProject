import { newWebSocketRpcSession } from "capnweb";
import { createSignal, onCleanup } from "solid-js";
import { Player, type PlayerInput, playerDistanceSq } from "../game/player.js";
import type { GameApi, RoomSnapshot } from "../game/protocol.js";
import { ClientEntity } from "./replication.js";

const INPUT_SEND_INTERVAL_MS = 50;

export function createRoom(roomId: string, playerId: string) {
  const player = new Player({ id: playerId, x: 0, y: 100, z: 0 });
  const replicated = new ClientEntity(player, playerDistanceSq);
  const [snapshot, setSnapshot] = createSignal<RoomSnapshot>({ tick: 0, players: {} });

  const api = newWebSocketRpcSession<GameApi>(`wss://${window.location.host}/api`);
  const session = api.join(roomId, playerId, (snap: RoomSnapshot) => {
    setSnapshot(snap);
    const auth = snap.players[playerId];
    if (auth) replicated.reconcile(auth);
  });

  let pending: PlayerInput | null = null;
  const sendTimer = setInterval(() => {
    if (!pending) return;
    session.sendInput(pending);
    pending = null;
  }, INPUT_SEND_INTERVAL_MS);

  function input(next: PlayerInput) {
    player.step(next);
    pending = next;
  }

  onCleanup(() => {
    clearInterval(sendTimer);
    session.leave();
    api[Symbol.dispose]();
  });

  return { player, snapshot, input } as const;
}
