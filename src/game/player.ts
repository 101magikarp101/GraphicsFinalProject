import { Vec3 } from "gl-matrix";

export const PLAYER_SPEED = 1;

export class Player {
  position: Vec3;
  id: string;

  constructor(id: string, position: Vec3) {
    this.id = id;
    this.position = Vec3.clone(position);
  }

  move(direction: Vec3): void {
    const dir = Vec3.clone(direction);
    dir.y = 0;
    dir.normalize();
    this.position.add(dir);
  }

  jump(): void {
    // TODO: apply upward velocity
  }
}
