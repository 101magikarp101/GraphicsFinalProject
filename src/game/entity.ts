export abstract class Entity<S, I> {
  constructor(public state: S) {}

  abstract step(input: I): void;
}
