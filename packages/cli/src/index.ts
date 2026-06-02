#!/usr/bin/env node
import { Command } from "commander";
import { scanCommand } from "./commands/scan.js";
import { serveCommand } from "./commands/serve.js";
import { askCommand } from "./commands/ask.js";
import { statusCommand } from "./commands/status.js";
import { debugCommand } from "./commands/debug.js";
import { agentsCommand, selectAgentCommand } from "./commands/agents.js";
import { CodeWikiError } from "@codewiki/core";

function wrapCommand(handler: (...args: any[]) => Promise<void>): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => {
    try {
      await handler(...args);
    } catch (err) {
      if (err instanceof CodeWikiError) {
        console.error(err.message);
        process.exit(err.exitCode);
      }
      throw err;
    }
  };
}

const program = new Command();

program
  .name("codewiki")
  .description("Local-first CLI for repository understanding")
  .version("0.1.0");

program
  .command("scan <repo>")
  .description("Scan a repository and create or refresh .codewiki/")
  .option("-c, --concurrency <n>", "Number of concurrent agent tasks")
  .option("-t, --timeout <seconds>", "Timeout per task in seconds")
  .option("-r, --retries <n>", "Number of retries per task")
  .option("-a, --agent <agent>", "Override the default agent for this scan")
  .option("--write-config", "Write scan options to repo config")
  .option("--non-interactive", "Do not prompt for interactive actions")
  .action(wrapCommand(async (repo: string, options: { concurrency?: string; timeout?: string; retries?: string; agent?: string; writeConfig?: boolean; nonInteractive?: boolean }) => {
    await scanCommand(repo, options);
  }));

program
  .command("serve <repo>")
  .description("Preview the generated static report locally")
  .option("-p, --port <port>", "Port to serve on", "3000")
  .action(wrapCommand(async (repo: string, options: { port?: string }) => {
    await serveCommand(repo, options);
  }));

program
  .command("ask <repo> <question>")
  .description("Answer a question from indexed evidence")
  .option("--json", "Output JSON instead of Markdown")
  .option("--agent <agent>", "Override the default agent")
  .action(wrapCommand(async (repo: string, question: string, options: { json?: boolean; agent?: string }) => {
    await askCommand(repo, question, options);
  }));

program
  .command("status <repo>")
  .description("Report snapshot, config, and scan health")
  .option("--json", "Output JSON instead of text")
  .action(wrapCommand(async (repo: string, options: { json?: boolean }) => {
    await statusCommand(repo, options);
  }));

program
  .command("debug <repo>")
  .description("Expose detailed run and task diagnostics")
  .option("--json", "Output JSON instead of text")
  .option("--task <task-id>", "Focus on a specific task")
  .option("--run <run-id>", "Focus on a specific run")
  .action(wrapCommand(async (repo: string, options: { json?: boolean; task?: string; run?: string }) => {
    await debugCommand(repo, options);
  }));

program
  .command("agents")
  .description("Detect local agent CLIs")
  .option("--json", "Output JSON instead of text")
  .option("--select", "Interactively select the default provider")
  .action(wrapCommand(async (options: { json?: boolean; select?: boolean }) => {
    if (options.select) {
      await selectAgentCommand();
    } else {
      await agentsCommand(options);
    }
  }));

program.parse();
