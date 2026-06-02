# CodeWiki

CodeWiki is a planned local-first CLI for repository understanding. It will scan a code repository, generate a static report site, and provide an evidence-only `ask` command for other coding agents.

## Current State

This repository currently contains the project context, architecture decisions, and Multica issue-tracker configuration used to build the MVP from issues.

Implementation work is tracked in Multica under `WADE-15` and its child issues. Agents should execute those issues against the GitHub repository resource attached to the Multica project, not against a local generated worktree.

## Docs

- [Project context](CONTEXT.md)
- [Architecture decisions](docs/adr/)
- [Agent instructions](AGENTS.md)
- [Issue tracker instructions](docs/agents/issue-tracker.md)

## MVP Direction

The accepted MVP direction is:

- TypeScript implementation
- Bun for development tooling
- Node.js LTS runtime target
- `packages/cli`, `packages/core`, and `packages/site` once implementation begins
- `.codewiki/` as the generated local analysis artifact, ignored by Git
