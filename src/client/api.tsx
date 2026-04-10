import { newWebSocketRpcSession } from "capnweb";
import { createContext, onCleanup, type ParentProps, useContext } from "solid-js";
import type { GameApi } from "../shared/types.js";

type GameApiSession = ReturnType<typeof newWebSocketRpcSession<GameApi>>;

const GameApiContext = createContext<GameApiSession>();

export function GameApiProvider(props: ParentProps) {
  const api = newWebSocketRpcSession<GameApi>(`wss://${window.location.host}/api`);
  onCleanup(() => api[Symbol.dispose]());
  return <GameApiContext.Provider value={api}>{props.children}</GameApiContext.Provider>;
}

export function useGameApi(): GameApiSession {
  const ctx = useContext(GameApiContext);
  if (!ctx) throw new Error("useGameApi must be used within a GameApiProvider");
  return ctx;
}
