# Move VFX Animation Plan

## Goal
Make each move family read as a unique battle action instead of a generic fireball projectile.

## Emberlynx Demo Move Plan
- `ember_jolt`: jittered ember stream with spark-ring impact.
- `flame_rush`: forward cone trail plus close-range burst.
- `magma_lance`: dense elongated lance shaft through target line.
- `dragon_breath`: high-density helix breath plume with expanding impact spiral.

## Fire Family Coverage
- `blaze_arc`: sweeping arced flame blade around the travel core (non-fireball profile).

## Global Move Family Plan
- Electric (`arc_bolt`, `static_lance`): zig-zag arc-chain lightning path.
- Ice (`frost_shard`, `snow_comet`): comet projectile with icy trailing tail.
- Poison (`venom_dart`, `toxic_mist`): expanding toxic cloud with layered rings.
- Ground (`quake_stomp`, `terrashock`): lateral fissure/rift line near impact zone.
- Flying (`gale_slice`, `sky_dart`): crescent wind blades.
- Psychic (`mind_lance`, `psi_wave`): orbiting focus rings around travel core.
- Bug (`chitin_barrage`, `swarm_nip`): jittered swarm barrage stream.
- Rock (`basalt_crash`, `stone_lance`): rising basalt spire cluster at target.
- Ghost/Dark (`specter_orb`, `wraith_bite`, `night_fang`, `shadow_claw`): haunting orbit and phase swirl.
- Fairy (`prism_dust`, `starlight_pulse`): radial prism pulse rings.
- Water (`spark_splash`, `tidal_ram`, `riptide_spike`, `undertow_lash`): sinusoidal undertow ribbon.
- Grass (`vine_snap`, `spore_burst`, `bramble_crush`, `canopy_spike`): thorned orbital crush and petal debris.
- Heavy Physical (`quick_tap`, `body_slammer`, `knuckle_drive`, `rush_upper`, `iron_comet`, `alloy_break`): impact-rush burst.
- Support/Status (`smoke_veil`, `mist_shell`, `bark_guard`, `steady_focus`): layered support aura columns.

## Implementation Notes
- Preserve a shared hit burst so impacts remain readable regardless of family style.
- Keep style selection deterministic by move id first, then by move visual category fallback.
- Reuse existing cube/triangle effect primitives; variation comes from trajectories, ringing, helix, and timing.
- Ensure support/status animations include both orbital rings and visible vertical aura columns.
- Ensure grass animations include a secondary petal debris layer over the thorn orbit.
