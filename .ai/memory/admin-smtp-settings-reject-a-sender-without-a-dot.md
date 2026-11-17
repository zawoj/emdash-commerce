---
name: admin-smtp-settings-reject-a-sender-without-a-dot
description: PUT /_emdash/api/settings/email validates fromEmail as an email with a dotted domain, so shop@localhost is refused there while EMAIL_SMTP_FROM_EMAIL=shop@localhost works; the body is {provider:"smtp", smtp:{...}}
metadata:
  type: project
---

# The admin SMTP API is stricter about the sender than the environment

Found 2026-11-17 while pointing the Cloudflare dev server at Mailpit.

- `PUT /_emdash/api/settings/email` needs `{ "provider": "smtp", "smtp": { host, port, secure, user, pass, fromEmail } }`. A body
  without `provider` answers `VALIDATION_ERROR` (`Expected 'smtp' | 'plugin'`).
- `fromEmail` goes through zod `email()`: `shop@localhost` answers `smtp.fromEmail: Invalid email address`. Use a dotted domain
  (`shop@mailpit.test`). The same address in `EMAIL_SMTP_FROM_EMAIL` is accepted and delivered on the Node target.
- The `POST` test send answers 200 while the console provider is still active (nothing reaches the sink): a failed `PUT` does not
  fail the test. Check `GET /_emdash/api/settings/email` (`selectedProviderId`) or the log line `email delivered via SMTP`.
