import { spawnSync } from "node:child_process";
import type { DetectedAgent } from "@codewiki/core";

const AGENT_COMMANDS: Array<{ name: string; command: string; args: string[] }> = [
  { name: "codex", command: "codex", args: ["--version"] },
  { name: "claude", command: "claude", args: ["--version"] },
  { name: "aider", command: "aider", args: ["--version"] },
  { name: "pi", command: "pi", args: ["--version"] },
];

function detectAgent(name: string, command: string, args: string[]): DetectedAgent {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf-8",
      timeout: 5000,
      shell: false,
    });
    const version = result.status === 0 ? result.stdout.trim().split("\n")[0] : null;
    return {
      name,
      command,
      version,
      available: result.status === 0,
    };
  } catch {
    return {
      name,
      command,
      version: null,
      available: false,
    };
  }
}

export async function agentsCommand(options: { json?: boolean }): Promise<void> {
  const agents = AGENT_COMMANDS.map((a) => detectAgent(a.name, a.command, a.args));

  if (options.json) {
    console.log(JSON.stringify(agents, null, 2));
  } else {
    console.log("Detected agents:");
    for (const agent of agents) {
      const status = agent.available ? `✓ ${agent.version || ""}` : "✗ not found";
      console.log(`  ${agent.name}: ${status}`);
    }
  }
}
