/**
 * The dev-only collections of the storefront (the `feedback` collection of the Notes tool in the editing pill),
 * kept out of the production seed `apps/storefront/seed/seed.json` and described in `seed/dev-tools.json` (the same
 * format, so `emdash seed seed/dev-tools.json --no-content` applies it too).
 *
 * `ensureDevTools` creates what is missing through the schema REST API. `pnpm seed` calls it only on the dev-login
 * path (a dev server), never with an access token (a deployed site).
 */
import { readFileSync } from "node:fs";

/** `call(method, path, { body })` is the seed's authenticated JSON caller. Returns the slugs it created. */
export const ensureDevTools = async ({ call, fragmentPath }) => {
	const fragment = JSON.parse(readFileSync(fragmentPath, "utf8"));
	const created = [];
	for (const { fields = [], ...collection } of fragment.collections ?? []) {
		try {
			await call("GET", `/schema/collections/${encodeURIComponent(collection.slug)}`);
			continue;
		} catch (error) {
			if (!String(error instanceof Error ? error.message : error).includes("-> 404")) throw error;
		}
		await call("POST", "/schema/collections", { body: collection });
		for (const field of fields) {
			await call("POST", `/schema/collections/${encodeURIComponent(collection.slug)}/fields`, { body: field });
		}
		created.push(collection.slug);
	}
	return created;
};
