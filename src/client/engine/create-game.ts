import { createResizeObserver } from "@solid-primitives/resize-observer";
import { makeTimer } from "@solid-primitives/timer";
import { Vec3 } from "gl-matrix";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { CubeType } from "@/client/engine/render/cube-types";
import type { BattleMoveVisualKind, BattleSessionState } from "@/game/battle";
import { CHUNK_SIZE } from "@/game/chunk";
import type { CreaturePublicState } from "@/game/creature";
import { findTargetedCreatureId } from "@/game/creature-targeting";
import { PlacedObjectType, RENDERABLE_PLACED_OBJECT_TYPES } from "@/game/object-placement";
import { filterRenderablePlacedObjects } from "@/game/object-placement-render";
import { PLAYER_SPEED, blockIntersectsPlayer, type Player, type PlayerInput, type PlayerPositionPacket } from "@/game/player";
import { findTargetedPlayerId } from "@/game/player-targeting";
import { DAY_LENGTH_S } from "@/game/time";
import {
  type BenchmarkConfig,
  type BenchmarkSample,
  type BenchmarkScene,
  type BenchmarkSummary,
  benchmarkSamplesToCsv,
  benchmarkSummariesToMarkdown,
  benchmarkSummaryToCsv,
  createRateMeter,
  createRingBuffer,
  summarizeBenchmark,
} from "../primitives";
import type { joinWorld } from "../primitives/join-world";
import { CameraController } from "./camera-controller";
import { ChunkManager } from "./chunks";
import { ChunkWorkerClient } from "./chunks/client";
import {
  type BattleEffectInstance,
  battleEffectPassDef,
  createEntityPipeline,
  creatureHighlightPassDef,
  creaturePassDef,
  creaturePipelineConfig,
  type EntityDrawData,
  type GpuBuffers,
  ensureBuffer,
  packBattleEffects,
  packPlacedObjects,
  packPlacedRocks,
  placedObjectPassDef,
  placedRockPassDef,
  playerPassDef,
  playerPipelineConfig,
} from "./entities";
import { type PlayerRenderState, packPlayerRenderStates } from "./entities/player-render-state";
import { createInput, type InputOptions } from "./input";
import type { RaycastHit } from "./raycast";
import { raycastVoxels } from "./raycast";
import { Renderer } from "./render/renderer";
import type { ShadowTechnique } from "./render/shadow-technique";
import { createRenderLoop } from "./render-loop";
import { SceneLighting } from "./scene-lighting";

export interface CreateGameArgs {
  glCanvas: () => HTMLCanvasElement | undefined;
  /** Output of `joinWorld()` — provides player, remote players, tick info, input, etc. */
  room: ReturnType<typeof joinWorld>;
  preferences: {
    mouseSensitivity: () => number;
    invertY: () => boolean;
    renderDistance: () => number;
    showMobHighlight: () => boolean;
    shadowTechnique: () => ShadowTechnique;
    shadowStrength: () => number;
  };
  /** Whether first-person movement/look input should currently be active. */
  inputEnabled?: () => boolean;
  /** Whether debug-only world-space render aids should be drawn. */
  debugVisuals?: () => boolean;
  benchmark?: BenchmarkConfig;
  shortcuts?: Omit<InputOptions, "onReset">;
}

/** Client-side rendering metrics exposed to the diagnostics panel. */
export interface ClientDiagnostics {
  fps: number;
  frameCount: number;
  /** Client-measured wall-clock time for the tick function (ms). */
  computeTimeMs: number;
  /** Rolling ring-buffer of recent compute times for sparkline display. */
  computeTimeHistory: number[];
  /** GPU-measured draw time via EXT_disjoint_timer_query (ms). 0 if unsupported. */
  gpuTimeMs: number;
  /** Rolling ring-buffer of recent GPU times for sparkline display. */
  gpuTimeHistory: number[];
  p95ComputeTimeMs: number;
  p95GpuTimeMs: number;
  visibleCreatures: number;
  pointerLocked: boolean;
}

export interface BenchmarkDiagnostics {
  enabled: boolean;
  active: boolean;
  scene: BenchmarkScene;
  shadowTechnique: ShadowTechnique;
  shadowStrength: number;
  elapsedS: number;
  durationS: number;
  sampleCount: number;
  summary?: BenchmarkSummary;
}

/** Server-side performance metrics derived from `ServerTick` packets. */
export interface ServerDiagnostics {
  /** Milliseconds per server tick (reported in the `WorldStatePacket`). */
  mspt: number;
  /** Rolling ring-buffer of recent mspt values. */
  msptHistory: number[];
  /** How many server ticks we receive per second. */
  snapsPerSec: number;
  /** How many position packets we send to the server per second. */
  packetsPerSec: number;
  /** Server-authoritative time of day in seconds. */
  timeOfDayS: number;
}

interface MutableGameState {
  playerPosition: Vec3;
  creatureNametags: CreatureNametag[];
  diagnostics: {
    client: ClientDiagnostics;
    server: ServerDiagnostics;
    benchmark: BenchmarkDiagnostics;
  };
}

export interface CreatureNametag {
  id: string;
  label: string;
  leftPx: number;
  topPx: number;
  scale: number;
  alpha: number;
}

function withBattleCreatures(
  creatures: Record<string, CreaturePublicState>,
  battle: BattleSessionState | null,
  nowMs: number,
): Record<string, CreaturePublicState> {
  if (!battle?.active) return creatures;
  return {
    ...creatures,
    [battle.starter.id]: battleCreatureToPublic(battle, "starter", nowMs),
    [battle.wild.id]: battleCreatureToPublic(battle, "wild", nowMs),
  };
}

function battleCreatureToPublic(
  battle: BattleSessionState,
  actor: "starter" | "wild",
  nowMs: number,
): CreaturePublicState {
  const creature = battle[actor];
  return {
    id: creature.id,
    speciesId: creature.speciesId,
    x: creature.x,
    y: creature.y + hitReactionOffset(battle, actor, nowMs),
    z: creature.z,
    yaw: creature.yaw,
    level: creature.level,
    hp: creature.hp,
    maxHp: creature.maxHp,
    isWild: actor === "wild",
    status: creature.status,
  };
}

function hitReactionOffset(battle: BattleSessionState, actor: "starter" | "wild", nowMs: number): number {
  const animation = battle.lastTurnAnimation;
  if (!animation) return 0;
  let offset = 0;
  for (const action of animation.actions) {
    const target = action.actor === "starter" ? "wild" : "starter";
    if (target !== actor || !action.hit || action.damage <= 0) continue;
    const elapsed = nowMs - action.impactAtMs;
    if (elapsed < 0 || elapsed > 280) continue;
    offset = Math.max(offset, Math.sin((elapsed / 280) * Math.PI) * 0.22);
  }
  return offset;
}

function battleEffectInstances(battle: BattleSessionState | null, nowMs: number): BattleEffectInstance[] {
  const animation = battle?.lastTurnAnimation;
  if (!battle?.active || !animation) return [];

  const effects: BattleEffectInstance[] = [];
  for (const action of animation.actions) {
    if (nowMs < action.startsAtMs || nowMs > action.endsAtMs) continue;
    const source = action.actor === "starter" ? battle.starter : battle.wild;
    const target = action.actor === "starter" ? battle.wild : battle.starter;
    const color = effectColorForMove(action.moveId, action.visualKind);
    const travelT = clamp01((nowMs - action.startsAtMs) / Math.max(1, action.impactAtMs - action.startsAtMs));
    const impactElapsed = nowMs - action.impactAtMs;
    const style = moveVfxStyle(action.moveId, action.visualKind);
    const yaw = Math.atan2(target.x - source.x, target.z - source.z);

    if (style === "ember-jolt") {
      for (let i = 0; i < 24; i++) {
        const t = clamp01(travelT - i * 0.022);
        const bx = lerp(source.x, target.x, t);
        const by = lerp(source.y + 0.78, target.y + 0.74, t);
        const bz = lerp(source.z, target.z, t);
        const jitter = i * 0.57 + travelT * Math.PI * 4.8;
        effects.push({
          x: bx + Math.sin(jitter) * 0.28,
          y: by + Math.sin(jitter * 1.7) * 0.11,
          z: bz + Math.cos(jitter) * 0.18,
          scale: 0.08 + (1 - i / 24) * 0.12,
          shape: i % 2,
          elongation: 1.22,
          yaw: yaw + Math.sin(jitter) * 0.18,
          color: [color[0], color[1], color[2], 0.86],
        });
      }
      appendEngulfCloud(effects, [1, 0.44, 0.16, 0.86], target.x, target.y, target.z, impactElapsed, {
        durationMs: 320,
        radius: 0.85,
        verticalRadius: 0.58,
        layers: 2,
        density: 14,
        drift: 0.11,
      });
    } else if (style === "magma-lance") {
      const px = lerp(source.x, target.x, travelT);
      const py = lerp(source.y + 0.82, target.y + 0.76, travelT);
      const pz = lerp(source.z, target.z, travelT);
      for (let i = 0; i < 18; i++) {
        const s = i / 17;
        effects.push({
          x: px - Math.sin(yaw) * (s - 0.5) * 1.45,
          y: py + (0.5 - s) * 0.24,
          z: pz - Math.cos(yaw) * (s - 0.5) * 1.45,
          scale: 0.08 + (1 - Math.abs(s - 0.5) * 2) * 0.15,
          shape: i % 3 === 0 ? 1 : 0,
          elongation: 1.95,
          yaw,
          color: [color[0], color[1], color[2], 0.9],
        });
      }
      if (impactElapsed >= 0 && impactElapsed <= 420) {
        const t = impactElapsed / 420;
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2 + t * Math.PI * 1.2;
          effects.push({
            x: target.x + Math.cos(a) * (0.3 + t * 0.7),
            y: target.y + 0.42 + (i % 3) * 0.08 + t * 0.22,
            z: target.z + Math.sin(a) * (0.3 + t * 0.7),
            scale: 0.08 + (1 - t) * 0.13,
            shape: i % 2,
            elongation: 1.85,
            yaw: a,
            color: [1, 0.46, 0.19, (1 - t) * 0.82],
          });
        }
      }
    } else if (style === "dragon-breath") {
      for (let i = 0; i < 48; i++) {
        const t = clamp01(travelT - i * 0.015);
        const bx = lerp(source.x, target.x, t);
        const by = lerp(source.y + 0.92, target.y + 0.78, t);
        const bz = lerp(source.z, target.z, t);
        const helix = i * 0.35 + travelT * Math.PI * 5.2;
        const radius = 0.1 + (i / 48) * 0.45;
        effects.push({
          x: bx + Math.cos(helix) * radius,
          y: by + Math.sin(helix * 1.25) * 0.16,
          z: bz + Math.sin(helix) * radius,
          scale: 0.09 + (1 - i / 48) * 0.14,
          shape: i % 3 === 0 ? 1 : 0,
          elongation: 1.45,
          yaw: yaw + helix * 0.08,
          color: [color[0], color[1], color[2], 0.9],
        });
      }
      appendEngulfCloud(effects, [1, 0.38, 0.14, 0.9], target.x, target.y, target.z, impactElapsed, {
        durationMs: 520,
        radius: 1.2,
        verticalRadius: 0.82,
        layers: 3,
        density: 20,
        drift: 0.16,
      });
    } else if (style === "flame-rush") {
      const lunge = Math.sin(travelT * Math.PI);
      const bx = lerp(source.x, target.x, 0.36 * lunge);
      const bz = lerp(source.z, target.z, 0.36 * lunge);
      const by = source.y + 0.74;
      for (let i = 0; i < 24; i++) {
        const coneT = i / 24;
        const spread = coneT * 0.62;
        const ring = ((i % 8) / 8) * Math.PI * 2 + lunge * Math.PI * 2.1;
        effects.push({
          x: bx - Math.sin(yaw) * (coneT * 1.25) + Math.cos(ring) * spread,
          y: by + 0.05 + Math.sin(ring * 2.0) * 0.07,
          z: bz - Math.cos(yaw) * (coneT * 1.25) + Math.sin(ring) * spread,
          scale: 0.08 + (1 - coneT) * 0.14,
          shape: i % 2,
          elongation: 1.36,
          yaw,
          color: [color[0], color[1], color[2], 0.86],
        });
      }
      appendEngulfCloud(effects, [1, 0.35, 0.12, 0.84], target.x, target.y, target.z, impactElapsed, {
        durationMs: 260,
        radius: 0.7,
        verticalRadius: 0.48,
        layers: 2,
        density: 10,
        drift: 0.08,
      });
    } else if (style === "blaze-arc") {
      const px = lerp(source.x, target.x, travelT);
      const py = lerp(source.y + 0.82, target.y + 0.82, travelT);
      const pz = lerp(source.z, target.z, travelT);
      for (let i = 0; i < 28; i++) {
        const t = i / 27;
        const arc = -0.5 + t;
        const swing = Math.sin((t + travelT * 0.65) * Math.PI * 2.0) * 0.4;
        effects.push({
          x: px + Math.cos(yaw + arc * 0.95) * (0.32 + Math.abs(arc) * 0.46),
          y: py + Math.sin((t + travelT) * Math.PI) * 0.22,
          z: pz + Math.sin(yaw + arc * 0.95) * (0.32 + Math.abs(arc) * 0.46),
          scale: 0.06 + (1 - Math.abs(arc) * 1.4) * 0.12,
          shape: i % 2,
          elongation: 1.62,
          yaw: yaw + swing,
          color: [color[0], color[1], color[2], 0.9],
        });
      }
      appendEngulfCloud(effects, [1, 0.52, 0.2, 0.86], target.x, target.y, target.z, impactElapsed, {
        durationMs: 360,
        radius: 0.92,
        verticalRadius: 0.62,
        layers: 2,
        density: 12,
        drift: 0.12,
      });
    } else if (style === "arc-chain") {
      const px = lerp(source.x, target.x, travelT);
      const py = lerp(source.y + 0.86, target.y + 0.82, travelT);
      const pz = lerp(source.z, target.z, travelT);
      for (let i = 0; i < 28; i++) {
        const t = i / 27;
        const sx = lerp(source.x, px, t);
        const sy = lerp(source.y + 0.86, py, t);
        const sz = lerp(source.z, pz, t);
        const zig = Math.sin(t * Math.PI * 8 + travelT * Math.PI * 6.5) * 0.22;
        effects.push({
          x: sx + Math.cos(yaw) * zig,
          y: sy + Math.sin(t * Math.PI * 4 + travelT * 4.2) * 0.08,
          z: sz - Math.sin(yaw) * zig,
          scale: 0.06 + (1 - t) * 0.1,
          shape: 1,
          elongation: 1.1,
          yaw,
          color: [color[0], color[1], color[2], 0.9],
        });
      }
      if (impactElapsed >= 0 && impactElapsed <= 320) {
        const t = impactElapsed / 320;
        for (let ring = 0; ring < 3; ring++) {
          const y = target.y + 0.58 + ring * 0.18;
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + t * Math.PI * (2.2 + ring * 0.4);
            effects.push({
              x: target.x + Math.cos(a) * (0.42 + ring * 0.08),
              y,
              z: target.z + Math.sin(a) * (0.42 + ring * 0.08),
              scale: 0.05 + (1 - t) * 0.1,
              shape: 1,
              elongation: 1.18,
              yaw: a,
              color: [0.98, 0.94, 0.38, (1 - t) * 0.84],
            });
          }
        }
      }
    } else if (style === "frost-comet") {
      const px = lerp(source.x, target.x, travelT);
      const py = lerp(source.y + 0.82, target.y + 0.78, travelT);
      const pz = lerp(source.z, target.z, travelT);
      for (let i = 0; i < 20; i++) {
        const tail = i / 20;
        effects.push({
          x: px - Math.sin(yaw) * tail * 0.8,
          y: py + tail * 0.06,
          z: pz - Math.cos(yaw) * tail * 0.8,
          scale: 0.05 + (1 - tail) * 0.16,
          shape: i % 2,
          elongation: 1.8,
          yaw,
          color: [color[0], color[1], color[2], 0.88],
        });
      }
      if (impactElapsed >= 0 && impactElapsed <= 360) {
        const t = impactElapsed / 360;
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          effects.push({
            x: target.x + Math.cos(a) * (0.42 + t * 0.42),
            y: target.y + 0.52 + (i % 4) * 0.11,
            z: target.z + Math.sin(a) * (0.42 + t * 0.42),
            scale: 0.06 + (1 - t) * 0.12,
            shape: i % 2,
            elongation: 1.55,
            yaw: a,
            color: [0.72, 0.95, 1, (1 - t) * 0.84],
          });
        }
      }
    } else if (style === "toxic-cloud") {
      const pulseT = clamp01((nowMs - action.startsAtMs) / Math.max(1, action.endsAtMs - action.startsAtMs));
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + pulseT * Math.PI * 0.8;
        const r = 0.2 + pulseT * 0.8 + (i % 3) * 0.04;
        effects.push({
          x: source.x + Math.cos(a) * r,
          y: source.y + 0.9 + Math.sin(a * 1.7 + pulseT * 5) * 0.12,
          z: source.z + Math.sin(a) * r,
          scale: 0.08 + pulseT * 0.14,
          shape: i % 3 === 0 ? 1 : 0,
          elongation: 1.15,
          yaw: a,
          color: [color[0], color[1], color[2], 0.82],
        });
      }
      appendEngulfCloud(effects, [0.62, 0.45, 0.83, 0.78], target.x, target.y, target.z, impactElapsed, {
        durationMs: 460,
        radius: 1,
        verticalRadius: 0.7,
        layers: 3,
        density: 16,
        drift: 0.09,
      });
    } else if (style === "quake-rift") {
      const t = travelT;
      const midX = lerp(source.x, target.x, 0.55);
      const midZ = lerp(source.z, target.z, 0.55);
      const perpX = Math.cos(yaw);
      const perpZ = -Math.sin(yaw);
      for (let i = 0; i < 22; i++) {
        const d = -1 + (i / 21) * 2;
        effects.push({
          x: midX + perpX * d * 0.9,
          y: target.y + 0.48 + Math.sin(i + t * 7) * 0.04,
          z: midZ + perpZ * d * 0.9,
          scale: 0.1 + (1 - Math.abs(d)) * 0.08,
          shape: 0,
          elongation: 1.05,
          yaw: yaw + Math.PI * 0.5,
          color: [color[0], color[1], color[2], 0.86],
        });
      }
      if (impactElapsed >= 0 && impactElapsed <= 340) {
        const t = impactElapsed / 340;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          effects.push({
            x: target.x + Math.cos(a) * (0.2 + t * 1.05),
            y: target.y + 0.4,
            z: target.z + Math.sin(a) * (0.2 + t * 1.05),
            scale: 0.07 + (1 - t) * 0.11,
            shape: 0,
            elongation: 1.4,
            yaw: a,
            color: [0.78, 0.6, 0.34, (1 - t) * 0.78],
          });
        }
      }
    } else if (style === "gale-crescent") {
      const px = lerp(source.x, target.x, travelT);
      const py = lerp(source.y + 0.84, target.y + 0.82, travelT);
      const pz = lerp(source.z, target.z, travelT);
      for (let i = 0; i < 20; i++) {
        const a = ((i / 19) - 0.5) * Math.PI;
        const r = 0.4 + (1 - Math.abs(a) / Math.PI) * 0.22;
        effects.push({
          x: px + Math.cos(yaw + a) * r,
          y: py + Math.sin(a * 1.2) * 0.15,
          z: pz + Math.sin(yaw + a) * r,
          scale: 0.05 + (1 - Math.abs(a) / Math.PI) * 0.12,
          shape: 1,
          elongation: 1.55,
          yaw: yaw + a,
          color: [color[0], color[1], color[2], 0.84],
        });
      }
    } else if (style === "mind-lance") {
      const px = lerp(source.x, target.x, travelT);
      const py = lerp(source.y + 0.88, target.y + 0.85, travelT);
      const pz = lerp(source.z, target.z, travelT);
      for (let i = 0; i < 30; i++) {
        const ringT = i / 30;
        const phase = ringT * Math.PI * 2 + travelT * Math.PI * 4;
        effects.push({
          x: px + Math.cos(phase) * 0.35 * (1 - ringT * 0.4),
          y: py + Math.sin(phase * 1.4) * 0.12,
          z: pz + Math.sin(phase) * 0.35 * (1 - ringT * 0.4),
          scale: 0.05 + (1 - ringT) * 0.12,
          shape: 1,
          elongation: 1.25,
          yaw: phase,
          color: [color[0], color[1], color[2], 0.86],
        });
      }
      if (impactElapsed >= 0 && impactElapsed <= 360) {
        const t = impactElapsed / 360;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + t * Math.PI * 1.8;
          effects.push({
            x: target.x + Math.cos(a) * (0.28 + t * 0.5),
            y: target.y + 0.82 + Math.sin(a * 2.2) * 0.08,
            z: target.z + Math.sin(a) * (0.28 + t * 0.5),
            scale: 0.05 + (1 - t) * 0.1,
            shape: 1,
            elongation: 1.3,
            yaw: a,
            color: [0.98, 0.58, 0.95, (1 - t) * 0.8],
          });
        }
      }
    } else if (style === "swarm-barrage") {
      for (let i = 0; i < 26; i++) {
        const t = clamp01(travelT - i * 0.02);
        const wobble = i * 0.5 + travelT * 7;
        effects.push({
          x: lerp(source.x, target.x, t) + Math.sin(wobble) * 0.22,
          y: lerp(source.y + 0.78, target.y + 0.82, t) + Math.cos(wobble * 1.6) * 0.1,
          z: lerp(source.z, target.z, t) + Math.cos(wobble) * 0.22,
          scale: 0.04 + (1 - i / 26) * 0.09,
          shape: i % 2,
          elongation: 1.05,
          yaw: yaw + wobble * 0.1,
          color: [color[0], color[1], color[2], 0.84],
        });
      }
    } else if (style === "basalt-spire") {
      const t = travelT;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        effects.push({
          x: target.x + Math.cos(a) * (0.16 + t * 0.35),
          y: target.y + 0.45 + (i % 4) * 0.12 + t * 0.35,
          z: target.z + Math.sin(a) * (0.16 + t * 0.35),
          scale: 0.08 + (1 - t) * 0.14,
          shape: 0,
          elongation: 1.9,
          yaw: a,
          color: [color[0], color[1], color[2], 0.86],
        });
      }
    } else if (style === "specter-orbit") {
      const px = lerp(source.x, target.x, travelT);
      const py = lerp(source.y + 0.86, target.y + 0.82, travelT);
      const pz = lerp(source.z, target.z, travelT);
      for (let i = 0; i < 24; i++) {
        const phase = (i / 24) * Math.PI * 2 + travelT * Math.PI * 2.8;
        effects.push({
          x: px + Math.cos(phase) * 0.42,
          y: py + Math.sin(phase * 1.8) * 0.14,
          z: pz + Math.sin(phase) * 0.42,
          scale: 0.06 + (1 - i / 24) * 0.1,
          shape: i % 2,
          elongation: 1.3,
          yaw: phase,
          color: [color[0], color[1], color[2], 0.82],
        });
      }
      for (let i = 0; i < 14; i++) {
        const t = clamp01(travelT - i * 0.04);
        const gx = lerp(source.x, target.x, t);
        const gy = lerp(source.y + 0.86, target.y + 0.82, t);
        const gz = lerp(source.z, target.z, t);
        const phase = i * 0.8 + travelT * Math.PI * 2.1;
        effects.push({
          x: gx + Math.cos(phase) * 0.18,
          y: gy + Math.sin(phase * 1.3) * 0.09,
          z: gz + Math.sin(phase) * 0.18,
          scale: 0.06 + (1 - i / 14) * 0.08,
          shape: 1,
          elongation: 1.18,
          yaw: phase,
          color: [color[0], color[1], color[2], 0.72],
        });
      }
    } else if (style === "prism-pulse") {
      const pulseT = clamp01((nowMs - action.startsAtMs) / Math.max(1, action.endsAtMs - action.startsAtMs));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const px = source.x + Math.cos(a) * (0.12 + pulseT * 0.9);
        const pz = source.z + Math.sin(a) * (0.12 + pulseT * 0.9);
        effects.push({
          x: px,
          y: source.y + 0.9 + Math.sin(pulseT * Math.PI * 2 + a) * 0.1,
          z: pz,
          scale: 0.06 + pulseT * 0.14,
          shape: 1,
          elongation: 1.32,
          yaw: a,
          color: [color[0], color[1], color[2], 0.86],
        });
      }
    } else if (style === "undertow-lash") {
      for (let i = 0; i < 30; i++) {
        const t = clamp01(travelT - i * 0.02);
        const bx = lerp(source.x, target.x, t);
        const by = lerp(source.y + 0.79, target.y + 0.79, t);
        const bz = lerp(source.z, target.z, t);
        const wave = i * 0.42 + travelT * Math.PI * 3.2;
        effects.push({
          x: bx + Math.cos(yaw) * Math.sin(wave) * 0.26,
          y: by + Math.sin(wave * 1.2) * 0.11,
          z: bz - Math.sin(yaw) * Math.sin(wave) * 0.26,
          scale: 0.07 + (1 - i / 30) * 0.11,
          shape: i % 2,
          elongation: 1.28,
          yaw,
          color: [color[0], color[1], color[2], 0.86],
        });
      }
      if (impactElapsed >= 0 && impactElapsed <= 360) {
        const t = impactElapsed / 360;
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2 + t * Math.PI * 1.4;
          effects.push({
            x: target.x + Math.cos(a) * (0.45 + t * 0.42),
            y: target.y + 0.5 + Math.sin(a * 1.7 + t * 6) * 0.12,
            z: target.z + Math.sin(a) * (0.45 + t * 0.42),
            scale: 0.06 + (1 - t) * 0.1,
            shape: i % 2,
            elongation: 1.36,
            yaw: a,
            color: [0.28, 0.72, 1, (1 - t) * 0.82],
          });
        }
      }
    } else if (style === "bramble-crush") {
      const px = lerp(source.x, target.x, travelT);
      const py = lerp(source.y + 0.82, target.y + 0.8, travelT);
      const pz = lerp(source.z, target.z, travelT);
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + travelT * Math.PI * 1.4;
        const r = 0.14 + (i % 3) * 0.08 + travelT * 0.35;
        effects.push({
          x: px + Math.cos(a) * r,
          y: py + (i % 5) * 0.03,
          z: pz + Math.sin(a) * r,
          scale: 0.06 + (1 - i / 22) * 0.12,
          shape: 0,
          elongation: 1.48,
          yaw: a,
          color: [color[0], color[1], color[2], 0.85],
        });
      }
      for (let i = 0; i < 14; i++) {
        const petalT = i / 14;
        const phase = petalT * Math.PI * 2 + travelT * Math.PI * 1.9;
        effects.push({
          x: px + Math.cos(phase) * (0.22 + petalT * 0.35),
          y: py + 0.08 + Math.sin(phase * 2.2) * 0.06,
          z: pz + Math.sin(phase) * (0.22 + petalT * 0.35),
          scale: 0.04 + (1 - petalT) * 0.08,
          shape: 1,
          elongation: 1.18,
          yaw: phase,
          color: [0.73, 0.92, 0.55, 0.74],
        });
      }
    } else if (style === "impact-rush") {
      const lungeT = Math.sin(travelT * Math.PI);
      const cx = lerp(source.x, target.x, 0.3 * lungeT);
      const cy = source.y + 0.75;
      const cz = lerp(source.z, target.z, 0.3 * lungeT);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + lungeT * Math.PI * 2.6;
        effects.push({
          x: cx + Math.cos(a) * 0.24,
          y: cy + Math.sin(a * 2) * 0.05,
          z: cz + Math.sin(a) * 0.24,
          scale: 0.07 + lungeT * 0.11,
          shape: i % 2,
          elongation: 1.08,
          yaw: yaw + a * 0.1,
          color: [color[0], color[1], color[2], 0.88],
        });
      }
    } else if (style === "support-aura") {
      const pulseT = clamp01((nowMs - action.startsAtMs) / Math.max(1, action.endsAtMs - action.startsAtMs));
      for (let ring = 0; ring < 3; ring++) {
        const yOffset = ring * 0.12;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + pulseT * Math.PI * (1.0 + ring * 0.35);
          effects.push({
            x: source.x + Math.cos(a) * (0.2 + pulseT * (0.45 + ring * 0.08)),
            y: source.y + 0.8 + yOffset,
            z: source.z + Math.sin(a) * (0.2 + pulseT * (0.45 + ring * 0.08)),
            scale: 0.05 + pulseT * 0.1,
            shape: 1,
            elongation: 1.2,
            yaw: a,
            color: [color[0], color[1], color[2], 0.8],
          });
        }
      }
      for (let column = 0; column < 4; column++) {
        const a = (column / 4) * Math.PI * 2 + pulseT * Math.PI * 0.8;
        const cx = source.x + Math.cos(a) * 0.38;
        const cz = source.z + Math.sin(a) * 0.38;
        for (let step = 0; step < 5; step++) {
          effects.push({
            x: cx,
            y: source.y + 0.62 + step * 0.13,
            z: cz,
            scale: 0.045 + pulseT * 0.05,
            shape: 0,
            elongation: 1.45,
            yaw: a,
            color: [color[0], color[1], color[2], 0.66],
          });
        }
      }
    } else {
      const px = lerp(source.x, target.x, travelT);
      const py = lerp(source.y + 0.8, target.y + 0.75, travelT);
      const pz = lerp(source.z, target.z, travelT);
      effects.push({
        x: px,
        y: py,
        z: pz,
        scale: 0.2 + Math.sin(travelT * Math.PI) * 0.15,
        shape: 1,
        elongation: 1.65,
        yaw,
        color,
      });
    }

    appendImpactBurst(effects, action.hit, color, target.x, target.y, target.z, impactElapsed);
  }
  return effects;
}

type MoveVfxStyle =
  | "ember-jolt"
  | "flame-rush"
  | "blaze-arc"
  | "magma-lance"
  | "dragon-breath"
  | "arc-chain"
  | "frost-comet"
  | "toxic-cloud"
  | "quake-rift"
  | "gale-crescent"
  | "mind-lance"
  | "swarm-barrage"
  | "basalt-spire"
  | "specter-orbit"
  | "prism-pulse"
  | "undertow-lash"
  | "bramble-crush"
  | "impact-rush"
  | "support-aura"
  | "default-projectile";

function moveVfxStyle(moveId: string, kind: BattleMoveVisualKind): MoveVfxStyle {
  if (moveId === "ember_jolt") return "ember-jolt";
  if (moveId === "flame_rush") return "flame-rush";
  if (moveId === "blaze_arc") return "blaze-arc";
  if (moveId === "magma_lance") return "magma-lance";
  if (moveId === "dragon_breath" || moveId === "drake_surge") return "dragon-breath";

  if (moveId === "arc_bolt" || moveId === "static_lance") return "arc-chain";
  if (moveId === "frost_shard" || moveId === "snow_comet") return "frost-comet";
  if (moveId === "venom_dart" || moveId === "toxic_mist") return "toxic-cloud";
  if (moveId === "quake_stomp" || moveId === "terrashock") return "quake-rift";
  if (moveId === "gale_slice" || moveId === "sky_dart") return "gale-crescent";
  if (moveId === "mind_lance" || moveId === "psi_wave") return "mind-lance";
  if (moveId === "chitin_barrage" || moveId === "swarm_nip") return "swarm-barrage";
  if (moveId === "basalt_crash" || moveId === "stone_lance") return "basalt-spire";
  if (moveId === "specter_orb" || moveId === "wraith_bite" || moveId === "night_fang" || moveId === "shadow_claw") {
    return "specter-orbit";
  }
  if (moveId === "prism_dust" || moveId === "starlight_pulse") return "prism-pulse";
  if (moveId === "riptide_spike" || moveId === "spark_splash" || moveId === "tidal_ram" || moveId === "undertow_lash") {
    return "undertow-lash";
  }
  if (moveId === "vine_snap" || moveId === "spore_burst" || moveId === "bramble_crush" || moveId === "canopy_spike") {
    return "bramble-crush";
  }
  if (moveId === "quick_tap" || moveId === "body_slammer" || moveId === "knuckle_drive" || moveId === "rush_upper" || moveId === "iron_comet" || moveId === "alloy_break") {
    return "impact-rush";
  }
  if (moveId === "smoke_veil" || moveId === "mist_shell" || moveId === "bark_guard" || moveId === "steady_focus") {
    return "support-aura";
  }

  if (kind === "melee") return "impact-rush";
  if (kind === "status") return "support-aura";
  return "default-projectile";
}

function appendImpactBurst(
  effects: BattleEffectInstance[],
  hit: boolean,
  color: [number, number, number, number],
  tx: number,
  ty: number,
  tz: number,
  impactElapsedMs: number,
): void {
  if (impactElapsedMs < 0 || impactElapsedMs > 360) return;
  const t = impactElapsedMs / 360;
  effects.push({
    x: tx,
    y: ty + 0.82,
    z: tz,
    scale: 0.2 + t * 0.55,
    shape: 0,
    elongation: 1,
    yaw: t * Math.PI * 1.15,
    color: [color[0], color[1], color[2], (1 - t) * (hit ? 0.78 : 0.36)],
  });

  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + t * Math.PI * 2.2;
    const radius = 0.18 + t * (hit ? 1.15 : 0.65);
    const elevate = (i % 4) * 0.06;
    effects.push({
      x: tx + Math.cos(angle) * radius,
      y: ty + 0.74 + elevate,
      z: tz + Math.sin(angle) * radius,
      scale: 0.08 + (1 - t) * 0.18,
      shape: i % 3 === 0 ? 1 : 0,
      elongation: i % 3 === 0 ? 1.5 : 1,
      yaw: angle,
      color: [color[0], color[1], color[2], (1 - t) * (hit ? 0.95 : 0.5)],
    });
  }
}

interface EngulfCloudOptions {
  durationMs: number;
  radius: number;
  verticalRadius: number;
  layers: number;
  density: number;
  drift: number;
}

function appendEngulfCloud(
  effects: BattleEffectInstance[],
  color: [number, number, number, number],
  tx: number,
  ty: number,
  tz: number,
  impactElapsedMs: number,
  options: EngulfCloudOptions,
): void {
  if (impactElapsedMs < 0 || impactElapsedMs > options.durationMs) return;
  const t = impactElapsedMs / options.durationMs;
  for (let layer = 0; layer < options.layers; layer++) {
    const yBase = ty + 0.55 + layer * 0.22;
    const layerScale = 1 + layer * 0.18;
    for (let i = 0; i < options.density; i++) {
      const a = (i / options.density) * Math.PI * 2 + t * Math.PI * (1.2 + layer * 0.35);
      const radius = options.radius * layerScale * (0.55 + t * 0.75);
      const drift = Math.sin(a * 1.9 + t * 8 + layer) * options.drift;
      effects.push({
        x: tx + Math.cos(a) * radius + drift,
        y: yBase + Math.sin(a * 1.7 + t * 6.2) * options.verticalRadius,
        z: tz + Math.sin(a) * radius - drift,
        scale: 0.06 + (1 - t) * 0.12,
        shape: i % 2,
        elongation: 1.28,
        yaw: a,
        color: [color[0], color[1], color[2], (1 - t) * color[3]],
      });
    }
  }
}

function effectColorForMove(moveId: string, kind: BattleMoveVisualKind): [number, number, number, number] {
  if (kind === "melee") return [1, 0.95, 0.62, 0.86];
  if (kind === "status") return [0.72, 0.55, 1, 0.72];
  if (moveId.includes("dragon")) return [0.76, 0.46, 1, 0.92];
  if (moveId.includes("drake")) return [0.7, 0.48, 0.98, 0.9];
  if (moveId.includes("arc") || moveId.includes("spark")) return [0.95, 0.92, 0.32, 0.9];
  if (moveId.includes("static")) return [0.98, 0.95, 0.42, 0.9];
  if (moveId.includes("frost") || moveId.includes("ice")) return [0.62, 0.92, 1, 0.9];
  if (moveId.includes("snow")) return [0.68, 0.94, 1, 0.9];
  if (moveId.includes("knuckle") || moveId.includes("fighting")) return [0.98, 0.58, 0.26, 0.88];
  if (moveId.includes("rush_upper")) return [1, 0.62, 0.32, 0.88];
  if (moveId.includes("venom") || moveId.includes("poison")) return [0.7, 0.42, 0.88, 0.88];
  if (moveId.includes("toxic")) return [0.64, 0.46, 0.82, 0.88];
  if (moveId.includes("quake") || moveId.includes("ground")) return [0.8, 0.62, 0.33, 0.88];
  if (moveId.includes("terra")) return [0.74, 0.6, 0.38, 0.88];
  if (moveId.includes("gale") || moveId.includes("flying")) return [0.74, 0.9, 1, 0.88];
  if (moveId.includes("sky")) return [0.8, 0.93, 1, 0.88];
  if (moveId.includes("mind") || moveId.includes("psych")) return [0.98, 0.52, 0.92, 0.9];
  if (moveId.includes("psi")) return [0.98, 0.6, 0.95, 0.9];
  if (moveId.includes("chitin") || moveId.includes("bug")) return [0.68, 0.9, 0.34, 0.88];
  if (moveId.includes("swarm")) return [0.72, 0.88, 0.3, 0.88];
  if (moveId.includes("basalt") || moveId.includes("rock")) return [0.72, 0.68, 0.58, 0.88];
  if (moveId.includes("stone")) return [0.76, 0.7, 0.62, 0.88];
  if (moveId.includes("specter") || moveId.includes("ghost")) return [0.62, 0.62, 0.94, 0.9];
  if (moveId.includes("wraith")) return [0.66, 0.64, 0.92, 0.9];
  if (moveId.includes("night") || moveId.includes("dark")) return [0.45, 0.45, 0.72, 0.88];
  if (moveId.includes("shadow")) return [0.5, 0.48, 0.78, 0.88];
  if (moveId.includes("iron") || moveId.includes("steel")) return [0.75, 0.79, 0.84, 0.9];
  if (moveId.includes("alloy")) return [0.78, 0.82, 0.86, 0.9];
  if (moveId.includes("prism") || moveId.includes("fairy")) return [1, 0.7, 0.9, 0.88];
  if (moveId.includes("starlight")) return [1, 0.76, 0.94, 0.88];
  if (moveId.includes("magma")) return [1, 0.4, 0.16, 0.92];
  if (moveId.includes("blaze")) return [1, 0.45, 0.2, 0.92];
  if (moveId.includes("riptide")) return [0.3, 0.72, 1, 0.9];
  if (moveId.includes("undertow")) return [0.24, 0.62, 0.95, 0.9];
  if (moveId.includes("bramble")) return [0.48, 0.9, 0.32, 0.9];
  if (moveId.includes("canopy")) return [0.44, 0.86, 0.36, 0.9];
  if (moveId.includes("ember") || moveId.includes("flame")) return [1, 0.35, 0.14, 0.88];
  if (moveId.includes("splash") || moveId.includes("tidal")) return [0.25, 0.65, 1, 0.84];
  if (moveId.includes("vine") || moveId.includes("spore")) return [0.42, 0.95, 0.35, 0.82];
  return [0.82, 0.86, 1, 0.84];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface MinimapApi {
  /** Increments whenever chunk surface data changes. */
  terrainVersion: () => number;
  /** Number of world blocks available from player center to one map edge. */
  radiusBlocks: number;
  /**
   * Highest loaded block sample for world-space (x, z).
   * High byte = `CubeType`, low byte = surface Y.
   */
  sampleSurface: (wx: number, wz: number) => number | undefined;
}

export interface GameState extends Readonly<MutableGameState> {
  readonly minimap: MinimapApi;
  readonly benchmark: {
    readonly canRun: boolean;
    readonly active: () => boolean;
    start: () => void;
    stop: () => void;
    exportJson: () => void;
    exportCsv: () => void;
    exportMarkdown: () => void;
  };
}

function projectWorldToScreen(
  viewMatrix: Float32Array,
  projMatrix: Float32Array,
  worldX: number,
  worldY: number,
  worldZ: number,
  screenWidth: number,
  screenHeight: number,
): { x: number; y: number; depth: number } | undefined {
  const vx =
    viewMatrix[0] * worldX + viewMatrix[4] * worldY + viewMatrix[8] * worldZ + viewMatrix[12];
  const vy =
    viewMatrix[1] * worldX + viewMatrix[5] * worldY + viewMatrix[9] * worldZ + viewMatrix[13];
  const vz =
    viewMatrix[2] * worldX + viewMatrix[6] * worldY + viewMatrix[10] * worldZ + viewMatrix[14];
  const vw =
    viewMatrix[3] * worldX + viewMatrix[7] * worldY + viewMatrix[11] * worldZ + viewMatrix[15];

  const cx = projMatrix[0] * vx + projMatrix[4] * vy + projMatrix[8] * vz + projMatrix[12] * vw;
  const cy = projMatrix[1] * vx + projMatrix[5] * vy + projMatrix[9] * vz + projMatrix[13] * vw;
  const cz = projMatrix[2] * vx + projMatrix[6] * vy + projMatrix[10] * vz + projMatrix[14] * vw;
  const cw = projMatrix[3] * vx + projMatrix[7] * vy + projMatrix[11] * vz + projMatrix[15] * vw;

  if (cw <= 0.0001) return undefined;

  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;
  if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2 || ndcZ < -1.2 || ndcZ > 1.2) {
    return undefined;
  }

  return {
    x: (ndcX * 0.5 + 0.5) * screenWidth,
    y: (1 - (ndcY * 0.5 + 0.5)) * screenHeight,
    depth: Math.max(0, Math.min(1, ndcZ * 0.5 + 0.5)),
  };
}

function creatureLabel(speciesId: string): string {
  if (!speciesId) return "Pokemon";
  return speciesId
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Sliding window for FPS / TPS / snap-rate averaging. */
const FPS_WINDOW_MS = 500;
/** Number of samples kept in the compute-time and mspt ring buffers. */
const FRAME_HISTORY_SIZE = 120;
/** Clamp input dt so a long tab-away doesn't cause a huge movement spike. */
const MAX_INPUT_DT_MS = 100;
const INPUT_SEND_INTERVAL_MS = 50;
const BENCHMARK_TERMINAL_OUTPUT_ENABLED = false;
const AUTO_BATTLE_TOUCH_RADIUS = 2.25;
const AUTO_BATTLE_TOUCH_HEIGHT = 2.4;
const AUTO_BATTLE_TOUCH_COOLDOWN_MS = 200;
const MAX_ANIMATED_WALK_SPEED = PLAYER_SPEED * 1.35;
const THIRD_PERSON_CAMERA_DISTANCE = 4;
const THIRD_PERSON_CAMERA_MIN_DISTANCE = 0.35;
const THIRD_PERSON_CAMERA_COLLISION_PADDING = 0.15;

type PlayerPerspective = "first-person" | "third-person-back" | "third-person-front";

const PLAYER_PERSPECTIVES: readonly PlayerPerspective[] = ["first-person", "third-person-back", "third-person-front"];
const PLAYER_INSTANCE_LAYOUT: ReadonlyArray<{ name: string; size: number }> = [
  { name: "aOffset", size: 4 },
  { name: "aPitch", size: 1 },
  { name: "aMotion", size: 2 },
  { name: "aCommandPose", size: 1 },
  { name: "aShirtColor", size: 3 },
];

const BENCHMARK_SCENE_ANCHORS: Record<BenchmarkScene, readonly [number, number, number]> = {
  open: [0, 65, 0],
  foliage: [46, 63, 46],
  cave: [0, 34, 0],
  mixed: [80, 62, -20],
};

function computeP95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index] ?? 0;
}

function blockOverlapsCreature(blockX: number, blockY: number, blockZ: number, creature: CreaturePublicState): boolean {
  const r = 0.92;
  const h = 1.9;
  const minX = creature.x - r;
  const maxX = creature.x + r;
  const minY = creature.y;
  const maxY = creature.y + h;
  const minZ = creature.z - r;
  const maxZ = creature.z + r;
  return !(
    maxX <= blockX ||
    minX >= blockX + 1 ||
    maxY <= blockY ||
    minY >= blockY + 1 ||
    maxZ <= blockZ ||
    minZ >= blockZ + 1
  );
}

function findTouchEncounterCreatureId(
  playerState: { x: number; y: number; z: number },
  creatures: Record<string, CreaturePublicState>,
): string | undefined {
  let nearestId: string | undefined;
  let nearestDistSq = AUTO_BATTLE_TOUCH_RADIUS * AUTO_BATTLE_TOUCH_RADIUS;
  for (const creature of Object.values(creatures)) {
    const dy = Math.abs(creature.y + 0.8 - (playerState.y + 0.9));
    if (dy > AUTO_BATTLE_TOUCH_HEIGHT) continue;
    const dx = creature.x - playerState.x;
    const dz = creature.z - playerState.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > nearestDistSq) continue;
    nearestDistSq = distSq;
    nearestId = creature.id;
  }
  return nearestId;
}

function cyclePerspective(current: PlayerPerspective): PlayerPerspective {
  const idx = PLAYER_PERSPECTIVES.indexOf(current);
  return PLAYER_PERSPECTIVES[(idx + 1) % PLAYER_PERSPECTIVES.length] ?? "first-person";
}

function lookDirectionFromYawPitch(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const cp = Math.cos(pitch);
  return {
    x: cp * Math.sin(yaw),
    y: Math.sin(pitch),
    z: -cp * Math.cos(yaw),
  };
}

function applyThirdPersonCamera(
  camera: CameraController,
  player: Player,
  yaw: number,
  pitch: number,
  perspective: Exclude<PlayerPerspective, "first-person">,
  chunks: ChunkManager,
): void {
  const pivot = player.position;
  const lookDir = lookDirectionFromYawPitch(yaw, pitch);
  const directionSign = perspective === "third-person-front" ? 1 : -1;
  const rayX = lookDir.x * directionSign;
  const rayY = lookDir.y * directionSign;
  const rayZ = lookDir.z * directionSign;

  let distance = THIRD_PERSON_CAMERA_DISTANCE;
  const hit = raycastVoxels(pivot.x, pivot.y, pivot.z, rayX, rayY, rayZ, THIRD_PERSON_CAMERA_DISTANCE, (wx, wy, wz) =>
    chunks.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)),
  );
  if (hit) {
    distance = Math.max(THIRD_PERSON_CAMERA_MIN_DISTANCE, hit.distance - THIRD_PERSON_CAMERA_COLLISION_PADDING);
  }

  const eye = new Vec3([pivot.x + rayX * distance, pivot.y + rayY * distance, pivot.z + rayZ * distance]);
  const cameraYaw = perspective === "third-person-front" ? yaw + Math.PI : yaw;
  const cameraPitch = perspective === "third-person-front" ? -pitch : pitch;
  camera.setOrientation(cameraYaw, cameraPitch);
  camera.setPosition(eye);
}

function mergePlayerInstanceBuffers(
  remoteBuffers: GpuBuffers,
  remoteCount: number,
  localBuffers: GpuBuffers,
  localCount: number,
  out: GpuBuffers,
): GpuBuffers {
  const totalCount = remoteCount + localCount;
  for (const { name, size } of PLAYER_INSTANCE_LAYOUT) {
    const dst = ensureBuffer(out, name, totalCount * size);
    const remote = remoteBuffers[name];
    if (remote) {
      dst.set(remote.subarray(0, remoteCount * size), 0);
    }
    const local = localBuffers[name];
    if (local) {
      dst.set(local.subarray(0, localCount * size), remoteCount * size);
    }
  }
  return out;
}

function playerCommandPoseStrength(battle: BattleSessionState | null, nowMs: number): number {
  const animation = battle?.lastTurnAnimation;
  if (!battle?.active || !animation) return 0;
  let strength = 0;
  for (const action of animation.actions) {
    if (action.actor !== "starter") continue;
    if (nowMs < action.startsAtMs || nowMs > action.endsAtMs) continue;
    const windupDuration = Math.max(1, action.impactAtMs - action.startsAtMs);
    const releaseDuration = Math.max(1, action.endsAtMs - action.impactAtMs);
    let pose = 0;
    if (nowMs <= action.impactAtMs) {
      pose = Math.max(0, Math.min(1, (nowMs - action.startsAtMs) / windupDuration));
    } else {
      pose = Math.max(0, Math.min(1, 1 - (nowMs - action.impactAtMs) / releaseDuration));
    }
    if (pose > strength) strength = pose;
  }
  return strength;
}

function benchmarkOrbit(scene: BenchmarkScene, elapsedS: number): { yaw: number; pitch: number } {
  const speed = scene === "mixed" ? 0.45 : scene === "foliage" ? 0.32 : scene === "cave" ? 0.2 : 0.24;
  const pitchAmp = scene === "cave" ? 0.06 : 0.1;
  return {
    yaw: elapsedS * speed,
    pitch: Math.sin(elapsedS * 0.75) * pitchAmp,
  };
}

type BattleCameraMode = "orbit" | "side-track" | "front-track";

const BATTLE_CAMERA_MODE_DURATION_S = 6;
const BATTLE_CAMERA_MODES: readonly BattleCameraMode[] = ["orbit", "side-track", "front-track"];

function hashString32(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lookAtPose(
  camera: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): { yaw: number; pitch: number } {
  const dx = target.x - camera.x;
  const dy = target.y - camera.y;
  const dz = target.z - camera.z;
  const dist = Math.max(0.001, Math.hypot(dx, dy, dz));
  return {
    yaw: Math.atan2(dx, -dz),
    pitch: Math.asin(Math.max(-1, Math.min(1, dy / dist))),
  };
}

function battleOrbitPose(
  battle: BattleSessionState,
  nowMs: number,
  startedAtMs: number,
): { x: number; y: number; z: number; yaw: number; pitch: number } {
  const cx = (battle.starter.x + battle.wild.x) * 0.5;
  const cz = (battle.starter.z + battle.wild.z) * 0.5;
  const cy = Math.max(battle.starter.y, battle.wild.y) + 0.95;
  const focusY = cy + 0.78;
  const separation = Math.hypot(battle.starter.x - battle.wild.x, battle.starter.z - battle.wild.z);
  const radius = Math.max(5.4, separation * 1.5);
  const elapsedS = Math.max(0, (nowMs - startedAtMs) / 1000);
  const pairDx = battle.wild.x - battle.starter.x;
  const pairDz = battle.wild.z - battle.starter.z;
  const pairLen = Math.max(0.001, Math.hypot(pairDx, pairDz));
  const axisX = pairDx / pairLen;
  const axisZ = pairDz / pairLen;
  const perpX = -axisZ;
  const perpZ = axisX;

  const modeSegment = Math.floor(elapsedS / BATTLE_CAMERA_MODE_DURATION_S);
  const modeElapsedS = elapsedS - modeSegment * BATTLE_CAMERA_MODE_DURATION_S;
  const modeHash = hashString32(`${battle.battleId}:${modeSegment}`);
  const mode = BATTLE_CAMERA_MODES[modeHash % BATTLE_CAMERA_MODES.length] ?? "orbit";
  const phase = ((modeHash >>> 3) % 6283) / 1000;

  let x = cx;
  let y = cy + 2.15;
  let z = cz;

  if (mode === "orbit") {
    const orbitAngle = elapsedS * 0.16 + phase;
    x = cx + Math.cos(orbitAngle) * radius;
    z = cz + Math.sin(orbitAngle) * radius;
    y = cy + 1.72 + Math.sin(elapsedS * 0.26 + phase) * 0.12;
  } else if (mode === "side-track") {
    const t = Math.max(0, Math.min(1, modeElapsedS / BATTLE_CAMERA_MODE_DURATION_S));
    const lateral = -1 + t * 2;
    x = cx + perpX * radius * 0.92 + axisX * lateral * Math.max(1.6, separation * 0.6);
    z = cz + perpZ * radius * 0.92 + axisZ * lateral * Math.max(1.6, separation * 0.6);
    y = cy + 1.82;
  } else {
    const sweep = Math.sin(modeElapsedS * 0.24 + phase) * Math.max(1.4, separation * 0.55);
    x = cx + axisX * radius * 0.98 + perpX * sweep;
    z = cz + axisZ * radius * 0.98 + perpZ * sweep;
    y = cy + 1.68;
  }

  const lookAt = lookAtPose({ x, y, z }, { x: cx, y: focusY, z: cz });
  return { x, y, z, yaw: lookAt.yaw, pitch: lookAt.pitch };
}

function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function initRenderState(gl: HTMLCanvasElement, player: Player) {
  const renderer = new Renderer(gl, [
    playerPassDef,
    creaturePassDef,
    creatureHighlightPassDef,
    battleEffectPassDef,
    placedObjectPassDef,
    placedRockPassDef,
  ]);
  const camera = new CameraController({ width: gl.clientWidth, height: gl.clientHeight });
  camera.setOrientation(player.state.yaw, player.state.pitch);
  camera.setPosition(player.position);
  return { renderer, camera };
}

/**
 * Reactive game primitive.
 *
 * The store is the reactive boundary: the rAF callback (an event-handler context)
 * writes into it each frame, and SolidJS consumers track individual properties.
 */
export function createGame(args: CreateGameArgs): GameState {
  const room = () => args.room;
  const inputEnabled = () => args.inputEnabled?.() ?? true;
  const benchmarkConfig = args.benchmark?.enabled ? args.benchmark : undefined;
  const benchmarkEffectiveDurationS = benchmarkConfig
    ? Math.max(1, benchmarkConfig.durationS - benchmarkConfig.warmupS)
    : 0;

  const [state, setState] = createStore<MutableGameState>({
    playerPosition: new Vec3(),
    creatureNametags: [],
    diagnostics: {
      client: {
        fps: 0,
        frameCount: 0,
        computeTimeMs: 0,
        computeTimeHistory: Array.from({ length: FRAME_HISTORY_SIZE }, () => 0),
        gpuTimeMs: 0,
        gpuTimeHistory: Array.from({ length: FRAME_HISTORY_SIZE }, () => 0),
        p95ComputeTimeMs: 0,
        p95GpuTimeMs: 0,
        visibleCreatures: 0,
        pointerLocked: false,
      },
      server: {
        mspt: 0,
        msptHistory: Array.from({ length: FRAME_HISTORY_SIZE }, () => 0),
        snapsPerSec: 0,
        packetsPerSec: 0,
        timeOfDayS: 0,
      },
      benchmark: {
        enabled: Boolean(benchmarkConfig),
        active: false,
        scene: benchmarkConfig?.scene ?? "open",
        shadowTechnique: benchmarkConfig?.shadowTechnique ?? args.preferences.shadowTechnique(),
        shadowStrength: benchmarkConfig?.shadowStrength ?? args.preferences.shadowStrength(),
        elapsedS: 0,
        durationS: benchmarkEffectiveDurationS,
        sampleCount: 0,
      },
    },
  });

  const [terrainVersion, setTerrainVersion] = createSignal(0);
  const chunks = new ChunkManager(new ChunkWorkerClient(), args.preferences.renderDistance(), () =>
    setTerrainVersion((version) => version + 1),
  );
  const lighting = new SceneLighting();
  onCleanup(() => {
    chunks.dispose();
  });

  const remotePlayers = createEntityPipeline(playerPipelineConfig);
  const remoteCreatures = createEntityPipeline(creaturePipelineConfig);
  const fpsMeter = createRateMeter(FPS_WINDOW_MS);
  const snapMeter = createRateMeter(FPS_WINDOW_MS);
  const packetMeter = createRateMeter(FPS_WINDOW_MS);
  const computeHistory = createRingBuffer(FRAME_HISTORY_SIZE);
  const gpuHistory = createRingBuffer(FRAME_HISTORY_SIZE);
  const msptHistory = createRingBuffer(FRAME_HISTORY_SIZE);
  const placedObjectBuffers: GpuBuffers = {};
  const placedRockBuffers: GpuBuffers = {};
  const battleEffectBuffers: GpuBuffers = {};
  const localPlayerBuffers: GpuBuffers = {};
  const mergedPlayerBuffers: GpuBuffers = {};
  let frame = 0;
  let lastSnapCount = 0;
  let lastTick = 0;
  let lastPacketCount = 0;
  let timeOffsetS = 0;
  let lastPlacedObjects = chunks.getVisiblePlacedObjects();
  let lastRenderCenterX = NaN;
  let lastRenderCenterZ = NaN;
  let renderedFoliageCount = 0;
  let renderedRockCount = 0;
  let lastRenderDistance = args.preferences.renderDistance();
  let benchmarkActive = false;
  let benchmarkTeleported = false;
  let benchmarkStartedAtMs = 0;
  let battleCameraStartedAtMs = 0;
  let lastAutoBattleAttemptAtMs = 0;
  let activeBattleId: string | undefined;
  let perspectiveMode: PlayerPerspective = "first-person";
  let localPlayerPhaseOffset = 0;
  let localPlayerPhaseId: string | undefined;
  let localPreviousRenderSample: { x: number; z: number; atMs: number } | undefined;
  const benchmarkSamples: BenchmarkSample[] = [];
  let benchmarkSummary: BenchmarkSummary | undefined;
  // Lazy-initialized on the first frame where all signals have resolved.
  let ctx: { renderer: Renderer; camera: CameraController } | undefined;

  const startBenchmark = () => {
    if (!benchmarkConfig || benchmarkActive) return;
    benchmarkActive = true;
    benchmarkTeleported = false;
    benchmarkStartedAtMs = performance.now();
    benchmarkSamples.length = 0;
    benchmarkSummary = undefined;
    setState("diagnostics", "benchmark", {
      enabled: true,
      active: true,
      scene: benchmarkConfig.scene,
      shadowTechnique: benchmarkConfig.shadowTechnique,
      shadowStrength: benchmarkConfig.shadowStrength,
      elapsedS: 0,
      durationS: benchmarkEffectiveDurationS,
      sampleCount: 0,
      summary: undefined,
    });
  };

  const stopBenchmark = () => {
    if (!benchmarkConfig || !benchmarkActive) return;
    benchmarkActive = false;
    benchmarkSummary = summarizeBenchmark(
      benchmarkConfig.scene,
      benchmarkConfig.shadowTechnique,
      benchmarkConfig.shadowStrength,
      benchmarkEffectiveDurationS,
      benchmarkSamples,
    );
    const benchmarkRecord = {
      config: benchmarkConfig,
      summary: benchmarkSummary,
      samples: [...benchmarkSamples],
    };
    // Expose latest benchmark to make report writing/debugging easier from DevTools.
    (globalThis as { __minceraftBenchmarkLast?: unknown }).__minceraftBenchmarkLast = benchmarkRecord;
    if (BENCHMARK_TERMINAL_OUTPUT_ENABLED) {
      console.info("[benchmark] completed", benchmarkRecord);
    }
    setState("diagnostics", "benchmark", {
      enabled: true,
      active: false,
      scene: benchmarkConfig.scene,
      shadowTechnique: benchmarkConfig.shadowTechnique,
      shadowStrength: benchmarkConfig.shadowStrength,
      elapsedS: benchmarkEffectiveDurationS,
      durationS: benchmarkEffectiveDurationS,
      sampleCount: benchmarkSamples.length,
      summary: benchmarkSummary,
    });
  };

  const exportBenchmarkJson = () => {
    if (!benchmarkConfig || !benchmarkSummary) return;
    const payload = {
      config: benchmarkConfig,
      summary: benchmarkSummary,
      samples: benchmarkSamples,
    };
    downloadTextFile(
      `benchmark-${benchmarkConfig.scene}-${Date.now()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  };

  const exportBenchmarkCsv = () => {
    if (!benchmarkConfig || !benchmarkSummary) return;
    const summaryCsv = benchmarkSummaryToCsv(benchmarkSummary);
    const samplesCsv = benchmarkSamplesToCsv(benchmarkSamples);
    downloadTextFile(`benchmark-${benchmarkConfig.scene}-${Date.now()}-summary.csv`, summaryCsv, "text/csv");
    downloadTextFile(`benchmark-${benchmarkConfig.scene}-${Date.now()}-samples.csv`, samplesCsv, "text/csv");
  };

  const exportBenchmarkMarkdown = () => {
    if (!benchmarkConfig || !benchmarkSummary) return;
    downloadTextFile(
      `benchmark-${benchmarkConfig.scene}-${benchmarkConfig.shadowTechnique}-${Date.now()}-report.md`,
      benchmarkSummariesToMarkdown([benchmarkSummary]),
      "text/markdown",
    );
  };

  if (benchmarkConfig?.autoStart) startBenchmark();

  let latestHit: RaycastHit | null = null;
  let blockSeq = 1;
  const pendingBlocks = new Map<number, { x: number; y: number; z: number; previousType: CubeType }>();

  const handleReset = () => {
    ctx?.camera.reset();
  };

  const handleLeftClick = () => {
    const s = room().session();
    if (!s) return;

    const player = room().player();
    if (player) {
      const yaw = player.state.yaw;
      const pitch = player.state.pitch;
      const targetedCreatureId = findTargetedCreatureId(
        { x: player.state.x, y: player.state.y, z: player.state.z, yaw, pitch },
        remoteCreatures.states(performance.now()),
      );
      if (targetedCreatureId && !room().battleState()?.active && room().starterState()) {
        s.startBattle(targetedCreatureId);
        return;
      }

      const targetPlayerId = findTargetedPlayerId(
        { x: player.state.x, y: player.state.y, z: player.state.z, yaw, pitch },
        remotePlayers.states(performance.now()),
      );
      if (targetPlayerId) {
        s.attack({
          targetPlayerId,
          x: player.state.x,
          y: player.state.y,
          z: player.state.z,
          yaw,
          pitch,
        });
        return;
      }
    }

    const hit = latestHit;
    if (!hit || hit.blockType === CubeType.Bedrock) return;

    const seq = blockSeq++;
    const previousType = chunks.modifyBlock(hit.blockX, hit.blockY, hit.blockZ, CubeType.Air);
    if (previousType == null) return;
    pendingBlocks.set(seq, { x: hit.blockX, y: hit.blockY, z: hit.blockZ, previousType });
    s.sendBlockAction({ seq, action: "break", x: hit.blockX, y: hit.blockY, z: hit.blockZ });
  };

  const handleRightClick = () => {
    const hit = latestHit;
    const s = room().session();
    if (!hit || !s) return;

    const placeX = hit.blockX + hit.faceNormal[0];
    const placeY = hit.blockY + hit.faceNormal[1];
    const placeZ = hit.blockZ + hit.faceNormal[2];

    // Don't place if the target is already occupied
    if (chunks.getBlock(placeX, placeY, placeZ) !== CubeType.Air) return;

    // Don't place inside the local player's own cylinder
    const player = room().player();
    if (player && blockIntersectsPlayer(placeX, placeY, placeZ, player.state)) return;

    // Don't place blocks where creatures are standing.
    for (const creature of Object.values(room().remoteCreatures)) {
      if (blockOverlapsCreature(placeX, placeY, placeZ, creature)) return;
    }

    const blockType = CubeType.Dirt; // TODO: use selected hotbar item
    const seq = blockSeq++;
    const previousType = chunks.modifyBlock(placeX, placeY, placeZ, blockType);
    if (previousType == null) return;
    pendingBlocks.set(seq, { x: placeX, y: placeY, z: placeZ, previousType });
    s.sendBlockAction({ seq, action: "place", x: placeX, y: placeY, z: placeZ, blockType });
  };

  const input = createInput(args.glCanvas, {
    onReset: handleReset,
    onCyclePerspective: () => {
      perspectiveMode = cyclePerspective(perspectiveMode);
    },
    onLeftClick: handleLeftClick,
    onRightClick: handleRightClick,
    ...args.shortcuts,
  });

  // TODO: refactor to be general packet handling rather than only inputs
  let nextPacketSequence = 1;
  let pendingPacket: Omit<PlayerPositionPacket, "sequence"> | undefined;
  let queuedPacketWhileInFlight: Omit<PlayerPositionPacket, "sequence"> | undefined;
  let positionPacketInFlight = false;

  const sendLatestPositionPacket = (session: { sendPosition: (packet: PlayerPositionPacket) => void }): void => {
    if (!pendingPacket || positionPacketInFlight) return;

    const packet = pendingPacket;
    positionPacketInFlight = true;
    packetCount++;

    Promise.resolve(session.sendPosition({ ...packet, sequence: nextPacketSequence++ }))
      .catch(() => {})
      .finally(() => {
        positionPacketInFlight = false;
        if (!queuedPacketWhileInFlight) return;
        pendingPacket = queuedPacketWhileInFlight;
        queuedPacketWhileInFlight = undefined;
        const nextSession = room().session();
        if (!nextSession) return;
        sendLatestPositionPacket(nextSession);
      });
  };

  let packetCount = 0;
  // Heartbeat: keep sending the latest known position at INPUT_SEND_INTERVAL_MS
  // even when the player isn't moving. Regular RPC activity keeps the DO warm
  // (setInterval alone doesn't prevent Cloudflare eviction); the server
  // deduplicates by position delta and rate-limits faster-than-25ms packets.
  makeTimer(
    () => {
      const session = room().session();
      if (!pendingPacket || !session) return;
      if (positionPacketInFlight) {
        queuedPacketWhileInFlight = pendingPacket;
        return;
      }
      sendLatestPositionPacket(session);
    },
    INPUT_SEND_INTERVAL_MS,
    setInterval,
  );

  let needsResize = true;
  createResizeObserver(args.glCanvas, () => {
    needsResize = true;
  });

  // Match Minecraft 1.21: fog starts at 92% of render distance and completes
  // at the hard chunk cutoff, so distant chunks fade into the sky instead of
  // popping as the player walks around.
  let fogFar = lastRenderDistance * CHUNK_SIZE;
  let fogNear = fogFar * 0.92;
  const fogColor = new Float32Array(3);

  createRenderLoop((dt, now) => {
    const gl = args.glCanvas();
    const player = room().player();
    if (!gl || !player) return;

    ctx ??= initRenderState(gl, player);
    const { renderer, camera } = ctx;

    const tickStart = performance.now();
    const inputDt = Math.min(dt, MAX_INPUT_DT_MS) / 1000;

    // --- Resize ---
    if (needsResize) {
      needsResize = false;
      const dpr = window.devicePixelRatio || 1;
      gl.width = Math.round(gl.clientWidth * dpr);
      gl.height = Math.round(gl.clientHeight * dpr);
      camera.resize(gl.clientWidth, gl.clientHeight);
    }

    // --- Input → server ---
    const benchmarkInputLocked = benchmarkConfig?.disableInput && benchmarkActive;
    const effectiveInputEnabled = inputEnabled() && !benchmarkInputLocked;
    const activeBattle = room().battleState();
    if (activeBattle?.active) {
      if (activeBattleId !== activeBattle.battleId) {
        activeBattleId = activeBattle.battleId;
        battleCameraStartedAtMs = now;
      }
    } else {
      activeBattleId = undefined;
    }

    const mouse = effectiveInputEnabled ? input.consumeMouseDelta() : { dx: 0, dy: 0 };
    const mouseSensitivity = args.preferences.mouseSensitivity();
    const invertY = args.preferences.invertY() ? -1 : 1;
    camera.rotate(mouse.dx * mouseSensitivity, mouse.dy * mouseSensitivity * invertY);
    let aimYaw = camera.yaw();
    let aimPitch = camera.pitch();
    const keys = input.walkKeys();
    const walk = effectiveInputEnabled ? camera.walkDir(keys) : { x: 0, z: 0 };
    const fly = effectiveInputEnabled && keys.fly;
    const jump = effectiveInputEnabled && keys.space;
    const sprint = effectiveInputEnabled && keys.shift && !fly;

    if (benchmarkConfig && benchmarkActive) {
      const elapsedS = (now - benchmarkStartedAtMs) / 1000;
      if (!benchmarkTeleported) {
        const [x, y, z] = BENCHMARK_SCENE_ANCHORS[benchmarkConfig.scene];
        room().replicated()?.teleport({ x, y, z });
        room().session()?.teleportTo(x, y, z);
        room().session()?.setTimeOfDay(benchmarkConfig.fixedTimeOfDayS);
        benchmarkTeleported = true;
      }
      const orbit = benchmarkOrbit(benchmarkConfig.scene, elapsedS);
      camera.setOrientation(orbit.yaw, orbit.pitch);
      aimYaw = orbit.yaw;
      aimPitch = orbit.pitch;
    }

    if (activeBattle?.active) {
      const orbit = battleOrbitPose(activeBattle, now, battleCameraStartedAtMs);
      camera.setOrientation(orbit.yaw, orbit.pitch);
      camera.setPosition(new Vec3([orbit.x, orbit.y, orbit.z]));
    } else {
      const session = room().session();
      if (
        session &&
        room().starterState() &&
        now - lastAutoBattleAttemptAtMs >= AUTO_BATTLE_TOUCH_COOLDOWN_MS
      ) {
        const touchCreatureId = findTouchEncounterCreatureId(player.state, room().remoteCreatures);
        if (touchCreatureId) {
          session.startBattle(touchCreatureId);
          lastAutoBattleAttemptAtMs = now;
        }
      }
    }

    const yaw = aimYaw;
    const pitch = aimPitch;
    if (inputEnabled() && chunks.hasChunkAt(player.state.x, player.state.z)) {
      const next: PlayerInput = {
        dx: walk.x,
        dz: walk.z,
        dtSeconds: inputDt,
        yaw,
        pitch,
        jump,
        sprint,
        fly,
        flyUp: fly && keys.space,
        flyDown: fly && keys.shift,
      };
      room().replicated()?.predict(next);
    }
    pendingPacket = {
      x: player.state.x,
      y: player.state.y,
      z: player.state.z,
      yaw: player.state.yaw,
      pitch: player.state.pitch,
    };
    if (!activeBattle?.active) {
      if (perspectiveMode === "first-person") {
        camera.setOrientation(yaw, pitch);
        camera.setPosition(player.position);
      } else {
        applyThirdPersonCamera(camera, player, yaw, pitch, perspectiveMode, chunks);
      }
    }

    const renderDistance = args.preferences.renderDistance();
    if (renderDistance !== lastRenderDistance) {
      lastRenderDistance = renderDistance;
      chunks.setRenderDistance(renderDistance);
      fogFar = renderDistance * CHUNK_SIZE;
      fogNear = fogFar * 0.92;
    }

    chunks.update(player.position.x, player.position.z);
    chunks.processIncoming();

    const replicated = room().replicated();
    if (replicated) {
      const entity = replicated.entity as Player;
      entity.collisionQuery = (cx, cz, cy) => chunks.collisionQuery(cx, cz, cy);
      entity.headQuery = (cx, cz, cy) => chunks.headQuery(cx, cz, cy);
    }

    // --- Raycast for block targeting ---
    const eye = camera.eye();
    const lookDir = camera.lookDirection();
    const currentHit = raycastVoxels(eye.x, eye.y, eye.z, lookDir.x, lookDir.y, lookDir.z, 6.0, (wx, wy, wz) =>
      chunks.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)),
    );
    latestHit = currentHit;

    const viewMatrix = camera.viewMatrix();
    const projMatrix = camera.projMatrix();
    chunks.cull(viewMatrix, projMatrix);

    const placedObjects = chunks.getVisiblePlacedObjects();
    const movedForObjectRepack =
      Number.isNaN(lastRenderCenterX) ||
      Math.abs(player.position.x - lastRenderCenterX) >= 8 ||
      Math.abs(player.position.z - lastRenderCenterZ) >= 8;
    if (placedObjects !== lastPlacedObjects || movedForObjectRepack) {
      const renderablePlacedObjects = filterRenderablePlacedObjects(
        placedObjects,
        player.position.x,
        player.position.z,
      );
      const foliageObjects = renderablePlacedObjects.filter(
        (object) =>
          object.type !== PlacedObjectType.Rock &&
          (RENDERABLE_PLACED_OBJECT_TYPES as readonly PlacedObjectType[]).includes(object.type),
      );
      const rockObjects = renderablePlacedObjects.filter((object) => object.type === PlacedObjectType.Rock);
      renderedFoliageCount = packPlacedObjects(foliageObjects, placedObjectBuffers);
      renderedRockCount = packPlacedRocks(rockObjects, placedRockBuffers);
      lastPlacedObjects = placedObjects;
      lastRenderCenterX = player.position.x;
      lastRenderCenterZ = player.position.z;
    }

    // --- Remote entities + block acks ---
    const tickInfo = room().tickInfo;
    if (tickInfo.tick !== lastTick) {
      remotePlayers.onSnapshot(unwrap(room().remotePlayers), now);
      remoteCreatures.onSnapshot(
        withBattleCreatures(unwrap(room().remoteCreatures), room().battleState(), Date.now()),
        now,
      );
      lastTick = tickInfo.tick;
      msptHistory.push(tickInfo.tickTimeMs);
      timeOffsetS = tickInfo.timeOfDayS - ((now / 1000) % DAY_LENGTH_S);

      // Queue server-pushed chunk data for incremental ingestion
      for (const chunkBatch of room().chunkDataQueue.splice(0)) {
        chunks.receiveChunks(chunkBatch);
      }

      // Process block acks
      for (const ack of room().blockAckQueue.splice(0)) {
        const pending = pendingBlocks.get(ack.seq);
        if (!pending) continue;
        pendingBlocks.delete(ack.seq);
        if (!ack.accepted) {
          chunks.modifyBlock(pending.x, pending.y, pending.z, pending.previousType);
          chunks.clearLocalOverride(pending.x, pending.y, pending.z);
        }
      }

      // Apply block changes from other players
      const pendingCoords = new Set([...pendingBlocks.values()].map((p) => `${p.x},${p.y},${p.z}`));
      for (const change of room().blockChangesQueue.splice(0)) {
        if (!pendingCoords.has(`${change.x},${change.y},${change.z}`)) {
          chunks.modifyBlock(change.x, change.y, change.z, change.blockType as CubeType);
        }
      }
    }

    const timeOfDayS = (((now / 1000 + timeOffsetS) % DAY_LENGTH_S) + DAY_LENGTH_S) % DAY_LENGTH_S;
    lighting.update(timeOfDayS);
    fogColor.set(lighting.backgroundColor.subarray(0, 3));
    const shadowTechnique =
      benchmarkConfig && benchmarkActive ? benchmarkConfig.shadowTechnique : args.preferences.shadowTechnique();
    const shadowStrength =
      benchmarkConfig && benchmarkActive ? benchmarkConfig.shadowStrength : args.preferences.shadowStrength();

    // --- Render ---
    const remotePlayerFrame = remotePlayers.frame(now);
    let playerBuffers = remotePlayerFrame.buffers;
    let playerCount = remotePlayerFrame.count;
    const showLocalPlayerModel = perspectiveMode !== "first-person";
    const commandPose = playerCommandPoseStrength(activeBattle ?? null, Date.now());
    if (showLocalPlayerModel) {
      if (localPlayerPhaseId !== player.id) {
        localPlayerPhaseId = player.id;
        localPlayerPhaseOffset = ((hashString32(player.id) >>> 0) / 0xffffffff) * Math.PI * 2;
      }
      let walkSpeed = 0;
      if (localPreviousRenderSample && now > localPreviousRenderSample.atMs) {
        const dtS = (now - localPreviousRenderSample.atMs) / 1000;
        if (dtS > 0) {
          walkSpeed = Math.hypot(player.state.x - localPreviousRenderSample.x, player.state.z - localPreviousRenderSample.z) / dtS;
          walkSpeed = Math.min(walkSpeed, MAX_ANIMATED_WALK_SPEED);
        }
      }
      localPreviousRenderSample = { x: player.state.x, z: player.state.z, atMs: now };
      const localRenderState: PlayerRenderState = {
        id: player.id,
        name: player.state.name,
        x: player.state.x,
        y: player.state.y,
        z: player.state.z,
        yaw: player.state.yaw,
        pitch: player.state.pitch,
        walkSpeed,
        phaseOffset: localPlayerPhaseOffset,
        commandPose,
      };
      const localCount = packPlayerRenderStates([localRenderState], localPlayerBuffers);
      playerBuffers = mergePlayerInstanceBuffers(
        remotePlayerFrame.buffers,
        remotePlayerFrame.count,
        localPlayerBuffers,
        localCount,
        mergedPlayerBuffers,
      );
      playerCount = remotePlayerFrame.count + localCount;
    } else {
      localPreviousRenderSample = undefined;
    }
    const { buffers: creatureBuffers, count: creatureCount } = remoteCreatures.frame(now);
    const battleEffects = battleEffectInstances(room().battleState(), Date.now());
    const battleEffectCount = packBattleEffects(battleEffects, battleEffectBuffers);
    const entities: EntityDrawData[] = [
      { key: "players", buffers: playerBuffers, count: playerCount },
      { key: "creatures", buffers: creatureBuffers, count: creatureCount },
      { key: "battle-effects", buffers: battleEffectBuffers, count: battleEffectCount },
      { key: "placed-objects", buffers: placedObjectBuffers, count: renderedFoliageCount },
      { key: "placed-rocks", buffers: placedRockBuffers, count: renderedRockCount },
    ];
    if (args.preferences.showMobHighlight() && creatureCount > 0) {
      entities.push({ key: "creatures-highlight", buffers: creatureBuffers, count: creatureCount });
    }
    renderer.render({
      viewMatrix,
      projMatrix,
      cubePositions: chunks.positions,
      cubeColors: chunks.colors,
      cubeAmbientOcclusion: chunks.ambientOcclusion,
      numCubes: chunks.count,
      lightPosition: lighting.lightPosition,
      lightDirection: lighting.lightDirection,
      sunPosition: lighting.sunPosition,
      backgroundColor: lighting.backgroundColor,
      ambientColor: lighting.ambientColor,
      sunColor: lighting.sunColor,
      shadowTechnique,
      shadowStrength,
      debugShadowVolumes: args.debugVisuals?.() ?? false,
      timeS: now / 1000,
      cameraPos: eye,
      fogColor,
      fogNear,
      fogFar,
      entities,
      highlightBlock: currentHit
        ? { x: currentHit.blockX, y: currentHit.blockY, z: currentHit.blockZ, blockType: currentHit.blockType }
        : undefined,
    });

    const canvas = args.glCanvas();
    const screenWidth = canvas?.clientWidth ?? 0;
    const screenHeight = canvas?.clientHeight ?? 0;
    const nametags: CreatureNametag[] = [];
    if (screenWidth > 0 && screenHeight > 0) {
      const creaturesForTags = remoteCreatures.states(now);
      for (const creature of creaturesForTags) {
        const projected = projectWorldToScreen(
          viewMatrix as unknown as Float32Array,
          projMatrix as unknown as Float32Array,
          creature.x,
          creature.y + 2.15,
          creature.z,
          screenWidth,
          screenHeight,
        );
        if (!projected) continue;
        const depthFade = 1 - projected.depth;
        const scale = Math.max(0.72, Math.min(1.08, 0.72 + depthFade * 0.42));
        const alpha = Math.max(0.38, Math.min(0.95, 0.35 + depthFade * 0.7));
        nametags.push({
          id: creature.id,
          label: creatureLabel(creature.speciesId),
          leftPx: projected.x,
          topPx: projected.y,
          scale,
          alpha,
        });
      }
    }

    // --- Diagnostics (producers → store) ---
    frame++;
    const computeTimeMs = performance.now() - tickStart;
    const gpuTimeMs = renderer.gpuTimer.lastTimeMs;
    fpsMeter.sample(dt, 1);
    computeHistory.push(computeTimeMs);
    gpuHistory.push(gpuTimeMs);
    const currentSnapCount = room().snapCount();
    snapMeter.sample(dt, currentSnapCount - lastSnapCount);
    lastSnapCount = currentSnapCount;
    packetMeter.sample(dt, packetCount - lastPacketCount);
    lastPacketCount = packetCount;

    if (benchmarkConfig && benchmarkActive) {
      const elapsedS = (now - benchmarkStartedAtMs) / 1000;
      const sampleElapsedS = elapsedS - benchmarkConfig.warmupS;
      if (sampleElapsedS >= 0) {
        benchmarkSamples.push({
          elapsedS: sampleElapsedS,
          computeTimeMs,
          gpuTimeMs: benchmarkConfig.includeGpuTime ? gpuTimeMs : 0,
          fps: fpsMeter.rate,
          mspt: benchmarkConfig.includeServerTime ? tickInfo.tickTimeMs : 0,
          shadowTechnique,
          shadowStrength,
        });
      }
      setState("diagnostics", "benchmark", {
        enabled: true,
        active: true,
        scene: benchmarkConfig.scene,
        shadowTechnique: benchmarkConfig.shadowTechnique,
        shadowStrength: benchmarkConfig.shadowStrength,
        elapsedS: Math.max(0, sampleElapsedS),
        durationS: benchmarkEffectiveDurationS,
        sampleCount: benchmarkSamples.length,
        summary: undefined,
      });
      if (elapsedS >= benchmarkConfig.durationS) {
        stopBenchmark();
      }
    }

    setState("playerPosition", player.position);
    setState("creatureNametags", nametags);
    setState("diagnostics", "client", {
      fps: fpsMeter.rate,
      frameCount: frame,
      computeTimeMs,
      computeTimeHistory: computeHistory.ordered(),
      gpuTimeMs,
      gpuTimeHistory: gpuHistory.ordered(),
      p95ComputeTimeMs: computeP95(computeHistory.ordered()),
      p95GpuTimeMs: computeP95(gpuHistory.ordered()),
      visibleCreatures: creatureCount,
      pointerLocked: input.pointerLocked(),
    });
    setState("diagnostics", "server", {
      mspt: tickInfo.tickTimeMs,
      msptHistory: msptHistory.ordered(),
      snapsPerSec: snapMeter.rate,
      packetsPerSec: packetMeter.rate,
      timeOfDayS,
    });
  });

  return {
    get playerPosition() {
      return state.playerPosition;
    },
    get creatureNametags() {
      return state.creatureNametags;
    },
    get diagnostics() {
      return state.diagnostics;
    },
    benchmark: {
      canRun: Boolean(benchmarkConfig),
      active: () => benchmarkActive,
      start: startBenchmark,
      stop: stopBenchmark,
      exportJson: exportBenchmarkJson,
      exportCsv: exportBenchmarkCsv,
      exportMarkdown: exportBenchmarkMarkdown,
    },
    minimap: {
      terrainVersion,
      radiusBlocks: chunks.minimapRadiusBlocks,
      sampleSurface: (wx, wz) => chunks.sampleSurface(wx, wz),
    },
  };
}
