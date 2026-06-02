import { spawnSync } from "node:child_process";
import type { DetectedAgent, HealthStatus } from "@codewiki/core";
import { loadConfig, writeUserConfig } from "@codewiki/core";

const AGENT_COMMANDS: Array<{ name: string; command: string; args: string[] }> = [
  { name: "codex", command: "codex", args: ["--version"] },
  { name: "claude", command: "claude", args: ["--version"] },
  { name: "aider", command: "aider", args: ["--version"] },
  { name: "pi", command: "pi", args: ["--version"] },
];

function determineHealth(status: number | null, version: string | null): HealthStatus {
  if (status === 0 && version) return "healthy";
  if (status === 0 && !version) return "degraded";
  return "unavailable";
}

export function detectAgent(name: string, command: string, args: string[]): DetectedAgent {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf-8",
      timeout: 5000,
      shell: false,
    });
    const version = result.status === 0 ? result.stdout.trim().split("\n")[0] || null : null;
    const health = determineHealth(result.status, version);
    return {
      name,
      command,
      version,
      available: result.status === 0,
      health,
      default: false,
    };
  } catch {
    return {
      name,
      command,
      version: null,
      available: false,
      health: "unavailable",
      default: false,
    };
  }
}

export async function agentsCommand(options: { json?: boolean }): Promise<void> {
  const config = loadConfig();
  const detected = AGENT_COMMANDS.map((a) => detectAgent(a.name, a.command, a.args));

  const agents = detected.map((agent) => ({
    ...agent,
    default: agent.name === config.agent.default && agent.available,
  }));

  if (options.json) {
    console.log(JSON.stringify(agents, null, 2));
    return;
  }

  const available = agents.filter((a) => a.available);

  if (available.length === 0) {
    console.log("No agent CLIs detected.");
    console.log("Install one of: codex, claude, aider, pi");
    return;
  }

  console.log("Detected agents:");
  for (const agent of agents) {
    const status = agent.available
      ? `✓ ${agent.version || ""} (${agent.health})`
      : `✗ not found (${agent.health})`;
    const marker = agent.default ? " [default]" : "";
    console.log(`  ${agent.name}: ${status}${marker}`);
  }

  if (available.length > 1 && process.stdin.isTTY) {
    console.log("");
    await promptSelectProvider(available, config.agent.default);
  }
}

export async function selectAgentCommand(): Promise<void> {
  const detected = AGENT_COMMANDS.map((a) => detectAgent(a.name, a.command, a.args));
  const available = detected.filter((a) => a.available);

  if (available.length === 0) {
    console.log("No agent CLIs detected.");
    console.log("Install one of: codex, claude, aider, pi");
    return;
  }

  const config = loadConfig();
  await promptSelectProvider(available, config.agent.default);
}

async function promptSelectProvider(
  available: DetectedAgent[],
  currentDefault: string
): Promise<void> {
  // Lazy-load inquirer only when needed for interactivity
  const { select } = await import("@inquirer/prompts");

  const choices = available.map((agent) => ({
    name: `${agent.name} (${agent.version || "unknown version"})${agent.name === currentDefault ? " [current default]" : ""}`,
    value: agent.name,
    description: `Command: ${agent.command}`,
  }));

  const selected = await select({
    message: "Select the default agent provider:",
    choices,
  });

  writeUserConfig({
    agent: {
      default: selected,
    },
  });

  console.log(`Default provider set to: ${selected}`);
}
