import { beforeEach, describe, expect, it } from "vitest";

import { availabilityView, catalogProductView } from "../contracts/api.js";
import { isCommerceError } from "../core/errors.js";
import { createCatalogReadService, type CatalogReadService } from "./catalog-read.js";
import { createStorefrontWorld, price, product, recurringPrice, variant, type StorefrontWorld } from "./cart/test-support.js";

describe("catalog read service", () => {
	let w: StorefrontWorld;
	let catalog: CatalogReadService;

	beforeEach(async () => {
		w = createStorefrontWorld();
		catalog = createCatalogReadService(w.container);
		w.world.catalog.addAttribute({
			id: "size",
			name: "Size",
			storefrontLabel: "Size",
			code: null,
			inputType: "select",
			presentation: "buttons",
			unit: null,
			isFilterable: false,
			values: [
				{ id: "sz-m", attributeId: "size", label: "M", code: "M", swatch: null },
				{ id: "sz-l", attributeId: "size", label: "L", code: "L", swatch: null },
				{ id: "sz-xl", attributeId: "size", label: "XL", code: "XL", swatch: null },
			],
		});
		w.world.catalog.addProductType({ id: "shirt", name: "Shirt", code: null, variantAxisIds: ["size"], allowedValueIds: ["sz-m", "sz-l"], specAttributeIds: [], requiredSpecIds: [] });
		w.world.catalog.addProduct(product({ id: "tee", slug: "tee", title: "Tee", hasVariants: true, typeId: "shirt" }));
		w.world.catalog.addVariant(variant({ id: "m", productId: "tee", title: "M", optionValueIds: ["sz-m"] }));
		w.world.catalog.addVariant(variant({ id: "l", productId: "tee", title: "L", optionValueIds: ["sz-l"] }));
		w.world.catalog.addVariant(variant({ id: "xl", productId: "tee", title: "XL", isActive: false }));
		w.world.catalog.addPrice(price({ id: "tee-m-sale", productId: "tee", variantId: "m", unitAmount: 900, isDefault: false }));
		w.world.catalog.addPrice(price({ id: "tee-m", productId: "tee", variantId: "m", unitAmount: 1500, isDefault: true }));
		w.world.catalog.addPrice(price({ id: "tee-l", productId: "tee", variantId: "l", unitAmount: 1500 }));
		w.world.catalog.addPrice(price({ id: "tee-xl", productId: "tee", variantId: "xl", unitAmount: 1500 }));
		w.world.catalog.addPrice(price({ id: "tee-old", productId: "tee", variantId: "m", unitAmount: 100, isActive: false, isDefault: false }));
		await w.world.inventory.adjust({ kind: "variant", id: "m" }, 4, "seed");
		await w.world.inventory.adjust({ kind: "variant", id: "l" }, 0, "seed");
	});

	it("shows a published product with its active variants and active prices, default first, non-default included", async () => {
		const view = await catalog.legacyProduct("tee");
		expect(catalogProductView.parse(view)).toEqual(view);
		expect(view.variants.map((entry) => entry.id)).toEqual(["m", "l"]);
		expect(view.variants[0]).toEqual({ id: "m", title: "M", sku: null, optionValues: [{ name: "Size", value: "M" }], available: 4, isAvailable: true });
		expect(view.variants[1]).toMatchObject({ id: "l", available: 0, isAvailable: false });
		expect(view.prices.map((entry) => entry.id)).toEqual(["tee-l", "tee-m", "tee-m-sale"]);
		expect(view.prices[0]).toMatchObject({ unitAmount: { amount: 1500, currency: "pln" }, isDefault: true, isPurchasable: true, type: "one_time", interval: null });
		expect(view).toMatchObject({ slug: "tee", hasVariants: true, available: 4, isAvailable: true, options: [{ name: "Size", values: ["M", "L"] }] });
	});

	it("reports a product with an untracked variant as unlimited, and one with no stock as unavailable", async () => {
		w.world.catalog.addVariant(variant({ id: "free", productId: "tee", title: "Free", inventory: { isTracked: false, allowsBackorder: false } }));
		expect((await catalog.legacyProduct("tee")).available).toBeNull();
		w.world.catalog.addProduct(product({ id: "gone", slug: "gone", inventory: { isTracked: true, allowsBackorder: false } }));
		w.world.catalog.addPrice(price({ id: "gone-1", productId: "gone" }));
		expect(await catalog.legacyProduct("gone")).toMatchObject({ available: 0, isAvailable: false, variants: [] });
	});

	it("includes recurring terms", async () => {
		w.world.catalog.addProduct(product({ id: "p4", slug: "plan" }));
		w.world.catalog.addPrice(recurringPrice());
		expect((await catalog.legacyProduct("plan")).prices[0]).toMatchObject({ type: "recurring", interval: "month", intervalCount: 1, trialDays: 14 });
	});

	it("is a 404 for an unknown or unpublished slug", async () => {
		w.world.catalog.addProduct(product({ id: "draft", slug: "draft", isPublished: false }));
		for (const slug of ["nope", "draft"]) {
			const error = await catalog.legacyProduct(slug).catch((caught: unknown) => caught);
			expect(isCommerceError(error) && error.status).toBe(404);
		}
	});

	it("never calls the payment provider, and a failed sync makes a price not purchasable while a pending one stays purchasable", async () => {
		await w.world.catalogLinks.put({ entityKey: "price:tee-l", providerId: null, providerPriceByFingerprint: {}, fingerprint: null, syncStatus: "failed", lastError: "x", attempts: 3, nextAttemptAt: null, syncedAt: null, driftFields: [] }, null);
		const view = await catalog.legacyProduct("tee");
		expect(Object.fromEntries(view.prices.map((entry) => [entry.id, entry.isPurchasable]))).toEqual({ "tee-l": false, "tee-m": true, "tee-m-sale": true });
		expect(w.provider.calls).toEqual([]);
	});

	it("availability: purchasable and stock per price, unknown ids not purchasable", async () => {
		w.world.catalog.addProduct(product({ id: "off", slug: "off", isPublished: false }));
		w.world.catalog.addPrice(price({ id: "off-1", productId: "off" }));
		w.world.catalog.addPrice(price({ id: "free-1", productId: "free" }));
		w.world.catalog.addProduct(product({ id: "free", slug: "free" }));
		const view = await catalog.availability(["tee-m", "tee-l", "tee-xl", "tee-old", "off-1", "free-1", "ghost"]);
		expect(availabilityView.parse(view)).toEqual(view);
		expect(view.prices).toEqual({
			"tee-m": { isPurchasable: true, available: 4 },
			"tee-l": { isPurchasable: true, available: 0 },
			"tee-xl": { isPurchasable: false, available: 0 },
			"tee-old": { isPurchasable: false, available: 4 },
			"off-1": { isPurchasable: false, available: null },
			"free-1": { isPurchasable: true, available: null },
			ghost: { isPurchasable: false, available: null },
		});
	});
});
