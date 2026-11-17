# Agent skills

Task-specific instructions for coding assistants (Claude Code, Codex, Cursor). Format matches
[EmDash](https://github.com/emdash-cms/emdash) (`skills/<name>/SKILL.md` with YAML frontmatter and optional
`references/`).

| Skill | Use when |
| --- | --- |
| [building-commerce-site](building-commerce-site/SKILL.md) | Adding commerce to an EmDash site with the `stripe-commerce` plugin and a storefront like this repo. |
| [extending-stripe-plugin](extending-stripe-plugin/SKILL.md) | Changing or extending `@emdash-commerce/plugin-stripe` (layers, subscribers, tests). |

The demo storefront also vendors EmDash's own skills under `apps/storefront/.agents/skills/` (building an EmDash site,
creating plugins, CLI). Those teach core EmDash APIs; the two skills here teach **this monorepo's commerce stack**.

## Publishing

EmDash maintains a separate [`emdash-cms/skills`](https://github.com/emdash-cms/skills) repository and syncs selected
skills from the main `emdash` repo with a script. **This community repo does not sync anywhere.** Skills live in git
for humans and agents who clone `zawoj/emdash-commerce`; copying them into your own project is manual.

To wire skills into Cursor or Claude Code, symlink or copy `skills/` (or individual folders) into the tool's skills
path, or point agents at `SKILL.md` from your project's `AGENTS.md`.