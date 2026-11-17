---
name: emdash-smtp-provider-rules
description: EmDash 1.5's built-in SMTP provider refuses port 25 and plaintext, verifies the certificate, needs a sender when the user is not an address, wins over the dev console when EMAIL_SMTP_* are complete, and is silent to the buyer on failure — traps when testing with a local sink
metadata:
  type: project
---

# EmDash 1.5 built-in SMTP provider: the rules that bite

Read from `emdash/dist/email-smtp-*.mjs` and `emdash-runtime-*.mjs`, run against a local STARTTLS sink on 2026-11-17.

- **Selection.** A complete, valid `EMAIL_SMTP_*` set makes `emdash-builtin-smtp` the automatic pick, ahead of the dev console, so
  leaving it in `.env` means no mail shows at `/_emdash/api/dev/emails`. Without env the provider is registered but manual
  (Settings → Email or `PUT /_emdash/api/settings/email`). Admin-saved settings win over env on every send.
- **An invalid env set is ignored with a log warning** (`Ignoring SMTP environment variables: …`), not an error: port 25, a bad
  `EMAIL_SMTP_SECURE`, missing user or password. `pnpm run doctor` mirrors those rules (`smtpEnvStatus`).
- **Sender.** Without `EMAIL_SMTP_FROM_EMAIL` / `EMAIL_SMTP_FROM` the sender is the SMTP user; a user such as `apikey` fails the
  envelope check. The admin API refuses to save it without `fromEmail`.
- **TLS is mandatory and verified.** STARTTLS must be offered (otherwise "does not offer STARTTLS"), no plaintext fallback, port
  25 refused. A local sink therefore needs a certificate for `localhost` that Node trusts (`NODE_EXTRA_CA_CERTS=cert.pem`),
  with `AUTH PLAIN` or `LOGIN` advertised after the upgrade. workerd does not read `NODE_EXTRA_CA_CERTS`, so a self-signed sink
  cannot be used from the Cloudflare dev server (implicit TLS: "Failed to connect"; STARTTLS: fails at the upgrade).
- **Bodies are base64**, subjects are RFC 2047 encoded when non-ASCII: decode before grepping a captured message.
- **The shop never shows a delivery failure.** `/orders/lookup` and `POST /orders/access-link` answer the same success whether
  the mail went out or not (by design). The signals are the log (`SMTP delivery failed`, trace of the last SMTP steps) and a
  missing `Email sent:` entry in the order timeline.
- Under workerd (local, `astro dev`) the client reached smtp.gmail.com:587, completed STARTTLS against its real certificate and
  got `535` for deliberately fake credentials: the TCP + TLS upgrade path works on workerd; a delivered message on a deployed
  Worker was not run.
