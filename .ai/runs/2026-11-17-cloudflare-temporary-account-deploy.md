# Real Cloudflare deploy attempt on a temporary preview account

Goal: deploy the generated template with `wrangler deploy --temporary`, set up the shop and buy through hosted Checkout.

Steps and outcome:

1. Merged `t3/implement-roadmap-items`; `pnpm template:cloudflare` into a scratch dir outside the repo, `pnpm install
   --ignore-workspace` (12 s), `pnpm run build` (about 9 s).
2. `wrangler deploy --temporary` (4.164.0): account created. Upload failed, asset over 5 MiB (`lib.*.js`, 5 724 665 bytes).
   A scratch-only chunk split got past it.
3. Then: required secrets missing (needs `--secrets-file`); with the file D1 and KV were created, R2 was not (403 on the bucket
   lookup) and the Worker upload failed with code 10085. `r2 bucket create --temporary` answered code 10000.
4. Stopped as instructed (a binding the temporary account does not support). The setup wizard, PAT, seed, webhook, purchase,
   cron and optional-secret checks did not run. No Stripe webhook was registered, no PAT exists, no Worker was created.

Teardown: D1 database and KV namespace deleted on the temporary account, cached account file and Wrangler logs of the run
removed, scratch directory deleted; the account itself expires on its own (claim window 60 minutes). The claim URL was
never written anywhere.

Verification: `pnpm check:ai`. Facts recorded in `docs/cloudflare.md` and `.ai/memory/cloudflare-temporary-account-cannot-host-the-shop.md`.

Follow-ups: repeat on a real Cloudflare account with R2 (steps 3 to 7 of the original brief).
