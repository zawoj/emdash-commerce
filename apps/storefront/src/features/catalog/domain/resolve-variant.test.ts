import { describe, expect, it } from "vitest";

import type { VariantRow } from "./variants";
import { resolveVariantRow } from "./resolve-variant";

const rows: VariantRow[] = [
	{
		surrogateId: 1,
		variantId: "v1",
		priceId: "p1",
		sku: "SKU-1",
		options: { size: "m", colour: "black" },
		stock: { status: "in_stock", lowCount: null },
		priceAmount: 1000,
		currency: "pln",
		imageUrls: [],
		isActive: true,
	},
];

describe("resolveVariantRow", () => {
	it("resolves a unique variant from option fields", () => {
		const row = resolveVariantRow(rows, { "option:size": "m", "option:colour": "black" });
		expect(row?.priceId).toBe("p1");
	});
});
