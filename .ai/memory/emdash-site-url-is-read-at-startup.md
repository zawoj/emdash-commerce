---
name: emdash-site-url-is-read-at-startup
description: On an empty database the first checkout answers NOT_CONFIGURED (redirect URL outside the allowed origins) until the dev server is restarted once - the site URL is stored by setup but read at startup
---

# Site URL is read at startup (fresh database)

Found while re-creating the QA instance from scratch (delete `data.db*` and `uploads`, start on port 4370, `pnpm seed`).
The seed's dev login runs the setup, which stores `emdash:site_url` (`http://localhost:4370`) in the options table, but the
plugin context (`ctx.site.url`, used by `services/checkout/urls.ts` to build and check the success and cancel URLs) was
resolved when the server started, from an empty database. The first `POST checkout` therefore answered
`NOT_CONFIGURED: A checkout redirect URL points outside the site's allowed origins`; after one restart it worked.

- Not a plugin bug: the allowed-origin check is correct, the site URL it compares with was stale.
- Fix for a newcomer: restart the server once after the first seed (documented in `docs/getting-started.md`).
- Related: another port than the default needs the same URL in the setup, so start the server on the port you seed against.
