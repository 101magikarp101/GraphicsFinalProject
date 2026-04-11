import { createSignal } from "solid-js";
import { createRoom } from "./create-room";
import { createGame } from "./engine";

export default function App() {
  const [glCanvas, setGlCanvas] = createSignal<HTMLCanvasElement>();
  const [textCanvas, setTextCanvas] = createSignal<HTMLCanvasElement>();

  const { player, input } = createRoom("world-1", crypto.randomUUID());

  createGame({
    glCanvas,
    inputCanvas: textCanvas,
    player,
    sendInput: input,
  });

  return (
    <div class="container">
      <canvas ref={setGlCanvas} id="glCanvas" class="card" width={1280} height={960} />
      <canvas ref={setTextCanvas} id="textCanvas" width={1280} height={960} />
    </div>
  );
}
