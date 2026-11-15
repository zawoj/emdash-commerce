import { describe, expect, it } from "vitest";

import { canAdvance, createKit, pickVariant, variantPickId } from "@emdash-commerce/design-system/look-kit";

describe("variantPickId", () => {
	it("chooses the sole sellable variant when the product has no axes", () => {
		const variants = [{ id: 1, isPurchasable: true }];
		expect(variantPickId([], variants, undefined)).toBe(1);
	});

	it("waits for a resolved variant when axes exist", () => {
		const variants = [{ id: 2, isPurchasable: true }];
		expect(variantPickId(["size"], variants, undefined)).toBeNull();
		expect(variantPickId(["size"], variants, { id: 2, isPurchasable: true })).toBe(2);
	});
});

describe("kit stepper with axis-less products", () => {
	it("can advance after the single sellable is recorded", () => {
		const ids = [10, 20] as const;
		let kit = createKit(ids);
		kit = pickVariant(kit, 10, variantPickId([], [{ id: 1, isPurchasable: true }], undefined));
		expect(canAdvance(kit)).toBe(true);
	});
});
