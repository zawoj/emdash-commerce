---
name: stripe-listen-needs-an-event-selection
description: Stripe CLI 1.55 exits with "must specify events to forward" for a bare stripe listen --forward-to; add --all-snapshot (or --events); the key can come from STRIPE_API_KEY instead of a login
metadata:
  type: project
---

# `stripe listen --forward-to ...` alone no longer starts (CLI 1.55.11)

Verified 2026-11-17 on Stripe CLI 1.55.11: `stripe listen --forward-to localhost:4380/...` prints
`must specify events to forward using --events, --all-snapshot, or --all-thin` and exits 1, so a script that waits for
"Ready!" fails. `--all-snapshot` restores the old behaviour for the plugin's webhook (it handles or ignores every snapshot
event). `docs/getting-started.md` still shows the bare command: add the flag there if you hit this.

- `stripe listen --print-secret` prints the signing secret for the account behind the CLI's login; with `STRIPE_API_KEY=<key>` in
  the environment it prints the secret of **that key's account** (the same value when the login and the key belong to one
  sandbox). Use the environment variable, not `--api-key`: a command-line key is visible in the process list.
- The signing secret is printed in the `Ready!` line too, so a `stripe listen` log must never be uploaded or pasted.
