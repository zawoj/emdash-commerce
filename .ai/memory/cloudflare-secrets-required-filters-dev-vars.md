---
name: cloudflare-secrets-required-filters-dev-vars
description: with "secrets": {"required": [...]} in wrangler.jsonc, a .dev.vars entry whose name is not listed never reaches the Worker's process.env in astro dev, so EMAIL_SMTP_* from .dev.vars are ignored; the admin's Settings → Email path is unaffected
metadata:
  type: project
---

# `secrets.required` hides every other `.dev.vars` entry from `process.env` (local workerd)

Seen 2026-11-17 on `DEPLOY_TARGET=cloudflare astro dev` (wrangler/workerd under `@astrojs/cloudflare` 14.3.4), with this repo's
`wrangler.jsonc` (`"secrets": { "required": ["EMDASH_ENCRYPTION_KEY", "STRIPE_SECRET_KEY"] }`):

- `.dev.vars` with `EMAIL_SMTP_HOST/PORT/USER/PASS` next to the encryption key: `GET /_emdash/api/settings/email` answered
  `smtp.configured: false`, the console provider stayed selected. The key itself worked (saving SMTP in the admin encrypts with it).
- Adding the four names to `secrets.required`, fresh database, restart: `configured: true, source: "env"`,
  `selectedProviderId: "emdash-builtin-smtp"`. Nothing else changed.

So locally on the Cloudflare target an env-based setting that is not in `secrets.required` is invisible, silently (the only
hint is the "Missing required secrets" warning about the listed ones). The same filter very likely applies to
`STRIPE_WEBHOOK_SECRET` and `COMMERCE_ACCESS_TOKEN_SECRET` in `.dev.vars` (not tested). What a **deployed** Worker does with a
secret set by `wrangler secret put` that is not listed was **not** tested.

What to do: for local Cloudflare runs of the email path either save the SMTP settings in the admin (works, verified), or add
the names to `secrets.required` for that run (and revert: a listed secret becomes mandatory for the Deploy button). Do not list
them permanently without checking what a deploy without them does.

Check with `GET /_emdash/api/settings/email` (dev login): `smtp.source` says `env` or `db` or `null`.
