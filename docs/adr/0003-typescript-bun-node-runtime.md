# ADR-0003: TypeScript, Bun Tooling, and Node Runtime Target

## Status

Accepted

## Context

CodeWiki needs a CLI, JSON schema validation, local subprocess orchestration, tree-sitter/language adapters, and an interactive report website. TypeScript fits this combination well and lets the project dogfood JavaScript and TypeScript repository indexing.

Bun provides fast package management, workspace tooling, test running, and TypeScript execution. However, the published CLI should be easy for coding agents and developers to run in common Node.js environments.

## Decision

CodeWiki is implemented in TypeScript.

Bun is used for repository tooling:

- package management
- workspace scripts
- tests
- local development commands

The published `codewiki` CLI targets Node.js LTS runtime compatibility. Runtime code should not depend on Bun-only APIs unless a compatibility wrapper exists.

The initial monorepo packages are:

```text
packages/
  cli/
  core/
  site/
```

`agent-runner` starts inside `packages/core` as an internal module. It can be extracted into its own package once provider complexity justifies it. A generic `common` package is intentionally avoided in the MVP.

## Initial Libraries

- CLI: `commander`
- Interactive prompts: `@inquirer/prompts`
- Schema validation: `zod`
- Report app: Vite + React
- Code highlighting: Shiki
- Parsing: tree-sitter plus focused language adapters

## Consequences

Development can use Bun speed without forcing end users to install Bun.

The codebase starts with three packages instead of premature package fragmentation.

Provider and shared utility boundaries can be extracted when there is concrete pressure.
