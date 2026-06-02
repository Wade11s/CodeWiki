# CodeWiki Context

CodeWiki is a local-first CLI system for scanning a code repository, producing a browsable static analysis report, and answering repository questions for other coding agents through a strict evidence-based CLI contract.

The product is similar in spirit to DeepWiki, but the MVP is not a hosted wiki or chat application. Its core artifact is a reusable local repository index under `.codewiki/`.

## MVP Boundary

The MVP supports this loop:

1. `codewiki scan <repo>` creates or refreshes `.codewiki/`, runs repository analysis, and generates `.codewiki/site/`.
2. `codewiki serve <repo>` previews the generated static report locally.
3. `codewiki ask <repo> "<question>"` answers only from indexed evidence.
4. `codewiki status <repo>` reports snapshot, stale state, schema versions, agent configuration, skipped files, and scan health.
5. `codewiki debug <repo>` exposes detailed task logs, schema errors, and artifact paths.
6. `codewiki agents` detects local agent CLIs and lets the user interactively choose the default agent.

The MVP does not include hosted SaaS, accounts, multi-user permissions, remote sync, online publishing, a web Q&A UI, HTTP API, or MCP server.

## Domain Terms

- **Repository**: The target codebase passed to CodeWiki.
- **Snapshot**: A versioned view of a repository, including git commit/head information, dirty state, file hashes, schema version, parser version, and agent version information.
- **Stale Index**: A `.codewiki/` index whose snapshot no longer matches the current repository state.
- **CodeWiki Directory**: The generated local directory at `<repo>/.codewiki/`. It is the core product artifact and is not committed by default.
- **Facts**: Deterministic repository data produced by tools such as git, file hashing, ignore-rule evaluation, parsers, tree-sitter, and language adapters.
- **Interpretations**: Agent-produced explanations such as module summaries, feature names, architecture descriptions, and answers.
- **Validation**: Deterministic checks that schemas are valid and all cited evidence exists within the indexed snapshot.
- **Evidence**: A validated reference to a code block, including file path, line range, snippet, symbol or block id, and related symbols when available.
- **Artifact**: A versioned JSON document in `.codewiki/` that stores facts, interpretations, or run/debug metadata.
- **Agent Runner**: The abstraction that invokes local CLI agents such as Codex, Claude Code, Pi Agent, or user-defined commands.
- **Provider**: A concrete Agent Runner implementation for one local agent CLI.
- **Detected Feature**: A feature inferred from deterministic signals such as package scripts, CLI commands, routes, handlers, UI pages, tests, public exports, and README usage snippets.
- **Code Map**: A browsable structure view of files, modules, symbols, imports/exports, entry points, and feature-to-code mappings. Function-level call graphs are best-effort only.

## Architecture Principles

Facts, Interpretations, and Validation must stay separate.

Agents may explain, group, name, and repair structured outputs, but they are not the source of truth for code locations, file hashes, symbol existence, or line validity. CodeWiki must be able to reject an agent output when citations fail deterministic validation.

Markdown and HTML are rendering formats, not the primary analysis format. Analysis results are structured JSON artifacts with schemas and snapshot bindings.

## `.codewiki/` Layout

The MVP uses JSON files instead of SQLite:

```text
.codewiki/
  config.json
  snapshot.json
  index/
    files.json
    symbols.json
    imports.json
    blocks.json
    feature-candidates.json
    skipped-files.json
  artifacts/
    overview.json
    modules.json
    features.json
    code-map.json
  runs/
    <run-id>/
      tasks/
        <task-id>.json
      logs/
        <task-id>.stdout.txt
        <task-id>.stderr.txt
  site/
```

Each core JSON artifact has this envelope:

```json
{
  "schemaVersion": "1.0.0",
  "snapshotId": "...",
  "generatedAt": "...",
  "data": {}
}
```

## Configuration

Configuration exists at both user and repository levels. Repository config overrides user config.

```json
{
  "agent": {
    "default": "codex",
    "concurrency": 2,
    "timeoutSeconds": 600,
    "retries": 1
  },
  "scan": {
    "interactiveConfig": true
  }
}
```

`codewiki scan` can override these with flags such as `--concurrency`, `--timeout`, and `--retries`. With `--write-config`, scan writes the selected values to repo-level `.codewiki/config.json`.

## Report Contract

The static report contains:

- **Overview**: Repository architecture, technology stack, entry points, and run model.
- **Modules**: Directory, package, or module-level explanations and dependencies.
- **Features**: Detected features mapped to implementation evidence.
- **Code Map**: Files, symbols, blocks, imports/exports, entry points, and best-effort call relationships.

The report does not contain a Q&A page. Claims inside report pages carry inline evidence references. Clicking a reference opens a right-side code panel showing the file, line range, code snippet, and related symbols.

## Ask Contract

`codewiki ask` is for CLI and coding-agent integration. It reads from `.codewiki/` by default and does not rescan source code unless a future explicit refresh workflow is added.

Answers must include validated evidence. If there is insufficient indexed evidence, or if generated citations fail validation, CodeWiki refuses to answer with:

```text
No answer: insufficient indexed evidence.
```

The response includes searched scopes, snapshot id, stale state, and suggested next steps such as rerunning `codewiki scan <repo>`. There is no `--allow-unsupported` mode.

The default output is structured Markdown with Answer, Evidence, Confidence, and Index sections. `--json` returns machine-readable output for other coding agents.

## Indexing Scope

The MVP uses tree-sitter and language adapters. TypeScript, JavaScript, and Python receive deeper symbol/index support first. Other languages are indexed at file or coarse block level until adapters are added.

The indexer follows `.gitignore` by default and excludes common generated directories such as `node_modules`, `.git`, `.codewiki`, `dist`, `build`, `coverage`, `.next`, `.turbo`, `.venv`, and `__pycache__`. Additional include/exclude rules can be configured.

Monorepos receive basic package/workspace awareness so modules can be grouped by package or app. Multi-repo aggregation and complex deployment topology are outside the MVP.

Large repository handling is based on modular analysis, skipped-file tracking, and explicit incomplete markers. The MVP skips binary files, oversized files, generated files, ignored files, and parse failures with reasons in `index/skipped-files.json`.

## Technology Choices

The project is implemented in TypeScript. Bun is used for workspace tooling, package management, scripts, and tests. The published CLI targets Node.js LTS runtime compatibility and should avoid Bun-only APIs in runtime code.

The initial monorepo packages are:

- `packages/cli`
- `packages/core`
- `packages/site`

The report site uses Vite and React. Code snippets use Shiki for syntax highlighting. Monaco is outside the MVP.

The CLI uses `commander` and `@inquirer/prompts`.

## Testing

The default test path uses a fake agent provider for deterministic unit and integration tests.

Local development treats Claude provider integration as a first-class path:

- `bun test` runs deterministic tests with the fake provider.
- `bun test:claude` runs real Claude provider integration tests on a machine with Claude installed and authenticated.

Real agent integration tests are not required in ordinary CI unless CI is explicitly configured with a working provider environment.
