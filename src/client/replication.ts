import type { Entity } from "../game/entity.js";

const DEFAULT_DRIFT_SQ = 4;

export class ClientEntity<S extends object, I> {
  constructor(
    public entity: Entity<S, I>,
    private distanceSq: (a: S, b: S) => number,
    private threshold: number = DEFAULT_DRIFT_SQ,
  ) {}

  reconcile(authoritative: S) {
    if (this.distanceSq(this.entity.state, authoritative) > this.threshold) {
      Object.assign(this.entity.state, authoritative);
    }
  }
}
