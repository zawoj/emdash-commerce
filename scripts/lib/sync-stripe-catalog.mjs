/**
 * The seed's last step: get the demo catalog into Stripe. Publishing queues the catalog, but nothing waits for it,
 * so the first checkout would find prices that are not synced. This queues a full resync and runs the due syncs
 * itself (`admin/catalog/sync`, a batch per call) until nothing is due or the timeout passes.
 *
 * `call(method, path, { body })` is the seed's authenticated JSON caller and answers the parsed response; the
 * collaborators are injected so the polling can be tested without a server.
 */

const LATER =
	'Run it later: set STRIPE_SECRET_KEY, restart the server, open Commerce in the admin and press "Resync catalog" (or call the commerce_catalog_resync MCP tool), then run `pnpm seed` again to finish.';

const unwrap = (response) => response.data ?? response;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @returns {Promise<"synced" | "no-key" | "not-sandbox" | "timeout" | "failed">} */
export const syncStripeCatalog = async ({ call, plugin, timeoutMs, log = console.log, sleep = defaultSleep, now = Date.now }) => {
	const status = unwrap(await call("POST", `/plugins/${plugin}/admin/status`, { body: {} }));
	if (!status.stripe?.isKeyPresent) {
		log(`stripe: no key configured, catalog not synced. ${LATER}`);
		return "no-key";
	}
	if (status.stripe.mode !== "test") {
		log("stripe: the configured key is not a sandbox key, so the seed does not sync the catalog. Use a sandbox key for demo data.");
		return "not-sandbox";
	}
	const { queued } = unwrap(await call("POST", `/plugins/${plugin}/admin/catalog/resync`, { body: {} }));
	log(`stripe: ${queued} catalog entities queued, syncing...`);
	const deadline = now() + timeoutMs;
	let progress = { processed: 0, due: queued, failed: 0 };
	let total = 0;
	while (now() < deadline) {
		progress = unwrap(await call("POST", `/plugins/${plugin}/admin/catalog/sync`, { body: { limit: 25 } }));
		total += progress.processed;
		if (progress.due === 0) break;
		if (progress.processed === 0) await sleep(2000);
	}
	if (progress.due > 0) {
		log(
			`stripe: timed out after ${timeoutMs / 1000}s with ${progress.due} entities still due (${total} synced). The maintenance task keeps going in the background; run \`pnpm seed\` again or press "Resync catalog" in the admin to finish.`,
		);
		return "timeout";
	}
	if (progress.failed > 0) {
		log(`stripe: ${total} entities synced, ${progress.failed} failed and will retry with backoff. Check the Commerce page in the admin for the error (key permissions are the usual cause).`);
		return "failed";
	}
	log(`stripe: catalog synced (${total} entities)`);
	return "synced";
};
