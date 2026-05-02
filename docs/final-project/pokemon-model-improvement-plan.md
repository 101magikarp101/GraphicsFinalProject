# Pokemon Model Improvement Plan

## Goal
Make each starter and wild species read as distinct silhouettes and materials instead of sharing one template body.

## Current Problem Summary
- Most creatures share near-identical proportions and part layouts.
- Visual identity is carried mostly by color, which is not enough at distance.
- Animation beats are likely reused without species-specific timing/personality.

## Principles
- Prioritize silhouette first, texture second.
- Preserve gameplay readability: hitbox center and eye-line should remain predictable.
- Keep triangle/voxel budget scalable for large creature counts.
- Make species variation data-driven (not hardcoded per renderer branch).

## Phase 1: Data Model for Species Geometry (1-2 days)
1. Add a species model descriptor schema.
2. Move body-part dimensions and offsets into per-species config.
3. Include optional attachments: horns, fins, tail segments, wings, crest, spikes.
4. Add per-species material palette entries for primary/secondary/accent/emissive.

Proposed schema fields:
- bodyShape: compact, serpentine, avian, quadruped, biped-heavy, biped-light
- proportions: torso, head, limbLength, limbThickness, neckLength, tailLength
- appendages: list of typed modules with scale, offset, yaw/pitch roll defaults
- surfaceProfile: smooth, plated, rocky, fluffy, leafy
- animationStyle: idle sway, bob, predatory crouch, float, hopping

## Phase 2: Procedural Part Assembly (2-4 days)
1. Build a part assembler that composes creature meshes from descriptors.
2. Implement reusable primitives: torso, head, limb, wing, fin, tail chain, horn.
3. Support mirrored parts with asymmetry override.
4. Add LOD rules for distant creatures (fewer appendage segments).

Deliverable:
- Species-specific generated model data at load time, cached per species id.

## Phase 3: Species Signature Pass (2-3 days)
1. Define one signature trait per species family:
- ember line: angular horns + tapered tail ember tip
- tidal line: dorsal fins + smooth rounded limbs
- vine line: leaf frills + thicker rooted legs
2. Add silhouette tests in side/front/top preview snapshots.
3. Reject any species whose silhouette overlap exceeds threshold with another species.

## Phase 4: Material and Texture Identity (2-3 days)
1. Add palette ramps per species (base, shadow, highlight, accent).
2. Introduce species-specific pattern masks (stripes, spots, gradients, edge highlights).
3. Keep brightness compression to avoid white clipping in daylight.
4. Add optional emissive accents for rare/status variants only.

## Phase 5: Animation Personality Layer (2-4 days)
1. Parameterize idle and locomotion by species weight and temperament.
2. Add species-specific anticipation and recovery timings on battle actions.
3. Add secondary motion channels (tail lag, wing settle, crest bounce).
4. Keep shared animation graph, but feed species profile constants.

## Phase 6: Tooling and Workflow (1-2 days)
1. Add a model preview scene in client debug UI.
2. Add sliders/toggles for species descriptor tuning.
3. Add one-click export of species snapshot sheets for review.
4. Add JSON validation for descriptor schema.

## Phase 7: Performance and Quality Gates (1-2 days)
1. Budget targets per creature:
- near LOD: target block/vertex cap
- mid LOD: ~60% of near
- far LOD: billboard or minimal proxy
2. Add benchmark cases with 20, 40, 80 active creatures.
3. Add automated checks for missing part links, invalid offsets, and NaN transforms.

## Suggested Initial Backlog
1. Create CreatureModelDescriptor type and migrate 3 starter species.
2. Implement part assembler with torso/head/limb/tail primitives.
3. Add silhouette preview tool and baseline screenshots.
4. Add per-species animationStyle constants to idle + attack windup.
5. Ship first distinct trio (fire/water/grass) and collect playtest feedback.

## Risks
- Over-customization can break readability in crowded scenes.
- Manual tuning time can grow quickly without preview tooling.
- Performance regressions likely if appendages are not LOD-gated early.

## Definition of Done
- At least 6 species have unique silhouettes recognizable at medium distance.
- Starter trio no longer shares identical body template.
- FPS impact remains within agreed benchmark budget.
- Species descriptor pipeline supports adding a new species without renderer code changes.
