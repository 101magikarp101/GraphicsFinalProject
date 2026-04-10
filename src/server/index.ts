import { Entrypoint, handler } from "@cloudflare/actors";
import { newWorkersRpcResponse } from "capnweb";
import { GameApiServer } from "./api.js";

export { GameState } from "./game-state.js";

export class Worker extends Entrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api") {
      return newWorkersRpcResponse(request, new GameApiServer(this.env));
    }

    return new Response("Not found", { status: 404 });
  }
}

export default handler(Worker);
