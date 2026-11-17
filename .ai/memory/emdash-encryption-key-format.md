---
name: emdash-encryption-key-format
description: EMDASH_ENCRYPTION_KEY must be emdash_enc_v1_ + 43 base64url characters since EmDash 1.5 - a bare hex key makes plugin secrets and guest order links fail with a 500
---

# `EMDASH_ENCRYPTION_KEY` is not a hex key any more

EmDash 1.5 (`src/config/secrets.ts`) accepts only `emdash_enc_v1_` followed by 43 base64url characters (32 random bytes, 57
characters in all), or a comma-separated list of them for rotation. `bootstrap`, `.env.example` and the docs used to say
"64-character hex, `openssl rand -hex 32`"; a key made that way is rejected.

What a bad key looks like (it does not stop the dev server, it breaks everything that reads a plugin secret):

- the `commerce-maintenance` cron logs `EmDashSecretsError: EMDASH_ENCRYPTION_KEY entry is malformed`;
- `orders/view`, `orders/access-link`, `customer/portal` (anything that needs the access-token secret) answer 500 `INTERNAL`
  instead of 401 or `NOT_CONFIGURED`;
- saving a secret in the admin fails.

Rules:

- Make a key with `pnpm bootstrap` (`encryptionKeyFrom` in `scripts/lib/bootstrap-env.mjs`) or `npx emdash secrets generate`.
  `pnpm doctor` fails a key in any other shape (`isEncryptionKey`).
- Never swap the key on a database that has already stored a secret: the generated access-token secret is encrypted with it,
  and the next read answers `PluginSettingEncryptionError: encrypted with an unavailable key` (500). Restore the old key, or
  reset `apps/storefront/data.db*` and seed again.
- Do not "fix" a 57-character key because it is not 64 hex characters: that is the valid shape.
