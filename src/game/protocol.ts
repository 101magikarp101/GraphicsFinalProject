import type { PlayerInput, PlayerState } from "./player";

export interface RoomSnapshot {
  tick: number;
  players: Record<string, PlayerState>;
  acks: Record<string, number>;
}

export interface RoomSessionApi {
  sendInputs(inputs: PlayerInput[]): void;
  leave(): void;
}

export interface GameApi {
  join(
    roomId: string,
    playerId: string,
    onSnapshot: (snap: RoomSnapshot) => void,
  ): Promise<RoomSessionApi>;
}
