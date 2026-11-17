import { DEPLOY_BUTTON_URL, MODES, REPO_URL } from "./constants.mjs";

/** `.dev.vars.example` of the generated copy (the app's own one points at monorepo scripts). */
export const DEV_VARS_EXAMPLE = `# Secrets for local development (\`pnpm dev\`, \`wrangler dev\`): copy this file to .dev.vars. Never commit .dev.vars.
# In production set them as Worker secrets: \`pnpm exec wrangler secret put <NAME>\` (or type them into the Deploy form).

# emdash_enc_v1_ + 43 base64url characters. Generate: npx emdash secrets generate
# Never change it once the database holds a secret.
EMDASH_ENCRYPTION_KEY=replace-with-emdash-secrets-generate

# Stripe sandbox secret or restricted key (sk_test_... / rk_test_...). Never a live key unless the site is meant to be live.
STRIPE_SECRET_KEY=sk_test_replace_me

# Optional on a deployed site: press "Register webhook" in the Commerce admin page instead.
# Locally: the whsec_... that \`stripe listen\` prints.
STRIPE_WEBHOOK_SECRET=whsec_replace_me

# Optional: signs the links in guest order emails. Generated on first use when EMDASH_ENCRYPTION_KEY is set.
# COMMERCE_ACCESS_TOKEN_SECRET=
`;

/** README.md of the generated repo. */
export const buildReadme = ({ mode, sourceSha }) => {
	const packagesLine =
		mode === MODES.VENDOR
			? "The three `@emdash-commerce/*` packages (`design-system`, `plugin-stripe`, `plugin-image-hotspots`) are **vendored** in `vendor/`, exactly as `pnpm pack` would ship them, and installed with `file:` specs, so the repo builds on its own with no workspace and no npm release."
			: "The three `@emdash-commerce/*` packages are installed from npm.";
	return `# EmDash Commerce — Cloudflare template

> **Unofficial community demo.** A mock Cloudflare-merch store (fictional products, USD, generated art) built on
> [EmDash](https://github.com/emdash-cms/emdash). It is **not** an official EmDash or Cloudflare product.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](${DEPLOY_BUTTON_URL})

An Astro 7 SSR storefront on EmDash with the Stripe commerce plugin, on **Cloudflare Workers + D1 + R2** (plus the \`EmDashRoom\`
Durable Object for co-editing and a cron trigger). It is a self-contained copy of \`apps/storefront\` from
[zawoj/emdash-commerce](${REPO_URL}).

> **This repository is generated.** It is rebuilt from the monorepo by \`pnpm template:cloudflare\` (workflow
> \`.github/workflows/cloudflare-template.yml\`) and force-pushed to the \`cloudflare-template\` branch. Do not send changes here:
> open them against [${REPO_URL.replace("https://github.com/", "")}](${REPO_URL}).${sourceSha ? ` Generated from commit \`${sourceSha}\`.` : ""}

${packagesLine}

## Deploy

1. Press the button above. Cloudflare clones this branch into your account and provisions the D1 database and the R2 bucket.
2. Fill the two required secrets in the form (they are Worker secrets, never committed):
   - \`EMDASH_ENCRYPTION_KEY\` — \`emdash_enc_v1_\` + 43 base64url characters. Generate it with \`npx emdash secrets generate\`.
     Keep a copy: D1 backups do not contain it, and changing it makes stored secrets unreadable.
   - \`STRIPE_SECRET_KEY\` — a Stripe **sandbox** key (\`sk_test_...\` / \`rk_test_...\`) from the Stripe dashboard.
3. Open \`https://<your worker>/_emdash/admin\`, finish the setup wizard, then **Plugins → Stripe commerce → Register webhook**.
   That stores the webhook signing secret encrypted in D1, so \`STRIPE_WEBHOOK_SECRET\` is optional.
4. Set up email (order confirmations and guest order links need an SMTP provider): Settings → Email in the admin, see
   [docs/email.md](${REPO_URL}/blob/main/docs/email.md).
5. Create products in the admin, or fill the mock catalog from a clone of the monorepo with an API token (Settings → API
   Tokens, scope \`admin\`): \`EMDASH_URL=https://<your worker> EMDASH_TOKEN=ec_pat_... pnpm seed\` — see
   [docs/production.md](${REPO_URL}/blob/main/docs/production.md), "Seeding a deployed site".

Build and deploy commands Cloudflare runs: \`pnpm run build\` (Cloudflare target) and \`pnpm run deploy\` (\`wrangler deploy\`).
The Workers **Paid** plan is needed in practice (CPU time and subrequest limits).

## Local development

\`\`\`sh
pnpm install
cp .dev.vars.example .dev.vars   # fill in the secrets
pnpm dev                          # astro dev on workerd, http://localhost:4361
pnpm build && pnpm exec wrangler dev   # the production bundle
pnpm typecheck
\`\`\`

Requires Node >= 24.22.1 (see \`engines\`). \`wrangler.jsonc\` names the database \`emdash-commerce\` and the bucket
\`emdash-commerce-media\`; rename them before the first deploy if you like.

## More

Everything else — the architecture, the plugin API, the Cloudflare guide, limits — lives in the monorepo:
[docs/cloudflare.md](${REPO_URL}/blob/main/docs/cloudflare.md) and [README](${REPO_URL}#readme). MIT licensed.
`;
};
