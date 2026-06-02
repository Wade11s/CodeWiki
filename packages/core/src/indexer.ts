import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { CodeSymbol, Import, Block, Module, IndexerResult, SymbolKind, BlockKind } from "./types.js";

// ── Deterministic ID generation ──

function makeId(parts: string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 16);
}

function symbolId(filePath: string, name: string, lineStart: number, kind: string): string {
  return makeId(["sym", filePath, name, String(lineStart), kind]);
}

function importId(filePath: string, source: string, lineStart: number): string {
  return makeId(["imp", filePath, source, String(lineStart)]);
}

function blockId(filePath: string, name: string, lineStart: number, kind: string): string {
  return makeId(["blk", filePath, name, String(lineStart), kind]);
}

function moduleId(path: string, name: string, type: string): string {
  return makeId(["mod", path, name, type]);
}

// ── Language detection ──

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "py":
      return "python";
    case "go":
      return "go";
    case "rs":
      return "rust";
    case "java":
      return "java";
    case "rb":
      return "ruby";
    case "c":
    case "h":
      return "c";
    case "cpp":
    case "cc":
    case "hpp":
      return "cpp";
    default:
      return "unknown";
  }
}

function isSupportedLanguage(language: string): boolean {
  return language === "typescript" || language === "javascript" || language === "python";
}

// ── File reading ──

interface FileContext {
  relPath: string;
  content: string;
  lines: string[];
  language: string;
}

function readFileContext(repoPath: string, relPath: string): FileContext | null {
  const fullPath = join(repoPath, relPath);
  try {
    const content = readFileSync(fullPath, "utf-8");
    return {
      relPath,
      content,
      lines: content.split("\n"),
      language: detectLanguage(relPath),
    };
  } catch {
    return null;
  }
}

// ── Line helpers ──

function getLineStart(content: string, index: number): number {
  return content.substring(0, index).split("\n").length;
}

function getSnippet(lines: string[], lineStart: number, lineEnd: number): string {
  return lines.slice(Math.max(0, lineStart - 1), Math.min(lines.length, lineEnd)).join("\n").trim();
}

// ── Indentation tracking for block end detection ──

function findBlockEnd(lines: string[], startLine: number): number {
  if (startLine >= lines.length) return startLine;

  // For brace-based languages, track brace balance
  let braceDepth = 0;
  let inString: string | null = null;
  let escapeNext = false;

  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (ch === "\\") {
        escapeNext = true;
        continue;
      }
      if (inString) {
        if (ch === inString) {
          inString = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      // Simple comment skip (// and /* */)
      if (ch === "/" && j + 1 < line.length) {
        const next = line[j + 1];
        if (next === "/") break; // rest of line is comment
        if (next === "*") {
          // skip to end of block comment
          j++;
          while (j < line.length - 1) {
            if (line[j] === "*" && line[j + 1] === "/") {
              j++;
              break;
            }
            j++;
          }
          continue;
        }
      }
      if (ch === "{") braceDepth++;
      if (ch === "}") {
        braceDepth--;
        if (braceDepth <= 0 && i > startLine - 1) {
          return i + 1;
        }
      }
    }
  }

  // Fallback: if no braces found, return a reasonable window
  return Math.min(startLine + 4, lines.length);
}

function findPythonBlockEnd(lines: string[], startLine: number): number {
  if (startLine >= lines.length) return startLine;

  const startIndent = lines[startLine - 1].match(/^(\s*)/)?.[1].length ?? 0;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= startIndent) {
      return i;
    }
  }
  return lines.length;
}

// ── TypeScript / JavaScript parsing ──

interface ParsedSymbol {
  name: string;
  kind: SymbolKind;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  exported: boolean;
}

interface ParsedImport {
  source: string;
  names: string[];
  lineStart: number;
  lineEnd: number;
  snippet: string;
  isDefault: boolean;
  isNamespace: boolean;
}

function parseTypeScriptJavaScript(ctx: FileContext): { symbols: ParsedSymbol[]; imports: ParsedImport[] } {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const { content, lines } = ctx;

  // ── Imports ──

  // ES6 imports
  const esmImportRegex = /import\s+(?:(\*\s+as\s+(\w+))|(\w+)\s*,?\s*)?\s*(?:\{([^}]*)\})?\s*from\s+['"`]([^'"`]+)['"`]/g;
  for (const match of content.matchAll(esmImportRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    const lineEnd = Math.min(lines.length, lineStart + 1);
    const snippet = getSnippet(lines, lineStart, lineEnd);
    const source = match[5];

    const isNamespace = !!match[1];
    const defaultName = match[3];
    const namedImports = match[4];

    const names: string[] = [];
    if (defaultName) names.push(defaultName);
    if (isNamespace && match[2]) names.push(match[2]);
    if (namedImports) {
      const cleaned = namedImports
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/\s+as\s+\w+/, "").trim());
      names.push(...cleaned);
    }

    imports.push({
      source,
      names,
      lineStart,
      lineEnd,
      snippet,
      isDefault: !!defaultName && !namedImports && !isNamespace,
      isNamespace,
    });
  }

  // Bare import: import 'module'
  const bareImportRegex = /import\s+['"`]([^'"`]+)['"`]/g;
  for (const match of content.matchAll(bareImportRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    const lineEnd = Math.min(lines.length, lineStart + 1);
    imports.push({
      source: match[1],
      names: [],
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      isDefault: false,
      isNamespace: false,
    });
  }

  // CommonJS require
  const requireRegex = /(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  for (const match of content.matchAll(requireRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    const lineEnd = Math.min(lines.length, lineStart + 1);
    const source = match[3];
    const names: string[] = [];
    if (match[2]) names.push(match[2]);
    if (match[1]) {
      names.push(
        ...match[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
    imports.push({
      source,
      names,
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      isDefault: !!match[2] && !match[1],
      isNamespace: false,
    });
  }

  // ── Symbols ──

  // export const/let/var/function/class/interface/type/enum name
  const exportedDeclRegex = /export\s+(?:default\s+)?(?:async\s+)?(const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
  for (const match of content.matchAll(exportedDeclRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    const lineEnd = findBlockEnd(lines, lineStart);
    const keyword = match[1];
    const name = match[2];
    const kindMap: Record<string, SymbolKind> = {
      function: "function",
      class: "class",
      interface: "interface",
      type: "type",
      enum: "enum",
      const: "const",
      let: "let",
      var: "variable",
    };
    const kind = kindMap[keyword] ?? "unknown";

    symbols.push({
      name,
      kind,
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: true,
    });
  }

  // Default export of arrow function or expression: export default const name = ...
  const defaultExportRegex = /export\s+default\s+(?:function\s+)?(\w+)/g;
  for (const match of content.matchAll(defaultExportRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    const lineEnd = findBlockEnd(lines, lineStart);
    symbols.push({
      name: match[1],
      kind: "export",
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: true,
    });
  }

  // Non-exported function declarations
  const funcRegex = /(?:^|\n)\s*(?:async\s+)?function\s+(\w+)\s*\(/g;
  for (const match of content.matchAll(funcRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    // Skip if already captured as export
    if (symbols.some((s) => s.name === match[1] && s.lineStart === lineStart)) continue;
    const lineEnd = findBlockEnd(lines, lineStart);
    symbols.push({
      name: match[1],
      kind: "function",
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: false,
    });
  }

  // Non-exported class declarations
  const classRegex = /(?:^|\n)\s*class\s+(\w+)\s*(?:extends\s+\w+)?\s*\{/g;
  for (const match of content.matchAll(classRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    if (symbols.some((s) => s.name === match[1] && s.lineStart === lineStart)) continue;
    const lineEnd = findBlockEnd(lines, lineStart);
    symbols.push({
      name: match[1],
      kind: "class",
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: false,
    });
  }

  // Arrow functions assigned to const: const name = (...) =>
  const arrowFuncRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
  for (const match of content.matchAll(arrowFuncRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    if (symbols.some((s) => s.name === match[1] && s.lineStart === lineStart)) continue;
    const lineEnd = findBlockEnd(lines, lineStart);
    symbols.push({
      name: match[1],
      kind: "arrow_function",
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: false,
    });
  }

  // Interface declarations (non-exported)
  const interfaceRegex = /(?:^|\n)\s*interface\s+(\w+)/g;
  for (const match of content.matchAll(interfaceRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    if (symbols.some((s) => s.name === match[1] && s.lineStart === lineStart)) continue;
    const lineEnd = findBlockEnd(lines, lineStart);
    symbols.push({
      name: match[1],
      kind: "interface",
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: false,
    });
  }

  // Type aliases (non-exported)
  const typeAliasRegex = /(?:^|\n)\s*type\s+(\w+)\s*=/g;
  for (const match of content.matchAll(typeAliasRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    if (symbols.some((s) => s.name === match[1] && s.lineStart === lineStart)) continue;
    const lineEnd = Math.min(lines.length, lineStart + 1);
    symbols.push({
      name: match[1],
      kind: "type",
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: false,
    });
  }

  // Enum declarations (non-exported)
  const enumRegex = /(?:^|\n)\s*enum\s+(\w+)/g;
  for (const match of content.matchAll(enumRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    if (symbols.some((s) => s.name === match[1] && s.lineStart === lineStart)) continue;
    const lineEnd = findBlockEnd(lines, lineStart);
    symbols.push({
      name: match[1],
      kind: "enum",
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: false,
    });
  }

  // Method declarations inside classes
  const methodRegex = /(?:(\w+)\s*\([^)]*\)\s*\{|(\w+):\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/g;
  for (const match of content.matchAll(methodRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    const name = match[1] || match[2];
    if (symbols.some((s) => s.name === name && s.lineStart === lineStart)) continue;
    const lineEnd = findBlockEnd(lines, lineStart);
    symbols.push({
      name,
      kind: "method",
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: false,
    });
  }

  return { symbols, imports };
}

// ── Python parsing ──

function parsePython(ctx: FileContext): { symbols: ParsedSymbol[]; imports: ParsedImport[] } {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const { content, lines } = ctx;

  // ── Imports ──

  // import module [as alias]
  const importRegex = /(?:^|\n)\s*import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/g;
  for (const match of content.matchAll(importRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    const lineEnd = Math.min(lines.length, lineStart + 1);
    const parts = match[1].split(",").map((s) => s.trim());
    const names = parts.map((p) => p.split(/\s+as\s+/)[0].trim());
    imports.push({
      source: names[0] || match[1],
      names,
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      isDefault: false,
      isNamespace: true,
    });
  }

  // from module import name1, name2
  const fromImportRegex = /(?:^|\n)\s*from\s+([\w.]+)\s+import\s+([^\n]+)/g;
  for (const match of content.matchAll(fromImportRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    const lineEnd = Math.min(lines.length, lineStart + 1);
    const source = match[1];
    const imported = match[2].trim();
    const names = imported
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "*");

    imports.push({
      source,
      names,
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      isDefault: false,
      isNamespace: false,
    });
  }

  // ── Symbols ──

  // Functions and async functions
  const funcRegex = /(?:^|\n)\s*(async\s+)?def\s+(\w+)\s*\(/g;
  for (const match of content.matchAll(funcRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    const lineEnd = findPythonBlockEnd(lines, lineStart);
    const isAsync = !!match[1];
    symbols.push({
      name: match[2],
      kind: isAsync ? "function" : "function",
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: !match[2].startsWith("_"),
    });
  }

  // Classes
  const classRegex = /(?:^|\n)\s*class\s+(\w+)\s*[\(:]/g;
  for (const match of content.matchAll(classRegex)) {
    const lineStart = getLineStart(content, match.index ?? 0);
    const lineEnd = findPythonBlockEnd(lines, lineStart);
    symbols.push({
      name: match[1],
      kind: "class",
      lineStart,
      lineEnd,
      snippet: getSnippet(lines, lineStart, lineEnd),
      exported: !match[1].startsWith("_"),
    });
  }

  return { symbols, imports };
}

// ── Unsupported language fallback ──

function parseUnsupported(ctx: FileContext): { symbols: ParsedSymbol[]; imports: ParsedImport[] } {
  // No deep parsing; just a single file-level block
  return { symbols: [], imports: [] };
}

// ── Orchestrator: process one file ──

function indexFile(repoPath: string, relPath: string): { symbols: CodeSymbol[]; imports: Import[]; blocks: Block[] } {
  const ctx = readFileContext(repoPath, relPath);
  if (!ctx) return { symbols: [], imports: [], blocks: [] };

  let parsed: { symbols: ParsedSymbol[]; imports: ParsedImport[] };

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    parsed = parseTypeScriptJavaScript(ctx);
  } else if (ctx.language === "python") {
    parsed = parsePython(ctx);
  } else {
    parsed = parseUnsupported(ctx);
  }

  const fileSymbols: CodeSymbol[] = parsed.symbols.map((s) => ({
    id: symbolId(relPath, s.name, s.lineStart, s.kind),
    name: s.name,
    kind: s.kind,
    filePath: relPath,
    lineStart: s.lineStart,
    lineEnd: s.lineEnd,
    snippet: s.snippet,
    exported: s.exported,
    language: ctx.language,
  }));

  const fileImports: Import[] = parsed.imports.map((i) => ({
    id: importId(relPath, i.source, i.lineStart),
    source: i.source,
    names: i.names,
    filePath: relPath,
    lineStart: i.lineStart,
    lineEnd: i.lineEnd,
    snippet: i.snippet,
    isDefault: i.isDefault,
    isNamespace: i.isNamespace,
    language: ctx.language,
  }));

  // Build blocks from symbols + imports
  const blocks: Block[] = [];

  for (const s of parsed.symbols) {
    const blkId = blockId(relPath, s.name, s.lineStart, s.kind);
    const childSymIds = fileSymbols
      .filter((fs) => fs.lineStart >= s.lineStart && fs.lineEnd <= s.lineEnd && fs.id !== symbolId(relPath, s.name, s.lineStart, s.kind))
      .map((fs) => fs.id);

    blocks.push({
      id: blkId,
      kind: s.kind as BlockKind,
      name: s.name,
      filePath: relPath,
      lineStart: s.lineStart,
      lineEnd: s.lineEnd,
      snippet: s.snippet,
      language: ctx.language,
      symbolIds: childSymIds.length > 0 ? childSymIds : [symbolId(relPath, s.name, s.lineStart, s.kind)],
    });
  }

  for (const i of parsed.imports) {
    const blkId = blockId(relPath, i.source, i.lineStart, "import");
    blocks.push({
      id: blkId,
      kind: "import",
      name: i.source,
      filePath: relPath,
      lineStart: i.lineStart,
      lineEnd: i.lineEnd,
      snippet: i.snippet,
      language: ctx.language,
      symbolIds: [],
    });
  }

  // For unsupported languages, add a single file-level block
  if (!isSupportedLanguage(ctx.language)) {
    const blkId = blockId(relPath, basename(relPath), 1, "unknown");
    blocks.push({
      id: blkId,
      kind: "unknown",
      name: basename(relPath),
      filePath: relPath,
      lineStart: 1,
      lineEnd: ctx.lines.length,
      snippet: ctx.lines.slice(0, Math.min(5, ctx.lines.length)).join("\n").trim(),
      language: ctx.language,
      symbolIds: [],
    });
  }

  return { symbols: fileSymbols, imports: fileImports, blocks };
}

// ── Module detection ──

function findPackageJsonFiles(repoPath: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(repoPath, fullPath);
      if (entry.isDirectory()) {
        const parts = relPath.split(/[/\\]/);
        if (
          parts.includes("node_modules") ||
          parts.includes(".git") ||
          parts.includes(".codewiki") ||
          parts.includes("dist") ||
          parts.includes("__pycache__")
        ) {
          continue;
        }
        walk(fullPath);
      } else if (entry.name === "package.json") {
        results.push(relPath);
      }
    }
  }

  try {
    walk(repoPath);
  } catch {
    // ignore
  }

  return results;
}

function findPythonPackages(repoPath: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(repoPath, fullPath);
      if (entry.isDirectory()) {
        const parts = relPath.split(/[/\\]/);
        if (
          parts.includes(".git") ||
          parts.includes(".codewiki") ||
          parts.includes("__pycache__") ||
          parts.includes(".venv")
        ) {
          continue;
        }
        walk(fullPath);
      } else if (entry.name === "__init__.py") {
        results.push(dirname(relPath));
      }
    }
  }

  try {
    walk(repoPath);
  } catch {
    // ignore
  }

  return results;
}

function isWorkspaceRoot(repoPath: string): boolean {
  const markers = ["pnpm-workspace.yaml", "lerna.json", "nx.json", "turbo.json"];
  return markers.some((m) => existsSync(join(repoPath, m)));
}

function buildModules(repoPath: string, files: string[]): Module[] {
  const modules: Module[] = [];
  const pkgJsonFiles = findPackageJsonFiles(repoPath);
  const pyPackages = findPythonPackages(repoPath);

  // Track which files are assigned to a module
  const assigned = new Set<string>();

  // Create modules from package.json files
  for (const pkgPath of pkgJsonFiles) {
    const pkgDir = dirname(pkgPath);
    try {
      const pkg = JSON.parse(readFileSync(join(repoPath, pkgPath), "utf-8"));
      const name = pkg.name || basename(pkgDir) || "package";
      const moduleFiles = files.filter((f) => {
        const fDir = dirname(f);
        return fDir === pkgDir || fDir.startsWith(pkgDir + "/");
      });

      const entryPoints: string[] = [];
      if (pkg.main) entryPoints.push(pkg.main);
      if (pkg.module) entryPoints.push(pkg.module);
      if (pkg.bin) {
        if (typeof pkg.bin === "string") {
          entryPoints.push(pkg.bin);
        } else {
          entryPoints.push(...Object.values(pkg.bin).filter((v): v is string => typeof v === "string"));
        }
      }

      const deps: string[] = [];
      if (pkg.dependencies) deps.push(...Object.keys(pkg.dependencies));
      if (pkg.devDependencies) deps.push(...Object.keys(pkg.devDependencies));
      if (pkg.peerDependencies) deps.push(...Object.keys(pkg.peerDependencies));

      modules.push({
        id: moduleId(pkgDir, name, "package"),
        name,
        path: pkgDir,
        type: "package",
        language: "javascript",
        files: moduleFiles,
        entryPoints: entryPoints.length > 0 ? entryPoints : undefined,
        dependencies: deps.length > 0 ? deps : undefined,
      });

      for (const f of moduleFiles) assigned.add(f);
    } catch {
      // ignore invalid package.json
    }
  }

  // Create modules from Python packages
  for (const pyPkg of pyPackages) {
    const name = basename(pyPkg) || "python-package";
    const moduleFiles = files.filter((f) => {
      const fDir = dirname(f);
      return fDir === pyPkg || fDir.startsWith(pyPkg + "/");
    });

    modules.push({
      id: moduleId(pyPkg, name, "package"),
      name,
      path: pyPkg,
      type: "package",
      language: "python",
      files: moduleFiles,
    });

    for (const f of moduleFiles) assigned.add(f);
  }

  // If it's a monorepo, add a workspace root module
  if (isWorkspaceRoot(repoPath) && pkgJsonFiles.length > 1) {
    try {
      const rootPkg = JSON.parse(readFileSync(join(repoPath, "package.json"), "utf-8"));
      const name = rootPkg.name || "workspace";
      const workspaceFiles = files.filter((f) => !assigned.has(f));
      modules.unshift({
        id: moduleId(".", name, "workspace"),
        name,
        path: ".",
        type: "workspace",
        language: "javascript",
        files: workspaceFiles,
      });
      for (const f of workspaceFiles) assigned.add(f);
    } catch {
      // no root package.json
    }
  }

  // Group remaining files by directory
  const remaining = files.filter((f) => !assigned.has(f));
  const byDir = new Map<string, string[]>();
  for (const f of remaining) {
    const d = dirname(f);
    const list = byDir.get(d) || [];
    list.push(f);
    byDir.set(d, list);
  }

  for (const [dir, dirFiles] of byDir) {
    const name = basename(dir) || "root";
    modules.push({
      id: moduleId(dir, name, "directory"),
      name,
      path: dir,
      type: "directory",
      files: dirFiles,
    });
  }

  return modules;
}

// ── Public API ──

export function runIndexer(repoPath: string, files: string[]): IndexerResult {
  const symbols: CodeSymbol[] = [];
  const imports: Import[] = [];
  const blocks: Block[] = [];

  for (const relPath of files) {
    const result = indexFile(repoPath, relPath);
    symbols.push(...result.symbols);
    imports.push(...result.imports);
    blocks.push(...result.blocks);
  }

  const modules = buildModules(repoPath, files);

  return { symbols, imports, blocks, modules };
}
