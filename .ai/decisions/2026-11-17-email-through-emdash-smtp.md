# Order email goes through EmDash's built-in SMTP provider; no provider plugin of our own

Date: 2026-11-17

## Context

The Stripe plugin sends order confirmations and guest order links through `ctx.email.send` (capability `email:send`).
EmDash has one exclusive `email:deliver` provider. A deployed site has none until one is configured, so mail silently does
not go out (the plugin logs a warning; the buyer's lookup form answers the same success either way, by design). The roadmap
asked to document, and optionally automate, provider setup for deployed sites on both targets (Node, Cloudflare Workers).

EmDash 1.5 ships a built-in SMTP provider (`emdash-builtin-smtp`): it reads `EMAIL_SMTP_*` (complete set = auto-selected
fallback, ahead of the dev console) or settings saved in the admin (password encrypted with `EMDASH_ENCRYPTION_KEY`, wins over
env on every send). It needs STARTTLS or implicit TLS, `PLAIN`/`LOGIN` auth, and refuses port 25.

## Decision

- Use EmDash's SMTP provider and document it (`docs/email.md`); the plugin keeps asking the pipeline, never a transport.
- Automate only what is cheap and safe: commented `EMAIL_SMTP_*` placeholders in `.env.example` (commented, because a complete
  set switches off the dev console), and a `pnpm run doctor` check (`smtpEnvStatus` in `scripts/lib/bootstrap-env.mjs`) that
  mirrors EmDash's own validation and never prints a value.
- Do **not** ship an HTTP-API provider plugin (Resend, Postmark API) in this repo. EmDash's seam for one exists
  (`email:deliver` with `hooks.email-transport:register`, selectable in Settings → Email), it is documented as the route for
  relays without SMTP.

## Alternatives

- Our own `plugin-email-*` package: one more published package with its own versioning, secrets and tests for a provider whose
  choice is the site owner's; SMTP already covers every large relay. Left for the roadmap if a Workers-only gap shows up.
- Sending from the Stripe plugin directly over a provider's API: couples commerce to one vendor and duplicates the pipeline
  (magic links and invites would still need the provider).
- Having `pnpm bootstrap` prompt for SMTP: another secret to type, and it would be set in dev where the console provider is the
  better default.

## Consequences

- Delivery on a deployed site is a configuration step, not code; the doc says how to test it and where failures show up.
- The doctor check cannot see admin-saved settings or Worker secrets, so a "todo" there is normal for those sites.
- Only providers that offer SMTP on 587/465 with `PLAIN`/`LOGIN` work out of the box (no OAuth2 mailboxes).
- What runs on Cloudflare Workers is limited to what was verified; see `docs/email.md` and
  `.ai/memory/wrangler-passes-only-required-secrets-to-the-worker.md`.
