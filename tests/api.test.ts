import { describe, expect, it } from "vitest";
import { GameApiServer } from "../src/server/api.js";

function createMockEnv() {
  return {
    GameState: {
      idFromName: (name: string) => ({ toString: () => name }),
      get: (id: unknown) => ({ id }),
    },
  } as never;
}

describe("GameApiServer", () => {
  it("responds to ping with pong", async () => {
    const server = new GameApiServer(createMockEnv());
    expect(await server.ping()).toBe("pong");
  });

  it("echoes a message back", async () => {
    const server = new GameApiServer(createMockEnv());
    expect(await server.echo("hello")).toBe("hello");
    expect(await server.echo("")).toBe("");
  });

  it("adds two numbers", async () => {
    const server = new GameApiServer(createMockEnv());
    expect(await server.add(2, 3)).toBe(5);
    expect(await server.add(-1, 1)).toBe(0);
    expect(await server.add(0.1, 0.2)).toBeCloseTo(0.3);
  });

  it("returns a game state stub for a given gameId", () => {
    const server = new GameApiServer(createMockEnv());
    const stub = server.getGameState("test-game");
    expect(stub).toBeDefined();
  });
});
