import { describe, expect, it } from "vitest";

import { imageUrlOf } from "./image.js";
import { hasPlacedPoints, normaliseValue } from "./normalise.js";
import { hotspotsValueSchema } from "./schema.js";

describe("normaliseValue", () => {
	it("returns an empty value for null, undefined, arrays and garbage", () => {
		for (const input of [null, undefined, 4, "nope", [], "{bad json"]) {
			expect(normaliseValue(input)).toEqual({ image: null, points: [] });
		}
	});

	it("accepts a JSON string", () => {
		const value = normaliseValue(JSON.stringify({ image: null, points: [{ id: "a", x: 1, y: 2 }] }));
		expect(value.points).toEqual([{ id: "a", x: 1, y: 2 }]);
	});

	it("keeps a valid image untouched, including fields it does not know", () => {
		const image = { id: "m1", provider: "local", alt: "x", width: 10, height: 5, blurhash: "abc", meta: { storageKey: "k.jpg" } };
		expect(normaliseValue({ image, points: [] }).image).toEqual(image);
	});

	it("drops an image without an id", () => {
		expect(normaliseValue({ image: { alt: "x" }, points: [] }).image).toBeNull();
	});

	it("clamps and rounds coordinates, and accepts numeric strings", () => {
		const value = normaliseValue({ points: [{ id: "a", x: 120, y: -4 }, { id: "b", x: "33.336", y: "7" }] });
		expect(value.points).toEqual([
			{ id: "a", x: 100, y: 0 },
			{ id: "b", x: 33.34, y: 7 },
		]);
	});

	it("drops points without usable coordinates", () => {
		const value = normaliseValue({
			points: [{ id: "a", x: Number.NaN, y: 1 }, { id: "b", y: 1 }, null, "x", { id: "c", x: 1, y: 2 }],
		});
		expect(value.points.map((point) => point.id)).toEqual(["c"]);
	});

	it("trims text, drops empty fields and unknown sides", () => {
		const value = normaliseValue({
			points: [{ id: "a", x: 1, y: 1, title: "  Pockets ", text: "   ", side: "middle", productSlug: " run-cap " }],
		});
		expect(value.points[0]).toEqual({ id: "a", x: 1, y: 1, title: "Pockets", productSlug: "run-cap" });
	});

	it("keeps text as typed when asked not to trim (the editor)", () => {
		const value = normaliseValue({ points: [{ id: "a", x: 1, y: 1, title: "Wind " }] }, 6, { shouldTrim: false });
		expect(value.points[0]?.title).toBe("Wind ");
	});

	it("keeps a valid side", () => {
		expect(normaliseValue({ points: [{ id: "a", x: 1, y: 1, side: "start" }] }).points[0]?.side).toBe("start");
	});

	it("makes duplicate or missing ids unique", () => {
		const value = normaliseValue({ points: [{ id: "a", x: 1, y: 1 }, { id: "a", x: 2, y: 2 }, { x: 3, y: 3 }] });
		const ids = value.points.map((point) => point.id);
		expect(new Set(ids).size).toBe(3);
		expect(ids[0]).toBe("a");
	});

	it("caps the number of points", () => {
		const points = Array.from({ length: 10 }, (_, index) => ({ id: `p${index}`, x: index, y: index }));
		expect(normaliseValue({ points }, 4).points).toHaveLength(4);
		expect(normaliseValue({ points: Array.from({ length: 80 }, (_, i) => ({ id: `p${i}`, x: 1, y: 1 })) }).points).toHaveLength(50);
	});

	it("always produces a value the schema accepts", () => {
		const value = normaliseValue({
			image: { id: "m" },
			points: [{ id: "a", x: 1.005, y: 99.999, title: "t".repeat(500), text: "x".repeat(900) }],
		});
		expect(hotspotsValueSchema.safeParse(value).success).toBe(true);
	});
});

describe("hasPlacedPoints", () => {
	it("needs an image and a point", () => {
		expect(hasPlacedPoints({ image: null, points: [{ id: "a", x: 1, y: 1 }] })).toBe(false);
		expect(hasPlacedPoints({ image: { id: "m" }, points: [] })).toBe(false);
		expect(hasPlacedPoints({ image: { id: "m" }, points: [{ id: "a", x: 1, y: 1 }] })).toBe(true);
	});
});

describe("imageUrlOf", () => {
	it("prefers src, then previewUrl, then the local storage key", () => {
		expect(imageUrlOf({ id: "m", src: " https://x/y.jpg " })).toBe("https://x/y.jpg");
		expect(imageUrlOf({ id: "m", previewUrl: "https://cdn/p.jpg" })).toBe("https://cdn/p.jpg");
		expect(imageUrlOf({ id: "m", meta: { storageKey: "k.jpg" } })).toBe("/_emdash/api/media/file/k.jpg");
	});

	it("is null without anything to load", () => {
		expect(imageUrlOf(null)).toBeNull();
		expect(imageUrlOf({ id: "m" })).toBeNull();
	});
});
