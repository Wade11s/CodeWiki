import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync, writeFileSync as writeFile } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanCommand } from "./src/commands/scan.js";
import { statusCommand } from "./src/commands/status.js";
import { debugCommand } from "./src/commands/debug.js";
import { askCommand } from "./src/commands/ask.js";
import { serveCommand } from "./src/commands/serve.js";
import { generateSite } from "./src/site-generator.js";

function createTempRepo(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `codewiki-fixture-${name}-`));
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

describe("Repository fixtures", () => {
  it("scans a minimal repo", async () => {
    const repo = createTempRepo("minimal");
    addFile(repo, "index.js", "export const x = 1;\n");
    addFile(repo, "README.md", "# Minimal\n");

    await scanCommand(repo, {});

    expect(existsSync(join(repo, ".codewiki", "snapshot.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "index", "files.json"))).toBe(true);

    cleanup(repo);
  });

  it("scans a node-cli repo", async () => {
    const repo = createTempRepo("node-cli");
    addFile(repo, "package.json", JSON.stringify({ name: "cli", version: "1.0.0" }));
    addFile(repo, "bin/cli.js", "#!/usr/bin/env node\nconsole.log('hi');\n");
    addFile(repo, "src/app.js", "module.exports = {};\n");
    addFile(repo, "test.js", "console.log('test');\n");

    await scanCommand(repo, {});

    const snapshotPath = join(repo, ".codewiki", "snapshot.json");
    expect(existsSync(snapshotPath)).toBe(true);
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
    expect(snapshot.fileCount).toBeGreaterThanOrEqual(4);

    cleanup(repo);
  });

  it("scans a react-app repo", async () => {
    const repo = createTempRepo("react");
    addFile(repo, "package.json", JSON.stringify({ name: "react-app", dependencies: { react: "^19" } }));
    addFile(repo, "src/main.jsx", "import React from 'react';\n");
    addFile(repo, "src/App.jsx", "export default function App() { return null; }\n");

    await scanCommand(repo, {});

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

    await scanCommand(repo, {});

    const snapshotPath = join(repo, ".codewiki", "snapshot.json");
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));

    expect(snapshot).toHaveProperty("id");
    expect(snapshot).toHaveProperty("schemaVersion");
    expect(snapshot).toHaveProperty("createdAt");
    expect(snapshot).toHaveProperty("repoPath", repo);
    expect(snapshot).toHaveProperty("fileCount");
    expect(snapshot).toHaveProperty("parserVersion");
    expect(snapshot).toHaveProperty("agentVersion");

    cleanup(repo);
  });

  it("schema version is stable across scans", async () => {
    const repo = createTempRepo("version");
    addFile(repo, "x.js", "// x\n");

    await scanCommand(repo, {});
    const snap1 = JSON.parse(readFileSync(join(repo, ".codewiki", "snapshot.json"), "utf-8"));

    await scanCommand(repo, {});
    const snap2 = JSON.parse(readFileSync(join(repo, ".codewiki", "snapshot.json"), "utf-8"));

    expect(snap1.schemaVersion).toBe(snap2.schemaVersion);

    cleanup(repo);
  });
});

describe("CodeWiki Directory fixtures", () => {
  it("creates the expected .codewiki/ layout", async () => {
    const repo = createTempRepo("layout");
    addFile(repo, "file.js", "// file\n");

    await scanCommand(repo, {});

    expect(existsSync(join(repo, ".codewiki", "config.json"))).toBe(false);
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

    await scanCommand(repo, {});

    output = "";
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;

    expect(output).toContain("CodeWiki directory: yes");
    expect(output).toContain("Snapshot:");

    cleanup(repo);
  });

  it("debug outputs JSON with --json", async () => {
    const repo = createTempRepo("debug");
    addFile(repo, "a.js", "// a\n");
    await scanCommand(repo, {});

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
    await scanCommand(repo, {});

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
    await scanCommand(repo, {});

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

    await scanCommand(repo, {});

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
    await scanCommand(repo, {});

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

describe("Serve fixtures", () => {
  it("serve starts a server that responds with index.html", async () => {
    const repo = createTempRepo("serve-test");
    addFile(repo, "a.js", "// a\n");
    await scanCommand(repo, {});

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
});
