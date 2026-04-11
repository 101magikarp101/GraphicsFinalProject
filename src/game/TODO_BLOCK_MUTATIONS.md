# Block Mutations: Sequence-Based Optimistic Updates

Design for client-predicted block placement/breaking with server validation.

## Protocol

Add to `protocol.ts`:

```typescript
interface BlockAction {
  seq: number;          // client-assigned, monotonically increasing
  type: "place" | "break";
  x: number;
  y: number;
  z: number;
  blockType?: number;   // for placement
}

interface BlockAck {
  seq: number;
  accepted: boolean;
}
```

Add `sendBlockAction(action: BlockAction)` to `RoomSessionApi`.
Add `blockAcks: BlockAck[]` to `RoomSnapshot` (batched per tick).

## Client Flow

1. Player clicks to place/break a block.
2. Client assigns a `seq` and pushes the action to a pending queue.
3. Client applies the change to local chunk data immediately (optimistic).
4. Client sends the action to server via `sendBlockAction()`.
5. On snapshot, client reads `blockAcks`:
   - `accepted: true` — remove from pending queue, no-op (already applied).
   - `accepted: false` — remove from pending queue, revert the local chunk change.
6. Keep a revert log: `Map<seq, { x, y, z, previousBlockType }>` so rejected
   actions can be undone without re-fetching the chunk.

## Server Flow

1. `GameRoom` receives block actions into a per-player queue (like movement inputs).
2. Each tick, process all queued block actions:
   - **Validate**: is the chunk loaded? Is the player within interaction range
     (e.g., 6 blocks)? Is the target block breakable / the placement location empty?
     Does the player have the required item (future)?
   - **Apply**: mutate the authoritative chunk data.
   - **Record ack**: push `{ seq, accepted: true/false }` to the player's ack list.
3. Broadcast: include changed blocks in the snapshot so other clients update.
   Use a `blockChanges: Array<{ x, y, z, blockType }>` field in `RoomSnapshot`
   (only non-empty when blocks changed this tick).
4. Other clients apply `blockChanges` directly to their local chunk data.

## Validation Rules

- [ ] Distance check: reject if `dist(player, block) > MAX_INTERACT_DISTANCE`
- [ ] Target check (break): reject if block is already air
- [ ] Target check (place): reject if block is not air / not replaceable
- [ ] Chunk bounds: reject if coordinates are outside loaded world
- [ ] Rate limit: max N block actions per tick per player (prevent spam)

## Chunk Storage

- [ ] Extend `schema.ts` with a `chunks` table: `(cx, cz, data BLOB)` storing
      modified blocks as a delta from the seed-generated terrain
- [ ] On block mutation, mark the chunk dirty for alarm-based flush (same pattern
      as player persistence)
- [ ] On `onInit()`, load chunk deltas and apply over seed-generated terrain

## Broadcast Efficiency

- [ ] Only include `blockChanges` in snapshots when blocks actually changed
- [ ] For the acting player: they already applied optimistically, so `blockChanges`
      is redundant — they only need the ack. Consider filtering or letting the
      client skip self-originated changes via the `seq` match.
- [ ] Batch multiple block changes per tick into a single `blockChanges` array

## Open Questions

- Should chunk data be stored per-chunk or as a world-level delta log?
- How to handle block changes near chunk boundaries (notify adjacent chunks)?
- Should block placement consume items from an inventory system (future)?
- How to handle concurrent place+break at the same coordinate in the same tick?
  (First-come-first-served based on queue order.)
