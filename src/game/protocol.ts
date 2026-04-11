import type { PlayerInput, PlayerState } from "./player.js";

export interface RoomSnapshot {
  tick: number;
  players: Record<string, PlayerState>;
}

export interface RoomSessionApi {
  sendInput(input: PlayerInput): void;
  leave(): void;
}

export interface GameApi {
  join(
    roomId: string,
    playerId: string,
    onSnapshot: (snap: RoomSnapshot) => void,
  ): Promise<RoomSessionApi>;
}
