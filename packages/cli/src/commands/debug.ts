import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readSnapshot, loadConfig, readLatestRun } from "@codewiki/core";

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

function readTaskFile(codewikiDir: string, runId: string, taskId: string): unknown {
  const taskPath = join(codewikiDir, "runs", runId, "tasks", `${taskId}.json`);
  if (!existsSync(taskPath)) return { error: `Task not found: ${taskId}` };
  try {
    return JSON.parse(readFileSync(taskPath, "utf-8"));
  } catch {
    return { error: "Failed to parse task file" };
  }
}

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
  const runs = listRuns(codewikiDir);

  const targetRunId = options.run || runs[0]?.runId;
  const latestRun = targetRunId ? readLatestRun(codewikiDir) : null;

  const debug: Record<string, unknown> = {
    codewikiExists: exists,
    snapshot,
    config,
    indexFiles,
    artifactFiles,
    runs,
    runDiagnostics: null,
    taskDiagnostics: null,
  };

  if (targetRunId && latestRun && latestRun.runId === targetRunId) {
    debug.runDiagnostics = {
      runId: latestRun.runId,
      phase: latestRun.phase,
      status: latestRun.status,
      startedAt: latestRun.startedAt,
      completedAt: latestRun.completedAt,
      moduleSummary: latestRun.modules.map((m) => ({
        name: m.moduleName,
        status: m.status,
        fileCount: m.files.length,
        artifactCount: m.artifacts.length,
        diagnostics: m.diagnostics,
      })),
      taskSummary: latestRun.tasks.map((t) => ({
        taskId: t.taskId,
        moduleName: t.moduleName,
        status: t.status,
        durationMs: t.durationMs,
        retriesUsed: t.retriesUsed,
        validationErrors: t.validationErrors,
      })),
      skippedFiles: latestRun.skippedFiles,
    };
  }

  if (options.task) {
    // Find task in latest run or specified run
    const searchRunId = options.run || runs[0]?.runId;
    if (searchRunId) {
      debug.taskDiagnostics = readTaskFile(codewikiDir, searchRunId, options.task);
    } else {
      debug.taskDiagnostics = { error: "No runs available to search for task" };
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
    if (debug.runDiagnostics) {
      const rd = debug.runDiagnostics as Record<string, unknown>;
      console.log(`\nRun diagnostics (${rd.runId}):`);
      console.log(`  Phase: ${rd.phase}`);
      console.log(`  Status: ${rd.status}`);
      const modules = rd.moduleSummary as Array<Record<string, unknown>> | undefined;
      if (modules) {
        for (const m of modules) {
          console.log(`  Module ${m.name}: ${m.status} (${m.fileCount} files, ${m.artifactCount} artifacts)`);
          if (m.diagnostics && (m.diagnostics as string[]).length > 0) {
            for (const d of m.diagnostics as string[]) {
              console.log(`    - ${d}`);
            }
          }
        }
      }
    }
    if (debug.taskDiagnostics) {
      console.log("\nTask diagnostics:");
      console.log(JSON.stringify(debug.taskDiagnostics, null, 2));
    }
  }
}
