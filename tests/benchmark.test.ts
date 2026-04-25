import { describe, expect, it } from "vitest";
import {
  benchmarkSamplesToCsv,
  benchmarkSummaryToCsv,
  parseBenchmarkConfig,
  summarizeBenchmark,
  type BenchmarkSample,
} from "@/client/primitives/benchmark";

describe("parseBenchmarkConfig", () => {
  it("returns disabled defaults when benchmark flag is missing", () => {
    const cfg = parseBenchmarkConfig("");
    expect(cfg.enabled).toBe(false);
    expect(cfg.scene).toBe("open");
    expect(cfg.durationS).toBe(20);
    expect(cfg.warmupS).toBe(3);
  });

  it("parses and clamps benchmark query parameters", () => {
    const cfg = parseBenchmarkConfig(
      "?benchmark=1&benchScene=foliage&benchSeconds=9999&benchTimeOfDayS=-2&benchAuto=0&benchDisableInput=1",
    );

    expect(cfg.enabled).toBe(true);
    expect(cfg.scene).toBe("foliage");
    expect(cfg.durationS).toBe(600);
    expect(cfg.fixedTimeOfDayS).toBe(0);
    expect(cfg.warmupS).toBe(3);
    expect(cfg.autoStart).toBe(false);
    expect(cfg.disableInput).toBe(true);
  });

  it("parses and clamps benchmark warmup", () => {
    const cfg = parseBenchmarkConfig("?benchmark=1&benchSeconds=7&benchWarmupS=99");
    expect(cfg.durationS).toBe(7);
    expect(cfg.warmupS).toBe(30);
  });
});

describe("benchmark summary and csv", () => {
  const samples: BenchmarkSample[] = [
    { elapsedS: 0, computeTimeMs: 5, gpuTimeMs: 2, fps: 120, mspt: 10 },
    { elapsedS: 1, computeTimeMs: 6, gpuTimeMs: 3, fps: 100, mspt: 12 },
    { elapsedS: 2, computeTimeMs: 8, gpuTimeMs: 4, fps: 90, mspt: 15 },
    { elapsedS: 3, computeTimeMs: 10, gpuTimeMs: 6, fps: 70, mspt: 20 },
  ];

  it("summarizes benchmark metrics", () => {
    const summary = summarizeBenchmark("open", 4, samples);
    expect(summary.scene).toBe("open");
    expect(summary.sampleCount).toBe(4);
    expect(summary.avgComputeMs).toBe(7.25);
    expect(summary.p95ComputeMs).toBe(10);
    expect(summary.p95GpuMs).toBe(6);
    expect(summary.p95Mspt).toBe(20);
  });

  it("exports csv for summary and samples", () => {
    const summary = summarizeBenchmark("open", 4, samples);
    const summaryCsv = benchmarkSummaryToCsv(summary);
    const sampleCsv = benchmarkSamplesToCsv(samples);

    expect(summaryCsv).toContain("scene,duration_s,sample_count");
    expect(summaryCsv).toContain("open,4.00,4");
    expect(sampleCsv).toContain("elapsed_s,compute_ms,gpu_ms,fps,mspt");
    expect(sampleCsv.split("\n").length).toBeGreaterThan(4);
  });
});
