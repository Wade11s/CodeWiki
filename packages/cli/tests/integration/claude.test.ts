import { describe, it, expect } from "bun:test";

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
  it("is a placeholder for future Claude integration tests", () => {
    expect(true).toBe(true);
  });
});
