export type BenchmarkScene = "open" | "foliage" | "cave" | "mixed";

export interface BenchmarkConfig {
  enabled: boolean;
  scene: BenchmarkScene;
  durationS: number;
  warmupS: number;
  fixedTimeOfDayS: number;
  autoStart: boolean;
  disableInput: boolean;
  includeGpuTime: boolean;
  includeServerTime: boolean;
}

export interface BenchmarkSample {
  elapsedS: number;
  computeTimeMs: number;
  gpuTimeMs: number;
  fps: number;
  mspt: number;
}

export interface BenchmarkSummary {
  scene: BenchmarkScene;
  durationS: number;
  sampleCount: number;
  avgComputeMs: number;
  p95ComputeMs: number;
  avgGpuMs: number;
  p95GpuMs: number;
  avgFps: number;
  p95Mspt: number;
  createdAtIso: string;
}

const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  enabled: false,
  scene: "open",
  durationS: 20,
  warmupS: 3,
  fixedTimeOfDayS: 9,
  autoStart: true,
  disableInput: true,
  includeGpuTime: true,
  includeServerTime: true,
};

const SCENE_SET = new Set<BenchmarkScene>(["open", "foliage", "cave", "mixed"]);

export function parseBenchmarkConfig(search: string): BenchmarkConfig {
  const params = new URLSearchParams(search);
  const enabled = parseBoolParam(params.get("benchmark"));
  if (!enabled) return { ...DEFAULT_BENCHMARK_CONFIG };

  const rawScene = params.get("benchScene")?.trim().toLowerCase();
  const scene = rawScene && SCENE_SET.has(rawScene as BenchmarkScene) ? (rawScene as BenchmarkScene) : "open";
  const durationS = clampNumber(parseFloatOrNaN(params.get("benchSeconds")), 5, 600, 20);
  const warmupS = clampNumber(parseFloatOrNaN(params.get("benchWarmupS")), 0, 30, DEFAULT_BENCHMARK_CONFIG.warmupS);
  const fixedTimeOfDayS = clampNumber(parseFloatOrNaN(params.get("benchTimeOfDayS")), 0, 24, 9);

  return {
    enabled: true,
    scene,
    durationS,
    warmupS,
    fixedTimeOfDayS,
    autoStart: parseBoolParam(params.get("benchAuto"), true),
    disableInput: parseBoolParam(params.get("benchDisableInput"), true),
    includeGpuTime: parseBoolParam(params.get("benchIncludeGpu"), true),
    includeServerTime: parseBoolParam(params.get("benchIncludeServer"), true),
  };
}

export function summarizeBenchmark(
  scene: BenchmarkScene,
  durationS: number,
  samples: readonly BenchmarkSample[],
): BenchmarkSummary {
  return {
    scene,
    durationS,
    sampleCount: samples.length,
    avgComputeMs: average(samples.map((sample) => sample.computeTimeMs)),
    p95ComputeMs: percentile(samples.map((sample) => sample.computeTimeMs), 0.95),
    avgGpuMs: average(samples.map((sample) => sample.gpuTimeMs)),
    p95GpuMs: percentile(samples.map((sample) => sample.gpuTimeMs), 0.95),
    avgFps: average(samples.map((sample) => sample.fps)),
    p95Mspt: percentile(samples.map((sample) => sample.mspt), 0.95),
    createdAtIso: new Date().toISOString(),
  };
}

export function benchmarkSummaryToCsv(summary: BenchmarkSummary): string {
  const headers = [
    "scene",
    "duration_s",
    "sample_count",
    "avg_compute_ms",
    "p95_compute_ms",
    "avg_gpu_ms",
    "p95_gpu_ms",
    "avg_fps",
    "p95_mspt",
    "created_at_iso",
  ];
  const row = [
    summary.scene,
    summary.durationS.toFixed(2),
    String(summary.sampleCount),
    summary.avgComputeMs.toFixed(3),
    summary.p95ComputeMs.toFixed(3),
    summary.avgGpuMs.toFixed(3),
    summary.p95GpuMs.toFixed(3),
    summary.avgFps.toFixed(3),
    summary.p95Mspt.toFixed(3),
    summary.createdAtIso,
  ];
  return `${headers.join(",")}\n${row.join(",")}\n`;
}

export function benchmarkSamplesToCsv(samples: readonly BenchmarkSample[]): string {
  const header = "elapsed_s,compute_ms,gpu_ms,fps,mspt";
  const rows = samples.map((sample) =>
    [
      sample.elapsedS.toFixed(3),
      sample.computeTimeMs.toFixed(3),
      sample.gpuTimeMs.toFixed(3),
      sample.fps.toFixed(3),
      sample.mspt.toFixed(3),
    ].join(","),
  );
  return `${header}\n${rows.join("\n")}\n`;
}

function parseBoolParam(value: string | null, fallback = false): boolean {
  if (value == null || value === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

function parseFloatOrNaN(value: string | null): number {
  if (value == null) return Number.NaN;
  return Number.parseFloat(value);
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(1, p));
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * clamped) - 1);
  return sorted[index] ?? 0;
}
