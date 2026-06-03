import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanCommand } from "../src/commands/scan.js";
import { askCommand } from "../src/commands/ask.js";
import { AgentRunner } from "@codewiki/core";
import type { AgentProvider, TaskResult, ValidationError, DetectedAgent } from "@codewiki/core";

function createTempRepo(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `codewiki-ask-${name}-`));
  return dir;
}

function cleanup(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function addFile(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  const parent = join(fullPath, "..");
  mkdirSync(parent, { recursive: true });
  writeFileSync(fullPath, content);
}

function captureOutput<T>(fn: () => T | Promise<T>): Promise<{ result: T | undefined; output: string }> {
  let output = "";
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

  return Promise.resolve()
    .then(() => fn())
    .then((result) => {
      console.log = originalLog;
      return { result, output };
    })
    .catch((err) => {
      console.log = originalLog;
      throw err;
    });
}

// Custom provider that returns proper ask responses
class AskFakeProvider implements AgentProvider {
  name = "ask-fake";
  private mode: "success" | "fail" | "invalid-citation" | "low-confidence" = "success";

  setMode(mode: "success" | "fail" | "invalid-citation" | "low-confidence"): void {
    this.mode = mode;
  }

  async detect(): Promise<DetectedAgent | null> {
    return {
      name: "ask-fake",
      command: "ask-fake",
      version: "0.1.0",
      available: true,
      health: "healthy",
      default: false,
    };
  }

  async runTask(options: {
    prompt: string;
    repoIndexPath: string;
    inputArtifacts: string[];
    outputSchema: string;
    timeoutSeconds: number;
    retries: number;
  }): Promise<TaskResult> {
    if (this.mode === "fail") {
      return {
        taskId: `ask-fail-${Date.now()}`,
        exitCode: 1,
        durationMs: 10,
        stdout: "",
        stderr: "Ask task failed",
        retries: 0,
        validationErrors: [] as ValidationError[],
        state: "failed",
      };
    }

    if (this.mode === "low-confidence") {
      return {
        taskId: `ask-low-${Date.now()}`,
        exitCode: 0,
        durationMs: 10,
        stdout: JSON.stringify({ answer: "", confidence: 0, citations: [] }),
        stderr: "",
        retries: 0,
        validationErrors: [] as ValidationError[],
        state: "success",
      };
    }

    if (this.mode === "invalid-citation") {
      return {
        taskId: `ask-bad-${Date.now()}`,
        exitCode: 0,
        durationMs: 10,
        stdout: JSON.stringify({
          answer: "The answer uses a bad citation.",
          confidence: 0.9,
          citations: [
            { filePath: "nonexistent/file.ts", lineStart: 1, lineEnd: 5, snippet: "does not exist" },
          ],
        }),
        stderr: "",
        retries: 0,
        validationErrors: [] as ValidationError[],
        state: "success",
      };
    }

    // success mode: return valid citations matching the evidence
    // Extract file paths from the prompt to cite correctly
    const filePathMatch = options.prompt.match(/\((src\/[\w./-]+):\d/);
    const filePath = filePathMatch ? filePathMatch[1] : "src/example.ts";

    return {
      taskId: `ask-ok-${Date.now()}`,
      exitCode: 0,
      durationMs: 10,
      stdout: JSON.stringify({
        answer: "The greet function returns a greeting string.",
        confidence: 0.92,
        citations: [
          { filePath, lineStart: 1, lineEnd: 3, snippet: "export function greet" },
        ],
      }),
      stderr: "",
      retries: 0,
      validationErrors: [] as ValidationError[],
      state: "success",
    };
  }
}

describe("ask command", () => {
  let userConfigDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    userConfigDir = mkdtempSync(join(tmpdir(), "codewiki-user-"));
    originalHome = process.env.HOME;
    process.env.HOME = userConfigDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    cleanup(userConfigDir);
  });

  it("returns a successful JSON answer with evidence", async () => {
    const repo = createTempRepo("json-success");
    addFile(repo, "src/greet.ts", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n");

    const runner = new AgentRunner();
    const fake = new AskFakeProvider();
    runner.register(fake);

    await scanCommand(repo, { runner, agent: "ask-fake", nonInteractive: true });

    const { output } = await captureOutput(() =>
      askCommand(repo, "What does the greet function do?", { json: true, runner, agent: "ask-fake" })
    );
    const parsed = JSON.parse(output);

    expect(parsed.answer).toContain("greet");
    expect(parsed.evidence).toBeArray();
    expect(parsed.evidence.length).toBeGreaterThan(0);
    expect(parsed.confidence).toBeGreaterThan(0);
    expect(parsed.snapshotId).toBeString();
    expect(typeof parsed.stale).toBe("boolean");
    expect(parsed.searchedScopes).toContain("index");

    cleanup(repo);
  });

  it("returns a successful Markdown answer", async () => {
    const repo = createTempRepo("markdown-success");
    addFile(repo, "src/greet.ts", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n");

    const runner = new AgentRunner();
    const fake = new AskFakeProvider();
    runner.register(fake);

    await scanCommand(repo, { runner, agent: "ask-fake", nonInteractive: true });

    const { output } = await captureOutput(() =>
      askCommand(repo, "What does the greet function do?", { runner, agent: "ask-fake" })
    );

    expect(output).toContain("## Answer");
    expect(output).toContain("greet");
    expect(output).toContain("## Evidence");
    expect(output).toContain("## Confidence");
    expect(output).toContain("## Index");
    expect(output).toContain("## Agent");

    cleanup(repo);
  });

  it("reports stale index when files have changed", async () => {
    const repo = createTempRepo("stale-index");
    addFile(repo, "src/greet.ts", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n");

    const runner = new AgentRunner();
    const fake = new AskFakeProvider();
    runner.register(fake);

    await scanCommand(repo, { runner, agent: "ask-fake", nonInteractive: true });

    // Modify the file to make snapshot stale
    addFile(repo, "src/greet.ts", "export function greet(name: string): string {\n  return `Hi, ${name}!`;\n}\nexport function farewell() {}\n");

    const { output } = await captureOutput(() =>
      askCommand(repo, "What does the greet function do?", { json: true, runner, agent: "ask-fake" })
    );
    const parsed = JSON.parse(output);

    expect(parsed.stale).toBe(true);
    expect(parsed.answer).toContain("greet");

    cleanup(repo);
  });

  it("returns refusal when retrieval has insufficient evidence", async () => {
    const repo = createTempRepo("insufficient");
    addFile(repo, "src/greet.ts", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n");

    const runner = new AgentRunner();
    const fake = new AskFakeProvider();
    runner.register(fake);

    await scanCommand(repo, { runner, agent: "ask-fake", nonInteractive: true });

    const { output } = await captureOutput(() =>
      askCommand(repo, "What is the quantum mechanical model of the atom?", { json: true, runner, agent: "ask-fake" })
    );
    const parsed = JSON.parse(output);

    expect(parsed.answer).toBe("No answer: insufficient indexed evidence.");
    expect(parsed.evidence).toBeArray();
    expect(parsed.evidence.length).toBe(0);
    expect(parsed.confidence).toBe(0);
    expect(parsed.suggestedNextSteps.length).toBeGreaterThan(0);
    expect(parsed.searchedScopes).toContain("index");

    cleanup(repo);
  });

  it("returns refusal when agent citations are invalid", async () => {
    const repo = createTempRepo("invalid-citation");
    addFile(repo, "src/greet.ts", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n");

    const runner = new AgentRunner();
    const fake = new AskFakeProvider();
    fake.setMode("invalid-citation");
    runner.register(fake);

    await scanCommand(repo, { runner, agent: "ask-fake", nonInteractive: true });

    const { output } = await captureOutput(() =>
      askCommand(repo, "What does the greet function do?", { json: true, runner, agent: "ask-fake" })
    );
    const parsed = JSON.parse(output);

    expect(parsed.answer).toBe("No answer: insufficient indexed evidence.");
    expect(parsed.evidence).toBeArray();
    expect(parsed.evidence.length).toBe(0);
    expect(parsed.confidence).toBe(0);

    cleanup(repo);
  });

  it("does not rescan source code by default", async () => {
    const repo = createTempRepo("no-rescan");
    addFile(repo, "src/greet.ts", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n");

    const runner = new AgentRunner();
    const fake = new AskFakeProvider();
    runner.register(fake);

    await scanCommand(repo, { runner, agent: "ask-fake", nonInteractive: true });

    // Record the snapshot id after scan
    const { output: out1 } = await captureOutput(() =>
      askCommand(repo, "What does the greet function do?", { json: true, runner, agent: "ask-fake" })
    );
    const parsed1 = JSON.parse(out1);
    const snapshotId1 = parsed1.snapshotId;

    // Ask again — should use same snapshot, no rescan
    const { output: out2 } = await captureOutput(() =>
      askCommand(repo, "What does greet return?", { json: true, runner, agent: "ask-fake" })
    );
    const parsed2 = JSON.parse(out2);

    expect(parsed2.snapshotId).toBe(snapshotId1);
    // The index should still be the same (not rescanned)
    expect(parsed2.searchedScopes).toContain("index");

    cleanup(repo);
  });

  it("returns refusal when agent task fails", async () => {
    const repo = createTempRepo("agent-fail");
    addFile(repo, "src/greet.ts", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n");

    const runner = new AgentRunner();
    const fake = new AskFakeProvider();
    fake.setMode("fail");
    runner.register(fake);

    await scanCommand(repo, { runner, agent: "ask-fake", nonInteractive: true });

    const { output } = await captureOutput(() =>
      askCommand(repo, "What does the greet function do?", { json: true, runner, agent: "ask-fake" })
    );
    const parsed = JSON.parse(output);

    expect(parsed.answer).toBe("No answer: insufficient indexed evidence.");
    expect(parsed.confidence).toBe(0);

    cleanup(repo);
  });

  it("returns refusal when agent returns low confidence", async () => {
    const repo = createTempRepo("low-confidence");
    addFile(repo, "src/greet.ts", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n");

    const runner = new AgentRunner();
    const fake = new AskFakeProvider();
    fake.setMode("low-confidence");
    runner.register(fake);

    await scanCommand(repo, { runner, agent: "ask-fake", nonInteractive: true });

    const { output } = await captureOutput(() =>
      askCommand(repo, "What does the greet function do?", { json: true, runner, agent: "ask-fake" })
    );
    const parsed = JSON.parse(output);

    expect(parsed.answer).toBe("No answer: insufficient indexed evidence.");
    expect(parsed.confidence).toBe(0);

    cleanup(repo);
  });
});
