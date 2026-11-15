---
name: emdash-plugin-stripe-resync-is-slow-by-design
description: A catalog resync only queues links; the cron task syncs 25 per five minutes, so a seeded catalog is not in Stripe for ~40 minutes unless something drives admin/catalog/sync
---

# A resync queues, it does not sync

`admin/catalog/resync` (Commerce page button, `commerce_catalog_resync`) marks every link `pending`; the work is done by
the `catalog-sync` maintenance step: 25 links per run, every five minutes (`MAINTENANCE.catalogBatch`). The demo catalog
has ~200 links, so after `pnpm seed` the first checkout failed with NOT_SYNCED until someone resynced and waited.

- `admin/catalog/sync` (`commerce_catalog_sync`) runs a batch now and answers `{ processed, due, failed }`; repeat until
  `due` is 0. `scripts/seed-demo.mjs` does exactly that at the end (sandbox key only, timeout
  `SEED_SYNC_TIMEOUT_SECONDS`).
- Syncing a product also syncs its dependents, so `due` can drop by more than `processed`.
- A link that fails backs off (30 s up to 30 min) and is not "due" meanwhile: `failed > 0` with `due = 0` means look at
  the Commerce page, usually key permissions.
- Without a Stripe key nothing is queued usefully: the seed prints what to run later instead.
