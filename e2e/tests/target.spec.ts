import { expect, test } from "@playwright/test";

import { IS_CLOUDFLARE, RUNTIME_PROOF_ENV, TARGET } from "../support/config";
import { RUNTIMES } from "../support/server";

// The same specs run on both targets, so this one proves the target is the one that was asked for: the setup measured
// the runtime of the server it started (a `workerd` process in the server's process group or none), independent of the
// `E2E_TARGET` setting that chose it. A switch that started the wrong server fails here, not silently everywhere.
test.describe("target", () => {
	test(`the server runs on ${TARGET}`, async ({ request }) => {
		expect(process.env[RUNTIME_PROOF_ENV]).toBe(IS_CLOUDFLARE ? RUNTIMES.workerd : RUNTIMES.node);
		// And it is a working shop, not just the right process.
		const response = await request.get("/shop");
		expect(response.status()).toBe(200);
	});
});
