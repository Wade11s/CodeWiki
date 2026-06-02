# Issue tracker: Multica

Issues and PRDs for this repo live as Multica issues in the `CodeWiki` project.
Use the `multica` CLI for all operations.

## Workspace and Project

- Workspace: `625c6b40-4caa-48ea-9126-4bf62a83415b`
- Project: `CodeWiki`
- Project ID: `cf46bec4-493e-47b8-b46a-0ffc35f0b964`

Before issue work, select the workspace:

```sh
multica workspace switch 625c6b40-4caa-48ea-9126-4bf62a83415b
```

Use this project flag for issue commands:

```sh
--project cf46bec4-493e-47b8-b46a-0ffc35f0b964
```

If the project needs to be re-discovered, run:

```sh
multica project list --output json
multica project resource list cf46bec4-493e-47b8-b46a-0ffc35f0b964 --output json
```

The project is linked to this repo through:

- `github_repo`: `https://github.com/Wade11s/CodeWiki.git`

Agents should execute project issues from the Multica `github_repo` resource, not from a user-local generated worktree.

## Conventions

- **Authenticate**: check with `multica auth status` first. If it reports an invalid, expired, or missing token, stop and ask the user to run `multica login`; do not run `multica login` automatically because it creates a new token.
- **Select workspace**: run `multica workspace switch 625c6b40-4caa-48ea-9126-4bf62a83415b`. For one-off commands, pass `--workspace-id 625c6b40-4caa-48ea-9126-4bf62a83415b`.
- **Create an issue**: `multica issue create --title "..." --description "..." --project cf46bec4-493e-47b8-b46a-0ffc35f0b964 --output json`. Use `--description-file <path>` or `--description-stdin` for multi-line descriptions.
- **Read an issue**: `multica issue get <id> --output json`, then fetch comments with `multica issue comment list <id> --output json`.
- **List issues**: `multica issue list --project cf46bec4-493e-47b8-b46a-0ffc35f0b964 --metadata triage_role=<role> --status <status> --output json`. Omit any filter that is not relevant.
- **Comment on an issue**: `multica issue comment add <id> --content "..." --output json`. Use `--content-file <path>` or `--content-stdin` for multi-line comments.
- **Update status**: `multica issue status <id> <status> --output json`.
- **Apply / remove labels**: find or create the label with `multica label list --output json` / `multica label create --name "<label>" --color "#3b82f6" --output json`, then run `multica issue label add <issue-id> <label-id> --output json` or `multica issue label remove <issue-id> <label-id> --output json`. Label names must be 32 characters or fewer.
- **Apply / change triage role**: `multica issue metadata set <id> --key triage_role --value "<role>" --type string --output json`, and mirror the same value as a Multica label. When changing roles, remove the previous triage label from the issue.
- **Close**: `multica issue status <id> cancelled --output json`. For won't-fix, post the explanation first with `multica issue comment add <id> --content "..." --output json`, set `triage_role` to `wontfix`, then close.

Do not run multiple mutating commands against the same issue in parallel. Commands like `issue update`, `issue status`, `issue metadata set/delete`, and `issue label add/remove` should be serialized.

## Triage Roles

When a skill says "apply a label" or refers to `docs/agents/triage-labels.md`, treat the mapped value as both the Multica metadata value for `triage_role` and the Multica issue label name to create/apply.

Use these canonical values unless `docs/agents/triage-labels.md` maps them differently:

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
- `wontfix`

Use `triage_role` metadata as the filtering source of truth because `multica issue list` supports `--metadata triage_role=<role>` and does not expose a label filter.

For board visibility only, you may also mirror triage roles into coarse Multica statuses:

- `needs-triage` -> `backlog`
- `needs-info` -> `blocked`
- `ready-for-agent` -> `todo`
- `ready-for-human` -> `todo`
- `wontfix` -> `cancelled`

Do not treat Multica status as the source of truth for triage. Agents may also move issues through execution statuses like `in_progress`, `in_review`, and `done`.

## When a Skill Says "Publish to the Issue Tracker"

Create a Multica issue:

```sh
multica issue create --title "..." --description "..." --project cf46bec4-493e-47b8-b46a-0ffc35f0b964 --output json
```

## When a Skill Says "Fetch the Relevant Ticket"

Run:

```sh
multica issue get <id> --output json
multica issue comment list <id> --output json
```
