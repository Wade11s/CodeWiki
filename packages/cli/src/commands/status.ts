import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readSnapshot, loadConfig } from "@codewiki/core";
import { SkippedFilesArtifactSchema, SkipReasonSchema } from "@codewiki/core";
import type { SkippedFilesArtifact, SkipReason } from "@codewiki/core";

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

export async function statusCommand(repoPath: string, options: { json?: boolean }): Promise<void> {
  const snapshot = readSnapshot(repoPath);
  const config = loadConfig(repoPath);
  const skipped = readSkippedFiles(repoPath);
  const skippedCounts = countSkippedByReason(skipped);
  const totalSkipped = skipped ? skipped.data.length : 0;

  const codewikiDir = join(repoPath, ".codewiki");
  const exists = existsSync(codewikiDir);

  const status = {
    codewikiExists: exists,
    snapshot: snapshot || null,
    config,
    stale: snapshot ? snapshot.gitDirty : false,
    schemaVersion: snapshot ? snapshot.schemaVersion : null,
    skippedFiles: totalSkipped,
    skippedByReason: skippedCounts,
    failedTasks: 0,
  };

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(`CodeWiki directory: ${exists ? "yes" : "no"}`);
    if (snapshot) {
      console.log(`Snapshot: ${snapshot.id}`);
      console.log(`Schema version: ${snapshot.schemaVersion}`);
      console.log(`Git head: ${snapshot.gitHead || "(none)"}`);
      console.log(`Dirty: ${snapshot.gitDirty}`);
      console.log(`Files: ${snapshot.fileCount}`);
      console.log(`Stale: ${status.stale}`);
    } else {
      console.log("No snapshot found. Run 'codewiki scan' first.");
    }
    console.log(`Default agent: ${config.agent.default}`);
    console.log(`Concurrency: ${config.agent.concurrency}`);
    console.log(`Timeout: ${config.agent.timeoutSeconds}s`);
    if (totalSkipped > 0) {
      console.log(`Skipped files: ${totalSkipped}`);
      for (const [reason, count] of Object.entries(skippedCounts)) {
        if (count > 0) {
          console.log(`  ${reason}: ${count}`);
        }
      }
    }
  }
}
