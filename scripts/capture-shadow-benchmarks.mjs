import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = process.env.BENCHMARK_URL ?? "http://127.0.0.1:5175/";
const CHROME_PATH = process.env.CHROME_PATH ?? DEFAULT_CHROME;
const REMOTE_DEBUGGING_PORT = Number(process.env.CHROME_DEBUG_PORT ?? 9333);
const OUTPUT_DIR = process.env.BENCHMARK_OUT ?? "docs/final-project";
const SCENES = (process.env.BENCHMARK_SCENES ?? "open,foliage,cave,mixed").split(",");
const TECHNIQUES = ["ambient-occlusion", "shadow-map", "shadow-volume"];
const DURATION_S = Number(process.env.BENCHMARK_SECONDS ?? 5);
const WARMUP_S = Number(process.env.BENCHMARK_WARMUP ?? 1);
const SHADOW_STRENGTH = Number(process.env.BENCHMARK_SHADOW_STRENGTH ?? 0.72);

let chrome;

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  chrome = launchChrome();
  process.on("exit", () => chrome?.kill());
  await waitForChrome();

  const records = [];
  for (const scene of SCENES) {
    for (const technique of TECHNIQUES) {
      console.log(`[benchmark] ${scene} / ${technique}`);
      const record = await runBenchmark(scene, technique);
      records.push(record);
    }
  }

  const summaries = records.map((record) => record.summary);
  await writeFile(join(OUTPUT_DIR, "shadow-benchmark-results.json"), `${JSON.stringify(records, null, 2)}\n`);
  await writeFile(join(OUTPUT_DIR, "shadow-benchmark-summary.csv"), summariesToCsv(summaries));
  await writeFile(join(OUTPUT_DIR, "shadow-benchmark-summary.md"), summariesToMarkdown(summaries));
  await writeFile(join(OUTPUT_DIR, "shadow-benchmark-graphs.svg"), summariesToSvg(summaries));
  chrome.kill();
}

function launchChrome() {
  const userDataDir = `/private/tmp/minceraft-shadow-bench-${Date.now()}`;
  return spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${REMOTE_DEBUGGING_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,720",
    "about:blank",
  ]);
}

async function waitForChrome() {
  const url = `http://127.0.0.1:${REMOTE_DEBUGGING_PORT}/json/version`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await delay(150);
  }
  throw new Error("Timed out waiting for Chrome DevTools Protocol");
}

async function runBenchmark(scene, technique) {
  const params = new URLSearchParams({
    benchmark: "1",
    benchScene: scene,
    benchShadow: technique,
    benchShadowStrength: String(SHADOW_STRENGTH),
    benchSeconds: String(DURATION_S),
    benchWarmupS: String(WARMUP_S),
    benchAuto: "1",
    benchDisableInput: "1",
    benchIncludeGpu: "1",
    benchIncludeServer: "1",
  });
  const target = await createTarget(`${BASE_URL}?${params.toString()}`);
  const client = await connectCdp(target.webSocketDebuggerUrl);
  await client.send("Runtime.enable");
  await client.send("Page.enable");

  const deadline = Date.now() + (DURATION_S + 35) * 1000;
  while (Date.now() < deadline) {
    const evaluation = await client.send("Runtime.evaluate", {
      expression: "JSON.stringify(globalThis.__minceraftBenchmarkLast ?? null)",
      returnByValue: true,
    });
    const value = evaluation.result?.value;
    if (value && value !== "null") {
      client.close();
      await closeTarget(target.id);
      return JSON.parse(value);
    }
    await delay(300);
  }

  client.close();
  await closeTarget(target.id);
  throw new Error(`Timed out waiting for benchmark ${scene}/${technique}`);
}

async function createTarget(url) {
  const response = await fetch(`http://127.0.0.1:${REMOTE_DEBUGGING_PORT}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  if (!response.ok) throw new Error(`Failed to create Chrome target: ${response.status}`);
  return response.json();
}

async function closeTarget(targetId) {
  await fetch(`http://127.0.0.1:${REMOTE_DEBUGGING_PORT}/json/close/${targetId}`).catch(() => undefined);
}

function connectCdp(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result ?? {});
  });

  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((requestResolve, requestReject) => {
            pending.set(id, { resolve: requestResolve, reject: requestReject });
          });
        },
        close() {
          ws.close();
        },
      });
    });
    ws.addEventListener("error", () => reject(new Error("Failed to connect to Chrome DevTools Protocol")));
  });
}

function summariesToCsv(summaries) {
  const header = [
    "scene",
    "technique",
    "strength",
    "avg_cpu_ms",
    "p95_cpu_ms",
    "avg_gpu_ms",
    "p95_gpu_ms",
    "avg_fps",
    "p95_mspt",
    "est_memory_mb",
  ];
  const rows = summaries.map((summary) =>
    [
      summary.scene,
      summary.shadowTechnique,
      summary.shadowStrength.toFixed(2),
      summary.avgComputeMs.toFixed(3),
      summary.p95ComputeMs.toFixed(3),
      summary.avgGpuMs.toFixed(3),
      summary.p95GpuMs.toFixed(3),
      summary.avgFps.toFixed(3),
      summary.p95Mspt.toFixed(3),
      summary.estimatedMemoryMb.toFixed(2),
    ].join(","),
  );
  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

function summariesToMarkdown(summaries) {
  const rows = summaries
    .map(
      (summary) =>
        `| ${summary.scene} | ${summary.shadowTechnique} | ${summary.avgComputeMs.toFixed(2)} | ${summary.p95ComputeMs.toFixed(2)} | ${summary.avgGpuMs.toFixed(2)} | ${summary.p95GpuMs.toFixed(2)} | ${summary.avgFps.toFixed(1)} | ${summary.estimatedMemoryMb.toFixed(1)} |`,
    )
    .join("\n");
  return [
    "# Shadow Technique Benchmark Summary",
    "",
    `Captured with \`${BASE_URL}\`, ${DURATION_S}s runs, ${WARMUP_S}s warmup, shadow strength ${SHADOW_STRENGTH}.`,
    "",
    "| Scene | Technique | Avg CPU ms | P95 CPU ms | Avg GPU ms | P95 GPU ms | Avg FPS | Est. MB |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    rows,
    "",
  ].join("\n");
}

function summariesToSvg(summaries) {
  const width = 960;
  const height = 560;
  const margin = { top: 42, right: 32, bottom: 110, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxGpu = Math.max(1, ...summaries.map((summary) => summary.avgGpuMs || summary.avgComputeMs));
  const barWidth = plotWidth / summaries.length;
  const colors = {
    "ambient-occlusion": "#60a5fa",
    "shadow-map": "#f59e0b",
    "shadow-volume": "#a78bfa",
  };
  const bars = summaries
    .map((summary, index) => {
      const value = summary.avgGpuMs || summary.avgComputeMs;
      const h = (value / maxGpu) * plotHeight;
      const x = margin.left + index * barWidth + 4;
      const y = margin.top + plotHeight - h;
      const label = `${summary.scene}/${summary.shadowTechnique.replace("shadow-", "")}`;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(8, barWidth - 8).toFixed(1)}" height="${h.toFixed(1)}" fill="${colors[summary.shadowTechnique]}"/><text x="${(x + barWidth / 2 - 4).toFixed(1)}" y="${height - 72}" transform="rotate(55 ${(x + barWidth / 2 - 4).toFixed(1)} ${height - 72})" font-size="10" text-anchor="start">${label}</text><text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="10" text-anchor="middle">${value.toFixed(1)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="${margin.left}" y="26" fill="#f8fafc" font-family="Arial, sans-serif" font-size="18" font-weight="700">Average GPU ms by Scene and Shadow Technique</text>
  <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="#94a3b8"/>
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#94a3b8"/>
  <text x="18" y="${margin.top + plotHeight / 2}" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="12" transform="rotate(-90 18 ${margin.top + plotHeight / 2})">ms</text>
  <g font-family="Arial, sans-serif" fill="#e2e8f0">${bars}</g>
</svg>
`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  chrome?.kill();
  console.error(error);
  process.exit(1);
});
