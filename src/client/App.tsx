import { onCleanup, onMount } from "solid-js";
import { MinecraftAnimation } from "../minceraft/App.js";
import { createRoom } from "./create-room.js";

// fixes canvas rendering on  HiDPI displays (e.g. Retina/Apple displays)
function scaleCanvasToDPR(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.width;
  const cssHeight = canvas.height;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
}

export default function App() {
  let glCanvasRef!: HTMLCanvasElement;
  let textCanvasRef!: HTMLCanvasElement;

  const { player, input } = createRoom("world-1", crypto.randomUUID());

  onMount(() => {
    scaleCanvasToDPR(glCanvasRef);
    scaleCanvasToDPR(textCanvasRef);
    const animation = new MinecraftAnimation(glCanvasRef, textCanvasRef, player, input);
    animation.start();
    onCleanup(() => animation.destroy());
  });

  return (
    <div class="container">
      <canvas ref={glCanvasRef} id="glCanvas" class="card" width={1280} height={960} />
      <canvas ref={textCanvasRef} id="textCanvas" width={1280} height={960} />
    </div>
  );
}
