# ADR-0004: CLI Surface and Local Agent Selection

## Status

Accepted

## Context

CodeWiki relies on local coding agents such as Codex, Claude Code, Pi Agent, or user-defined commands. The CLI must support agent discovery and selection without coupling scan or ask logic to a specific provider.

The MVP also needs non-interactive paths so other coding agents can call CodeWiki.

## Decision

Agent invocation goes through an Agent Runner abstraction:

```ts
runTask({
  prompt,
  repoIndexPath,
  inputArtifacts,
  outputSchema,
  timeoutSeconds
})
```

Concrete providers wrap local CLI agents. The MVP supports local CLI providers only. Direct cloud model SDK providers are outside the MVP.

`codewiki agents` is the agent selection command. It detects available local agents and opens an interactive list so the user can choose the default provider.

`codewiki agents --json` outputs machine-readable detection results for automation.

`scan` and `ask` use the configured default agent, and both support `--agent <agent>` for one-off overrides.

If no default agent exists, interactive `scan` or `ask` can trigger the same selection flow.

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

`codewiki scan <repo> --concurrency 4 --timeout 900 --retries 2 --write-config` runs with overrides and writes them to repo-level `.codewiki/config.json`.

There is no agent budget setting in the MVP.

## Execution Model

Agent tasks can run in parallel. The MVP supports:

- configurable concurrency
- per-task timeout
- retry count
- task logs
- schema validation errors
- exit code and duration tracking

Default concurrency is conservative, initially `2`.

## Debugging

`codewiki status <repo>` gives a user-level summary: snapshot, stale state, effective agent config, schema versions, skipped files, and failed task counts.

`codewiki debug <repo>` exposes detailed run and task diagnostics, including prompts, input artifact ids, stdout, stderr, exit code, duration, retries, and validation errors. It supports task-focused and JSON output modes.
