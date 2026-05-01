# Pixelmon Expansion Plan (CS354H Graphics Project)

## Goal

Build an original Pixelmon-style expansion for this Minecraft-like game with:

1. Original creatures inspired by type systems (not franchise copies)
2. Blocky rendered creature models with animations
3. Wild spawning and world integration
4. Real-time 3D attack visuals + turn-based battle gameplay
5. Starter selection and progression (leveling, balancing)
6. Advanced shadow rasterization implementations and comparisons:
	- Shadow maps
	- Shadow volumes
	- Ambient occlusion variant

Start with 3 core types (Fire/Water/Grass), then scale architecture to all 18 types later.

## Scope Decisions (Locked)

1. Initial content scope: 3 starter types only (Fire/Water/Grass)
2. Creature count now: 5 originals per type (15 total)
3. IP approach: use only original names/models/moves
4. Battle phasing: real-time 3D attacks and turn-based loop in one milestone
5. Diagnostics/reporting: use in-engine diagnostics plus reproducible benchmark outputs for class writeup

## High-Level Milestones

1. Baseline and benchmarking infrastructure
2. Core creature data architecture (types, species, moves, stats)
3. Wild spawn lifecycle and networking
4. Blocky creature modeling + animation rendering pipeline
5. Combined playable battle milestone (encounter -> turn-based combat + 3D move visuals)
6. Advanced shadow rasterization integration
7. Performance/accuracy comparison and reporting artifacts
8. Balance, polish, and expansion roadmap to full 18-type system

## Current Implementation Status

Phases 0-6 are implemented for the final demo path:

1. Benchmark mode and diagnostics are wired with JSON/CSV/Markdown export support.
2. Original creature data, type interactions, moves, XP, and progression are implemented.
3. Wild spawning, caps, lifecycle state, and replication are implemented.
4. Blocky creature rendering and battle effect rendering are implemented.
5. Starter selection, encounter initiation, turn-based battle, move visuals, battle HUD, XP rewards, and persistence are implemented.
6. Runtime-switchable ambient occlusion, shadow mapping, and stencil shadow volumes are implemented with shadow-strength controls.
7. Report artifacts, static comparison metrics, and a runtime benchmark capture script are in `docs/final-project/` and `scripts/capture-shadow-benchmarks.mjs`.

Remaining polish after submission would be expansion to all 18 types, deeper balance tuning, and broader screenshot/video capture.

---

## Phase 0: Baseline + Instrumentation Hardening

### Objective

Create a reproducible baseline before adding Pixelmon and advanced shadows.

### Tasks

1. Define benchmark scenes:
	- Open terrain (daylight)
	- Dense foliage/objects
	- Cave or enclosed region
	- Mixed scene with many entities
2. Build deterministic benchmark mode:
	- Fixed world seed
	- Fixed camera path
	- Fixed run duration
3. Extend diagnostics capture:
	- GPU frame time
	- CPU compute time
	- Frame pacing and p95 frame time
4. Export benchmark logs to machine-readable output (JSON/CSV)
5. Record baseline metrics for current renderer

### Key Integration Points

1. `src/client/engine/create-game.ts` (frame timing, diagnostics state)
2. `src/client/engine/render/renderer.ts` (GPU timing boundaries)
3. `src/client/components/DiagnosticsPanel.tsx` (visual diagnostic controls)

### Self-Check Gate A

1. Running benchmark mode twice with same seed/path gives near-identical metrics
2. Baseline logs generated for all scenes
3. Diagnostics panel still works in normal gameplay

---

## Phase 1: Creature Domain Architecture (Fire/Water/Grass First)

### Objective

Create all reusable systems for species, moves, stats, progression, and type interactions.

### Tasks

1. Add creature domain types:
	- `CreatureType`, `SpeciesId`, `MoveId`
	- `StatBlock`, `CreatureState`, `BattleStatus`
	- `LearnsetEntry`, `GrowthCurve`
2. Create initial type chart implementation for Fire/Water/Grass
3. Add original species roster: 15 creatures (5 per type)
4. Add move library (damage, status, utility)
5. Implement damage and status resolution services
6. Implement XP/level-up progression rules
7. Add persistence schema/migrations for:
	- species definitions
	- owned creatures
	- wild creatures
	- move sets and progression

### Design Notes

1. Data model must be extension-ready for 18 types and larger species count
2. Keep species/move configs data-driven (not hardcoded inside combat loop)

### Self-Check Gate B

1. All 15 species load and validate at startup
2. Type effectiveness unit tests pass (Fire/Water/Grass)
3. XP and level-up logic pass tests
4. DB persistence survives room/server restart

---

## Phase 2: Wild Spawn System + Lifecycle + Replication

### Objective

Spawn wild creatures in the voxel world, keep counts bounded, and replicate reliably.

### Tasks

1. Reuse existing `EnemySpawn` placement metadata from object placement pipeline
2. Implement spawn policies:
	- biome gating
	- rarity weights
	- level bands
	- spawn cooldowns
3. Implement creature lifecycle states:
	- spawn
	- active/wander
	- in battle (locked)
	- faint
	- despawn/respawn
4. Add strict limits:
	- global creature max
	- per-chunk max
	- per-player-radius max
5. Extend room tick packet flow for creature updates
6. Add client-side interpolation/store for creature state snapshots

### Key Integration Points

1. `src/game/object-placement.ts` (EnemySpawn rules)
2. `src/game/room.ts` (system registration + tick/broadcast)
3. `src/game/protocol.ts` (new creature packets)
4. `src/client/engine/create-game.ts` (packet handling and entity integration)

### Self-Check Gate C

1. Wild creatures spawn deterministically with fixed seed
2. Spawn caps prevent runaway entity counts
3. Creature replication remains stable under latency
4. No regressions in existing player/block systems

---

## Phase 3: Original Blocky Creature Models + Animation

### Objective

Render all 15 starter-phase creatures as blocky models with core animations.

### Tasks

1. Define model/rig format:
	- voxel/blocky body part hierarchy
	- pivots and joint conventions
	- palette/material mapping
2. Build 15 original creature models (5 Fire, 5 Water, 5 Grass)
3. Author animation clips:
	- idle
	- walk
	- attack
	- hit reaction
	- faint
4. Integrate creature render pass and instancing buffers
5. Add culling/LOD strategy for performance
6. Add animation-state replication hooks for network sync

### Key Integration Points

1. `src/client/engine/entities/*`
2. `src/client/engine/render/renderer.ts`
3. `src/client/engine/scene-lighting.ts`

### Self-Check Gate D

1. All 15 creatures render correctly in world
2. Animations transition cleanly between states
3. Frame time remains within acceptable budget in mixed scenes

---

## Phase 4: Combined Playable Battle Milestone

### Objective

Deliver a complete encounter flow: starter select -> wild encounter -> turn-based battle with real-time 3D move visuals -> rewards/progression.

### Tasks

1. Starter flow:
	- on first play, choose 1 of 3 starters (Fire/Water/Grass)
2. Encounter initiation:
	- click wild creature to open battle UI
3. Turn-based server-authoritative battle state machine:
	- encounter start
	- action selection
	- turn resolution
	- KO/faint
	- rewards/XP
	- battle end
4. Real-time 3D move execution during turn resolution:
	- projectile and melee visuals
	- impact effects
	- hit reactions and timing
5. UI implementation:
	- battle HUD and move selection
	- HP/status/XP display
	- turn log and prompts
6. Persistence + progression:
	- XP gain
	- level up
	- move progression
7. Desync safety:
	- packet acking and reconciliation
	- disconnect/reconnect handling

### Key Integration Points

1. `src/client/engine/create-game.ts` (`handleLeftClick` target routing)
2. `src/game/protocol.ts` (battle session packets)
3. `src/game/room.ts` (authoritative battle orchestration)
4. `src/client/components/*` and `src/client/views/game.tsx` (battle UI)

### Self-Check Gate E

1. New player can pick starter and begin normal play
2. Clicking wild creature reliably enters battle
3. Full battle loop resolves without soft-locks
4. XP and level progress persist across sessions

---

## Phase 5: Advanced Shadow Rasterization Algorithms

### Objective

Implement and expose all required class techniques with runtime switching.

### Required Techniques

1. Shadow maps
2. Shadow volumes
3. Ambient occlusion variant (compare against current AO baseline)

### Tasks

1. Shadow maps path:
	- directional light shadow pass
	- depth map generation
	- sampling in main pass
	- bias tuning to reduce acne/peter-panning
2. Shadow volumes path:
	- silhouette edge generation strategy
	- stencil-based shadow application
	- geometry scope control for performance
3. AO path:
	- keep existing voxel AO as baseline
	- add improved AO variant for comparison
4. Add runtime technique toggles in diagnostics/debug UI
5. Ensure each technique can be benchmarked independently on identical scenes

### Key Integration Points

1. `src/client/engine/render/renderer.ts`
2. `src/client/engine/scene-lighting.ts`
3. `src/game/chunk.ts` (current AO data path)
4. `src/client/components/DiagnosticsPanel.tsx`

### Self-Check Gate F

1. All three techniques compile and render in the same build
2. Runtime switching works without restart
3. Visual artifact checklist completed per scene

---

## Phase 6: Performance + Accuracy Comparison (Report-Ready)

### Objective

Produce rigorous outputs for CS354H evaluation.

### Comparison Matrix

For each scene and each shadow technique, capture:

1. Average GPU ms
2. p95 frame time
3. CPU overhead
4. Memory overhead
5. Accuracy/quality notes:
	- aliasing
	- acne
	- light leaking
	- temporal instability/flicker

### Deliverables

1. Exported benchmark logs (JSON/CSV)
2. Summary markdown table for report
3. Screenshot set per technique/scene
4. Final recommendation matrix:
	- best visual quality
	- best efficiency
	- best default gameplay setting

### Self-Check Gate G

1. Repeatable metrics produced from deterministic benchmark runs
2. Tables and figures generated directly from logs
3. Conclusions trace back to measured data

---

## Phase 7: Balance, Polish, and Next Expansion

### Objective

Make gameplay stable and classroom-demo ready, then prepare expansion to all types.

### Tasks

1. Balance first 15 species and move set:
	- starter fairness
	- encounter pacing
	- reward curves
2. Improve UX:
	- battle readability
	- input responsiveness
	- transitions and clarity
3. Regression hardening:
	- existing mining/building/combat behavior preserved
4. Create post-demo roadmap to full 18-type expansion

### Self-Check Gate H

1. Playtest sessions complete full loop without critical blockers
2. Existing game systems remain intact
3. Expansion backlog documented for remaining 15 types

---

## Testing Strategy by Layer

### Unit Tests

1. Type effectiveness
2. Damage calculation
3. Status effect resolution
4. XP/level-up
5. Spawn cap enforcement

### Integration Tests

1. Room packet order: spawn -> encounter -> turn resolve -> reward/despawn
2. Battle reconnect/desync handling
3. Persistence for owned creatures and progression

### Rendering/Performance Tests

1. Creature render buffer correctness
2. Animation state sync correctness
3. Shadow technique benchmark runs across all scenes

### Regression Tests

1. Existing block actions still work
2. Existing player combat path still works
3. Existing network tick flow not degraded

---

## Dependency Graph (Execution Order)

1. Phase 0 must complete before valid comparisons can be claimed
2. Phase 1 blocks Phases 2 and 4
3. Phase 2 protocol stability should be reached before final Phase 3 sync polish
4. Phase 3 and late Phase 2 can overlap
5. Phase 5 can start after Phase 0, but should be tuned with creature-heavy scenes from Phases 3-4
6. Phase 6 requires completed Phase 5
7. Phase 7 depends on Phases 4 and 6 results

---

## Final Definition of Done

Project is complete for this milestone when:

1. 15 original creatures (5 each Fire/Water/Grass) are in-game with blocky models and animations
2. Wild spawn system is deterministic and capped
3. Starter selection and full wild battle loop are playable end-to-end
4. Real-time 3D move visuals run during turn resolution
5. Shadow maps, shadow volumes, and AO variant all render and are runtime-switchable
6. Performance/accuracy comparison outputs are generated and report-ready
7. Existing core game systems remain functional with no major regressions
