import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import type { FeatureCandidate, FeatureCandidateGroup, Evidence } from "./types.js";

interface FileContext {
  relPath: string;
  fullPath: string;
  content: string;
  lines: string[];
}

function readContext(fullPath: string, relPath: string): FileContext | null {
  try {
    const content = readFileSync(fullPath, "utf-8");
    return { relPath, fullPath, content, lines: content.split("\n") };
  } catch {
    return null;
  }
}

function makeEvidence(ctx: FileContext, lineStart: number, lineEnd: number, snippet: string, symbol?: string): Evidence {
  return {
    filePath: ctx.relPath,
    lineStart: Math.max(1, lineStart),
    lineEnd: Math.min(ctx.lines.length, lineEnd),
    snippet: snippet.trim(),
    ...(symbol ? { symbol } : {}),
  };
}

function generateId(category: string, name: string, filePath: string, lineStart: number): string {
  const hash = createHash("sha256")
    .update(`${category}:${name}:${filePath}:${lineStart}`)
    .digest("hex");
  return hash.slice(0, 16);
}

function generateGroupId(category: string, name: string, filePath: string): string {
  const hash = createHash("sha256")
    .update(`group:${category}:${name}:${filePath}`)
    .digest("hex");
  return hash.slice(0, 16);
}

// ── Package scripts / CLI ──

function extractPackageScripts(repoPath: string): FeatureCandidateGroup[] {
  const pkgPath = join(repoPath, "package.json");
  if (!existsSync(pkgPath)) return [];

  const ctx = readContext(pkgPath, "package.json");
  if (!ctx) return [];

  const groups: FeatureCandidateGroup[] = [];

  try {
    const pkg = JSON.parse(ctx.content);

    if (pkg.scripts && typeof pkg.scripts === "object") {
      const candidates: FeatureCandidate[] = [];
      for (const [name, cmd] of Object.entries(pkg.scripts)) {
        if (typeof cmd !== "string") continue;
        const { lineStart, lineEnd } = findKeyLines(ctx, `"${name}"`, cmd);
        candidates.push({
          id: generateId("script", name, "package.json", lineStart),
          category: "script",
          name,
          description: `npm script: ${cmd}`,
          evidence: [makeEvidence(ctx, lineStart, lineEnd, `"${name}": "${cmd}"`, name)],
        });
      }
      if (candidates.length > 0) {
        groups.push({
          id: generateGroupId("script", "Package Scripts", "package.json"),
          category: "script",
          name: "Package Scripts",
          description: `Scripts defined in package.json`,
          candidates,
        });
      }
    }

    if (pkg.bin && typeof pkg.bin === "object") {
      const candidates: FeatureCandidate[] = [];
      for (const [name, path] of Object.entries(pkg.bin)) {
        if (typeof path !== "string") continue;
        const { lineStart, lineEnd } = findKeyLines(ctx, `"${name}"`, path);
        candidates.push({
          id: generateId("cli", name, "package.json", lineStart),
          category: "cli",
          name,
          description: `CLI command: ${path}`,
          evidence: [makeEvidence(ctx, lineStart, lineEnd, `"${name}": "${path}"`, name)],
        });
      }
      if (candidates.length > 0) {
        groups.push({
          id: generateGroupId("cli", "CLI Commands", "package.json"),
          category: "cli",
          name: "CLI Commands",
          description: `Bin entries defined in package.json`,
          candidates,
        });
      }
    } else if (pkg.bin && typeof pkg.bin === "string") {
      const name = pkg.name || "cli";
      const lineStart = 1;
      groups.push({
        id: generateGroupId("cli", "CLI Command", "package.json"),
        category: "cli",
        name: "CLI Command",
        description: `Single bin entry: ${pkg.bin}`,
        candidates: [
          {
            id: generateId("cli", name, "package.json", lineStart),
            category: "cli",
            name,
            description: `CLI command: ${pkg.bin}`,
            evidence: [makeEvidence(ctx, lineStart, ctx.lines.length, `"bin": "${pkg.bin}"`, name)],
          },
        ],
      });
    }
  } catch {
    // ignore invalid package.json
  }

  return groups;
}

function findKeyLines(ctx: FileContext, key: string, value: string): { lineStart: number; lineEnd: number } {
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i];
    if (line.includes(key) && line.includes(value)) {
      return { lineStart: i + 1, lineEnd: i + 1 };
    }
  }
  return { lineStart: 1, lineEnd: ctx.lines.length };
}

// ── Routes / API / UI pages ──

const ROUTE_PATTERNS = [
  // Express
  { regex: /\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/g, framework: "Express", category: "route" as const },
  // Express router
  { regex: /router\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/g, framework: "Express", category: "route" as const },
  // Next.js pages (export default function with Page suffix)
  { regex: /export\s+default\s+function\s+(\w+Page|\w+page)\b/g, framework: "Next.js", category: "ui-page" as const },
  // React Router Route (multi-line JSX aware)
  { regex: /<(Route|route)(?:\s+[\s\S]*?)?path\s*=\s*['"`]([^'"`]+)['"`]/g, framework: "React Router", category: "route" as const },
  // FastAPI decorator
  { regex: /@(?:app|router)\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/g, framework: "FastAPI", category: "api" as const },
  // Flask route
  { regex: /@\w+\.(route|get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g, framework: "Flask", category: "route" as const },
];

// Next.js App Router: matches export default function in pages/ or app/ directories
const NEXTJS_APP_ROUTER_REGEX = /export\s+default\s+function\s+\w+.*\{/g;

function extractRoutes(files: FileContext[]): FeatureCandidateGroup[] {
  const byFile = new Map<string, FeatureCandidate[]>();

  for (const ctx of files) {
    const ext = ctx.relPath.split(".").pop()?.toLowerCase();
    if (!ext || !["ts", "js", "jsx", "tsx", "py"].includes(ext)) continue;

    const candidates: FeatureCandidate[] = [];

    for (const pattern of ROUTE_PATTERNS) {
      const matches = [...ctx.content.matchAll(pattern.regex)];
      for (const match of matches) {
        const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
        const lineStart = Math.max(1, lineIndex);
        const lineEnd = Math.min(ctx.lines.length, lineIndex + 2);
        const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

        let name: string;
        if (match[2]) {
          name = `${pattern.framework} ${match[1]?.toUpperCase?.() || ""} ${match[2]}`.trim();
        } else if (match[1]) {
          name = `${pattern.framework} ${match[1]}`;
        } else {
          name = `${pattern.framework} route`;
        }

        candidates.push({
          id: generateId(pattern.category, name, ctx.relPath, lineStart),
          category: pattern.category,
          name,
          description: `${pattern.framework} handler`,
          evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet)],
        });
      }
    }

    // Narrow Next.js App Router to app/ path conventions (pages/ is covered by *Page pattern)
    const isNextJsApp = /\bapp\b/.test(ctx.relPath);
    if (isNextJsApp && ["ts", "tsx", "js", "jsx"].includes(ext)) {
      const matches = [...ctx.content.matchAll(NEXTJS_APP_ROUTER_REGEX)];
      for (const match of matches) {
        const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
        const lineStart = Math.max(1, lineIndex);
        const lineEnd = Math.min(ctx.lines.length, lineIndex + 2);
        const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

        candidates.push({
          id: generateId("ui-page", "Next.js page", ctx.relPath, lineStart),
          category: "ui-page",
          name: `Next.js page in ${ctx.relPath}`,
          description: "Next.js App Router page",
          evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet)],
        });
      }
    }

    if (candidates.length > 0) {
      byFile.set(ctx.relPath, candidates);
    }
  }

  const groups: FeatureCandidateGroup[] = [];
  for (const [filePath, candidates] of byFile) {
    const relatedSymbols = candidates.map((c) => c.name);
    groups.push({
      id: generateGroupId("route", `Routes in ${filePath}`, filePath),
      category: "route",
      name: `Routes in ${filePath}`,
      description: `Framework routes and handlers`,
      candidates: candidates.map((c) => ({ ...c, relatedSymbols })),
    });
  }

  return groups;
}

// ── Tests ──

const TEST_FILE_PATTERNS = /\.(test|spec)\.(ts|js|jsx|tsx|py)$/i;

function extractTests(files: FileContext[]): FeatureCandidateGroup[] {
  const byFile = new Map<string, FeatureCandidate[]>();

  for (const ctx of files) {
    const isTestFile = TEST_FILE_PATTERNS.test(ctx.relPath);
    const ext = ctx.relPath.split(".").pop()?.toLowerCase();
    const isCodeFile = ext && ["ts", "js", "jsx", "tsx", "py"].includes(ext);

    if (!isCodeFile) continue;

    const candidates: FeatureCandidate[] = [];

    // JavaScript/TypeScript describe/it blocks
    if (["ts", "js", "jsx", "tsx"].includes(ext)) {
      const describeRegex = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
      const itRegex = /it\s*\(\s*['"`]([^'"`]+)['"`]/g;
      const testRegex = /test\s*\(\s*['"`]([^'"`]+)['"`]/g;

      for (const regex of [describeRegex, itRegex, testRegex]) {
        const matches = [...ctx.content.matchAll(regex)];
        for (const match of matches) {
          const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
          const lineStart = Math.max(1, lineIndex);
          const lineEnd = Math.min(ctx.lines.length, lineIndex + 1);
          const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

          candidates.push({
            id: generateId("test", match[1], ctx.relPath, lineStart),
            category: "test",
            name: match[1],
            description: isTestFile ? "Test case" : "Test-like block",
            evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet, match[1])],
          });
        }
      }
    }

    // Python test functions/classes
    if (ext === "py") {
      const funcRegex = /def\s+(test_\w+)\s*\(/g;
      const classRegex = /class\s+(Test\w+)\s*[\(:]/g;

      for (const regex of [funcRegex, classRegex]) {
        const matches = [...ctx.content.matchAll(regex)];
        for (const match of matches) {
          const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
          const lineStart = Math.max(1, lineIndex);
          const lineEnd = Math.min(ctx.lines.length, lineIndex + 2);
          const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

          candidates.push({
            id: generateId("test", match[1], ctx.relPath, lineStart),
            category: "test",
            name: match[1],
            description: isTestFile ? "Python test" : "Python test-like definition",
            evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet, match[1])],
          });
        }
      }
    }

    if (candidates.length > 0) {
      byFile.set(ctx.relPath, candidates);
    }
  }

  const groups: FeatureCandidateGroup[] = [];
  for (const [filePath, candidates] of byFile) {
    const relatedSymbols = candidates.map((c) => c.name);
    groups.push({
      id: generateGroupId("test", `Tests in ${filePath}`, filePath),
      category: "test",
      name: `Tests in ${filePath}`,
      description: `Test cases and test blocks`,
      candidates: candidates.map((c) => ({ ...c, relatedSymbols })),
    });
  }

  return groups;
}

// ── Public exports ──

function extractExports(files: FileContext[]): FeatureCandidateGroup[] {
  const byFile = new Map<string, FeatureCandidate[]>();

  for (const ctx of files) {
    const ext = ctx.relPath.split(".").pop()?.toLowerCase();
    if (!ext || !["ts", "js", "jsx", "tsx", "py"].includes(ext)) continue;

    const candidates: FeatureCandidate[] = [];

    if (["ts", "js", "jsx", "tsx"].includes(ext)) {
      // Named exports: export { a, b }; export const x; export function foo();
      const namedExportRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
      const destructExportRegex = /export\s*\{([^}]+)\}/g;
      const defaultExportRegex = /export\s+default\s+(?:function\s+)?(\w+)/g;

      for (const match of ctx.content.matchAll(namedExportRegex)) {
        const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
        const lineStart = Math.max(1, lineIndex);
        const lineEnd = Math.min(ctx.lines.length, lineIndex + 2);
        const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

        candidates.push({
          id: generateId("export", match[1], ctx.relPath, lineStart),
          category: "export",
          name: match[1],
          description: `Named export`,
          evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet, match[1])],
        });
      }

      for (const match of ctx.content.matchAll(destructExportRegex)) {
        const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
        const lineStart = Math.max(1, lineIndex);
        const lineEnd = Math.min(ctx.lines.length, lineIndex + 1);
        const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

        const names = match[1].split(",").map((s) => s.trim()).filter(Boolean);
        for (const name of names) {
          candidates.push({
            id: generateId("export", name, ctx.relPath, lineStart),
            category: "export",
            name,
            description: `Re-export`,
            evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet, name)],
          });
        }
      }

      for (const match of ctx.content.matchAll(defaultExportRegex)) {
        const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
        const lineStart = Math.max(1, lineIndex);
        const lineEnd = Math.min(ctx.lines.length, lineIndex + 2);
        const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

        candidates.push({
          id: generateId("export", match[1], ctx.relPath, lineStart),
          category: "export",
          name: match[1],
          description: `Default export`,
          evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet, match[1])],
        });
      }
    }

    if (ext === "py") {
      // Python __all__ and module-level exports (functions/classes)
      const funcRegex = /def\s+(\w+)\s*\(/g;
      const classRegex = /class\s+(\w+)\s*[\(:]/g;
      const allRegex = /__all__\s*=\s*\[([^\]]*)\]/g;

      const seenNames = new Set<string>();

      for (const match of ctx.content.matchAll(funcRegex)) {
        const name = match[1];
        if (name.startsWith("_")) continue;
        const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
        const lineStart = Math.max(1, lineIndex);
        const lineEnd = Math.min(ctx.lines.length, lineIndex + 2);
        const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

        seenNames.add(name);
        candidates.push({
          id: generateId("export", name, ctx.relPath, lineStart),
          category: "export",
          name,
          description: `Public function`,
          evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet, name)],
        });
      }

      for (const match of ctx.content.matchAll(classRegex)) {
        const name = match[1];
        if (name.startsWith("_")) continue;
        const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
        const lineStart = Math.max(1, lineIndex);
        const lineEnd = Math.min(ctx.lines.length, lineIndex + 2);
        const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

        seenNames.add(name);
        candidates.push({
          id: generateId("export", name, ctx.relPath, lineStart),
          category: "export",
          name,
          description: `Public class`,
          evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet, name)],
        });
      }

      for (const match of ctx.content.matchAll(allRegex)) {
        const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
        const lineStart = Math.max(1, lineIndex);
        const lineEnd = Math.min(ctx.lines.length, lineIndex + 2);
        const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

        const names = match[1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
        for (const name of names) {
          if (seenNames.has(name)) continue;
          candidates.push({
            id: generateId("export", name, ctx.relPath, lineStart),
            category: "export",
            name,
            description: `Explicit export (__all__)`,
            evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet, name)],
          });
        }
      }
    }

    if (candidates.length > 0) {
      byFile.set(ctx.relPath, candidates);
    }
  }

  const groups: FeatureCandidateGroup[] = [];
  for (const [filePath, candidates] of byFile) {
    const relatedSymbols = candidates.map((c) => c.name);
    groups.push({
      id: generateGroupId("export", `Exports in ${filePath}`, filePath),
      category: "export",
      name: `Exports in ${filePath}`,
      description: `Public exports`,
      candidates: candidates.map((c) => ({ ...c, relatedSymbols })),
    });
  }

  return groups;
}

// ── README usage ──

function extractReadmeUsage(repoPath: string): FeatureCandidateGroup[] {
  const readmePath = join(repoPath, "README.md");
  if (!existsSync(readmePath)) return [];

  const ctx = readContext(readmePath, "README.md");
  if (!ctx) return [];

  const candidates: FeatureCandidate[] = [];

  // Fenced code blocks
  const fenceRegex = /```(\w*)\n([\s\S]*?)```/g;
  for (const match of ctx.content.matchAll(fenceRegex)) {
    const lang = match[1] || "code";
    const block = match[2].trim();
    if (block.length === 0) continue;

    const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
    const lineStart = Math.max(1, lineIndex);
    const lineEnd = Math.min(ctx.lines.length, lineIndex + block.split("\n").length + 1);
    const snippet = ctx.lines.slice(lineStart - 1, lineEnd).join("\n").trim();

    // Use first line as name
    const firstLine = block.split("\n")[0].trim();
    const name = firstLine.length > 0 && firstLine.length <= 80 ? firstLine : `${lang} usage example`;

    candidates.push({
      id: generateId("readme-usage", name, "README.md", lineStart),
      category: "readme-usage",
      name,
      description: `README usage snippet (${lang})`,
      evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet)],
    });
  }

  // Inline usage snippets (e.g., `npm install xyz` or `$ node app.js`)
  const inlineRegex = /(`\$\s+[^`]+`)/g;
  for (const match of ctx.content.matchAll(inlineRegex)) {
    const lineIndex = ctx.content.substring(0, match.index).split("\n").length;
    const lineStart = Math.max(1, lineIndex);
    const lineEnd = Math.min(ctx.lines.length, lineIndex);
    const snippet = ctx.lines[lineStart - 1].trim();
    const name = match[1].replace(/`/g, "");

    candidates.push({
      id: generateId("readme-usage", name, "README.md", lineStart),
      category: "readme-usage",
      name,
      description: `README inline usage`,
      evidence: [makeEvidence(ctx, lineStart, lineEnd, snippet)],
    });
  }

  if (candidates.length === 0) return [];

  const relatedSymbols = candidates.map((c) => c.name);
  return [
    {
      id: generateGroupId("readme-usage", "README Usage", "README.md"),
      category: "readme-usage",
      name: "README Usage",
      description: `Usage snippets from README.md`,
      candidates: candidates.map((c) => ({ ...c, relatedSymbols })),
    },
  ];
}

// ── Orchestrator ──

export function extractFeatureCandidates(repoPath: string, files: string[]): FeatureCandidateGroup[] {
  const contexts: FileContext[] = [];
  for (const relPath of files) {
    const ctx = readContext(join(repoPath, relPath), relPath);
    if (ctx) contexts.push(ctx);
  }

  const groups: FeatureCandidateGroup[] = [];

  groups.push(...extractPackageScripts(repoPath));
  groups.push(...extractRoutes(contexts));
  groups.push(...extractTests(contexts));
  groups.push(...extractExports(contexts));
  groups.push(...extractReadmeUsage(repoPath));

  return groups;
}

export function countCandidates(groups: FeatureCandidateGroup[]): number {
  return groups.reduce((sum, g) => sum + g.candidates.length, 0);
}
