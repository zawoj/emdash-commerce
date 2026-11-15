# .ai — the technical working files

The repo keeps what is **technical and structural**: how it is built, what changed and why, the traps. This file is the
layout, the naming and the formats; `pnpm check:ai` (`scripts/check-ai-structure.mjs`, also run in CI) enforces them, and
`AGENTS.md` points every agent here. Product scope, tasks and status live in whatever tracker the maintainers use, never in
the repo; a technical file links its task when there is one.

```
CHANGELOG.md                   history of changes — what changed and why, one entry per PR
.ai/
├── README.md                  this file
├── decisions/                 technical decisions (ADRs): YYYY-MM-DD-slug.md — no status, no subfolders
├── runs/                      one log per autonomous AI run: YYYY-MM-DD-slug.md
└── memory/
    ├── MEMORY.md              index — every memory file listed exactly once
    └── <topic>.md             one fact per file (after a bug fix or non-obvious lesson, add a new file)
```

## Naming

Decisions and run logs are `YYYY-MM-DD-slug.md`: the real day the file is created, then a lowercase ASCII kebab-case slug
(`2026-10-20-oauth-login.md`). Two files on one day get different slugs. `pnpm check:ai` rejects anything else in
`decisions/` and `runs/`, and any folder inside them.

## `CHANGELOG.md`

Every PR adds an entry at the top, under today's date (add the `## YYYY-MM-DD` heading above the previous one if it is
missing). No change is too small for an entry.

```markdown
## YYYY-MM-DD

### <type>: <what> (#<PR number> or branch) — <Claude Code | Codex | Cursor | name>
- what changed and WHY — for someone who does not read the diff
- task link (when there is one)
- anything to do outside the code (env var, Stripe dashboard, deploy), if any
```

## Decisions (ADRs)

A technical decision worth keeping — a structure, a library, a trade-off — gets one file. It is never edited into a
different decision: when the decision changes, a new file supersedes the old one and says so. There is no status.

```markdown
# <The decision, as a short statement>

Date: YYYY-MM-DD · Task: <link> (when there is one) · Supersedes: <file> (when it does)

## Context       the problem and the constraints
## Decision      what we do, precisely
## Alternatives  what else was considered and why not
## Consequences  what this makes easier and harder; what to watch
```

## Runs (autonomous AI runs)

Every autonomous run — an agent working without a human in the loop — leaves **one** log in `runs/YYYY-MM-DD-slug.md`,
written as it works and finished before it stops:

```markdown
# <What the run was asked to do>

Agent: <Claude Code | Codex | Cursor | …> · Branch/PR: <name> / #<n> · Task: <link>

## Goal
## Steps         what was done, in order, with the commands that mattered
## Verification  what was run and the result (never "should work")
## Outcome       done | partial | blocked — and what is left
## Follow-ups    anything for a human or the next run
```

A run that found something the next session must know also writes it to `memory/` (below).

## Memory

What the code and the docs cannot say: technical decisions in brief, traps, incidents, how the maintainers want agents to work.

- **Read at session start**: `memory/MEMORY.md` and the files that match the task, in full.
- **One file = one topic.** English, kebab-case. Add its one line to `MEMORY.md`.
- **Update instead of adding next to it**; delete what is outdated; date the last verification.
- **Record the actual state, never a plan** — what is true today.
- **Do not record** what the code shows, history (that is `CHANGELOG.md` and `git log`), anything a doc already says
  (link it), or **secrets** — variable names at most.
- A change in `memory/` goes through a PR like any other.

After **fixing a bug** or finishing a task where you learned something non-obvious, add a new `memory/<topic>.md`
(kebab-case, frontmatter with `name:` and `description:`, one `# heading`) and exactly one link to it in `MEMORY.md` — the
checker rejects an unindexed or double-indexed entry. Do not append to a shared log: one topic per file.
