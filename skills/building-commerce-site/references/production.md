# Production checklist

Full detail: `docs/production.md`, `docs/cloudflare.md`, `docs/releasing.md`.

## Secrets

| Variable | Role |
| --- | --- |
| `EMDASH_ENCRYPTION_KEY` | Required; EmDash format; stable forever on a given database |
| `STRIPE_SECRET_KEY` | Sandbox until you deliberately go live |
| `STRIPE_WEBHOOK_SECRET` | Local: from `stripe listen`. Deployed: optional after **Register webhook** |
| `COMMERCE_ACCESS_TOKEN_SECRET` | Optional; signs guest links — rotation invalidates emailed links |

Admin-stored plugin settings **override** environment variables.

## Email

Order confirmation and access-link emails use EmDash's email pipeline. Dev: console provider — view captured mail at
`GET /_emdash/api/dev/emails` (development only, after dev login session).

Deployed: configure Settings → Email (SMTP or provider plugin) or mail never leaves the server.

## First deploy (Cloudflare sketch)

1. `wrangler secret put` encryption key + Stripe sandbox key.
2. `pnpm --filter @emdash-commerce/storefront deploy:cloudflare`.
3. Complete admin setup wizard with passkey (first visitor becomes admin).
4. Register Stripe webhook from Commerce page.
5. Create catalog in admin or import site, then **Resync catalog**.
6. Strip `feedback` collection from production seed if you do not want Notes dev collection.

Plugin runs on workerd unchanged — `.ai/memory/plugin-stripe-runs-on-workerd.md`.