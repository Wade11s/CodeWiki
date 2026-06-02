import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readSnapshot, loadConfigWithSources, isSnapshotStale, countCandidates, RunStore, SkippedFilesArtifactSchema, SkipReasonSchema } from "@codewiki/core";
import type { SkippedFilesArtifact, SkipReason, FeatureCandidateGroup } from "@codewiki/core";

function readSkippedFiles(repoPath: string): SkippedFilesArtifact | null {
  const path = join(repoPath, ".codewiki", "index", "skipped-files.json");
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    const result = SkippedFilesArtifactSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function countSkippedByReason(skipped: SkippedFilesArtifact | null): Record<SkipReason, number> {
  const counts = Object.fromEntries(
    SkipReasonSchema.options.map((r) => [r, 0])
  ) as Record<SkipReason, number>;
  if (!skipped) return counts;
  for (const file of skipped.data) {
    if (counts[file.reason] !== undefined) {
      counts[file.reason]++;
    }
  }
  return counts;
}

function readFeatureCandidates(repoPath: string): FeatureCandidateGroup[] {
  const path = join(repoPath, ".codewiki", "index", "feature-candidates.json");
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.data) ? parsed.data : [];
  } catch {
    return [];
  }
}

function getFailedTasks(repoPath: string): Array<{ taskId: string; state: string; summary: string }> {
  const codewikiDir = join(repoPath, ".codewiki");
  if (!existsSync(codewikiDir)) return [];

  const store = new RunStore(codewikiDir);
  const latestRun = store.getLatestRun();
  if (!latestRun) return [];

  return latestRun.tasks
    .filter((t) => t.state === "failed" || t.state === "timeout")
    .map((t) => ({
      taskId: t.taskId,
      state: t.state,
      summary: t.stderr.slice(0, 120) || t.validationErrors[0] || "No details",
    }));
}

function readIndexArtifactCount(repoPath: string, artifactName: string): number {
  const path = join(repoPath, ".codewiki", "index", `${artifactName}.json`);
  if (!existsSync(path)) return 0;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.data) ? parsed.data.length : 0;
  } catch {
    return 0;
  }
}

function readArtifactCount(repoPath: string, artifactName: string): number {
  const path = join(repoPath, ".codewiki", "artifacts", `${artifactName}.json`);
  if (!existsSync(path)) return 0;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.data) ? parsed.data.length : 0;
  } catch {
    return 0;
  }
}

export async function statusCommand(repoPath: string, options: { json?: boolean }): Promise<void> {
  const snapshot = readSnapshot(repoPath);
  const { agent, scan } = loadConfigWithSources(repoPath);
  const skipped = readSkippedFiles(repoPath);
  const skippedCounts = countSkippedByReason(skipped);
  const totalSkipped = skipped ? skipped.data.length : 0;

  const codewikiDir = join(repoPath, ".codewiki");
  const exists = existsSync(codewikiDir);

  const stale = snapshot ? isSnapshotStale(repoPath, snapshot) : false;
  const candidateGroups = readFeatureCandidates(repoPath);
  const candidateCount = countCandidates(candidateGroups);
  const failedTasks = getFailedTasks(repoPath);

  const symbolCount = readIndexArtifactCount(repoPath, "symbols");
  const importCount = readIndexArtifactCount(repoPath, "imports");
  const blockCount = readIndexArtifactCount(repoPath, "blocks");
  const moduleCount = readArtifactCount(repoPath, "modules");

  const status = {
    codewikiExists: exists,
    snapshot: snapshot || null,
    config: {
      agent: {
        default: agent.default,
        concurrency: agent.concurrency,
        timeoutSeconds: agent.timeoutSeconds,
        retries: agent.retries,
        sources: agent.sources,
      },
      scan: {
        interactiveConfig: scan.interactiveConfig,
        source: scan.source,
      },
    },
    stale,
    schemaVersion: snapshot ? snapshot.schemaVersion : null,
    skippedFiles: totalSkipped,
    skippedByReason: skippedCounts,
    failedTasks: failedTasks.length,
    failedTaskSummaries: failedTasks,
    candidateCount,
    candidateGroups: candidateGroups.length,
    symbolCount,
    importCount,
    blockCount,
    moduleCount,
  };

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(`CodeWiki directory: ${exists ? "yes" : "no"}`);
    if (snapshot) {
      console.log(`Snapshot: ${snapshot.id}`);
      console.log(`Schema version: ${snapshot.schemaVersion}`);
      console.log(`Generated: ${snapshot.createdAt}`);
      console.log(`Repo path: ${snapshot.repoPath}`);
      console.log(`Git head: ${snapshot.gitHead || "(none)"}`);
      console.log(`Dirty: ${snapshot.gitDirty}`);
      console.log(`Files: ${snapshot.fileCount}`);
      console.log(`Stale: ${stale}`);
      console.log(`Symbols: ${symbolCount}`);
      console.log(`Imports: ${importCount}`);
      console.log(`Blocks: ${blockCount}`);
      console.log(`Modules: ${moduleCount}`);
      console.log(`Feature candidates: ${candidateCount} (${candidateGroups.length} groups)`);
    } else {
      console.log("No snapshot found. Run 'codewiki scan' first.");
    }
    console.log("");
    console.log("Agent configuration:");
    console.log(`  Default provider: ${agent.default} (${agent.sources.default})`);
    console.log(`  Concurrency: ${agent.concurrency} (${agent.sources.concurrency})`);
    console.log(`  Timeout: ${agent.timeoutSeconds}s (${agent.sources.timeoutSeconds})`);
    console.log(`  Retries: ${agent.retries} (${agent.sources.retries})`);
    console.log("");
    console.log(`Scan interactive-config: ${scan.interactiveConfig} (${scan.source})`);
    if (totalSkipped > 0) {
      console.log(`Skipped files: ${totalSkipped}`);
      for (const [reason, count] of Object.entries(skippedCounts)) {
        if (count > 0) {
          console.log(`  ${reason}: ${count}`);
        }
      }
    }
    if (failedTasks.length > 0) {
      console.log("");
      console.log(`Failed tasks: ${failedTasks.length}`);
      for (const task of failedTasks) {
        console.log(`  ${task.taskId} (${task.state}): ${task.summary}`);
      }
    }
  }
}
