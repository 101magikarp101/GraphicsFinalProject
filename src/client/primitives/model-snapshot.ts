import {
  computeSilhouetteMetric,
  descriptorAppendageMask,
  modelMetricsToCsv,
  validateCreatureModelDescriptors,
} from "@/game/creature-model-analysis";
import { CREATURE_MODEL_DESCRIPTORS } from "@/game/creature-model-descriptor";

export function exportCreatureModelSnapshotCsv(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const baseCsv = modelMetricsToCsv(CREATURE_MODEL_DESCRIPTORS);
  const issues = validateCreatureModelDescriptors(CREATURE_MODEL_DESCRIPTORS);
  const issueRows = ["speciesId,issueCount"];

  for (const descriptor of CREATURE_MODEL_DESCRIPTORS) {
    const issueCount = issues.filter((issue) => issue.speciesId === descriptor.speciesId).length;
    issueRows.push(`${descriptor.speciesId},${issueCount}`);
  }

  const appendageRows = ["speciesId,horn,fin,tailSegment,wing,crest,spike,frontArea,sideArea,topArea"];
  for (const descriptor of CREATURE_MODEL_DESCRIPTORS) {
    const [horn, fin, tailSegment, wing, crest, spike] = descriptorAppendageMask(descriptor);
    const metric = computeSilhouetteMetric(descriptor);
    appendageRows.push(
      [
        descriptor.speciesId,
        horn.toFixed(4),
        fin.toFixed(4),
        tailSegment.toFixed(4),
        wing.toFixed(4),
        crest.toFixed(4),
        spike.toFixed(4),
        metric.frontArea.toFixed(4),
        metric.sideArea.toFixed(4),
        metric.topArea.toFixed(4),
      ].join(","),
    );
  }

  const snapshot = [
    "# creature-model-metrics",
    baseCsv,
    "",
    "# descriptor-issues",
    issueRows.join("\n"),
    "",
    "# appendage-signature",
    appendageRows.join("\n"),
  ].join("\n");

  const blob = new Blob([snapshot], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `creature-model-snapshot-${stamp}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
