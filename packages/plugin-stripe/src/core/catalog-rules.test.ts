import { describe, expect, it } from "vitest";

import {
	axisValuesOf,
	combinationsOf,
	MAX_AXES_PER_TYPE,
	MAX_VARIANTS_PER_PRODUCT,
	missingRequiredSpecs,
	optionsKeyOf,
	planGeneration,
	productTypeProblems,
	reshapeSpecs,
	swatchProblem,
	variantSkuOf,
	variantTitleOf,
	variantValueProblems,
} from "./catalog-rules.js";
import type { Attribute, ProductType } from "./product-type.js";
import { isSwatchColour } from "./product-type.js";

const attribute = (id: string, values: string[], over: Partial<Attribute> = {}): Attribute => ({
	id,
	name: id,
	storefrontLabel: id,
	code: null,
	inputType: "select",
	presentation: "buttons",
	unit: null,
	isFilterable: false,
	values: values.map((value) => ({ id: `${id}:${value}`, attributeId: id, label: value, code: value, swatch: null })),
	...over,
});

const type = (over: Partial<ProductType> = {}): ProductType => ({ id: "t", name: "Shirt", code: null, variantAxisIds: ["size", "colour"], allowedValueIds: [], specAttributeIds: [], requiredSpecIds: [], ...over });

describe("options key", () => {
	it("is the sorted value ids, so the order values were linked in does not matter", () => {
		expect(optionsKeyOf(["b", "a", "c"])).toBe("a|b|c");
		expect(optionsKeyOf(["c", "a"])).toBe(optionsKeyOf(["a", "c"]));
		expect(optionsKeyOf([])).toBe("");
	});
});

describe("derived title and SKU", () => {
	it("builds `Product — M / Black` and falls back to the product title alone", () => {
		expect(variantTitleOf("Shirt", ["M", "Black"])).toBe("Shirt — M / Black");
		expect(variantTitleOf("Shirt", [])).toBe("Shirt");
	});

	it("builds an upper-case SKU from the product SKU (or slug) and the value codes, and nothing without a base or values", () => {
		expect(variantSkuOf("sh-01", null, ["m", "black"])).toBe("SH-01-M-BLACK");
		expect(variantSkuOf(null, "my shirt", ["Light blue"])).toBe("MY-SHIRT-LIGHT-BLUE");
		expect(variantSkuOf(null, null, ["m"])).toBeNull();
		expect(variantSkuOf("sh", null, [])).toBeNull();
	});
});

describe("combinations", () => {
	it("is the cartesian product of the ticked values, one value per axis, in axis order", () => {
		expect(combinationsOf([{ attributeId: "size", valueIds: ["s", "m"] }, { attributeId: "colour", valueIds: ["red", "blue", "green"] }])).toEqual([
			["s", "red"], ["s", "blue"], ["s", "green"], ["m", "red"], ["m", "blue"], ["m", "green"],
		]);
		expect(combinationsOf([{ attributeId: "size", valueIds: ["s"] }])).toEqual([["s"]]);
	});

	it("is empty when there is no axis or an axis has nothing ticked", () => {
		expect(combinationsOf([])).toEqual([]);
		expect(combinationsOf([{ attributeId: "size", valueIds: ["s"] }, { attributeId: "colour", valueIds: [] }])).toEqual([]);
	});

	it("skips combinations whose options key already exists, and duplicates inside the request", () => {
		const plan = planGeneration([["a", "x"], ["a", "y"], ["a", "x"]], new Set(["a|y"]));
		expect(plan.toCreate).toEqual([["a", "x"]]);
		expect(plan.skippedKeys).toEqual(["a|y", "a|x"]);
	});

	it("matches an existing key whatever the order of its values", () => {
		expect(planGeneration([["y", "a"]], new Set(["a|y"])).toCreate).toEqual([]);
	});
});

describe("axis values", () => {
	it("offers the type's allowed values for an axis that lists any, and all of its values otherwise", () => {
		const size = attribute("size", ["s", "m", "l"]);
		const colour = attribute("colour", ["red", "blue"]);
		const restricted = type({ allowedValueIds: ["size:s", "size:m"] });
		expect(axisValuesOf(restricted, size).map((value) => value.label)).toEqual(["s", "m"]);
		expect(axisValuesOf(restricted, colour).map((value) => value.label)).toEqual(["red", "blue"]);
	});
});

describe("product type problems", () => {
	it("flags more than three axes, a non-select axis and a required specification outside the specification attributes", () => {
		expect(productTypeProblems(type({ variantAxisIds: ["a", "b", "c", "d"] }), [])).toEqual([expect.stringContaining(`at most ${MAX_AXES_PER_TYPE}`)]);
		expect(productTypeProblems(type(), [attribute("size", ["s"], { inputType: "text" })])).toEqual([expect.stringContaining("must be a select attribute")]);
		expect(productTypeProblems(type({ specAttributeIds: ["a"], requiredSpecIds: ["a", "b"] }), [])).toHaveLength(1);
		expect(productTypeProblems(type({ specAttributeIds: ["a"], requiredSpecIds: ["a"] }), [attribute("size", ["s"])])).toEqual([]);
	});
});

describe("variant values against the axes", () => {
	const size = attribute("size", ["s", "m", "l"]);
	const colour = attribute("colour", ["red", "blue"]);

	it("accepts exactly one allowed value per axis", () => {
		expect(variantValueProblems(type(), [size, colour], ["size:s", "colour:red"])).toEqual([]);
	});

	it("asks for a value for an axis that has none", () => {
		expect(variantValueProblems(type(), [size, colour], ["size:s"])).toEqual([expect.stringContaining('Pick a value for "colour"')]);
	});

	it("refuses two values of one axis", () => {
		expect(variantValueProblems(type(), [size, colour], ["size:s", "size:m", "colour:red"])).toEqual([expect.stringContaining('one value for "size", not 2')]);
	});

	it("refuses a value the type does not allow for the axis, and a value of no axis", () => {
		const restricted = type({ allowedValueIds: ["size:s"] });
		expect(variantValueProblems(restricted, [size, colour], ["size:l", "colour:red"])).toEqual([expect.stringContaining("not an allowed size")]);
		expect(variantValueProblems(type(), [size], ["size:s", "other:x"])).toEqual([expect.stringContaining("does not belong to any axis")]);
	});
});

describe("swatch colour", () => {
	it("accepts #rgb and #rrggbb only", () => {
		for (const ok of ["#fff", "#FFAA00", "#0a0"]) expect(isSwatchColour(ok), ok).toBe(true);
		for (const bad of ["fff", "#ffff", "#gggggg", "red", "#12345", ""]) expect(isSwatchColour(bad), bad).toBe(false);
		expect(swatchProblem("#abc")).toBeNull();
		expect(swatchProblem(undefined)).toBeNull();
		expect(swatchProblem("")).toBeNull();
		expect(swatchProblem("blue")).toContain("#rgb or #rrggbb");
		expect(swatchProblem(5)).toContain("#rgb or #rrggbb");
	});
});

describe("specifications", () => {
	it("names the required specifications that are empty, treating empty text, an empty list and a missing row as empty, but false and 0 as filled", () => {
		const t = { requiredSpecIds: ["a", "b", "c", "d", "e", "f"] };
		const missing = missingRequiredSpecs(t, { a: "x", b: "  ", c: [], d: false, e: 0 }, (id) => id.toUpperCase());
		expect(missing).toEqual(["B", "C", "F"]);
	});

	it("drops the rows of attributes the type no longer lists, and every row when there is no type", () => {
		expect(reshapeSpecs({ a: "1", b: 2, c: true }, { specAttributeIds: ["a", "c"] })).toEqual({ a: "1", c: true });
		expect(reshapeSpecs({ a: "1" }, null)).toEqual({});
	});

	it("caps a product at 50 variants", () => {
		expect(MAX_VARIANTS_PER_PRODUCT).toBe(50);
	});
});
