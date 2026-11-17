# Run: verify SMTP delivery with Mailpit

## Goal

Prove EmDash's SMTP provider delivers the shop's mail to a real SMTP server on the Node production bundle and on local workerd,
and make Mailpit the documented way to test email locally.

## Steps

1. Mailpit `v1.33.0` (Docker; released 2026-10-31) with a throwaway CA and a `localhost` certificate (SAN), `STARTTLS` required,
   any login accepted. Ports: SMTP 2526, UI/API 8026.
2. Node: `nx run-many -t build` with `EMDASH_DATABASE_FILE` / `EMDASH_UPLOADS_DIR` set; setup and an `admin` token through a dev
   server on the same database; `pnpm start` on 4373 with `EMAIL_SMTP_*`, `NODE_EXTRA_CA_CERTS` and the `stripe listen` secret in
   the process environment; token seed; `stripe listen --all-snapshot`; a scratch Playwright spec (not committed) reusing the e2e
   hosted-Checkout helpers.
3. workerd: `dev:cloudflare` on 4374 with `EMDASH_CLOUDFLARE_STATE_DIR`, SMTP saved through `PUT /settings/email`, a test send with
   and without `NODE_EXTRA_CA_CERTS`.
4. `scripts/mailpit.mjs` (`pnpm mail:dev`) and `scripts/lib/mailpit.mjs` with unit tests, proved by nine mutations (all killed).

## Verification

- Node: the order confirmation (`Cloudflare Merch: order ORD-2026-00001 confirmed`) and the guest link mail (`... your link to order
  ORD-2026-00001`) arrived in Mailpit, From `Mailpit Shop <shop@localhost>`, To the buyer; the link opened `/orders/view` (200, order
  number and Paid).
- workerd: delivered with `NODE_EXTRA_CA_CERTS`; `TLS handshake failed: invalid peer certificate: UnknownIssuer` without it.
- `pnpm run doctor` reads only `apps/storefront/.env`, so it cannot see process-environment `EMAIL_SMTP_*`; the same rules checked
  with `checkEnv(process.env)` said ready.

## Outcome and follow-ups

`docs/email.md` has the "Test delivery locally with Mailpit" section. The earlier note that workerd cannot trust a local CA was wrong
and is corrected in memory. Not run: implicit TLS (465 style) against Mailpit, a deployed Worker, a real relay.
