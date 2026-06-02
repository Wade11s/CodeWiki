import { existsSync } from "node:fs";
import { join } from "node:path";
import { readSnapshot, loadConfig } from "@codewiki/core";

export async function statusCommand(repoPath: string, options: { json?: boolean }): Promise<void> {
  const snapshot = readSnapshot(repoPath);
  const config = loadConfig(repoPath);

  const codewikiDir = join(repoPath, ".codewiki");
  const exists = existsSync(codewikiDir);

  const status = {
    codewikiExists: exists,
    snapshot: snapshot || null,
    config,
    stale: snapshot ? snapshot.gitDirty : false,
    schemaVersion: snapshot ? snapshot.schemaVersion : null,
    skippedFiles: 0,
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
  }
}
