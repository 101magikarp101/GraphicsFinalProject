import { RpcTarget } from "capnweb";

export abstract class Replicated<S> extends RpcTarget {
  state: S;
  peer?: Replicated<S>;
  readonly isServer: boolean;

  constructor(isServer: boolean, initialState: S) {
    super();
    this.isServer = isServer;
    this.state = initialState;
  }

  reconcile(state: S) {
    this.state = state;
  }

  setPeer(peer: Replicated<S>) {
    this.peer = peer;
  }
}
