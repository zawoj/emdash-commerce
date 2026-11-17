# Writing and reviewing changesets

A changeset determines the version bump for a published package, and its description becomes public documentation in
that package's `CHANGELOG.md` and in the GitHub release. Readers meet it while deciding whether and how to upgrade, so
write it for someone who installs the package, not for someone who has read the pull request or the diff.

The repo-root `CHANGELOG.md` is a different file: the hand-written history of the monorepo and the demo storefront
(every PR adds an entry there, changeset or not). See `docs/releasing.md` and
`.ai/decisions/2026-11-17-changesets-and-publishing.md` for why both exist.

## Published packages

| Package | What consumers get |
| --- | --- |
| `@emdash-commerce/plugin-stripe` | The `stripe-commerce` EmDash plugin |
| `@emdash-commerce/plugin-image-hotspots` | The `image-hotspots:hotspots` field widget |
| `@emdash-commerce/design-system` | Tokens and the Astro components |

`@emdash-commerce/storefront` (the demo shop in `apps/storefront`) is private and listed under `ignore` in
[`config.json`](config.json); it is never released and never needs a changeset.

## When to add a changeset

Add a changeset for any change to a published package's behavior or API: a bug fix, a feature, a behavior-changing
refactor, a changed export, a changed peer dependency range. Without one the change does not trigger a release.

- A change that touches several packages needs one changeset listing all of them.
- A pull request with several distinct changes can carry one changeset per change; each becomes its own CHANGELOG entry.
- Docs-only, test-only, CI/tooling and demo-storefront changes do not need a changeset.

Create one with the following command, then edit the generated Markdown file:

```bash
pnpm changeset
```

Commit it with the pull request. When the pull request merges to `main`, the release workflow collects every pending
changeset into one "Version Packages" pull request; merging that pull request publishes.

## Bump types

Every package is `0.x` today, so the convention is:

- `patch`: a bug fix or a small improvement that needs no action from the reader.
- `minor`: a new backwards-compatible feature **or a breaking change while the package is `0.x`**. A breaking change must
  say so in the first sentence and show the migration.
- `major`: reserved for the first `1.0.0` and, after that, for breaking changes. Ask the maintainers before choosing it.

## Lead with the released behavior

Start with a present-tense verb such as **Fixes**, **Adds**, **Updates**, **Removes** or **Deprecates**. In the opening
sentence:

- Name the user-facing API, option, route, component or behavior readers will recognise.
- Say who is affected and what they can now do, or state the observable problem that is fixed.
- Describe the released behavior, not file names, private functions, refactors or implementation choices.

Give detail in proportion to the impact. One specific sentence is often enough for a patch. A significant feature needs
the capability, basic usage, defaults and compatibility, and any action readers must take.

Longer entries can use Markdown headings, but start at `####`: changesets are embedded below headings in the generated
CHANGELOG, so `##` and `###` break its hierarchy.

Do not keep useful explanations only in a changeset or a PR description; put them in the package docs too.

## Examples

The examples are illustrative: the names in them are not a promise about the current API.

A patch entry names the affected route and the problem a site owner observes:

```md
---
"@emdash-commerce/plugin-stripe": patch
---

Fixes the Stripe webhook answering `200` for an order it could not record, so Stripe now retries the event instead of dropping it.
```

A minor entry names the capability and shows how to use it:

````md
---
"@emdash-commerce/design-system": minor
---

Adds the `QuantityStepper` component with a `min`/`max` clamp and an accessible live region.

```astro
---
import { QuantityStepper } from "@emdash-commerce/design-system";
---

<QuantityStepper name="quantity" value={1} min={1} max={10} />
```
````

A breaking change on a `0.x` package is a `minor` bump that cannot be missed:

````md
---
"@emdash-commerce/plugin-stripe": minor
---

Removes the `catalog/list` route: it returned unpaged data and is replaced by `catalog/products`, which pages.

#### What should I do?

Call `catalog/products` with a `cursor` instead; the response shape is documented in `docs/api.md`.
````

## Bad and good descriptions

```diff
- Fixes a bug in the cart.
+ Fixes a cart losing its items after the browser cookie expired and the customer signed in again.
```

```diff
- Refactors the checkout service into three modules.
+ Fixes checkout failing with `CATALOG_LIMIT_EXCEEDED` for a product with more than 50 variants.
```

## Review changesets as documentation

Ask for a rewrite when an entry is vague, describes internal mechanics, reads like a commit message, or does not help a
reader decide whether the release matters to them. Frontmatter validity and technical accuracy are necessary but not
sufficient.

For the CLI and configuration, see the [Changesets documentation](https://github.com/changesets/changesets/tree/main/docs).
