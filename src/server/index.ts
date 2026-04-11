import { Entrypoint, handler } from "@cloudflare/actors";
import { newWorkersRpcResponse } from "capnweb";
import { GameRoom, GameServer } from "../game/room";

export { GameRoom };

export class Worker extends Entrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api") {
        return await newWorkersRpcResponse(request, new GameServer(this.env));
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({ message: "worker fetch error", error: message, path: url.pathname }),
      );
      return new Response("Internal server error", { status: 500 });
    }
  }
}

export default handler(Worker);
