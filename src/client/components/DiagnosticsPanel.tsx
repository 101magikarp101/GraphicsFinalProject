import { createSignal } from "solid-js";
import { SHADOW_TECHNIQUES, type ShadowTechnique } from "@/client/engine/render/shadow-technique";
import type { PlayerState } from "@/game/player";
import { DAY_LENGTH_S } from "@/game/time";
import type { BenchmarkDiagnostics } from "../engine/create-game";
import { Button } from "./Button";

const FRAME_GRAPH_WIDTH = 240;
const FRAME_GRAPH_HEIGHT = 80;
const FRAME_GRAPH_MAX_MS = 16.67;

const TICK_GRAPH_HEIGHT = 60;
const TICK_GRAPH_MAX_MS = 50;

interface OnlinePlayer {
  id: string;
  name: string;
}

interface DiagnosticsPanelProps {
  playerState: PlayerState;
  fps: number;
  computeTimeMs: number;
  computeTimeHistory: readonly number[];
  gpuTimeMs: number;
  gpuTimeHistory: readonly number[];
  p95ComputeTimeMs: number;
  p95GpuTimeMs: number;
  visibleCreatures: number;
  mspt: number;
  msptHistory: readonly number[];
  snapsPerSec: number;
  packetsPerSec: number;
  timeOfDayS: number;
  benchmark: BenchmarkDiagnostics;
  shadowTechnique: ShadowTechnique;
  shadowStrength: number;
  onBenchmarkStart?: () => void;
  onBenchmarkStop?: () => void;
  onBenchmarkExportJson?: () => void;
  onBenchmarkExportCsv?: () => void;
  onBenchmarkExportMarkdown?: () => void;
  onSetTimeOfDay: (timeS: number) => void;
  onShadowTechniqueInput: (technique: ShadowTechnique) => void;
  onShadowStrengthInput: (strength: number) => void;
  onlinePlayers: readonly OnlinePlayer[];
  onTeleportTo: (playerId: string) => void;
  pointerLocked: boolean;
}

const frameGuides = [
  { label: "240Hz / 4.17ms", ms: 4.17, stroke: "rgb(34 197 94 / 0.7)" },
  { label: "120Hz / 8.33ms", ms: 8.33, stroke: "rgb(250 204 21 / 0.7)" },
  { label: "60Hz / 16.67ms", ms: 16.67, stroke: "rgb(239 68 68 / 0.7)" },
] as const;

const tickGuides = [
  { label: "10ms", ms: 10, stroke: "rgb(34 197 94 / 0.7)" },
  { label: "25ms", ms: 25, stroke: "rgb(250 204 21 / 0.7)" },
  { label: "50ms", ms: 50, stroke: "rgb(239 68 68 / 0.7)" },
] as const;

function guideY(height: number, maxMs: number, targetMs: number) {
  return (height - (targetMs / maxMs) * height).toFixed(1);
}

function polyline(width: number, height: number, maxMs: number, history: readonly number[]) {
  const step = history.length > 1 ? width / (history.length - 1) : width;
  return history
    .map((ms, index) => {
      const x = index * step;
      const clamped = Math.min(ms, maxMs);
      const y = height - (clamped / maxMs) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Graph(props: {
  height: number;
  maxMs: number;
  guides: readonly { label: string; ms: number; stroke: string }[];
  history: readonly number[];
  stroke: string;
  title: string;
  overlayHistory?: readonly number[];
  overlayStroke?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${FRAME_GRAPH_WIDTH} ${props.height}`}
      class="h-20 w-full rounded border border-white/20 bg-black/40"
      preserveAspectRatio="none"
      aria-label={props.title}
      role="img"
    >
      <title>{props.title}</title>
      {props.guides.map((g) => {
        const y = guideY(props.height, props.maxMs, g.ms);
        return (
          <>
            <line
              x1="0"
              x2={FRAME_GRAPH_WIDTH.toString()}
              y1={y}
              y2={y}
              stroke={g.stroke}
              stroke-dasharray="4 3"
              stroke-width="1"
            />
            <rect
              x={(FRAME_GRAPH_WIDTH - 46).toString()}
              y={(Number(y) - 7).toString()}
              width="46"
              height="12"
              fill="rgb(0 0 0 / 0.55)"
              rx="2"
            />
            <text
              x={(FRAME_GRAPH_WIDTH - 42).toString()}
              y={(Number(y) + 2.5).toString()}
              fill={g.stroke}
              font-size="8"
            >
              {g.label}
            </text>
          </>
        );
      })}
      {props.overlayHistory && (
        <polyline
          fill="none"
          points={polyline(FRAME_GRAPH_WIDTH, props.height, props.maxMs, props.overlayHistory)}
          stroke={props.overlayStroke}
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
          opacity="0.7"
        />
      )}
      <polyline
        fill="none"
        points={polyline(FRAME_GRAPH_WIDTH, props.height, props.maxMs, props.history)}
        stroke={props.stroke}
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  );
}

function formatTimeOfDay(seconds: number): string {
  const progress = seconds / DAY_LENGTH_S;
  const hours = Math.floor(progress * 24) % 24;
  const minutes = Math.floor((progress * 24 * 60) % 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

export function DiagnosticsPanel(props: DiagnosticsPanelProps) {
  const player = () => props.playerState;
  const [dragging, setDragging] = createSignal(false);
  const [localTime, setLocalTime] = createSignal(0);
  const sliderValue = () => (dragging() ? localTime() : props.timeOfDayS);

  return (
    <div class="absolute top-2 right-2 z-20 w-80 rounded bg-black/60 p-3 font-mono text-sm text-white">
      <div class="flex items-center justify-between gap-3">
        <div class="text-gray-400">{player().name}</div>
        <div class="text-gray-400">{props.pointerLocked ? "(locked)" : null}</div>
      </div>
      <div class="text-gray-400">
        XYZ: {player().x.toFixed(2)} / {player().y.toFixed(2)} / {player().z.toFixed(2)}
      </div>
      <div>
        {props.fps} fps · <span class="text-blue-400">{props.computeTimeMs.toFixed(2)}ms</span>
        {props.gpuTimeMs > 0 && (
          <span>
            {" "}
            · <span class="text-orange-400">gpu {props.gpuTimeMs.toFixed(2)}ms</span>
          </span>
        )}
      </div>
      <div class="text-xs text-gray-300">
        p95 compute {props.p95ComputeTimeMs.toFixed(2)}ms
        {props.gpuTimeMs > 0 && <span> · p95 gpu {props.p95GpuTimeMs.toFixed(2)}ms</span>}
      </div>
      <div class="text-xs text-gray-300">wild visible {props.visibleCreatures}</div>
      <div class="my-2">
        <Graph
          height={FRAME_GRAPH_HEIGHT}
          maxMs={FRAME_GRAPH_MAX_MS}
          guides={frameGuides}
          history={props.computeTimeHistory}
          stroke="rgb(96 165 250)"
          overlayHistory={props.gpuTimeMs > 0 ? props.gpuTimeHistory : undefined}
          overlayStroke="rgb(251 146 60)"
          title="Per-frame compute time graph"
        />
      </div>
      <div>
        {props.snapsPerSec} snaps/s · {props.packetsPerSec} pkts/s ({props.mspt.toFixed(2)}ms)
      </div>
      <div class="my-2">
        <Graph
          height={TICK_GRAPH_HEIGHT}
          maxMs={TICK_GRAPH_MAX_MS}
          guides={tickGuides}
          history={props.msptHistory}
          stroke="rgb(52 211 153)"
          title="Server tick time graph"
        />
      </div>
      <div class="flex items-center gap-2 border-t border-white/20 pt-2 pb-2">
        <span class="shrink-0 text-gray-400">{formatTimeOfDay(sliderValue())}</span>
        <input
          type="range"
          min="0"
          max={DAY_LENGTH_S - 1}
          step="1"
          value={sliderValue()}
          class="h-1 w-full cursor-pointer accent-blue-400"
          onPointerDown={() => {
            setDragging(true);
            setLocalTime(props.timeOfDayS);
          }}
          onInput={(e) => setLocalTime(Number(e.currentTarget.value))}
          onChange={(e) => {
            props.onSetTimeOfDay(Number(e.currentTarget.value));
            setDragging(false);
          }}
        />
      </div>
      <div class="flex items-center justify-between gap-2 border-t border-white/20 py-2">
        <label for="shadow-technique" class="text-gray-400">
          shadows
        </label>
        <select
          id="shadow-technique"
          class="rounded border border-white/20 bg-black/50 px-2 py-1 text-xs text-white"
          value={props.shadowTechnique}
          onChange={(event) => props.onShadowTechniqueInput(event.currentTarget.value as ShadowTechnique)}
        >
          {SHADOW_TECHNIQUES.map((technique) => (
            <option value={technique}>{formatShadowTechnique(technique)}</option>
          ))}
        </select>
      </div>
      <div class="flex items-center gap-2 pb-2">
        <span class="shrink-0 text-gray-400">shadow strength</span>
        <input
          type="range"
          min="0"
          max="0.95"
          step="0.01"
          value={props.shadowStrength}
          class="h-1 w-full cursor-pointer accent-blue-400"
          disabled={props.shadowTechnique === "ambient-occlusion"}
          onInput={(event) => props.onShadowStrengthInput(Number(event.currentTarget.value))}
        />
        <span class="w-10 text-right text-xs text-gray-300">{Math.round(props.shadowStrength * 100)}%</span>
      </div>
      <div class="border-t border-white/20 pt-2">
        <div class="mb-2 rounded border border-white/20 bg-black/30 p-2">
          <div class="flex items-center justify-between">
            <div class="text-gray-400">benchmark</div>
            <div class="text-xs text-gray-300">
              {props.benchmark.enabled ? `${props.benchmark.scene} ${props.benchmark.elapsedS.toFixed(1)}s` : "off"}
            </div>
          </div>
          <div class="mt-1 text-xs text-gray-300">
            {props.benchmark.active ? "running" : "idle"} · {props.benchmark.sampleCount} samples
          </div>
          {props.benchmark.summary && (
            <div class="mt-1 text-xs text-gray-300">
              avg {props.benchmark.summary.avgComputeMs.toFixed(2)}ms · p95{" "}
              {props.benchmark.summary.p95ComputeMs.toFixed(2)}ms
            </div>
          )}
          <div class="mt-2 flex flex-wrap gap-1">
            <Button
              variant="ghost"
              class="text-xs"
              disabled={!props.onBenchmarkStart || props.benchmark.active}
              onClick={props.onBenchmarkStart}
            >
              Start
            </Button>
            <Button
              variant="ghost"
              class="text-xs"
              disabled={!props.onBenchmarkStop || !props.benchmark.active}
              onClick={props.onBenchmarkStop}
            >
              Stop
            </Button>
            <Button
              variant="ghost"
              class="text-xs"
              disabled={!props.onBenchmarkExportJson || !props.benchmark.summary}
              onClick={props.onBenchmarkExportJson}
            >
              Export JSON
            </Button>
            <Button
              variant="ghost"
              class="text-xs"
              disabled={!props.onBenchmarkExportCsv || !props.benchmark.summary}
              onClick={props.onBenchmarkExportCsv}
            >
              Export CSV
            </Button>
            <Button
              variant="ghost"
              class="text-xs"
              disabled={!props.onBenchmarkExportMarkdown || !props.benchmark.summary}
              onClick={props.onBenchmarkExportMarkdown}
            >
              Export MD
            </Button>
          </div>
        </div>
        <div class="text-gray-400">online ({props.onlinePlayers.length})</div>
        <ul class="mt-1">
          {props.onlinePlayers.map((p) => (
            <li class="mt-1">
              <Button variant="ghost" class="w-full justify-start text-sm" onClick={() => props.onTeleportTo(p.id)}>
                {p.name}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatShadowTechnique(technique: ShadowTechnique): string {
  if (technique === "ambient-occlusion") return "Ambient occlusion";
  if (technique === "shadow-map") return "Shadow map";
  return "Shadow volume";
}
