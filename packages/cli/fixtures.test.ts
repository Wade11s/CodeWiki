import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync, writeFileSync as writeFile } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { scanCommand } from "./src/commands/scan.js";
import { statusCommand } from "./src/commands/status.js";
import { debugCommand } from "./src/commands/debug.js";
import { askCommand } from "./src/commands/ask.js";
import { serveCommand } from "./src/commands/serve.js";
import { generateSite } from "./src/site-generator.js";
import { clearGitignoreCache } from "@codewiki/core";

function createTempRepo(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `codewiki-fixture-${name}-`));
  return dir;
}

function cleanup(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  clearGitignoreCache();
}

function addFile(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  const parent = join(fullPath, "..");
  mkdirSync(parent, { recursive: true });
  writeFileSync(fullPath, content);
}

describe("Repository fixtures", () => {
  it("scans a minimal repo", async () => {
    const repo = createTempRepo("minimal");
    addFile(repo, "index.js", "export const x = 1;\n");
    addFile(repo, "README.md", "# Minimal\n");

    await scanCommand(repo, { nonInteractive: true });

    expect(existsSync(join(repo, ".codewiki", "snapshot.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "index", "files.json"))).toBe(true);

    cleanup(repo);
  });

  it("scans a node-cli repo", async () => {
    const repo = createTempRepo("node-cli");
    addFile(repo, "package.json", JSON.stringify({ name: "cli", version: "1.0.0" }));
    addFile(repo, "src/app.js", "module.exports = {};\n");
    addFile(repo, "test.js", "console.log('test');\n");

    await scanCommand(repo, { nonInteractive: true });

    const snapshotPath = join(repo, ".codewiki", "snapshot.json");
    expect(existsSync(snapshotPath)).toBe(true);
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
    expect(snapshot.fileCount).toBeGreaterThanOrEqual(3);

    cleanup(repo);
  });

  it("scans a react-app repo", async () => {
    const repo = createTempRepo("react");
    addFile(repo, "package.json", JSON.stringify({ name: "react-app", dependencies: { react: "^19" } }));
    addFile(repo, "src/main.jsx", "import React from 'react';\n");
    addFile(repo, "src/App.jsx", "export default function App() { return null; }\n");

    await scanCommand(repo, { nonInteractive: true });

    const filesPath = join(repo, ".codewiki", "index", "files.json");
    const files = JSON.parse(readFileSync(filesPath, "utf-8"));
    expect(Array.isArray(files.data)).toBe(true);
    expect(files.data.length).toBeGreaterThanOrEqual(3);

    cleanup(repo);
  });
});

describe("Snapshot fixtures", () => {
  it("produces a valid snapshot envelope", async () => {
    const repo = createTempRepo("snapshot");
    addFile(repo, "a.js", "const a = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    const snapshotPath = join(repo, ".codewiki", "snapshot.json");
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));

    expect(snapshot).toHaveProperty("id");
    expect(snapshot).toHaveProperty("schemaVersion");
    expect(snapshot).toHaveProperty("createdAt");
    expect(snapshot).toHaveProperty("repoPath", repo);
    expect(snapshot).toHaveProperty("fileCount");
    expect(snapshot).toHaveProperty("fileHashes");
    expect(typeof snapshot.fileHashes).toBe("object");
    expect(snapshot.fileHashes["a.js"]).toBeDefined();
    expect(snapshot.fileHashes["a.js"]).toHaveLength(64); // sha256 hex
    expect(snapshot).toHaveProperty("parserVersion");
    expect(snapshot).toHaveProperty("agentVersion");

    cleanup(repo);
  });

  it("schema version is stable across scans", async () => {
    const repo = createTempRepo("version");
    addFile(repo, "x.js", "// x\n");

    await scanCommand(repo, { nonInteractive: true });
    const snap1 = JSON.parse(readFileSync(join(repo, ".codewiki", "snapshot.json"), "utf-8"));

    await scanCommand(repo, { nonInteractive: true });
    const snap2 = JSON.parse(readFileSync(join(repo, ".codewiki", "snapshot.json"), "utf-8"));

    expect(snap1.schemaVersion).toBe(snap2.schemaVersion);

    cleanup(repo);
  });
});

describe("CodeWiki Directory fixtures", () => {
  it("creates the expected .codewiki/ layout", async () => {
    const repo = createTempRepo("layout");
    addFile(repo, "file.js", "// file\n");

    await scanCommand(repo, { nonInteractive: true });

    expect(existsSync(join(repo, ".codewiki", "snapshot.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "index", "files.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "index", "symbols.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "index", "imports.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "index", "blocks.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "index", "feature-candidates.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "index", "skipped-files.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "artifacts", "overview.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "artifacts", "modules.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "artifacts", "features.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "artifacts", "code-map.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "config"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "runs"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "site"))).toBe(true);

    cleanup(repo);
  });

  it("status reports codewiki existence", async () => {
    const repo = createTempRepo("status");
    addFile(repo, "a.js", "// a\n");

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

    await statusCommand(repo, {});
    console.log = originalLog;

    expect(output).toContain("CodeWiki directory: no");

    await scanCommand(repo, { nonInteractive: true });

    output = "";
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;

    expect(output).toContain("CodeWiki directory: yes");
    expect(output).toContain("Snapshot:");
    expect(output).toContain("Generated:");
    expect(output).toContain("Repo path:");

    cleanup(repo);
  });

  it("debug outputs JSON with --json", async () => {
    const repo = createTempRepo("debug");
    addFile(repo, "a.js", "// a\n");
    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

    await debugCommand(repo, { json: true });
    console.log = originalLog;

    const debug = JSON.parse(output);
    expect(debug).toHaveProperty("codewikiExists");
    expect(debug).toHaveProperty("snapshot");
    expect(debug).toHaveProperty("indexFiles");
    expect(Array.isArray(debug.indexFiles)).toBe(true);

    cleanup(repo);
  });
});

describe("Evidence fixtures", () => {
  it("ask requires a snapshot", async () => {
    const repo = createTempRepo("ask-nosnap");

    let output = "";
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    console.error = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => { exitCode = code; throw new Error(`exit ${code}`); }) as typeof process.exit;

    try {
      await askCommand(repo, "What is this?", {});
    } catch {
      // expected
    }

    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;

    expect(exitCode).toBe(1);
    expect(output).toContain("No snapshot found");

    cleanup(repo);
  });

  it("ask returns placeholder when snapshot exists", async () => {
    const repo = createTempRepo("ask-snap");
    addFile(repo, "a.js", "// a\n");
    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

    await askCommand(repo, "What is this?", {});
    console.log = originalLog;

    expect(output).toContain("Not yet implemented");
    expect(output).toContain("Snapshot:");

    cleanup(repo);
  });

  it("ask returns JSON with --json", async () => {
    const repo = createTempRepo("ask-json");
    addFile(repo, "a.js", "// a\n");
    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

    await askCommand(repo, "What is this?", { json: true });
    console.log = originalLog;

    const response = JSON.parse(output);
    expect(response).toHaveProperty("answer");
    expect(response).toHaveProperty("evidence");
    expect(response).toHaveProperty("confidence");
    expect(response).toHaveProperty("snapshotId");

    cleanup(repo);
  });
});

describe("Site generation fixtures", () => {
  it("scan generates a static site directory", async () => {
    const repo = createTempRepo("site-gen");
    addFile(repo, "a.js", "// a\n");

    await scanCommand(repo, { nonInteractive: true });

    const siteDir = join(repo, ".codewiki", "site");
    expect(existsSync(siteDir)).toBe(true);
    expect(existsSync(join(siteDir, "index.html"))).toBe(true);
    expect(existsSync(join(siteDir, "snapshot.json"))).toBe(true);
    expect(existsSync(join(siteDir, "artifacts", "overview.json"))).toBe(true);
    expect(existsSync(join(siteDir, "artifacts", "modules.json"))).toBe(true);
    expect(existsSync(join(siteDir, "artifacts", "features.json"))).toBe(true);
    expect(existsSync(join(siteDir, "artifacts", "code-map.json"))).toBe(true);

    cleanup(repo);
  });

  it("generateSite copies rich artifacts into the site", async () => {
    const repo = createTempRepo("site-rich");
    addFile(repo, "a.js", "// a\n");
    await scanCommand(repo, { nonInteractive: true });

    const overviewPath = join(repo, ".codewiki", "artifacts", "overview.json");
    const enriched = {
      schemaVersion: "1.0.0",
      snapshotId: "test",
      generatedAt: new Date().toISOString(),
      data: {
        summary: "Rich summary",
        architecture: "Layered",
        technologyStack: ["Node.js"],
        entryPoints: [{ path: "a.js", description: "entry" }],
        runModel: "node a.js",
      },
    };
    writeFile(overviewPath, JSON.stringify(enriched, null, 2));

    const result = generateSite(repo);
    expect(result.success).toBe(true);

    const siteOverviewPath = join(repo, ".codewiki", "site", "artifacts", "overview.json");
    expect(existsSync(siteOverviewPath)).toBe(true);
    const siteOverview = JSON.parse(readFileSync(siteOverviewPath, "utf-8"));
    expect(siteOverview.data.summary).toBe("Rich summary");

    cleanup(repo);
  });

  it("generateSite handles missing snapshot gracefully", () => {
    const repo = createTempRepo("site-no-snap");
    mkdirSync(join(repo, ".codewiki"), { recursive: true });
    // No snapshot.json, no artifacts dir

    const result = generateSite(repo);
    expect(result.success).toBe(true); // Site dist was copied
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("snapshot"))).toBe(true);

    cleanup(repo);
  });
});

describe("Ignore rules fixtures", () => {
  it("skips ignored directories like node_modules", async () => {
    const repo = createTempRepo("ignored-dirs");
    addFile(repo, "src/index.js", "export const x = 1;\n");
    addFile(repo, "node_modules/pkg/index.js", "module.exports = {};\n");
    addFile(repo, ".git/config", "[core]\n");

    await scanCommand(repo, { nonInteractive: true });

    const skippedPath = join(repo, ".codewiki", "index", "skipped-files.json");
    const skipped = JSON.parse(readFileSync(skippedPath, "utf-8"));
    expect(Array.isArray(skipped.data)).toBe(true);

    const ignored = skipped.data.filter((f: { reason: string }) => f.reason === "ignored");
    const paths = ignored.map((f: { path: string }) => f.path);
    expect(paths.some((p: string) => p.includes("node_modules"))).toBe(true);
    expect(paths.some((p: string) => p.includes(".git"))).toBe(true);

    cleanup(repo);
  });

  it("skips generated files", async () => {
    const repo = createTempRepo("generated");
    addFile(repo, "src/app.js", "console.log('hello');\n");
    addFile(repo, "app.min.js", "console.log('min');\n");
    addFile(repo, "types.d.ts", "export type T = string;\n");
    addFile(repo, "app.js.map", "{}\n");

    await scanCommand(repo, { nonInteractive: true });

    const skippedPath = join(repo, ".codewiki", "index", "skipped-files.json");
    const skipped = JSON.parse(readFileSync(skippedPath, "utf-8"));

    const generated = skipped.data.filter((f: { reason: string }) => f.reason === "generated");
    const paths = generated.map((f: { path: string }) => f.path);
    expect(paths).toContain("app.min.js");
    expect(paths).toContain("types.d.ts");
    expect(paths).toContain("app.js.map");

    cleanup(repo);
  });

  it("skips binary files", async () => {
    const repo = createTempRepo("binary");
    addFile(repo, "src/index.js", "export const x = 1;\n");

    const binaryPath = join(repo, "image.png");
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    writeFileSync(binaryPath, buf);

    await scanCommand(repo, { nonInteractive: true });

    const skippedPath = join(repo, ".codewiki", "index", "skipped-files.json");
    const skipped = JSON.parse(readFileSync(skippedPath, "utf-8"));

    const binary = skipped.data.filter((f: { reason: string }) => f.reason === "binary");
    const paths = binary.map((f: { path: string }) => f.path);
    expect(paths).toContain("image.png");

    cleanup(repo);
  });

  it("skips oversized files", async () => {
    const repo = createTempRepo("oversized");
    addFile(repo, "src/index.js", "export const x = 1;\n");

    const bigPath = join(repo, "big.log");
    const bigContent = "x".repeat(1024 * 1024 + 100); // > 1 MB
    writeFileSync(bigPath, bigContent);

    await scanCommand(repo, { nonInteractive: true });

    const skippedPath = join(repo, ".codewiki", "index", "skipped-files.json");
    const skipped = JSON.parse(readFileSync(skippedPath, "utf-8"));

    const oversized = skipped.data.filter((f: { reason: string }) => f.reason === "oversized");
    const paths = oversized.map((f: { path: string }) => f.path);
    expect(paths).toContain("big.log");

    cleanup(repo);
  });

  it("respects configured exclude rules", async () => {
    const repo = createTempRepo("config-exclude");
    addFile(repo, "src/index.js", "export const x = 1;\n");
    addFile(repo, "docs/readme.md", "# docs\n");
    addFile(repo, "tests/test.js", "test\n");

    const configPath = join(repo, ".codewiki", "config.json");
    mkdirSync(join(repo, ".codewiki"), { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      scan: { interactiveConfig: false, exclude: ["docs/**", "tests/**"] },
    }));

    await scanCommand(repo, { nonInteractive: true });

    const filesPath = join(repo, ".codewiki", "index", "files.json");
    const files = JSON.parse(readFileSync(filesPath, "utf-8"));
    const paths = files.data as string[];
    expect(paths).toContain("src/index.js");
    expect(paths).not.toContain("docs/readme.md");
    expect(paths).not.toContain("tests/test.js");

    const skippedPath = join(repo, ".codewiki", "index", "skipped-files.json");
    const skipped = JSON.parse(readFileSync(skippedPath, "utf-8"));
    const ignored = skipped.data.filter((f: { reason: string; metadata?: { source?: string } }) => f.reason === "ignored" && f.metadata?.source === "config");
    const skippedPaths = ignored.map((f: { path: string }) => f.path);
    expect(skippedPaths.some((p: string) => p.includes("docs"))).toBe(true);
    expect(skippedPaths.some((p: string) => p.includes("tests"))).toBe(true);

    cleanup(repo);
  });

  it("respects configured include rules", async () => {
    const repo = createTempRepo("config-include");
    addFile(repo, "src/index.js", "export const x = 1;\n");
    addFile(repo, "src/utils.js", "export const y = 2;\n");
    addFile(repo, "README.md", "# readme\n");

    const configPath = join(repo, ".codewiki", "config.json");
    mkdirSync(join(repo, ".codewiki"), { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      scan: { interactiveConfig: false, include: ["src/**"] },
    }));

    await scanCommand(repo, { nonInteractive: true });

    const filesPath = join(repo, ".codewiki", "index", "files.json");
    const files = JSON.parse(readFileSync(filesPath, "utf-8"));
    const paths = files.data as string[];
    expect(paths).toContain("src/index.js");
    expect(paths).toContain("src/utils.js");
    expect(paths).not.toContain("README.md");

    cleanup(repo);
  });

  it("respects custom gitignore patterns", async () => {
    const repo = createTempRepo("gitignore-patterns");
    addFile(repo, "src/index.js", "export const x = 1;\n");
    addFile(repo, "debug.log", "debug info\n");
    addFile(repo, "output/bundle.js", "built\n");
    addFile(repo, "foo/output/keep.js", "keep me\n");
    addFile(repo, ".gitignore", "*.log\n/output/\n");

    await scanCommand(repo, { nonInteractive: true });

    const filesPath = join(repo, ".codewiki", "index", "files.json");
    const files = JSON.parse(readFileSync(filesPath, "utf-8"));
    const filePaths = files.data as string[];
    expect(filePaths).toContain("src/index.js");
    expect(filePaths).toContain("foo/output/keep.js");
    expect(filePaths).not.toContain("debug.log");
    expect(filePaths).not.toContain("output/bundle.js");

    const skippedPath = join(repo, ".codewiki", "index", "skipped-files.json");
    const skipped = JSON.parse(readFileSync(skippedPath, "utf-8"));
    const ignored = skipped.data.filter((f: { reason: string; metadata?: { source?: string } }) => f.reason === "ignored" && f.metadata?.source === "gitignore");
    const skippedPaths = ignored.map((f: { path: string }) => f.path);
    expect(skippedPaths.some((p: string) => p.includes("debug.log"))).toBe(true);
    expect(skippedPaths.some((p: string) => p.includes("output"))).toBe(true);

    cleanup(repo);
  });
});

describe("Gitignore handling fixtures", () => {
  it("non-interactive scan warns when .codewiki is not ignored", async () => {
    const repo = createTempRepo("noninteractive-warn");
    addFile(repo, "a.js", "// a\n");

    let warnings = "";
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings += args.join(" ") + "\n"; };

    await scanCommand(repo, { nonInteractive: true });

    console.warn = originalWarn;

    expect(warnings).toContain(".codewiki is not in .gitignore");

    // .gitignore should not be created
    expect(existsSync(join(repo, ".gitignore"))).toBe(false);

    cleanup(repo);
  });

  it("interactive scan adds .codewiki to .gitignore when confirmed", async () => {
    const repo = createTempRepo("interactive-add");
    addFile(repo, "a.js", "// a\n");

    await scanCommand(repo, { _testConfirmFn: async () => true });

    const gitignorePath = join(repo, ".gitignore");
    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, "utf-8");
    expect(content).toContain(".codewiki");

    cleanup(repo);
  });

  it("interactive scan does not modify .gitignore when user declines", async () => {
    const repo = createTempRepo("interactive-decline");
    addFile(repo, "a.js", "// a\n");

    await scanCommand(repo, { _testConfirmFn: async () => false });

    // .gitignore should not be created since user declined
    expect(existsSync(join(repo, ".gitignore"))).toBe(false);

    cleanup(repo);
  });

  it("does not warn or prompt when .codewiki is already in .gitignore", async () => {
    const repo = createTempRepo("already-ignored");
    addFile(repo, "a.js", "// a\n");
    writeFileSync(join(repo, ".gitignore"), ".codewiki\n");

    let warnings = "";
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings += args.join(" ") + "\n"; };

    await scanCommand(repo, { nonInteractive: true });

    console.warn = originalWarn;

    expect(warnings).not.toContain(".codewiki is not in .gitignore");

    cleanup(repo);
  });
});

describe("Status skipped files fixtures", () => {
  it("status reports skipped-file counts by reason", async () => {
    const repo = createTempRepo("status-skipped");
    addFile(repo, "src/index.js", "export const x = 1;\n");
    addFile(repo, "node_modules/pkg/index.js", "module.exports = {};\n");

    const binaryPath = join(repo, "image.png");
    writeFileSync(binaryPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]));

    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

    await statusCommand(repo, {});
    console.log = originalLog;

    expect(output).toContain("Skipped files:");
    expect(output).toContain("ignored:");
    expect(output).toContain("binary:");

    cleanup(repo);
  });

  it("status JSON includes skippedByReason", async () => {
    const repo = createTempRepo("status-skipped-json");
    addFile(repo, "src/index.js", "export const x = 1;\n");
    addFile(repo, "node_modules/pkg/index.js", "module.exports = {};\n");

    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

    await statusCommand(repo, { json: true });
    console.log = originalLog;

    const status = JSON.parse(output);
    expect(status).toHaveProperty("skippedFiles");
    expect(status).toHaveProperty("skippedByReason");
    expect(status.skippedByReason).toHaveProperty("ignored");
    expect(status.skippedByReason).toHaveProperty("binary");
    expect(status.skippedByReason).toHaveProperty("oversized");
    expect(status.skippedByReason).toHaveProperty("generated");
    expect(status.skippedByReason).toHaveProperty("parse-unavailable");

    cleanup(repo);
  });
});

describe("Stale detection fixtures", () => {
  it("clean repo is not stale", async () => {
    const repo = createTempRepo("clean");
    addFile(repo, "a.js", "const a = 1;\n");

    // Initialize git and commit
    const { execSync } = await import("node:child_process");
    execSync("git init", { cwd: repo, stdio: "ignore" });
    execSync("git config user.email 'test@test.com'", { cwd: repo, stdio: "ignore" });
    execSync("git config user.name 'Test'", { cwd: repo, stdio: "ignore" });
    addFile(repo, ".gitignore", ".codewiki/\n");
    execSync("git add .", { cwd: repo, stdio: "ignore" });
    execSync("git commit -m 'initial'", { cwd: repo, stdio: "ignore" });

    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;

    expect(output).toContain("Stale: false");
    expect(output).toContain("Dirty: false");

    cleanup(repo);
  });

  it("dirty repo reports stale", async () => {
    const repo = createTempRepo("dirty");
    addFile(repo, "a.js", "const a = 1;\n");

    const { execSync } = await import("node:child_process");
    execSync("git init", { cwd: repo, stdio: "ignore" });
    execSync("git config user.email 'test@test.com'", { cwd: repo, stdio: "ignore" });
    execSync("git config user.name 'Test'", { cwd: repo, stdio: "ignore" });
    addFile(repo, ".gitignore", ".codewiki/\n");
    execSync("git add .", { cwd: repo, stdio: "ignore" });
    execSync("git commit -m 'initial'", { cwd: repo, stdio: "ignore" });

    await scanCommand(repo, { nonInteractive: true });

    // Make working tree dirty
    addFile(repo, "a.js", "const a = 2;\n");

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;

    expect(output).toContain("Stale: true");

    cleanup(repo);
  });

  it("non-git repo scans and reports status correctly", async () => {
    const repo = createTempRepo("nongit");
    addFile(repo, "a.js", "const a = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;

    expect(output).toContain("Git head: (none)");
    expect(output).toContain("Stale: false");

    cleanup(repo);
  });

  it("changing a tracked file after scan causes stale", async () => {
    const repo = createTempRepo("changed");
    addFile(repo, "a.js", "const a = 1;\n");
    addFile(repo, "b.js", "const b = 2;\n");

    const { execSync } = await import("node:child_process");
    execSync("git init", { cwd: repo, stdio: "ignore" });
    execSync("git config user.email 'test@test.com'", { cwd: repo, stdio: "ignore" });
    execSync("git config user.name 'Test'", { cwd: repo, stdio: "ignore" });
    addFile(repo, ".gitignore", ".codewiki/\n");
    execSync("git add .", { cwd: repo, stdio: "ignore" });
    execSync("git commit -m 'initial'", { cwd: repo, stdio: "ignore" });

    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;
    expect(output).toContain("Stale: false");

    // Modify a file and stage it
    addFile(repo, "a.js", "const a = 99;\n");
    execSync("git add a.js", { cwd: repo, stdio: "ignore" });

    output = "";
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;
    expect(output).toContain("Stale: true");

    // Commit the change, then re-scan to refresh the snapshot
    execSync("git commit -m 'update'", { cwd: repo, stdio: "ignore" });
    await scanCommand(repo, { nonInteractive: true });

    output = "";
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;
    expect(output).toContain("Stale: false");

    cleanup(repo);
  });

  it("scan dirty then commit clears stale state", async () => {
    const repo = createTempRepo("dirty-commit");
    addFile(repo, "a.js", "const a = 1;\n");

    const { execSync } = await import("node:child_process");
    execSync("git init", { cwd: repo, stdio: "ignore" });
    execSync("git config user.email 'test@test.com'", { cwd: repo, stdio: "ignore" });
    execSync("git config user.name 'Test'", { cwd: repo, stdio: "ignore" });
    addFile(repo, ".gitignore", ".codewiki/\n");
    execSync("git add .", { cwd: repo, stdio: "ignore" });
    execSync("git commit -m 'initial'", { cwd: repo, stdio: "ignore" });

    // Modify before scan — snapshot captures the modified file's hash and gitDirty=true
    addFile(repo, "a.js", "const a = 2;\n");
    await scanCommand(repo, { nonInteractive: true });

    // Status should NOT be stale because current file hash matches snapshot
    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;
    expect(output).toContain("Stale: false");

    // Commit the change — current file hash still matches snapshot
    execSync("git add .", { cwd: repo, stdio: "ignore" });
    execSync("git commit -m 'fix'", { cwd: repo, stdio: "ignore" });

    output = "";
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;
    expect(output).toContain("Stale: false");

    cleanup(repo);
  });

  it("adding a file after scan causes stale", async () => {
    const repo = createTempRepo("file-add");
    addFile(repo, "a.js", "const a = 1;\n");

    const { execSync } = await import("node:child_process");
    execSync("git init", { cwd: repo, stdio: "ignore" });
    execSync("git config user.email 'test@test.com'", { cwd: repo, stdio: "ignore" });
    execSync("git config user.name 'Test'", { cwd: repo, stdio: "ignore" });
    addFile(repo, ".gitignore", ".codewiki/\n");
    execSync("git add .", { cwd: repo, stdio: "ignore" });
    execSync("git commit -m 'initial'", { cwd: repo, stdio: "ignore" });

    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;
    expect(output).toContain("Stale: false");

    addFile(repo, "b.js", "const b = 2;\n");

    output = "";
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;
    expect(output).toContain("Stale: true");

    cleanup(repo);
  });
});

describe("Serve fixtures", () => {
  it("serve starts a server that responds with index.html", async () => {
    const repo = createTempRepo("serve-test");
    addFile(repo, "a.js", "// a\n");
    await scanCommand(repo, { nonInteractive: true });

    const serverPromise = serveCommand(repo, { port: "0" });

    // Wait briefly for server to start, then abort
    await new Promise((resolve) => setTimeout(resolve, 300));

    // We cannot easily test the actual HTTP response here without a real port,
    // but we can verify the site dir exists and has the right structure.
    const siteDir = join(repo, ".codewiki", "site");
    expect(existsSync(join(siteDir, "index.html"))).toBe(true);

    // Clean up by killing the process (serveCommand never resolves)
    cleanup(repo);

    // Prevent unhandled promise rejection
    serverPromise.catch(() => {});
  });

  it("blocks path traversal attempts", async () => {
    const repo = createTempRepo("serve-traversal");
    addFile(repo, "a.js", "// a\n");
    await scanCommand(repo, { nonInteractive: true });

    // Write a secret file outside the site directory
    const secretPath = join(repo, ".codewiki", "secret.txt");
    writeFileSync(secretPath, "super-secret");

    const port = 9876;
    const serverPromise = serveCommand(repo, { port: String(port) });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Request with path traversal
    const res = await fetch(`http://localhost:${port}/../secret.txt`);
    const body = await res.text();

    // Should NOT serve the secret  should fall back to index.htmlfile 
    expect(body).not.toContain("super-secret");
    expect(body).toContain("CodeWiki Report"); // from index.html

    cleanup(repo);
    serverPromise.catch(() => {});
  });
});
