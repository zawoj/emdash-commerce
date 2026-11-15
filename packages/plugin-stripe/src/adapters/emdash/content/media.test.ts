import { describe, expect, it } from "vitest";

import { resolveGallery, resolveMediaImage } from "./media.js";

const FILE = "/_emdash/api/media/file/";

describe("resolveMediaImage", () => {
	it("local provider: a media-library value without src resolves through meta.storageKey, else the id", () => {
		const picked = { provider: "local", id: "01MEDIA", filename: "bottle.jpg", mimeType: "image/jpeg", width: 1200, height: 800, alt: "A bottle", meta: { storageKey: "01STORAGE.jpg" } };
		expect(resolveMediaImage(picked)).toEqual({ url: `${FILE}01STORAGE.jpg`, alt: "A bottle", width: 1200, height: 800 });
		expect(resolveMediaImage({ provider: "local", id: "01MEDIA" })).toEqual({ url: `${FILE}01MEDIA`, alt: null, width: null, height: null });
		expect(resolveMediaImage({ id: "01MEDIA" })?.url).toBe(`${FILE}01MEDIA`);
	});

	it("local provider: an explicit src wins; a bare src is a storage key; a key is path-encoded", () => {
		expect(resolveMediaImage({ provider: "local", id: "x", src: `${FILE}a.jpg`, meta: { storageKey: "b.jpg" } })?.url).toBe(`${FILE}a.jpg`);
		expect(resolveMediaImage({ provider: "local", id: "x", src: "c.jpg" })?.url).toBe(`${FILE}c.jpg`);
		expect(resolveMediaImage({ provider: "local", id: "x", meta: { storageKey: "dir/a b#1.jpg" } })?.url).toBe(`${FILE}dir/a%20b%231.jpg`);
		expect(resolveMediaImage({ provider: "local", id: "x", meta: { storageKey: "../etc" } })?.url).toBe(`${FILE}..%2Fetc`);
	});

	it("external provider (and the legacy external-url): src, never the id", () => {
		expect(resolveMediaImage({ provider: "external", id: "", src: "https://cdn.example/a.jpg", alt: "A" })).toEqual({ url: "https://cdn.example/a.jpg", alt: "A", width: null, height: null });
		expect(resolveMediaImage({ provider: "external-url", id: "", previewUrl: "https://cdn.example/p.jpg" })?.url).toBe("https://cdn.example/p.jpg");
		expect(resolveMediaImage({ provider: "external", id: "abc" })).toBeNull();
	});

	it("another provider: only a URL on the value is usable (its embed needs the provider module)", () => {
		expect(resolveMediaImage({ provider: "unsplash", id: "u1", src: "https://images.example/u1.jpg" })?.url).toBe("https://images.example/u1.jpg");
		expect(resolveMediaImage({ provider: "unsplash", id: "u1" })).toBeNull();
	});

	it("bare strings and junk", () => {
		expect(resolveMediaImage("https://x/y.png")).toEqual({ url: "https://x/y.png", alt: null, width: null, height: null });
		for (const junk of [null, undefined, "", 5, [], {}, { provider: "local" }, { provider: "local", id: "" }]) expect(resolveMediaImage(junk), String(junk)).toBeNull();
	});

	it("ignores unusable dimensions", () => {
		expect(resolveMediaImage({ id: "m", width: 0, height: "8" })).toMatchObject({ width: null, height: null });
	});
});

describe("resolveGallery", () => {
	it("maps rows in order, lets the row alt win and skips rows without an image", () => {
		const rows = [
			{ image: { provider: "local", id: "m1", alt: "media alt" }, alt: "row alt" },
			{ alt: "an empty row" },
			{ image: { provider: "local", id: "m2", alt: "media alt" } },
			"junk",
			{ image: { provider: "external", id: "", src: "https://x/y.jpg" } },
		];
		expect(resolveGallery(rows).map(({ url, alt }) => ({ url, alt }))).toEqual([
			{ url: `${FILE}m1`, alt: "row alt" },
			{ url: `${FILE}m2`, alt: "media alt" },
			{ url: "https://x/y.jpg", alt: null },
		]);
		expect(resolveGallery(null)).toEqual([]);
	});
});
