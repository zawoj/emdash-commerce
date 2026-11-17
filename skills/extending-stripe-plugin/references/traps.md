# Extension traps (quick reference)

Read linked memory files in full before changing behaviour.

| Symptom | Likely cause |
| --- | --- |
| Paid at Stripe, no order | Webhook secret mismatch, listener stopped, or event parked `dead` |
| Webhook `[400]` locally | `STRIPE_WEBHOOK_SECRET` not from current `stripe listen` |
| Checkout `NOT_CONFIGURED` after first seed | Restart server — site URL read at startup |
| `/orders/view` 500 | Malformed `EMDASH_ENCRYPTION_KEY` or missing access-token secret |
| Catalog "not synced" forever | Resync queued but cron slow — drive sync manually |
| Admin infinite loading after `pnpm build` | Dev server Vite cache overwritten — restart with `--force` |
| Products stuck draft after plugin write | Never auto-write `products` — use storage links + publish flow |
| Stripe idempotency weirdness | Reused random idempotency key within 24h |

## Limitations by design

See `packages/plugin-stripe/README.md` § Limitations: single currency per cart, no customer accounts, Checkout Sessions
only, fixed shipping rates (payment mode), relation reads cap at 50, no Connect, etc. Do not "fix" in a drive-by PR
without an ADR and issue.