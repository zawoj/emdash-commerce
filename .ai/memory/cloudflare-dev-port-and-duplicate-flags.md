---
name: cloudflare-dev-port-and-duplicate-flags
description: astro dev fails ("exited before becoming ready") when --port is given twice, so the *:cloudflare scripts do not pin a port; and a port the shell reports free may be held by another agent's static server
metadata:
  type: project
---

# Pass the port to `dev:cloudflare`, the script does not pin one

`pnpm dev:cloudflare --port 4361` appends the flag to the script's command line. With the script as
`astro dev --port 4360` the line became `--port 4360 --port 4397`, and Astro answered
`Dev server process exited before becoming ready` (no further message). So `dev:cloudflare` and `preview:cloudflare` carry no
`--port` (Astro's default is 4321); the docs pass `--port 4361` so it never collides with the Node `pnpm dev` on 4360.

Related findings from the same session:

- Under an AI-agent environment Astro 7 always starts the dev server in the background; `--ignore-lock` is refused there. Use
  `astro dev status`, `logs` and `stop` (in `apps/storefront`).
- A port can be held by something unrelated (a `python -m http.server 4391` of another agent made `curl localhost:4391` answer
  200). Check `lsof -iTCP:<port> -sTCP:LISTEN` before trusting a 200.
- A local D1 lives in `apps/storefront/.wrangler/state`, shared by `astro dev` (workerd through the adapter) and `wrangler dev`
  of the built Worker, so a seed made under one is visible in the other (stop one before starting the other). The site URL
  stored by the first setup is the port you seeded on: run the built Worker on that same port or checkout answers
  `NOT_CONFIGURED` (`emdash-site-url-is-read-at-startup`).
