#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

type BetterDirection = "higher" | "lower";

type MetricSpec = {
  key: string;
  better: BetterDirection;
  label: string;
};

type RunRecord = {
  run: string;
  benchmark: "msmarco" | "hotpotqa" | "freshness";
  gitCommit: string | null;
  gitBranch: string | null;
  metrics: Record<string, unknown>;
};

const METRICS: Record<RunRecord["benchmark"], MetricSpec[]> = {
  msmarco: [
    { key: "avg_mrr", better: "higher", label: "MRR" },
    { key: "avg_recall_at_k", better: "higher", label: "Recall@K" },
    { key: "avg_ndcg_at_k", better: "higher", label: "NDCG@K" },
    { key: "avg_latency_ms", better: "lower", label: "Latency (ms)" },
  ],
  hotpotqa: [
    { key: "avg_sf_f1", better: "higher", label: "Supporting Facts F1" },
    { key: "avg_sf_recall", better: "higher", label: "Supporting Facts Recall" },
    { key: "avg_sf_precision", better: "higher", label: "Supporting Facts Precision" },
    { key: "avg_doc_recall", better: "higher", label: "Document Recall" },
    { key: "avg_mrr", better: "higher", label: "MRR" },
    { key: "avg_f1", better: "higher", label: "Answer F1" },
    { key: "avg_latency_ms", better: "lower", label: "Latency (ms)" },
  ],
  freshness: [
    { key: "mean_seconds", better: "lower", label: "Mean Time-to-Truth (s)" },
    { key: "p95_seconds", better: "lower", label: "P95 Time-to-Truth (s)" },
    { key: "max_seconds", better: "lower", label: "Max Time-to-Truth (s)" },
    { key: "n_successful", better: "higher", label: "Successful Lookups" },
  ],
};

function parseArgs(argv: string[]) {
  const defaults = {
    runsDir: "tests/benchmarks/runs",
    outputMd: "tests/benchmarks/output/benchmark_highlevel_summary.md",
    limit: 10,
  };

  let runsDir = defaults.runsDir;
  let outputMd = defaults.outputMd;
  let limit = defaults.limit;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--runs-dir" && argv[i + 1]) {
      runsDir = argv[i + 1];
      i += 1;
    } else if (arg === "--output-md" && argv[i + 1]) {
      outputMd = argv[i + 1];
      i += 1;
    } else if (arg === "--limit" && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        limit = parsed;
      }
      i += 1;
    }
  }

  return { runsDir, outputMd, limit };
}

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function detectBenchmark(runName: string, metadata: Record<string, unknown> | null): RunRecord["benchmark"] | null {
  const benchmarkMeta = typeof metadata?.benchmark === "string" ? metadata.benchmark.toLowerCase() : runName.toLowerCase();
  if (benchmarkMeta.includes("msmarco")) {
    return "msmarco";
  }
  if (benchmarkMeta.includes("hotpot")) {
    return "hotpotqa";
  }
  if (benchmarkMeta.includes("freshness")) {
    return "freshness";
  }
  return null;
}

function formatMetric(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? `${value}` : value.toFixed(4);
  }
  return "n/a";
}

function statusVsPrevious(
  better: BetterDirection,
  current: number,
  previous: number,
): { status: "improved" | "regressed" | "unchanged"; delta: number } {
  const delta = current - previous;
  if (delta === 0) {
    return { status: "unchanged", delta };
  }
  if (better === "higher") {
    return { status: delta > 0 ? "improved" : "regressed", delta };
  }
  return { status: delta < 0 ? "improved" : "regressed", delta };
}

function benchmarkDisplayName(benchmark: RunRecord["benchmark"]): string {
  if (benchmark === "msmarco") {
    return "MS MARCO";
  }
  if (benchmark === "hotpotqa") {
    return "HotpotQA";
  }
  return "Freshness";
}

async function collectRuns(runsDir: string): Promise<Record<RunRecord["benchmark"], RunRecord[]>> {
  const grouped: Record<RunRecord["benchmark"], RunRecord[]> = {
    msmarco: [],
    hotpotqa: [],
    freshness: [],
  };

  const entries = await fs.readdir(runsDir, { withFileTypes: true });
  const runDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  for (const runName of runDirs) {
    const runPath = path.join(runsDir, runName);
    const metadata = await readJson(path.join(runPath, "metadata.json"));
    const benchmark = detectBenchmark(runName, metadata);
    if (!benchmark) {
      continue;
    }

    const summaryFile =
      benchmark === "msmarco"
        ? "msmarco_summary.json"
        : benchmark === "hotpotqa"
          ? "hotpotqa_summary.json"
          : "freshness_batch.json";

    const summaryJson = await readJson(path.join(runPath, summaryFile));
    if (!summaryJson) {
      continue;
    }

    const kpMetrics =
      summaryJson.kp && typeof summaryJson.kp === "object"
        ? (summaryJson.kp as Record<string, unknown>)
        : null;
    if (!kpMetrics) {
      continue;
    }

    grouped[benchmark].push({
      run: runName,
      benchmark,
      gitCommit: typeof metadata?.git_commit === "string" ? metadata.git_commit : null,
      gitBranch: typeof metadata?.git_branch === "string" ? metadata.git_branch : null,
      metrics: kpMetrics,
    });
  }

  return grouped;
}

function buildMarkdown(grouped: Record<RunRecord["benchmark"], RunRecord[]>, limit: number): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  let improvedTotal = 0;
  let regressedTotal = 0;
  let unchangedTotal = 0;
  let benchmarkCount = 0;

  const benchmarkSections: string[] = [];

  for (const benchmark of ["msmarco", "hotpotqa", "freshness"] as const) {
    const runs = grouped[benchmark];
    if (runs.length === 0) {
      continue;
    }

    benchmarkCount += 1;
    const section: string[] = [];

    const recent = runs.slice(-limit);
    const latest = recent[recent.length - 1];
    const previous = recent.length > 1 ? recent[recent.length - 2] : null;
    const regressions: string[] = [];
    const improvements: string[] = [];
    const unchanged: string[] = [];

    section.push(`## ${benchmarkDisplayName(benchmark)} (${benchmark})`);
    section.push("");
    section.push(`Latest run: \`${latest.run}\` on branch \`${latest.gitBranch ?? "unknown"}\` at commit \`${latest.gitCommit ?? "unknown"}\`.`);
    section.push("");

    if (!previous) {
      section.push("No previous run found for direct comparison yet.");
      section.push("");
      benchmarkSections.push(section.join("\n"));
      continue;
    }

    section.push(`Compared against previous run: \`${previous.run}\`.`);
    section.push("");
    section.push("### What changed");
    section.push("");

    for (const spec of METRICS[benchmark]) {
      const current = latest.metrics[spec.key];
      const prev = previous.metrics[spec.key];
      if (typeof current !== "number" || typeof prev !== "number") {
        continue;
      }

      const { status, delta } = statusVsPrevious(spec.better, current, prev);
      const signedDelta = `${delta >= 0 ? "+" : ""}${delta.toFixed(4)}`;
      const bullet = `- ${spec.label}: ${formatMetric(current)} (prev ${formatMetric(prev)}, delta ${signedDelta}) -> **${status}**`;
      section.push(bullet);

      if (status === "regressed") {
        regressions.push(spec.label);
        regressedTotal += 1;
      } else if (status === "improved") {
        improvements.push(spec.label);
        improvedTotal += 1;
      } else {
        unchanged.push(spec.label);
        unchangedTotal += 1;
      }
    }

    section.push("");
    section.push("### Interpretation");
    section.push("");
    if (regressions.length > 0) {
      section.push(`- Regressions to investigate: ${regressions.join(", ")}.`);
    } else {
      section.push("- No regressions in this benchmark.");
    }
    section.push(
      improvements.length > 0
        ? `- Improvements observed: ${improvements.join(", ")}.`
        : "- No metric improvements in this benchmark.",
    );
    if (unchanged.length > 0) {
      section.push(`- Stable metrics: ${unchanged.join(", ")}.`);
    }
    section.push(`- Runs included in trend window (${recent.length}): ${recent.map((run) => `\`${run.run}\``).join(", ")}.`);
    section.push("");

    benchmarkSections.push(section.join("\n"));
  }

  lines.push("# Benchmark High-Level Summary");
  lines.push("");
  lines.push(`Generated at: \`${now}\``);
  lines.push("");
  lines.push(`Built from archived runs for reasoning, debugging, and optimization.`);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(`- Benchmarks analyzed: ${benchmarkCount}`);
  lines.push(`- Metrics improved: ${improvedTotal}`);
  lines.push(`- Metrics regressed: ${regressedTotal}`);
  lines.push(`- Metrics unchanged: ${unchangedTotal}`);
  lines.push(
    regressedTotal > 0
      ? "- Overall signal: some regressions are present and should be treated as expected debugging targets."
      : "- Overall signal: no regressions detected in latest comparisons.",
  );
  lines.push("");
  lines.push(...benchmarkSections);

  return `${lines.join("\n")}\n`;
}

async function main() {
  const { runsDir, outputMd, limit } = parseArgs(process.argv.slice(2));
  const grouped = await collectRuns(runsDir);
  const markdown = buildMarkdown(grouped, limit);

  await fs.mkdir(path.dirname(outputMd), { recursive: true });
  await fs.writeFile(outputMd, markdown, "utf8");
  console.log(`Wrote markdown summary: ${outputMd}`);
}

main().catch((error) => {
  console.error("Failed to generate summary:", error);
  process.exit(1);
});
