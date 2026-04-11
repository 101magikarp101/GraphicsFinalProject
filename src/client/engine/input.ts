export interface WalkKeys {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
}

export interface InputControllerOptions {
  onReset?: () => void;
  onJump?: () => void;
}

export class InputController {
  private readonly abortController = new AbortController();
  private readonly keys: WalkKeys = { w: false, a: false, s: false, d: false };

  private dragging = false;
  private prevX = 0;
  private prevY = 0;
  private pendingMouseDx = 0;
  private pendingMouseDy = 0;

  constructor(canvas: HTMLCanvasElement, opts: InputControllerOptions = {}) {
    const { signal } = this.abortController;

    window.addEventListener("keydown", (e) => this.handleKeyDown(e, opts), { signal });
    window.addEventListener("keyup", (e) => this.handleKeyUp(e), { signal });
    canvas.addEventListener(
      "mousedown",
      (e) => {
        this.dragging = true;
        this.prevX = e.screenX;
        this.prevY = e.screenY;
      },
      { signal },
    );
    canvas.addEventListener(
      "mousemove",
      (e) => {
        if (!this.dragging) return;
        this.pendingMouseDx += e.screenX - this.prevX;
        this.pendingMouseDy += e.screenY - this.prevY;
        this.prevX = e.screenX;
        this.prevY = e.screenY;
      },
      { signal },
    );
    canvas.addEventListener("mouseup", () => (this.dragging = false), { signal });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
  }

  walkKeys(): Readonly<WalkKeys> {
    return this.keys;
  }

  consumeMouseDelta(): { dx: number; dy: number } {
    const dx = this.pendingMouseDx;
    const dy = this.pendingMouseDy;
    this.pendingMouseDx = 0;
    this.pendingMouseDy = 0;
    return { dx, dy };
  }

  destroy(): void {
    this.abortController.abort();
  }

  private handleKeyDown(e: KeyboardEvent, opts: InputControllerOptions): void {
    switch (e.code) {
      case "KeyW":
        this.keys.w = true;
        break;
      case "KeyA":
        this.keys.a = true;
        break;
      case "KeyS":
        this.keys.s = true;
        break;
      case "KeyD":
        this.keys.d = true;
        break;
      case "KeyR":
        opts.onReset?.();
        break;
      case "Space":
        opts.onJump?.();
        break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case "KeyW":
        this.keys.w = false;
        break;
      case "KeyA":
        this.keys.a = false;
        break;
      case "KeyS":
        this.keys.s = false;
        break;
      case "KeyD":
        this.keys.d = false;
        break;
    }
  }
}
