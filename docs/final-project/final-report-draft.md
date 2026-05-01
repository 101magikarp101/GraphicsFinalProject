# Final Project Report Draft: Pixelmon-Style Voxel Game with Advanced Shadow Rasterization

## 1. Goals and Algorithms

This project extends a Minecraft-like voxel renderer into a playable Pixelmon-style graphics demo with original blocky creatures, world spawning, starter selection, turn-based battles, real-time 3D attack effects, progression, and a runtime comparison of three shadow techniques: voxel ambient occlusion, shadow maps, and stencil shadow volumes. The graphics focus is advanced rasterized shadows in a large voxel world, using the same deterministic benchmark scenes for each technique so visual quality and efficiency can be compared.

Ambient occlusion is the baseline. Each visible cube carries per-face vertex occlusion samples from neighboring voxel occupancy. In the fragment shader these four values are bilinearly interpolated over the face and converted to an attenuation term

`AO = mix(0.3, 1.0, pow(clamp(ao / 3, 0, 1), 0.75))`.

This is stable and cheap because it is baked into the visible chunk buffers, but it only approximates local contact darkness and cannot cast directional shadows.

Shadow mapping uses a directional light-space camera. For a fragment position `p`, the renderer computes `p_l = LVP * p`, maps it to depth-texture coordinates, and compares the receiver depth against the stored caster depth with a slope-scaled bias. A 3x3 percentage-closer filter averages nearby comparisons, and the user-facing shadow-strength slider controls the final direct-light attenuation:

`visibility = mean(depth_receiver - bias <= depth_shadow)`, `direct = mix(1 - strength, 1, visibility)`.

This gives conventional cast shadows and is efficient for large terrain, but aliasing, acne, and peter-panning remain visible tradeoffs when the light projection covers a large area.

Stencil shadow volumes follow the z-fail method described in GPU Gems 3 and classic OpenGL stencil shadow-volume references. The sun/moon light is now treated as a normalized directional light. For each cube, faces with `dot(n, l) > 0` form the front cap; the same cap is extruded in direction `-l` to form the back cap; silhouette edges are detected where adjacent face signs differ and extruded into quads. The resulting closed volume is rendered into the stencil buffer with color and depth writes disabled. Back faces increment on depth fail and front faces decrement on depth fail. Pixels whose stencil value is nonzero are inside at least one shadow volume, so a full-screen overlay darkens only those pixels. This produces hard, pixel-stable masks and is visibly stronger than the previous approximation, but costs fill rate and uses finite extrusion instead of true homogeneous infinity.

References: NVIDIA GPU Gems 3, Chapter 11, "Efficient and Robust Shadow Volumes"; Paul’s Projects, "OpenGL Shadow Volumes Technical Info"; OpenGL SIGGRAPH 1999 notes on stencil shadow volumes.

## 2. Implementation Engineering, Results, and Limitations

The renderer is organized around `RenderView` in `src/client/engine/render/renderer.ts`. The normal terrain pass uses `blankCube.vert/frag`, the shadow-map pass uses `shadowMap.vert/frag`, and the stencil-volume path uses `shadowVolume.vert/frag` plus `shadowOverlay.vert/frag`. `SceneLighting` now exposes both a skybox sun position and a normalized directional light vector, so terrain, entities, objects, shadow maps, and shadow volumes use consistent light direction. The diagnostics HUD exposes runtime controls for shadow technique and shadow strength. Preferences persist these controls in local storage. Benchmark query parameters include `benchShadow` and `benchShadowStrength`, and benchmark exports include JSON, CSV, Markdown rows, and an SVG graph path.

The shadow-volume geometry builder is isolated in `src/client/engine/render/shadow-volume.ts` and covered by `tests/shadow-volume.test.ts`. The tests check that the generated volume is closed, that triangle winding points outward for correct front/back stencil counting, and that vertices extrude away from the directional light. This matters because z-fail stencil shadow volumes require closed caps; missing or inward-facing faces break the stencil balance.

Static implementation metrics are in `docs/final-project/shadow-technique-static-metrics.csv`, with a graph in `docs/final-project/shadow-technique-static-graph.svg`. Runtime benchmark capture is implemented in `scripts/capture-shadow-benchmarks.mjs`; it drives Chrome through the DevTools Protocol against the local Vite app and writes `shadow-benchmark-results.json`, `shadow-benchmark-summary.csv`, `shadow-benchmark-summary.md`, and `shadow-benchmark-graphs.svg`. In this Codex environment, launching Chrome was blocked by the approval system, so those runtime GPU numbers should be generated locally with:

`node scripts/capture-shadow-benchmarks.mjs`

Known limitations: shadow maps currently use terrain cubes as casters/receivers and do not yet project shadows onto every custom entity shader. Shadow volumes cast from visible terrain cubes and darken the already-rendered scene through a stencil mask, including entities in the masked region, but the far cap is finite rather than truly at infinity because WebGL does not expose desktop depth-clamp behavior. Both advanced techniques use hard shadows; soft shadows are only approximated in the shadow-map path by PCF. The Pixelmon gameplay layer is functional for demo purposes, but balance and expansion to all 18 creature types remain future work.
