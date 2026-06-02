import { describe, it, expect } from "bun:test";
import { ClaudeProvider, AgentRunner } from "@codewiki/core";

/**
 * Claude provider integration tests.
 *
 * These tests require a local Claude CLI installation and authentication.
 * They are excluded from the default `bun test` run and are executed via:
 *   bun test packages/cli/tests/integration
 *
 * To run individually:
 *   bun test packages/cli/tests/integration/claude.test.ts
 */

describe("Claude provider integration", () => {
  it("detects claude CLI when installed", async () => {
    const provider = new ClaudeProvider();
    const detected = await provider.detect();

    expect(detected).not.toBeNull();
    expect(detected!.name).toBe("claude");
    expect(detected!.command).toBe("claude");

    if (detected!.available) {
      expect(detected!.version).not.toBeNull();
      expect(detected!.health).toBe("healthy");
    } else {
      expect(detected!.health).toBe("unavailable");
    }
  });

  it("can be registered and detected through AgentRunner", async () => {
    const runner = new AgentRunner();
    runner.register(new ClaudeProvider());

    const agents = await runner.detectAgents();
    const claude = agents.find((a) => a.name === "claude");

    expect(claude).toBeDefined();
    expect(claude!.name).toBe("claude");
  });

  it("opt-in: exercises Claude provider with a simple task when available", async () => {
    const provider = new ClaudeProvider();
    const detected = await provider.detect();

    // Skip if Claude is not installed
    if (!detected!.available) {
      console.log("Claude CLI not available, skipping integration test");
      return;
    }

    const runner = new AgentRunner();
    runner.register(new ClaudeProvider());

    const result = await runner.runTask("claude", {
      prompt: "Return a JSON object with a single field 'test' set to true. No other text.",
      repoIndexPath: process.cwd(),
      inputArtifacts: [],
      outputSchema: '{ "type": "object", "properties": { "test": { "type": "boolean" } } }',
      timeoutSeconds: 30,
      retries: 0,
    });

    // The result may succeed or fail depending on Claude's response format;
    // we just verify the runner captured metadata correctly.
    expect(result.taskId).toContain("claude");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.state).toBeDefined();
  }, 60000);
});
