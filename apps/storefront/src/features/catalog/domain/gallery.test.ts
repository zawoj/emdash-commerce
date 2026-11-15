import { describe, expect, it } from "vitest";

import { visiblePhotoIndexes } from "@emdash-commerce/design-system/product-gallery-core";
import type { ProductDetailView } from "@emdash-commerce/plugin-stripe/contracts";

import { galleryOf } from "./gallery";
import { buildVariantModel } from "./variants";

describe("visiblePhotoIndexes", () => {
	const groups = [undefined, undefined, "Volt", "Volt"];

	it("shows the chosen colour's photos when it has some", () => {
		expect(visiblePhotoIndexes(groups, "Volt")).toEqual([2, 3]);
	});

	it("falls back to the untagged photos for a colour with none", () => {
		expect(visiblePhotoIndexes(groups, "Red")).toEqual([0, 1]);
	});

	it("falls back to every photo when all of them are tagged with other colours", () => {
		expect(visiblePhotoIndexes(["Black", "Black"], "Red")).toEqual([0, 1]);
	});

	it("shows everything without a chosen colour", () => {
		expect(visiblePhotoIndexes(groups, null)).toEqual([0, 1, 2, 3]);
	});
});

const availability = { state: "in_stock", lowCount: null } as const;

const detail = {
	title: "Shell",
	images: [{ url: "/a.jpg", alt: "a" }],
	axes: [
		{
			attributeId: "1",
			code: "colour",
			label: "Colour",
			presentation: "swatch",
			isImageAxis: true,
			values: [
				{ id: "b", code: "Black", label: "Black", swatch: null },
				{ id: "r", code: "Red", label: "Red", swatch: null },
			],
		},
	],
	variants: [
		{ id: "v1", sku: "S1", title: "Black", options: { colour: "Black" }, optionsKey: "k1", isActive: true, price: { amount: 100, currency: "PLN", priceId: "p1" }, availability, imageUrls: ["/black.jpg"] },
		{ id: "v2", sku: "S2", title: "Red", options: { colour: "Red" }, optionsKey: "k2", isActive: true, price: { amount: 100, currency: "PLN", priceId: "p2" }, availability, imageUrls: [] },
	],
} as unknown as ProductDetailView;

describe("galleryOf", () => {
	it("keeps every photo, tagged with its own colour, so a colour without photos can fall back", () => {
		const { images } = galleryOf(detail, buildVariantModel(detail));
		expect(images.map((entry) => [entry.image.src, entry.group])).toEqual([
			["/a.jpg", undefined],
			["/black.jpg", "Black"],
		]);
		const groups = images.map((entry) => entry.group);
		expect(visiblePhotoIndexes(groups, "Red")).toEqual([0]);
		expect(visiblePhotoIndexes(groups, "Black")).toEqual([1]);
	});
});
