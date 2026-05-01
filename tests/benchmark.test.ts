import { describe, expect, it } from "vitest";
import {
  type BenchmarkSample,
  benchmarkSamplesToCsv,
  benchmarkSummariesToMarkdown,
  benchmarkSummaryToCsv,
  parseBenchmarkConfig,
  summarizeBenchmark,
} from "@/client/primitives/benchmark";

describe("parseBenchmarkConfig", () => {
  it("returns disabled defaults when benchmark flag is missing", () => {
    const cfg = parseBenchmarkConfig("");
    expect(cfg.enabled).toBe(false);
    expect(cfg.scene).toBe("open");
    expect(cfg.durationS).toBe(20);
    expect(cfg.warmupS).toBe(3);
    expect(cfg.shadowTechnique).toBe("ambient-occlusion");
    expect(cfg.shadowStrength).toBe(0.62);
  });

  it("parses and clamps benchmark query parameters", () => {
    const cfg = parseBenchmarkConfig(
      "?benchmark=1&benchScene=foliage&benchSeconds=9999&benchTimeOfDayS=-2&benchAuto=0&benchDisableInput=1&benchShadow=shadow-map&benchShadowStrength=0.8",
    );

    expect(cfg.enabled).toBe(true);
    expect(cfg.scene).toBe("foliage");
    expect(cfg.durationS).toBe(600);
    expect(cfg.fixedTimeOfDayS).toBe(0);
    expect(cfg.warmupS).toBe(3);
    expect(cfg.autoStart).toBe(false);
    expect(cfg.disableInput).toBe(true);
    expect(cfg.shadowTechnique).toBe("shadow-map");
    expect(cfg.shadowStrength).toBe(0.8);
  });

  it("parses and clamps benchmark warmup", () => {
    const cfg = parseBenchmarkConfig("?benchmark=1&benchSeconds=7&benchWarmupS=99");
    expect(cfg.durationS).toBe(7);
    expect(cfg.warmupS).toBe(30);
  });
});

describe("benchmark summary and csv", () => {
  const samples: BenchmarkSample[] = [
    {
      elapsedS: 0,
      shadowTechnique: "shadow-volume",
      shadowStrength: 0.72,
      computeTimeMs: 5,
      gpuTimeMs: 2,
      fps: 120,
      mspt: 10,
    },
    {
      elapsedS: 1,
      shadowTechnique: "shadow-volume",
      shadowStrength: 0.72,
      computeTimeMs: 6,
      gpuTimeMs: 3,
      fps: 100,
      mspt: 12,
    },
    {
      elapsedS: 2,
      shadowTechnique: "shadow-volume",
      shadowStrength: 0.72,
      computeTimeMs: 8,
      gpuTimeMs: 4,
      fps: 90,
      mspt: 15,
    },
    {
      elapsedS: 3,
      shadowTechnique: "shadow-volume",
      shadowStrength: 0.72,
      computeTimeMs: 10,
      gpuTimeMs: 6,
      fps: 70,
      mspt: 20,
    },
  ];

  it("summarizes benchmark metrics", () => {
    const summary = summarizeBenchmark("open", "shadow-volume", 0.72, 4, samples);
    expect(summary.scene).toBe("open");
    expect(summary.shadowTechnique).toBe("shadow-volume");
    expect(summary.shadowStrength).toBe(0.72);
    expect(summary.sampleCount).toBe(4);
    expect(summary.estimatedMemoryMb).toBe(2.1);
    expect(summary.avgComputeMs).toBe(7.25);
    expect(summary.p95ComputeMs).toBe(10);
    expect(summary.p95GpuMs).toBe(6);
    expect(summary.p95Mspt).toBe(20);
  });

  it("exports csv for summary and samples", () => {
    const summary = summarizeBenchmark("open", "shadow-volume", 0.72, 4, samples);
    const summaryCsv = benchmarkSummaryToCsv(summary);
    const sampleCsv = benchmarkSamplesToCsv(samples);

    expect(summaryCsv).toContain("scene,shadow_technique,shadow_strength,duration_s,sample_count,est_memory_mb");
    expect(summaryCsv).toContain("open,shadow-volume,0.72,4.00,4,2.10");
    expect(sampleCsv).toContain("elapsed_s,shadow_technique,shadow_strength,compute_ms,gpu_ms,fps,mspt");
    expect(sampleCsv.split("\n").length).toBeGreaterThan(4);
  });

  it("exports markdown comparison rows", () => {
    const summary = summarizeBenchmark("open", "shadow-map", 0.72, 4, samples);
    const markdown = benchmarkSummariesToMarkdown([summary]);
    expect(markdown).toContain("| Scene | Technique | Strength | Avg CPU ms |");
    expect(markdown).toContain("| open | shadow-map | 0.72 |");
    expect(markdown).toContain("Directional cast shadows");
  });
});
