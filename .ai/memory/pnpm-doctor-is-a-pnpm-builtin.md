---
name: pnpm-doctor-is-a-pnpm-builtin
description: bare `pnpm doctor` runs pnpm's own (silent) command, not the root script; the health check is `pnpm run doctor` or `node scripts/bootstrap.mjs --check`
metadata:
  type: project
---

# `pnpm doctor` does not run our health check

Seen 2026-11-17 on pnpm 10.33.0: `pnpm doctor` prints nothing and exits 0 (it is pnpm's built-in "checks for known common
issues", `pnpm help doctor`), so the root script `"doctor": "node scripts/bootstrap.mjs --check"` is shadowed. `pnpm run doctor`
and `node scripts/bootstrap.mjs --check` print the report. Since 2026-11-17 every doc and comment says `pnpm run doctor`;
keep writing it that way (the script name stays `doctor` so `pnpm run doctor` and old habits keep working).
