import { describe, expect, it } from "vitest";

import { axisCodeOf, loadAxes, optionsTextOf, resolveOptions, valueCodeOf } from "./axes.js";
import { createModelWorld } from "./model-test-support.js";

describe("variant axes", () => {
	it("resolves a variant's values in axis order with the attribute's storefront label, whatever order they were linked in", async () => {
		const w = createModelWorld();
		const size = await w.attribute({ name: "Size", values: ["S", "M"] });
		const colour = await w.attribute({ name: "Colour (internal)", storefrontLabel: "Kolor", values: [{ label: "Black", code: "BLK" }] });
		const typeId = await w.productType({ name: "Shirt", axes: [size.id, colour.id], allowed: [size.valueIds[1]!] });
		const { axes, type } = await loadAxes(w.container.catalog, typeId);
		expect(type?.id).toBe(typeId);
		// An axis offers the type's allowed values when it lists any, else all of the attribute's values.
		expect(axes.map((axis) => axis.offered.map((value) => value.label))).toEqual([["M"], ["Black"]]);
		const options = resolveOptions(axes, [colour.valueIds[0]!, size.valueIds[1]!]);
		expect(optionsTextOf(options)).toBe("Size: M, Kolor: Black");
		expect(options.map(({ axis, value }) => [axisCodeOf(axis), valueCodeOf(value)])).toEqual([["size", "m"], ["colour-internal", "BLK"]]);
	});

	it("skips an axis the variant has no value for, and yields null without any option or without a type", async () => {
		const w = createModelWorld();
		const size = await w.attribute({ name: "Size", values: ["S"] });
		const colour = await w.attribute({ name: "Colour", values: ["Black"] });
		const typeId = await w.productType({ name: "Shirt", axes: [size.id, colour.id] });
		const { axes } = await loadAxes(w.container.catalog, typeId);
		expect(optionsTextOf(resolveOptions(axes, [colour.valueIds[0]!]))).toBe("Colour: Black");
		expect(optionsTextOf(resolveOptions(axes, []))).toBeNull();
		expect(await loadAxes(w.container.catalog, null)).toEqual({ type: null, axes: [] });
		expect((await loadAxes(w.container.catalog, "missing")).axes).toEqual([]);
	});
});
