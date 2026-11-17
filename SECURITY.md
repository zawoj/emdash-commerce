# Security Policy

emdash-commerce is a community commerce stack for [EmDash](https://github.com/emdash-cms/emdash): a Stripe-backed storefront demo, the `stripe-commerce` plugin, an image-hotspots field widget, and a shared design system. It handles payments (sandbox in local work), webhooks, order access links, plugin secrets, and admin/MCP surfaces. Report suspected vulnerabilities **privately** so maintainers can triage and fix them before public disclosure.

## Supported Versions

Security reports should target the current `main` branch and the latest published `@emdash-commerce/*` packages unless maintainers document additional supported release lines.

## Reporting a Vulnerability

Use GitHub’s private vulnerability reporting for this repository **only** — do not email maintainers:

1. Open the repository **Security** tab.
2. Choose **Report a vulnerability**.
3. Include enough detail for maintainers to reproduce and assess the issue.

If you already opened a private GitHub security advisory, keep follow-up discussion in that advisory thread. Avoid opening public issues for exploitable details; a public issue may be used only to ask for routing or status without sharing sensitive technical information.

## What to Include

Please include:

- affected package, app, script, or configuration;
- affected version, commit, or deployment mode (local Node + SQLite vs a Cloudflare-style deployment you built yourself);
- clear reproduction steps or a minimal proof of concept;
- expected impact and any privilege or authentication requirements;
- relevant logs, screenshots, request/response snippets, or stack traces with **secrets redacted** (Stripe keys, webhook secrets, `EMDASH_ENCRYPTION_KEY`, order access tokens, admin session material).

## In-Scope Examples

High-signal reports for **this repository** may include:

- Stripe webhook signature verification bypass or accepting unsigned webhooks;
- trusting cart totals, prices, or discounts from the browser instead of server-derived amounts;
- leaking or forging **order access tokens** (guest order links);
- secrets (Stripe keys, encryption keys, plugin settings) written to logs, error pages, or client-visible responses;
- missing or weak **admin or MCP permission checks** in plugin routes or tools;
- authorization bugs that expose another shopper’s cart, checkout, or order data;
- unsafe handling of uploaded media or user-controlled URLs in storefront or plugin code shipped here.

## Out of Scope

Report issues in **upstream** projects to those projects:

- [EmDash](https://github.com/emdash-cms/emdash) (CMS core, admin, auth, plugin sandbox);
- [Astro](https://github.com/withastro/astro);
- [Stripe](https://stripe.com) APIs and Dashboard configuration;
- [Cloudflare](https://www.cloudflare.com) Workers/D1/R2 unless introduced solely by code in this repo.

Lower-signal or usually out-of-scope reports include scanner output without reproduction, issues requiring a maintainer’s live credentials, denial-of-service without a realistic impact path, dependency version age without exploitability, and social engineering.

## Coordinated Disclosure

Maintainers aim to acknowledge valid-looking reports promptly, triage severity, and keep reporters updated while a fix is prepared. Please do not publicly disclose details until maintainers have had a reasonable opportunity to investigate, patch, and publish upgrade guidance.

## Safe Harbor

Good-faith research is welcome on your own deployments and test Stripe sandboxes. Do not access, modify, or exfiltrate others’ data; do not disrupt live services; stop testing if you encounter sensitive information unrelated to your report.