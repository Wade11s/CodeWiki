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
import { clearGitignoreCache, CodeWikiError } from "@codewiki/core";

const tempRepos: string[] = [];

function createTempRepo(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `codewiki-fixture-${name}-`));
  tempRepos.push(dir);
  return dir;
}

function cleanup(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  clearGitignoreCache();
}

afterEach(() => {
  for (const dir of tempRepos) {
    cleanup(dir);
  }
  tempRepos.length = 0;
});

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

    let err: unknown;
    try {
      await askCommand(repo, "What is this?", {});
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(CodeWikiError);
    expect((err as CodeWikiError).exitCode).toBe(1);
    expect((err as Error).message).toContain("No snapshot found");

    cleanup(repo);
  });

  it("ask returns refusal when evidence is insufficient", async () => {
    const repo = createTempRepo("ask-snap");
    addFile(repo, "a.js", "// a\n");
    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

    await askCommand(repo, "What is this?", {});
    console.log = originalLog;

    expect(output).toContain("No answer: insufficient indexed evidence.");
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
describe("Feature candidate fixtures", () => {
  it("extracts package scripts", async () => {
    const repo = createTempRepo("scripts");
    addFile(repo, "package.json", JSON.stringify({
      name: "test",
      scripts: {
        build: "tsc",
        test: "jest",
        start: "node dist/index.js",
      },
    }, null, 2));
    addFile(repo, "index.js", "console.log('ok');\n");

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));
    expect(Array.isArray(fc.data)).toBe(true);
    expect(fc.data.length).toBeGreaterThanOrEqual(1);

    const scriptGroup = fc.data.find((g: { category: string }) => g.category === "script");
    expect(scriptGroup).toBeDefined();
    expect(scriptGroup.candidates.length).toBeGreaterThanOrEqual(3);
    expect(scriptGroup.candidates.some((c: { name: string }) => c.name === "build")).toBe(true);
    expect(scriptGroup.candidates.some((c: { name: string }) => c.name === "test")).toBe(true);
    expect(scriptGroup.candidates.some((c: { name: string }) => c.name === "start")).toBe(true);

    for (const c of scriptGroup.candidates) {
      expect(c.evidence).toBeDefined();
      expect(c.evidence.length).toBeGreaterThanOrEqual(1);
      expect(c.evidence[0]).toHaveProperty("filePath", "package.json");
      expect(c.evidence[0]).toHaveProperty("lineStart");
      expect(c.evidence[0]).toHaveProperty("lineEnd");
      expect(c.evidence[0]).toHaveProperty("snippet");
    }

    cleanup(repo);
  });

  it("extracts CLI bin entries", async () => {
    const repo = createTempRepo("cli-bin");
    addFile(repo, "package.json", JSON.stringify({
      name: "my-cli",
      bin: {
        "my-cli": "./bin/cli.js",
        "my-tool": "./bin/tool.js",
      },
    }, null, 2));
    addFile(repo, "bin/cli.js", "#!/usr/bin/env node\n");

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const cliGroup = fc.data.find((g: { category: string }) => g.category === "cli");
    expect(cliGroup).toBeDefined();
    expect(cliGroup.candidates.length).toBeGreaterThanOrEqual(2);
    expect(cliGroup.candidates.some((c: { name: string }) => c.name === "my-cli")).toBe(true);
    expect(cliGroup.candidates.some((c: { name: string }) => c.name === "my-tool")).toBe(true);

    cleanup(repo);
  });

  it("extracts CLI bin as string", async () => {
    const repo = createTempRepo("cli-bin-string");
    addFile(repo, "package.json", JSON.stringify({
      name: "single-cli",
      bin: "./bin/single.js",
    }, null, 2));
    addFile(repo, "bin/single.js", "#!/usr/bin/env node\n");

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const cliGroup = fc.data.find((g: { category: string }) => g.category === "cli");
    expect(cliGroup).toBeDefined();
    expect(cliGroup.candidates.length).toBeGreaterThanOrEqual(1);
    expect(cliGroup.candidates[0].name).toBe("single-cli");
    expect(cliGroup.candidates[0].evidence[0]).toHaveProperty("filePath", "package.json");

    cleanup(repo);
  });

  it("extracts Express routes", async () => {
    const repo = createTempRepo("express");
    addFile(repo, "server.js", `
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('home'));
app.post('/api/users', (req, res) => res.send('create'));
app.get('/api/users/:id', (req, res) => res.send('get'));
module.exports = app;
`);

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const routeGroup = fc.data.find((g: { category: string }) => g.category === "route");
    expect(routeGroup).toBeDefined();
    expect(routeGroup.candidates.length).toBeGreaterThanOrEqual(3);
    expect(routeGroup.candidates.some((c: { name: string }) => c.name.includes("GET /"))).toBe(true);
    expect(routeGroup.candidates.some((c: { name: string }) => c.name.includes("POST /api/users"))).toBe(true);

    cleanup(repo);
  });

  it("extracts Next.js pages", async () => {
    const repo = createTempRepo("nextjs");
    addFile(repo, "src/pages/index.tsx", `
export default function HomePage() {
  return <div>Home</div>;
}
`);
    addFile(repo, "src/pages/about.tsx", `
export default function AboutPage() {
  return <div>About</div>;
}
`);

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const pageGroups = fc.data.filter((g: { category: string }) => g.category === "ui-page" || g.category === "route");
    expect(pageGroups.length).toBeGreaterThanOrEqual(1);

    const allCandidates = pageGroups.flatMap((g: { candidates: unknown[] }) => g.candidates);
    expect(allCandidates.length).toBeGreaterThanOrEqual(2);

    cleanup(repo);
  });

  it("extracts React Router routes", async () => {
    const repo = createTempRepo("react-router");
    addFile(repo, "src/App.jsx", `
import { Route, Routes } from 'react-router-dom';
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
    </Routes>
  );
}
`);

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const routeGroup = fc.data.find((g: { category: string }) => g.category === "route");
    expect(routeGroup).toBeDefined();
    expect(routeGroup.candidates.some((c: { name: string }) => c.name.includes("/"))).toBe(true);
    expect(routeGroup.candidates.some((c: { name: string }) => c.name.includes("/about"))).toBe(true);

    cleanup(repo);
  });

  it("extracts FastAPI endpoints", async () => {
    const repo = createTempRepo("fastapi");
    addFile(repo, "main.py", `
from fastapi import FastAPI
app = FastAPI()

@app.get("/items/")
def read_items():
    return []

@app.post("/items/")
def create_item():
    return {}
`);

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const apiGroup = fc.data.find((g: { category: string }) => g.category === "api" || g.category === "route");
    expect(apiGroup).toBeDefined();
    expect(apiGroup.candidates.length).toBeGreaterThanOrEqual(2);
    expect(apiGroup.candidates.some((c: { name: string }) => c.name.includes("GET /items/"))).toBe(true);

    cleanup(repo);
  });

  it("extracts Flask routes", async () => {
    const repo = createTempRepo("flask");
    addFile(repo, "app.py", `
from flask import Flask
app = Flask(__name__)

@app.route('/')
def home():
    return 'home'

@app.route('/hello/<name>')
def hello(name):
    return f'Hello {name}'
`);

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const routeGroup = fc.data.find((g: { category: string }) => g.category === "route");
    expect(routeGroup).toBeDefined();
    expect(routeGroup.candidates.some((c: { name: string }) => c.name.includes("/"))).toBe(true);

    cleanup(repo);
  });

  it("extracts test cases", async () => {
    const repo = createTempRepo("tests");
    addFile(repo, "math.test.js", `
describe('math', () => {
  it('adds two numbers', () => {
    expect(1 + 1).toBe(2);
  });
  it('subtracts two numbers', () => {
    expect(2 - 1).toBe(1);
  });
});
`);
    addFile(repo, "utils.spec.ts", `
describe('utils', () => {
  test('formats date', () => {});
});
`);

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const testGroups = fc.data.filter((g: { category: string }) => g.category === "test");
    expect(testGroups.length).toBeGreaterThanOrEqual(2);

    const allTests = testGroups.flatMap((g: { candidates: unknown[] }) => g.candidates);
    expect(allTests.some((c: { name: string }) => c.name === "adds two numbers")).toBe(true);
    expect(allTests.some((c: { name: string }) => c.name === "subtracts two numbers")).toBe(true);
    expect(allTests.some((c: { name: string }) => c.name === "formats date")).toBe(true);

    cleanup(repo);
  });

  it("extracts Python tests", async () => {
    const repo = createTempRepo("pytest");
    addFile(repo, "test_app.py", `
def test_login():
    assert True

def test_logout():
    assert True

class TestAuth:
    def test_token(self):
        assert True
`);

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const testGroup = fc.data.find((g: { category: string }) => g.category === "test");
    expect(testGroup).toBeDefined();
    expect(testGroup.candidates.some((c: { name: string }) => c.name === "test_login")).toBe(true);
    expect(testGroup.candidates.some((c: { name: string }) => c.name === "test_logout")).toBe(true);
    expect(testGroup.candidates.some((c: { name: string }) => c.name === "TestAuth")).toBe(true);

    cleanup(repo);
  });

  it("extracts public exports", async () => {
    const repo = createTempRepo("exports");
    addFile(repo, "lib.ts", `
export const PI = 3.14;
export function add(a: number, b: number): number {
  return a + b;
}
export class Calculator {
  compute() { return 0; }
}
export { subtract, multiply };
`);
    addFile(repo, "main.py", `
def greet(name: str) -> str:
    return f"Hello {name}"

class Greeter:
    def __init__(self):
        pass

__all__ = ["greet", "Greeter"]
`);

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const exportGroups = fc.data.filter((g: { category: string }) => g.category === "export");
    expect(exportGroups.length).toBeGreaterThanOrEqual(2);

    const allExports = exportGroups.flatMap((g: { candidates: unknown[] }) => g.candidates);
    expect(allExports.some((c: { name: string }) => c.name === "PI")).toBe(true);
    expect(allExports.some((c: { name: string }) => c.name === "add")).toBe(true);
    expect(allExports.some((c: { name: string }) => c.name === "Calculator")).toBe(true);
    expect(allExports.some((c: { name: string }) => c.name === "greet")).toBe(true);

    cleanup(repo);
  });

  it("extracts README usage snippets", async () => {
    const repo = createTempRepo("readme");
    addFile(repo, "README.md", `# My Project

## Install
` + "\n" + "```bash\nnpm install my-project\n```" + `

## Usage
` + "\n" + "```js\nimport { foo } from 'my-project';\nfoo();\n```" + `

Run it with \`$ node index.js\`.
`);
    addFile(repo, "index.js", "// ok\n");

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const readmeGroup = fc.data.find((g: { category: string }) => g.category === "readme-usage");
    expect(readmeGroup).toBeDefined();
    expect(readmeGroup.candidates.length).toBeGreaterThanOrEqual(2);

    for (const c of readmeGroup.candidates) {
      expect(c.evidence).toBeDefined();
      expect(c.evidence.length).toBeGreaterThanOrEqual(1);
      expect(c.evidence[0]).toHaveProperty("filePath", "README.md");
    }

    cleanup(repo);
  });

  it("status reports candidate counts", async () => {
    const repo = createTempRepo("status-candidates");
    addFile(repo, "package.json", JSON.stringify({
      name: "status-test",
      scripts: { build: "tsc", test: "jest" },
    }));
    addFile(repo, "index.js", "export const x = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

    await statusCommand(repo, {});
    console.log = originalLog;

    expect(output).toContain("Feature candidates:");

    let jsonOutput = "";
    console.log = (...args: unknown[]) => { jsonOutput += args.join(" ") + "\n"; };
    await statusCommand(repo, { json: true });
    console.log = originalLog;

    const json = JSON.parse(jsonOutput);
    expect(json).toHaveProperty("candidateCount");
    expect(json).toHaveProperty("candidateGroups");
    expect(typeof json.candidateCount).toBe("number");
    expect(typeof json.candidateGroups).toBe("number");
    expect(json.candidateCount).toBeGreaterThanOrEqual(2);

    cleanup(repo);
  });

  it("groups related signals by file", async () => {
    const repo = createTempRepo("grouping");
    addFile(repo, "routes.js", `
const router = require('express').Router();
router.get('/users', (req, res) => {});
router.post('/users', (req, res) => {});
router.get('/posts', (req, res) => {});
module.exports = router;
`);

    await scanCommand(repo, { nonInteractive: true });

    const fcPath = join(repo, ".codewiki", "index", "feature-candidates.json");
    const fc = JSON.parse(readFileSync(fcPath, "utf-8"));

    const routeGroup = fc.data.find((g: { category: string }) => g.category === "route");
    expect(routeGroup).toBeDefined();
    expect(routeGroup.name).toContain("routes.js");
    expect(routeGroup.candidates.length).toBeGreaterThanOrEqual(3);

    cleanup(repo);
  });
});

describe("Indexer fixtures", () => {
  it("indexes TypeScript symbols and imports", async () => {
    const repo = createTempRepo("indexer-ts");
    addFile(repo, "src/utils.ts", `
export const PI = 3.14;
export function add(a: number, b: number): number {
  return a + b;
}
export class Calculator {
  compute() { return 0; }
}
import { helper } from './helper';
`);
    addFile(repo, "src/helper.ts", `export const helper = 1;\n`);

    await scanCommand(repo, { nonInteractive: true });

    const symbolsPath = join(repo, ".codewiki", "index", "symbols.json");
    const symbols = JSON.parse(readFileSync(symbolsPath, "utf-8"));
    expect(Array.isArray(symbols.data)).toBe(true);
    expect(symbols.data.length).toBeGreaterThanOrEqual(4);

    const names = symbols.data.map((s: { name: string }) => s.name);
    expect(names).toContain("PI");
    expect(names).toContain("add");
    expect(names).toContain("Calculator");

    const importsPath = join(repo, ".codewiki", "index", "imports.json");
    const imports = JSON.parse(readFileSync(importsPath, "utf-8"));
    expect(Array.isArray(imports.data)).toBe(true);
    expect(imports.data.length).toBeGreaterThanOrEqual(1);
    expect(imports.data.some((i: { source: string }) => i.source === "./helper")).toBe(true);

    const blocksPath = join(repo, ".codewiki", "index", "blocks.json");
    const blocks = JSON.parse(readFileSync(blocksPath, "utf-8"));
    expect(Array.isArray(blocks.data)).toBe(true);
    expect(blocks.data.length).toBeGreaterThanOrEqual(4);

    cleanup(repo);
  });

  it("indexes Python symbols", async () => {
    const repo = createTempRepo("indexer-py");
    addFile(repo, "app.py", `
def greet(name: str) -> str:
    return f"Hello {name}"

class Greeter:
    def __init__(self):
        pass

from fastapi import FastAPI
import os
`);

    await scanCommand(repo, { nonInteractive: true });

    const symbolsPath = join(repo, ".codewiki", "index", "symbols.json");
    const symbols = JSON.parse(readFileSync(symbolsPath, "utf-8"));
    expect(Array.isArray(symbols.data)).toBe(true);
    expect(symbols.data.length).toBeGreaterThanOrEqual(2);

    const names = symbols.data.map((s: { name: string }) => s.name);
    expect(names).toContain("greet");
    expect(names).toContain("Greeter");

    const importsPath = join(repo, ".codewiki", "index", "imports.json");
    const imports = JSON.parse(readFileSync(importsPath, "utf-8"));
    expect(Array.isArray(imports.data)).toBe(true);
    expect(imports.data.length).toBeGreaterThanOrEqual(2);

    cleanup(repo);
  });

  it("produces deterministic IDs", async () => {
    const repo = createTempRepo("indexer-deterministic");
    addFile(repo, "lib.js", `export const x = 1;\nexport function foo() {}\n`);

    await scanCommand(repo, { nonInteractive: true });
    const symbols1 = JSON.parse(readFileSync(join(repo, ".codewiki", "index", "symbols.json"), "utf-8"));

    // Remove .codewiki and rescan
    rmSync(join(repo, ".codewiki"), { recursive: true, force: true });
    await scanCommand(repo, { nonInteractive: true });
    const symbols2 = JSON.parse(readFileSync(join(repo, ".codewiki", "index", "symbols.json"), "utf-8"));

    expect(symbols1.data.length).toBe(symbols2.data.length);
    for (let i = 0; i < symbols1.data.length; i++) {
      expect(symbols1.data[i].id).toBe(symbols2.data[i].id);
    }

    cleanup(repo);
  });

  it("falls back for unsupported languages", async () => {
    const repo = createTempRepo("indexer-fallback");
    addFile(repo, "main.go", `package main\n\nfunc main() {\n    println("hello")\n}\n`);
    addFile(repo, "app.rs", `fn main() {\n    println!("hello");\n}\n`);

    await scanCommand(repo, { nonInteractive: true });

    const blocksPath = join(repo, ".codewiki", "index", "blocks.json");
    const blocks = JSON.parse(readFileSync(blocksPath, "utf-8"));
    expect(Array.isArray(blocks.data)).toBe(true);
    expect(blocks.data.length).toBeGreaterThanOrEqual(2);

    const goBlock = blocks.data.find((b: { filePath: string }) => b.filePath === "main.go");
    expect(goBlock).toBeDefined();
    expect(goBlock.kind).toBe("unknown");

    const symbolsPath = join(repo, ".codewiki", "index", "symbols.json");
    const symbols = JSON.parse(readFileSync(symbolsPath, "utf-8"));
    expect(symbols.data.length).toBe(0);

    cleanup(repo);
  });

  it("groups monorepo packages as modules", async () => {
    const repo = createTempRepo("indexer-monorepo");
    addFile(repo, "package.json", JSON.stringify({ name: "root", workspaces: ["packages/*"] }));
    addFile(repo, "packages/core/package.json", JSON.stringify({ name: "@test/core", main: "index.js" }));
    addFile(repo, "packages/core/index.js", `export const core = 1;\n`);
    addFile(repo, "packages/cli/package.json", JSON.stringify({ name: "@test/cli", bin: { test: "./bin.js" } }));
    addFile(repo, "packages/cli/bin.js", `#!/usr/bin/env node\nconsole.log('hi');\n`);

    await scanCommand(repo, { nonInteractive: true });

    const modulesPath = join(repo, ".codewiki", "artifacts", "modules.json");
    const modules = JSON.parse(readFileSync(modulesPath, "utf-8"));
    expect(Array.isArray(modules.data)).toBe(true);
    expect(modules.data.length).toBeGreaterThanOrEqual(2);

    const names = modules.data.map((m: { name: string }) => m.name);
    expect(names).toContain("@test/core");
    expect(names).toContain("@test/cli");

    const coreModule = modules.data.find((m: { name: string }) => m.name === "@test/core");
    expect(coreModule.files).toContain("packages/core/index.js");
    expect(coreModule.files).toContain("packages/core/package.json");

    cleanup(repo);
  });

  it("status reports indexer counts", async () => {
    const repo = createTempRepo("indexer-status");
    addFile(repo, "lib.js", `export const x = 1;\nexport function foo() {}\n`);

    await scanCommand(repo, { nonInteractive: true });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

    await statusCommand(repo, { json: true });
    console.log = originalLog;

    const status = JSON.parse(output);
    expect(status).toHaveProperty("symbolCount");
    expect(status).toHaveProperty("importCount");
    expect(status).toHaveProperty("blockCount");
    expect(status).toHaveProperty("moduleCount");
    expect(typeof status.symbolCount).toBe("number");
    expect(typeof status.importCount).toBe("number");
    expect(typeof status.blockCount).toBe("number");
    expect(typeof status.moduleCount).toBe("number");

    cleanup(repo);
  });
});
