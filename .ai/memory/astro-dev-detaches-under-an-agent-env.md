---
name: astro-dev-detaches-under-an-agent-env
description: when a tool starts astro dev from an AI-agent shell Astro 7 detaches the server and refuses --ignore-lock; set ASTRO_DEV_BACKGROUND=1 to get a foreground process you can own and kill
metadata:
  type: project
---

# `astro dev` goes to the background by itself in an agent shell

Astro 7 detects an AI agent in the environment and, instead of running in the foreground, starts the dev server in the
background (the command returns at once; `astro dev status|logs|stop` manage it) and rejects `--ignore-lock` there
(`cannot be used together with an auto-detected AI agent environment`). A test runner that spawns `astro dev` and later wants
to stop it would hold the pid of a launcher that already exited.

`ASTRO_DEV_BACKGROUND=1` in the child's environment turns the detection off (Astro sets it itself for the background child), so
`astro dev --port N --ignore-lock` runs in the foreground, in the process group the caller spawned. `e2e/support/server.ts`
does this; without `--ignore-lock` a second dev server in the same checkout would refuse to start on the lock file.

Related: [[cloudflare-dev-port-and-duplicate-flags]] (the same detaching seen from `dev:cloudflare`).
