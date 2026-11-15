import type { PluginRoute } from "emdash";
import { describe, expect, it } from "vitest";

import { catalogProductsView, productDetailView, ROUTE } from "../../contracts/api.js";
import { syncManagedPrices } from "../../services/catalog/managed-prices.js";
import { createModelWorld } from "../../services/catalog/model-test-support.js";
import { createFakeRouteContext } from "../../testing/index.js";
import { createStripeCommercePlugin } from "../index.js";

describe("storefront catalog routes", () => {
	const setup = async () => {
		const w = createModelWorld();
		const plugin = createStripeCommercePlugin({ supportedCurrencies: ["pln"] }, {}, w.deps);
		const routes = plugin.routes as Record<string, PluginRoute>;
		const id = await w.product({ title: "Mug", slug: "mug", price: 1200, sku: "MUG" });
		await syncManagedPrices(w.container, { entity: "product", id });
		const call = (name: string, input: unknown) => routes[name]!.handler(createFakeRouteContext(w.ctx, { input } as never) as never);
		return { routes, call };
	};

	it("serves public, cacheable GET routes for the list and the detail", async () => {
		const { routes } = await setup();
		for (const name of [ROUTE.catalogProducts, ROUTE.catalogProduct]) {
			expect(routes[name]).toMatchObject({ methods: ["GET"], cacheControl: "public, max-age=30" });
		}
	});

	it("lists cards and returns the detail in the contract shapes, and validates the query", async () => {
		const { call } = await setup();
		const list = await call(ROUTE.catalogProducts, { sort: "price-asc", limit: "5" });
		expect(catalogProductsView.parse(list)).toEqual(list);
		expect((list as { items: unknown[] }).items).toHaveLength(1);
		const detail = await call(ROUTE.catalogProduct, { slug: "mug" });
		expect(productDetailView.parse(detail)).toEqual(detail);
		await expect(call(ROUTE.catalogProducts, { sort: "random" })).rejects.toMatchObject({ status: 400 });
		await expect(call(ROUTE.catalogProducts, { limit: "500" })).rejects.toMatchObject({ status: 400 });
		await expect(call(ROUTE.catalogProduct, { slug: "ghost" })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
	});
});
