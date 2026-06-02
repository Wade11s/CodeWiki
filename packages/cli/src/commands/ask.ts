import { existsSync } from "node:fs";
import { join } from "node:path";
import { readSnapshot } from "@codewiki/core";

export async function askCommand(
  repoPath: string,
  question: string,
  options: { json?: boolean; agent?: string }
): Promise<void> {
  const snapshot = readSnapshot(repoPath);
  if (!snapshot) {
    console.error(`Error: No snapshot found for ${repoPath}. Run 'codewiki scan ${repoPath}' first.`);
    process.exit(1);
  }

  const response = {
    answer: "Not yet implemented.",
    evidence: [],
    confidence: 0,
    snapshotId: snapshot.id,
    stale: false,
    searchedScopes: ["index", "artifacts"],
    suggestedNextSteps: ["Run codewiki scan to refresh the index."],
  };

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    console.log(`## Answer\n\n${response.answer}\n`);
    console.log(`## Evidence\n\nNo evidence available.\n`);
    console.log(`## Confidence\n\n${response.confidence}\n`);
    console.log(`## Index\n\n- Snapshot: ${response.snapshotId}\n- Searched: ${response.searchedScopes.join(", ")}\n`);
  }
}
