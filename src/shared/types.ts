export interface PlayerPosition {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface GameStateApi {
  getPlayerPosition(playerId: string): Promise<PlayerPosition | null>;
  setPlayerPosition(playerId: string, x: number, y: number, z: number): Promise<void>;
  getPlayers(): Promise<PlayerPosition[]>;
  removePlayer(playerId: string): Promise<void>;
  movePlayer(playerId: string, dx: number, dy: number, dz: number): Promise<PlayerPosition>;
}

export interface GameApi {
  ping(): Promise<string>;
  echo(message: string): Promise<string>;
  add(a: number, b: number): Promise<number>;
  getGameState(gameId: string): GameStateApi;
}
