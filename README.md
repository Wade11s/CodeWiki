# CodeWiki

Local-first CLI for repository understanding. Scan a codebase, generate a static report site, and ask evidence-only questions for other coding agents.

## Workspace

This is a Bun monorepo with three packages:

- `packages/cli` — CLI entrypoint and commands
- `packages/core` — Shared types, schemas, snapshot logic, agent runner
- `packages/site` — Vite + React report site

## Development Commands

```sh
# Install dependencies
bun install

# Build all packages
bun run build

# Type check (no emit)
bun run lint

# Run fixture-based tests (deterministic, no real agent required)
bun test

# Run fixture tests explicitly
bun run test:fixtures

# Run Claude integration tests (requires local Claude CLI)
bun run test:integration

# Invoke the local CLI
bun run codewiki -- <command> [args]

# Watch mode for CLI
bun run dev:cli

# Watch mode for site
bun run dev:site
```

## CLI Usage

```sh
# Scan a repository
codewiki scan <repo>

# Serve the generated report
codewiki serve <repo> --port 3000

# Ask a question (evidence-only)
codewiki ask <repo> "<question>"

# Check status
codewiki status <repo>

# Debug output
codewiki debug <repo> --json

# Detect local agents
codewiki agents --json
```

## Runtime Target

The published CLI targets Node.js LTS. Runtime code avoids Bun-only APIs.

## Project Context

- [Project context](CONTEXT.md)
- [Architecture decisions](docs/adr/)
- [Agent instructions](AGENTS.md)
