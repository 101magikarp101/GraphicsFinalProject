import { isShadowTechnique, type ShadowTechnique } from "@/client/engine/render/shadow-technique";

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
  shadowTechnique: ShadowTechnique;
  shadowStrength: number;
}

export interface BenchmarkSample {
  elapsedS: number;
  computeTimeMs: number;
  gpuTimeMs: number;
  fps: number;
  mspt: number;
  shadowTechnique: ShadowTechnique;
  shadowStrength: number;
}

export interface BenchmarkSummary {
  scene: BenchmarkScene;
  shadowTechnique: ShadowTechnique;
  shadowStrength: number;
  durationS: number;
  sampleCount: number;
  estimatedMemoryMb: number;
  avgComputeMs: number;
  p95ComputeMs: number;
  avgGpuMs: number;
  p95GpuMs: number;
  avgFps: number;
  p95Mspt: number;
  qualityNotes: string;
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
  shadowTechnique: "ambient-occlusion",
  shadowStrength: 0.72,
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
  const shadowTechnique = parseShadowTechnique(params.get("benchShadow"));
  const shadowStrength = clampNumber(
    parseFloatOrNaN(params.get("benchShadowStrength")),
    0,
    0.95,
    DEFAULT_BENCHMARK_CONFIG.shadowStrength,
  );

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
    shadowTechnique,
    shadowStrength,
  };
}

export function summarizeBenchmark(
  scene: BenchmarkScene,
  shadowTechnique: ShadowTechnique,
  shadowStrength: number,
  durationS: number,
  samples: readonly BenchmarkSample[],
): BenchmarkSummary {
  return {
    scene,
    shadowTechnique,
    shadowStrength,
    durationS,
    sampleCount: samples.length,
    estimatedMemoryMb: estimatedShadowTechniqueMemoryMb(shadowTechnique),
    avgComputeMs: average(samples.map((sample) => sample.computeTimeMs)),
    p95ComputeMs: percentile(
      samples.map((sample) => sample.computeTimeMs),
      0.95,
    ),
    avgGpuMs: average(samples.map((sample) => sample.gpuTimeMs)),
    p95GpuMs: percentile(
      samples.map((sample) => sample.gpuTimeMs),
      0.95,
    ),
    avgFps: average(samples.map((sample) => sample.fps)),
    p95Mspt: percentile(
      samples.map((sample) => sample.mspt),
      0.95,
    ),
    qualityNotes: shadowTechniqueQualityNotes(shadowTechnique),
    createdAtIso: new Date().toISOString(),
  };
}

export function benchmarkSummaryToCsv(summary: BenchmarkSummary): string {
  const headers = [
    "scene",
    "shadow_technique",
    "shadow_strength",
    "duration_s",
    "sample_count",
    "est_memory_mb",
    "avg_compute_ms",
    "p95_compute_ms",
    "avg_gpu_ms",
    "p95_gpu_ms",
    "avg_fps",
    "p95_mspt",
    "quality_notes",
    "created_at_iso",
  ];
  const row = [
    summary.scene,
    summary.shadowTechnique,
    summary.shadowStrength.toFixed(2),
    summary.durationS.toFixed(2),
    String(summary.sampleCount),
    summary.estimatedMemoryMb.toFixed(2),
    summary.avgComputeMs.toFixed(3),
    summary.p95ComputeMs.toFixed(3),
    summary.avgGpuMs.toFixed(3),
    summary.p95GpuMs.toFixed(3),
    summary.avgFps.toFixed(3),
    summary.p95Mspt.toFixed(3),
    csvEscape(summary.qualityNotes),
    summary.createdAtIso,
  ];
  return `${headers.join(",")}\n${row.join(",")}\n`;
}

export function benchmarkSummariesToMarkdown(summaries: readonly BenchmarkSummary[]): string {
  const header =
    "| Scene | Technique | Strength | Avg CPU ms | P95 CPU ms | Avg GPU ms | P95 GPU ms | Avg FPS | P95 MSPT | Est. MB | Notes |\n" +
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n";
  const rows = summaries.map(
    (summary) =>
      `| ${summary.scene} | ${summary.shadowTechnique} | ${summary.shadowStrength.toFixed(2)} | ${summary.avgComputeMs.toFixed(2)} | ${summary.p95ComputeMs.toFixed(2)} | ${summary.avgGpuMs.toFixed(2)} | ${summary.p95GpuMs.toFixed(2)} | ${summary.avgFps.toFixed(1)} | ${summary.p95Mspt.toFixed(2)} | ${summary.estimatedMemoryMb.toFixed(1)} | ${summary.qualityNotes} |`,
  );
  return `${header}${rows.join("\n")}\n`;
}

export function benchmarkSamplesToCsv(samples: readonly BenchmarkSample[]): string {
  const header = "elapsed_s,shadow_technique,shadow_strength,compute_ms,gpu_ms,fps,mspt";
  const rows = samples.map((sample) =>
    [
      sample.elapsedS.toFixed(3),
      sample.shadowTechnique,
      sample.shadowStrength.toFixed(2),
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

function parseShadowTechnique(value: string | null): ShadowTechnique {
  const trimmed = value?.trim();
  return trimmed && isShadowTechnique(trimmed) ? trimmed : DEFAULT_BENCHMARK_CONFIG.shadowTechnique;
}

function estimatedShadowTechniqueMemoryMb(technique: ShadowTechnique): number {
  if (technique === "shadow-map") return 16;
  if (technique === "shadow-volume") return 2.1;
  return 0;
}

function shadowTechniqueQualityNotes(technique: ShadowTechnique): string {
  if (technique === "ambient-occlusion") {
    return "Stable local contact shading; no cast shadows.";
  }
  if (technique === "shadow-map") {
    return "Directional cast shadows with PCF; may show aliasing or bias artifacts.";
  }
  return "Stencil masked hard shadows from closed directional shadow volumes.";
}

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
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
