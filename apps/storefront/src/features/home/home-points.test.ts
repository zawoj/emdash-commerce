import { describe, expect, it } from "vitest";

import { readLook, readSpotlight } from "./home-points";

const image = { id: "m1", alt: "Runners", meta: { storageKey: "run.jpg" } };

describe("readLook", () => {
	it("returns the image url and the product points", () => {
		const look = readLook({ image, points: [{ id: "a", x: 46, y: 34, productSlug: "aero-run-tee" }] });
		expect(look).toEqual({
			image: { url: "/_emdash/api/media/file/run.jpg", alt: "Runners" },
			points: [{ productSlug: "aero-run-tee", x: 46, y: 34 }],
		});
	});

	it("hides the section without an image, without points, or without any product", () => {
		expect(readLook(undefined)).toBeNull();
		expect(readLook({ image: null, points: [{ id: "a", x: 1, y: 1, productSlug: "x" }] })).toBeNull();
		expect(readLook({ image, points: [] })).toBeNull();
		expect(readLook({ image, points: [{ id: "a", x: 1, y: 1 }] })).toBeNull();
	});

	it("skips a point without a product but keeps the rest", () => {
		const look = readLook({ image, points: [{ id: "a", x: 1, y: 1 }, { id: "b", x: 2, y: 2, productSlug: "run-cap" }] });
		expect(look?.points).toEqual([{ productSlug: "run-cap", x: 2, y: 2 }]);
	});
});

describe("readSpotlight", () => {
	it("returns the image and the titled callouts", () => {
		const spotlight = readSpotlight({
			image,
			points: [{ id: "a", x: 63, y: 14, title: "Wind blocking", text: "Light membrane.", side: "end" }, { id: "b", x: 1, y: 1 }],
		});
		expect(spotlight?.callouts).toEqual([{ title: "Wind blocking", text: "Light membrane.", x: 63, y: 14, side: "end" }]);
	});

	it("falls back to the product image when empty", () => {
		expect(readSpotlight(undefined)).toBeNull();
		expect(readSpotlight({ image, points: [] })).toBeNull();
		expect(readSpotlight({ image: null, points: [{ id: "a", x: 1, y: 1, title: "t" }] })).toBeNull();
	});
});
