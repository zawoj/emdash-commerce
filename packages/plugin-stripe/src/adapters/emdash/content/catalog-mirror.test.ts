import { describe, expect, it } from "vitest";

import { buildCollectionDefinitions } from "../schema/collections.js";
import { commerceOptionsSchema } from "../../../contracts/options.js";
import { createCatalogMirror } from "./catalog-mirror.js";
import { createFakeContent, createInMemoryWorld, createNullLogger } from "../../../testing/index.js";

const options = commerceOptionsSchema.parse({});

describe("catalog mirror", () => {
	it("writes variant stock and keeps inventory mirrored on hand aligned", async () => {
		const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);
		const content = createFakeContent(definitions);
		const world = createInMemoryWorld();
		const mirror = createCatalogMirror(content, options.collections, world.inventory, createNullLogger());
		const variantId = content.seedEntry(options.collections.variants, {
			title: "M",
			stock: 5,
			is_active: true,
		});
		await mirror.writeVariantStock(variantId, 12);
		const entry = content.entries(options.collections.variants).find((row) => row.id === variantId);
		expect(entry?.data.stock).toBe(12);
		const level = await world.inventory.get({ kind: "variant", id: variantId });
		expect(level?.mirroredOnHand).toBe(12);
		expect(level?.onHand).toBe(12);
	});
});
