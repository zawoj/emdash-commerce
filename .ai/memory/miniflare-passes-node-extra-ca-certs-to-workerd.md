---
name: miniflare-passes-node-extra-ca-certs-to-workerd
description: the Cloudflare dev server (workerd) trusts a local CA when NODE_EXTRA_CA_CERTS is set for the astro process, because Miniflare reads the file at start; without it a self-signed SMTP sink fails with UnknownIssuer
metadata:
  type: project
---

# workerd does honour `NODE_EXTRA_CA_CERTS`, through Miniflare

Run 2026-11-17 (miniflare 5.20261116, workerd 1.20261116, wrangler 4.163): `dev:cloudflare` on a throwaway
`EMDASH_CLOUDFLARE_STATE_DIR`, EmDash SMTP saved through `PUT /_emdash/api/settings/email`, a Mailpit with a certificate signed
by a throwaway CA.

- With `NODE_EXTRA_CA_CERTS=<ca.pem>` in the environment of the `astro dev` process: the test email was delivered
  (`email delivered via SMTP`, the message is in Mailpit).
- Without it, same database and settings: `TLS handshake failed: invalid peer certificate: UnknownIssuer` (workerd's
  `kj-hyper/ffi.rs`), shown to the caller as `EMAIL_TEST_ERROR: SMTP delivery via localhost:2526 failed`.
- Why: Miniflare reads `process.env.NODE_EXTRA_CA_CERTS` once when it loads and adds the certificates to workerd's
  `trustedCertificates`. It is the **astro process's** variable that counts; it is not the Worker's `process.env`, which is why
  the `EMAIL_SMTP_*` names still have to come from Settings → Email ([[wrangler-passes-only-required-secrets-to-the-worker]]).
- The older claim that workerd cannot trust a self-signed sink was wrong for this version; nothing touches the keychain.
