# Battle Effect Whiteout Investigation

## Report Scope
Investigated why battle move effects were turning fully white during expansion/impact and implemented fixes in render pipeline + shader + effect composition.

## Symptoms Observed
- Move effects looked saturated at launch, then drifted toward white during expansion.
- Impact bursts looked harsher than travel trails.
- Alpha fade values in effect instances did not visually reduce intensity as expected.

## Root Causes Identified
1. Alpha fade authored but not applied
- In `battle-effects` pass, alpha blending was disabled (`blendAlpha: false`).
- Effect instances reduced alpha over time, but GPU rendered them as opaque blocks.
- Dense overlapping opaque blocks visually approximated white patches.

2. Fog lerp to sky color caused chroma loss
- Fragment shader mixed final effect color directly toward world fog color.
- Under bright daytime fog, expanded effects were pushed toward pale tones.

3. Highlight compression still allowed hue flattening
- Previous tone mapping reduced clipping, but very bright highlights still compressed chroma.
- This was most obvious in dense impact clusters where many bright cubes overlapped.

## Fixes Implemented
1. Enabled alpha blending for battle effects
- File: `src/client/engine/entities/battle-effects.ts`
- Changed `blendAlpha` to `true`.
- Result: authored alpha decay now actually fades expanded/impact voxels.

2. Reduced white drift in shader lighting/fog
- File: `src/client/engine/render/shaders/battleEffect.frag`
- Reduced ambient+diffuse intensity for effect lighting.
- Tightened post-tonemap peak clamp.
- Replaced direct fog-to-sky mix with hue-preserving fog tint.
- Result: effects retain move hue deeper into expansion phase.

3. Kept move-specific colors fully saturated
- File: `src/client/engine/create-game.ts`
- Move palettes remain explicit and non-neutral.
- Special handling for Emberlynx demo moves to avoid fallback desaturation.

## Validation
- Type checks passed for all changed runtime files.
- `bun run build` passes for both minceraft and client bundles.

## Residual Risk
- Extremely bright global lighting + maximum shadow strength can still reduce perceived saturation in edge cases.
- If needed, next step is a dedicated `uEffectSaturationFloor` uniform to enforce minimum chroma independent of scene fog.

## Next Hardening Option
- Add debug sliders in settings for:
  - effect saturation floor
  - fog influence multiplier on battle effects
  - max effect luminance clamp
- This would allow fast tuning per map/time-of-day without code changes.
