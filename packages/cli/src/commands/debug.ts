import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readSnapshot, loadConfig } from "@codewiki/core";

function listRuns(codewikiDir: string): Array<{ runId: string; tasks: string[] }> {
  const runsDir = join(codewikiDir, "runs");
  if (!existsSync(runsDir)) return [];

  const runs: Array<{ runId: string; tasks: string[] }> = [];
  for (const runId of readdirSync(runsDir)) {
    const tasksDir = join(runsDir, runId, "tasks");
    const tasks = existsSync(tasksDir) ? readdirSync(tasksDir).filter((f) => f.endsWith(".json")) : [];
    runs.push({ runId, tasks });
  }
  return runs;
}

export async function debugCommand(
  repoPath: string,
  options: { json?: boolean; task?: string }
): Promise<void> {
  const snapshot = readSnapshot(repoPath);
  const config = loadConfig(repoPath);
  const codewikiDir = join(repoPath, ".codewiki");
  const exists = existsSync(codewikiDir);

  const indexDir = join(codewikiDir, "index");
  const artifactsDir = join(codewikiDir, "artifacts");

  const indexFiles = existsSync(indexDir) ? readdirSync(indexDir) : [];
  const artifactFiles = existsSync(artifactsDir) ? readdirSync(artifactsDir) : [];
  const runs = listRuns(codewikiDir);

  const debug = {
    codewikiExists: exists,
    snapshot,
    config,
    indexFiles,
    artifactFiles,
    runs,
    taskDetails: null as unknown,
  };

  if (options.task) {
    const taskPath = join(codewikiDir, "runs", options.task, "tasks", `${options.task}.json`);
    if (existsSync(taskPath)) {
      try {
        debug.taskDetails = JSON.parse(readFileSync(taskPath, "utf-8"));
      } catch {
        debug.taskDetails = { error: "Failed to parse task file" };
      }
    } else {
      debug.taskDetails = { error: `Task not found: ${options.task}` };
    }
  }

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
      console.log(`  ${run.runId}: ${run.tasks.length} tasks`);
    }
    if (debug.taskDetails) {
      console.log("Task details:");
      console.log(JSON.stringify(debug.taskDetails, null, 2));
    }
  }
}
