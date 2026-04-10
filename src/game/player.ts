import { Vec3 } from "gl-matrix";
import { Replicated } from "./replicated.js";

export const PLAYER_SPEED = 1;

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  z: number;
}

export class Player extends Replicated<PlayerState> {
  #onChange?: () => void;

  constructor(
    isServer: boolean,
    id: string,
    x: number,
    y: number,
    z: number,
    onChange?: () => void,
  ) {
    super(isServer, { id, x, y, z });
    this.#onChange = onChange;
  }

  get id() {
    return this.state.id;
  }

  get position(): Vec3 {
    return new Vec3([this.state.x, this.state.y, this.state.z]);
  }

  move(direction: { x: number; y: number; z: number }) {
    const dir = new Vec3([direction.x, 0, direction.z]);
    if (dir.squaredMagnitude === 0) return;
    dir.normalize().scale(PLAYER_SPEED);
    this.state.x += dir.x;
    this.state.z += dir.z;

    if (!this.isServer) {
      (this.peer as Player | undefined)?.move({ x: direction.x, y: direction.y, z: direction.z });
    } else {
      this.peer?.reconcile(this.state);
      this.#onChange?.();
    }
  }
}
