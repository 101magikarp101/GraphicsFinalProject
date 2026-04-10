import { Entrypoint, handler } from "@cloudflare/actors";
import { newWorkersRpcResponse } from "capnweb";
import { GameRoom, GameServer } from "../game/room.js";

export { GameRoom };

export class Worker extends Entrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api") {
      return newWorkersRpcResponse(request, new GameServer(this.env));
    }
    return new Response("Not found", { status: 404 });
  }
}

export default handler(Worker);
