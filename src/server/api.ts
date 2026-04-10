import { RpcTarget } from "capnweb";

export class GameApiServer extends RpcTarget {
  #env: Env;

  constructor(env: Env) {
    super();
    this.#env = env;
  }

  async ping(): Promise<string> {
    return "pong";
  }

  async echo(message: string): Promise<string> {
    return message;
  }

  async add(a: number, b: number): Promise<number> {
    return a + b;
  }

  getGameState(gameId: string) {
    const id = this.#env.GameState.idFromName(gameId);
    return this.#env.GameState.get(id);
  }
}
