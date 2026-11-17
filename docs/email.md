# Email on a deployed site

The shop sends mail through **EmDash's email pipeline**; it has no mail code of its own. A deployed site has **no email
provider until you configure one**, and without one nothing is delivered: no order confirmation, no guest order link, no
magic-link or invite email. This page is the setup, the test, and what is known to work.

Read against EmDash 1.5.0 (`emdash/dist/email-smtp-*.mjs`, `emdash-runtime-*.mjs`, `astro/routes/api/settings/email.mjs`).
What was run for real is listed at the end; everything else is read from the code and says so.

## Which emails exist

| Email | Sent by | When |
| --- | --- | --- |
| Order confirmation (with a **View your order** link) | the Stripe plugin (`order.paid` subscriber) | the webhook marks the order paid |
| Payment failed, refund issued | the Stripe plugin | `order.payment_failed`, `order.refunded` |
| Guest order link ("your link to order ORD-…") | the Stripe plugin (`POST /orders/access-link`, the `/orders/lookup` form) | a buyer asks for a new link |
| Magic link, invite | EmDash core (system mail) | admin sign-in by email, inviting a user |
| Test email | EmDash admin (Settings → Email) | you press **Send test email** |

The plugin only asks the pipeline to send (`ctx.email.send`, capability `email:send`). It does not choose the transport.
Plugin mail can be switched off (`emails.isEnabled`); core system mail cannot.

If delivery fails the shop does **not** tell the buyer: `/orders/lookup` and `POST /orders/access-link` answer the same
success message whether or not an order matched or a mail went out (this is deliberate, so the form cannot be used to probe
for orders). A failed send is a log line (`Email could not be sent`, `Order access link not sent: no email provider accepted
it`, or `SMTP delivery failed` with the SMTP step) and the order's timeline has no `Email sent: …` entry. So after setup,
**test by sending**, do not assume.

## How the provider is chosen

EmDash has exactly one active `email:deliver` provider (an exclusive hook). Three kinds can exist:

| Provider | Present | Chosen |
| --- | --- | --- |
| Console (`emdash-console-email`) | only in `astro dev` | automatically when nothing else is complete. Captured mails are listed at `/_emdash/api/dev/emails` (needs the dev login). |
| Built-in SMTP (`emdash-builtin-smtp`) | always registered | automatically when the `EMAIL_SMTP_*` environment variables are **complete and valid** (also in dev: it then wins over the console). Otherwise only by choice: save SMTP settings in the admin, or select it. |
| A provider plugin with an `email:deliver` hook | when installed and active | by choice, in Settings → Email. |

The choice is stored in the database (`emdash:exclusive_hook:email:deliver`) and wins over the automatic pick. SMTP
settings saved in the admin win over the environment, **on every send**, so a change applies without a restart.

On a fresh deploy with no `EMAIL_SMTP_*` set and nothing saved, there is no provider: `ctx.email` reports unavailable, the
plugin logs `Email not sent: no email provider accepted it`, and the admin's test email answers `EMAIL_NOT_CONFIGURED` (503).

## Configure SMTP

Either way works on both targets. Use **port 587 (STARTTLS)** or **465 (implicit TLS)**.

### A. Environment variables (simplest, no admin step)

| Variable | Required | Notes |
| --- | --- | --- |
| `EMAIL_SMTP_HOST` | yes | Its presence turns the env config on. |
| `EMAIL_SMTP_PORT` | no | Default `587`. **`25` is refused.** |
| `EMAIL_SMTP_SECURE` | no | `starttls` (default) or `tls` (default when the port is `465`). |
| `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS` | yes | Both, or the whole config is ignored (with a log warning). |
| `EMAIL_SMTP_FROM_EMAIL` (+ `EMAIL_SMTP_FROM_NAME`) or `EMAIL_SMTP_FROM` (`Name <addr>`) | when the user is not an address | The sender. When unset EmDash uses the SMTP user, which fails if the user is not an address (an API-key user such as `apikey`). |
| `EMAIL_SMTP_REPLY_TO` | no | Default reply-to. |

- **Node:** put them in the process environment, or in `apps/storefront/.env` (`pnpm dev` and `pnpm start` load it). A
  commented block is in `apps/storefront/.env.example`.
- **Cloudflare:** the password is a secret, the rest are plain vars:
  `wrangler secret put EMAIL_SMTP_PASS`, and `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` / `EMAIL_SMTP_USER` /
  `EMAIL_SMTP_FROM_EMAIL` under `vars` in `wrangler.jsonc` or in the dashboard. They reach EmDash through `process.env`,
  which `nodejs_compat` fills (`docs/cloudflare.md`). Do not put the password in `vars`.
  **Trap, local Cloudflare dev:** `wrangler.jsonc` here declares `secrets.required`, and with it a `.dev.vars` entry whose
  name is not listed does **not** reach `process.env` (run: `EMAIL_SMTP_*` in `.dev.vars` were ignored, the console provider
  stayed active; listing the four names made EmDash pick SMTP from env). For a local Cloudflare run use option B below, or
  list the names temporarily. What a *deployed* Worker does with an unlisted `wrangler secret put` was not tested, so after
  deploying check `GET /_emdash/api/settings/email`: `smtp.source` must say `env` (or use option B). Details:
  `.ai/memory/wrangler-passes-only-required-secrets-to-the-worker.md`.
- A new variable needs a restart (Node) or a deploy (Cloudflare).

### B. Settings → Email in the admin

Admin, **Settings → Email**: host, port, security, user, password, sender. The password is stored **encrypted** in the
database, so `EMDASH_ENCRYPTION_KEY` must be set (it is already required for the shop). Saving activates SMTP. The same thing
over HTTP (permission `settings:manage`): `GET`/`PUT`/`POST /_emdash/api/settings/email` (read state, save, send a test).
`GET` shows the host, port, user and whether the settings come from `db` or `env`, never the password.

Use B when you do not want credentials in the Worker config, or when the person running the shop is not the one deploying.

### A worked example: Brevo (any relay with SMTP credentials works the same)

Create an SMTP key in your relay, verify your sending domain (SPF/DKIM) there, then:

```bash
EMAIL_SMTP_HOST=smtp-relay.brevo.com
EMAIL_SMTP_PORT=587                      # STARTTLS
EMAIL_SMTP_USER=<your SMTP login>
EMAIL_SMTP_PASS=<the SMTP key, not the account password>
EMAIL_SMTP_FROM_EMAIL=orders@yourshop.example   # an address on the verified domain
EMAIL_SMTP_FROM_NAME=Your Shop
```

The host names and ports of other relays differ, the shape does not: Postmark `smtp.postmarkapp.com:587`, Amazon SES
`email-smtp.<region>.amazonaws.com:587`, Resend `smtp.resend.com:465` (user `resend`, password the API key; set
`EMAIL_SMTP_FROM_EMAIL`), Mailgun `smtp.mailgun.org:587`. These come from the providers' public SMTP guides and were **not
run** here; check your provider's current page. The sender domain must be verified with the relay or it answers `550`.

What EmDash's SMTP client does not do (so check before choosing a provider):

- **No port 25**, and **no plaintext**: STARTTLS is required on 587 (it refuses a server that does not offer it), the
  certificate is verified normally.
- **Login by `PLAIN` or `LOGIN` only.** No OAuth2: a Gmail or Microsoft 365 mailbox needs an app password (or is not usable
  if the provider disabled basic auth).
- 25 s per message (the hook is cut at 30 s), one message per connection.

## Cloudflare Workers

EmDash's SMTP client opens its socket with `node:net` / `node:tls` (it has a workerd-specific TLS branch, and EmDash's
build leaves `cloudflare:sockets` to the runtime). **Run under workerd (`pnpm --filter @emdash-commerce/storefront
dev:cloudflare --port <port>`, local, not a deployed Worker):** saving SMTP in Settings → Email (API) worked, and a test send
reached `smtp.gmail.com:587`, upgraded the connection with STARTTLS against Google's real certificate and got Google's `535`
for deliberately fake credentials. So the TCP connect, the STARTTLS upgrade and the login exchange work on workerd. A message
**accepted by a relay from a Worker was not run**, and neither was a deployed Worker (outbound ports and limits there were not
checked; port 25 is refused by EmDash itself anyway).

If SMTP is not an option for your relay (some providers only offer an HTTP API), the seam is a provider plugin: any plugin with the `hooks.email-transport:register` capability and an exclusive
`email:deliver` hook becomes selectable in Settings → Email, and an HTTP provider needs only `fetch`
(`apps/storefront/.agents/skills/creating-plugins/references/hooks.md` shows a Resend example). **This repo ships no such
plugin**; whether a community one fits your provider is not something this repo checked.

## Test it

1. **Provider state.** Admin → Settings → Email shows the active provider; or `GET /_emdash/api/settings/email` and check
   `available: true` and `selectedProviderId`.
2. **Test email.** **Send test email** in the same screen (or `POST /_emdash/api/settings/email` with `{"to": "you@…"}`).
   A failure answers `EMAIL_TEST_ERROR` (the run showed only a generic message in the response); the reason is in the server
   log (`535` login rejected, `550` sender or recipient refused, no STARTTLS, a timeout).
3. **The shop's own mail.** Place a sandbox order with your own address; the confirmation should arrive, and the order's
   timeline (Orders collection) gets `Email sent: order.paid`. Then request a new link on `/orders/lookup` with the same
   address and order number; the mail "your link to order ORD-…" should arrive and its link open `/orders/view`.
4. **If nothing arrives:** the Worker or server log. Search `SMTP delivery failed` (it carries host, port and the last
   protocol steps, never credentials), `Email could not be sent`, `no email provider accepted it`.

`pnpm run doctor` (bare `pnpm doctor` is pnpm's own command and does nothing) reports whether `EMAIL_SMTP_*` in `apps/storefront/.env` form a config EmDash accepts (it checks the same rules,
never prints a value). It cannot see settings saved in the admin or the secrets of a deployed Worker, so a "todo" there is
expected for a site configured through the admin.

### Trying real delivery locally

To see the real SMTP path without a provider, point `EMAIL_SMTP_*` at a local sink. EmDash demands STARTTLS and verifies the
certificate, so a plain-text sink (`smtp-sink`, `MailHog` without TLS) is refused. Use one with TLS and a certificate for
`localhost` that Node trusts: `NODE_EXTRA_CA_CERTS=/path/to/that-cert.pem pnpm dev`. Accept any user and password. Turn the
variables off again afterwards: with a complete set the console provider is bypassed.

## What was verified

- Node target, `astro dev` on a throwaway database, a real Stripe sandbox purchase (hosted Checkout, `stripe listen`) with
  `EMAIL_SMTP_*` pointing at a local STARTTLS sink: the order confirmation and, after `POST /orders/access-link`, the
  access-link mail arrived at the sink with the right envelope recipient, the configured sender and the login; the link
  inside opened `/orders/view` with status 200 and the order. Nothing in the dev mailbox: SMTP replaced the console provider.
- The `pnpm run doctor` check is unit tested (`scripts/lib/bootstrap-env.test.mjs`).

- Cloudflare dev server (workerd): the settings API saved SMTP and an env-configured SMTP was auto-selected once the names were
  in `secrets.required` (see the trap above); the STARTTLS exchange against a real server is described in the Workers section.

Not verified: a real relay that accepts a message (Brevo, Postmark, SES, Resend…), a real inbox, spam placement, SPF/DKIM, the
admin **screen** (only its API), a deployed Cloudflare Worker (a message sent from one), a provider plugin, the
`/orders/lookup` form on the SMTP path (the API route it calls was used).
