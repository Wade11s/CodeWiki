# ADR-0002: Separate Facts, Interpretations, and Validation

## Status

Accepted

## Context

CodeWiki promises explanations that point to concrete implementation locations. Agent-only analysis is not reliable enough for code location, line ranges, file hashes, or citation validity.

The system needs agent reasoning, but it also needs deterministic guardrails so reports and answers remain checkable.

## Decision

The scan pipeline separates three responsibilities:

- **Facts**: Deterministic repository data such as snapshot metadata, file hashes, symbols, imports, exports, blocks, candidate features, skipped files, and line ranges.
- **Interpretations**: Agent-produced summaries, module explanations, feature names, architecture descriptions, and question answers.
- **Validation**: Deterministic schema and evidence checks that decide whether an artifact is usable.

Agents can participate across the workflow as workers, but they cannot be the source of truth for facts or validation.

## Pipeline Shape

`codewiki scan` runs the full pipeline:

1. Create a repository snapshot and deterministic index.
2. Extract deterministic feature candidates.
3. Run agent tasks to produce structured interpretation artifacts.
4. Validate artifact schemas and evidence references.
5. Generate `.codewiki/site/`.

If agent analysis fails, CodeWiki keeps successful facts and candidate outputs, records the failed tasks under `.codewiki/runs/`, and generates status/debug information instead of deleting partial results.

## Artifact Contract

Markdown is not the primary analysis format. Agent outputs must be structured JSON artifacts.

Each core artifact uses this envelope:

```json
{
  "schemaVersion": "1.0.0",
  "snapshotId": "...",
  "generatedAt": "...",
  "data": {}
}
```

Every claim that appears in a report or answer must trace to validated evidence:

- file path
- start line
- end line
- block or symbol id when available
- snapshot id

## Consequences

Agent outputs can be retried, repaired, and rejected without corrupting the index.

Reports and answers can be rendered in different forms while preserving the same evidence contract.

Future schema migrations require explicit handling because all artifacts are versioned.
