import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readSnapshot, loadConfig, RunStore } from "@codewiki/core";

export async function debugCommand(
  repoPath: string,
  options: { json?: boolean; task?: string; run?: string }
): Promise<void> {
  const snapshot = readSnapshot(repoPath);
  const config = loadConfig(repoPath);
  const codewikiDir = join(repoPath, ".codewiki");
  const exists = existsSync(codewikiDir);

  const indexDir = join(codewikiDir, "index");
  const artifactsDir = join(codewikiDir, "artifacts");

  const indexFiles = existsSync(indexDir) ? readdirSync(indexDir) : [];
  const artifactFiles = existsSync(artifactsDir) ? readdirSync(artifactsDir) : [];

  const store = new RunStore(codewikiDir);
  const runs = store.listRunRecords();

  let taskDetails: unknown = null;
  let runDetails: unknown = null;

  if (options.task) {
    // Search across all runs for the task
    for (const run of runs) {
      const task = store.readTask(run.runId, options.task);
      if (task) {
        taskDetails = task;
        break;
      }
    }
    if (!taskDetails) {
      taskDetails = { error: `Task not found: ${options.task}` };
    }
  }

  if (options.run) {
    const run = store.readRun(options.run);
    if (run) {
      runDetails = run;
    } else {
      runDetails = { error: `Run not found: ${options.run}` };
    }
  }

  const debug = {
    codewikiExists: exists,
    snapshot,
    config,
    indexFiles,
    artifactFiles,
    runs: runs.map((r) => ({
      runId: r.runId,
      providerName: r.providerName,
      startedAt: r.startedAt,
      summary: r.summary,
      taskCount: r.tasks.length,
    })),
    runDetails,
    taskDetails,
  };

  if (options.json) {
    console.log(JSON.stringify(debug, null, 2));
  } else {
    console.log(`CodeWiki directory: ${exists ? "yes" : "no"}`);
    if (snapshot) {
      console.log(`Snapshot: ${snapshot.id}`);
      console.log(`Schema version: ${snapshot.schemaVersion}`);
      console.log(`Parser version: ${snapshot.parserVersion}`);
      console.log(`Agent version: ${snapshot.agentVersion}`);
      console.log(`Git head: ${snapshot.gitHead || "(none)"}`);
      console.log(`Dirty: ${snapshot.gitDirty}`);
      console.log(`Files: ${snapshot.fileCount}`);
    }
    console.log(`Index files: ${indexFiles.join(", ") || "none"}`);
    console.log(`Artifact files: ${artifactFiles.join(", ") || "none"}`);
    console.log(`Runs: ${runs.length}`);
    for (const run of runs) {
      const status = `${run.summary.success} ok, ${run.summary.failed} failed, ${run.summary.timedOut} timeout`;
      console.log(`  ${run.runId}: ${run.tasks.length} tasks (${status})`);
    }
    if (runDetails) {
      console.log("");
      console.log("Run details:");
      console.log(JSON.stringify(runDetails, null, 2));
    }
    if (taskDetails) {
      console.log("");
      console.log("Task details:");
      console.log(JSON.stringify(taskDetails, null, 2));
    }
  }
}
