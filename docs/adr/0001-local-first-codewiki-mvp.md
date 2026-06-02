# ADR-0001: Local-First CodeWiki MVP

## Status

Accepted

## Context

CodeWiki aims to provide DeepWiki-like repository understanding through a local CLI. The system must scan a repository, generate a static report site, and answer repository questions for other coding agents.

The hardest part is producing reusable, evidence-backed repository understanding. Hosted accounts, remote sync, multi-user permissions, and online publishing are not required to validate that core value.

## Decision

The MVP is local-first.

`codewiki scan <repo>` creates a reusable local index under `<repo>/.codewiki/` and automatically generates a static report in `.codewiki/site/`.

The CLI surface is:

- `codewiki scan <repo>`
- `codewiki serve <repo>`
- `codewiki ask <repo> "<question>"`
- `codewiki status <repo>`
- `codewiki debug <repo>`
- `codewiki agents`

There is no separate `report` command in the MVP. Report generation is part of `scan`.

`.codewiki/` is the core product artifact. The report site and `ask` consume `.codewiki/`; they do not each reanalyze the repository independently.

The MVP does not include hosted SaaS, accounts, team collaboration, remote sync, web Q&A, local HTTP API, or MCP server.

## Consequences

The system can be tested end-to-end without cloud infrastructure.

Generated data remains close to the repository snapshot it describes.

The CLI must provide strong diagnostics because users will run it in varied local environments.

Remote publishing or team workflows can be added later as explicit export or hosted modes.

## Default Generated Layout

```text
.codewiki/
  config.json
  snapshot.json
  index/
  artifacts/
  runs/
  site/
```

## Git Behavior

`.codewiki/` is a local generated artifact and should not be committed by default.

On first interactive `scan`, CodeWiki asks whether to add `.codewiki/` to the target repository `.gitignore`. In non-interactive mode, it does not mutate `.gitignore`; it prints a warning instead.
