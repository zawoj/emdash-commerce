---
"@emdash-commerce/plugin-stripe": patch
---

Saving many variants at once no longer loses managed prices, and saving without a Stripe key no longer touches the rows. The managed price of each variant is now converged under its own lock instead of one lock per product: twenty variant saves used to queue behind each other past EmDash's 5 s hook timeout, and a variant whose hook timed out was left without a price (its option showed as unavailable) and could leave its lock held for five minutes. Without a Stripe key, a price or variant save also no longer gets `stripe_sync_status = failed` written into its row right after the save, a write that on Cloudflare D1 could collide with the next save or publish of the same row (`409 CONFLICT`, "Content changed while the operation was in progress"); the sync link still records the failure and backs off, and a real Stripe error still marks the row `failed`.
