---
name: cloudflare-temporary-account-cannot-host-the-shop
description: wrangler deploy --temporary (disposable account) cannot run this shop - 5 MiB per-asset limit hits an EmDash admin chunk, and R2 is forbidden so the MEDIA bucket cannot exist; also a first deploy refuses missing required secrets
metadata:
  type: project
---

# `wrangler deploy --temporary` cannot host the shop (checked 2026-11-17, wrangler 4.164.0)

`--temporary` is a hidden flag (commands with `supportTemporary`): no login, a proof-of-work challenge, an account valid
60 minutes unless claimed, cached in `~/Library/Preferences/.wrangler/wrangler-temporary-account.toml` (holds the token and the
claim URL: delete it, never paste it). `wrangler d1 list|delete` and `kv namespace delete` accept `--temporary` too.
(`wrangler r2 bucket create --temporary` accepts the flag but fails, see below.)

Three things stop a deploy of the generated template:

1. **Assets: 5 MiB per file** (`Invalid manifest: file size of 5724665 exceeds 5242880 limit [code: 10304]`). The file is the
   EmDash admin chunk `_astro/lib.*.js` (ProseMirror + lowlight). A normal account takes 25 MiB. Splitting it with
   `vite.build.rolldownOptions.output.advancedChunks` in a scratch copy got all 206 assets uploaded (largest left 5.05 MB, a
   hair under the limit), so it is a limit of the account type, not a shop bug; the repo build was left alone.
2. **R2 is forbidden.** `GET /r2/buckets/<name>` answers 403, so Wrangler does not auto-create the named bucket and the
   upload dies with `R2 bucket '...' not found [code: 10085]`; `r2 bucket create` answers `Authentication error [code: 10000]`.
   `MEDIA` is a hard dependency (uploads, seed media), so there is no honest temporary-account run.
3. **A first deploy needs the required secrets** (`The following required secrets have not been set`, the Worker does not exist
   yet so `secret put` cannot run first): use `wrangler deploy --secrets-file <file outside the repo, mode 600>`.

D1 (`DB`) and the KV namespace (`SESSION`) *were* auto-created on the temporary account; clean them up
(`wrangler d1 delete <name> -y --temporary`, `wrangler kv namespace delete --namespace-id <id> --temporary`).

A real deploy check therefore needs a real (or claimed, with R2 enabled) Cloudflare account. Details: `docs/cloudflare.md`
("Verified on a real deploy").
