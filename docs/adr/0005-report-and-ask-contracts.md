# ADR-0005: Report and Ask Evidence Contracts

## Status

Accepted

## Context

CodeWiki has two user-facing outputs:

- a static report website for browsing repository understanding
- a CLI `ask` command for users and other coding agents

Both outputs must be grounded in the same `.codewiki/` artifacts and validated evidence.

## Decision

The report website is generated during `codewiki scan` and written to `.codewiki/site/`.

The MVP report sections are:

- **Overview**: repository architecture, technology stack, entry points, and run model
- **Modules**: directory, package, or module-level summaries and dependencies
- **Features**: detected user-facing or developer-facing feature flows mapped to implementation
- **Code Map**: file tree, module grouping, symbols, imports/exports, entry points, and feature-to-code mappings

There is no Q&A page in the report site.

There is no standalone Evidence page. Evidence appears as inline citations attached to claims. Clicking a citation opens a right-side code panel with file path, line range, snippet, and related symbols.

The site is implemented with Vite and React. Code snippets use Shiki. Monaco is outside the MVP.

## Feature Detection

MVP features are detected automatically. User-seeded features are outside the MVP.

The deterministic indexer extracts feature candidates from signals such as:

- package scripts
- CLI command definitions
- HTTP route handlers
- RPC or API endpoints
- UI route/page components
- test `describe` blocks or equivalents
- public exported functions
- README usage snippets

Agents group and name these candidates into user-understandable detected features. They must not invent features without candidate evidence.

## Ask Contract

`codewiki ask <repo> "<question>"` answers from `.codewiki/` by default.

The default output is structured Markdown:

- Answer
- Evidence
- Confidence
- Index

`--json` returns a machine-readable equivalent for other coding agents.

Answers must include validated evidence. If retrieval finds insufficient evidence, or if agent-generated citations fail validation, CodeWiki refuses to answer:

```text
No answer: insufficient indexed evidence.
```

The refusal includes searched scopes, snapshot id, stale state, and suggested next steps such as rerunning `codewiki scan <repo>`.

There is no `--allow-unsupported` mode.

## Retrieval

The MVP uses local lexical and structured retrieval over:

- symbols
- blocks
- claims
- module names
- feature names
- file paths

External embedding APIs are not required for the MVP. Embeddings can be added later as an optional enhancement.

## Success Criteria

For a medium TypeScript, JavaScript, or Python repository:

1. `codewiki scan <repo>` produces `.codewiki/site/` with Overview, Modules, Features, and Code Map.
2. Key report explanations have clickable citations that open code snippets in a right-side panel.
3. `codewiki ask <repo> --json "How is this feature implemented?"` returns an evidence-backed answer when indexed evidence exists.
4. The same command refuses to answer when indexed evidence is insufficient or citations fail validation.
