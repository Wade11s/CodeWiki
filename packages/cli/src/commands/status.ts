import { existsSync } from "node:fs";
import { join } from "node:path";
import { readSnapshot, loadConfigWithSources } from "@codewiki/core";

export async function statusCommand(repoPath: string, options: { json?: boolean }): Promise<void> {
  const snapshot = readSnapshot(repoPath);
  const { agent, scan } = loadConfigWithSources(repoPath);

  const codewikiDir = join(repoPath, ".codewiki");
  const exists = existsSync(codewikiDir);

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
    console.log("");
    console.log("Agent configuration:");
    console.log(`  Default provider: ${agent.default} (${agent.sources.default})`);
    console.log(`  Concurrency: ${agent.concurrency} (${agent.sources.concurrency})`);
    console.log(`  Timeout: ${agent.timeoutSeconds}s (${agent.sources.timeoutSeconds})`);
    console.log(`  Retries: ${agent.retries} (${agent.sources.retries})`);
    console.log("");
    console.log(`Scan interactive-config: ${scan.interactiveConfig} (${scan.source})`);
  }
}
