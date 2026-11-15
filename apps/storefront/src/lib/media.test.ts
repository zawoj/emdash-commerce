import { describe, expect, it } from "vitest";

import { imageFromView, isUsableImageUrl, urlFromCmsImage } from "./media";

describe("isUsableImageUrl", () => {
	it("rejects missing and whitespace-only urls", () => {
		expect(isUsableImageUrl(undefined)).toBe(false);
		expect(isUsableImageUrl("")).toBe(false);
		expect(isUsableImageUrl("   ")).toBe(false);
	});

	it("accepts real paths", () => {
		expect(isUsableImageUrl("/_emdash/api/media/file/x.jpg")).toBe(true);
	});
});

describe("imageFromView", () => {
	it("returns undefined when the catalog image url is empty", () => {
		expect(imageFromView({ url: "", alt: "x" })).toBeUndefined();
		expect(imageFromView({ url: "  ", alt: "x" })).toBeUndefined();
	});

	it("trims usable urls", () => {
		const attrs = imageFromView({ url: " /img.jpg ", alt: "Alt" });
		expect(attrs?.src).toBe("/img.jpg");
	});
});

describe("urlFromCmsImage", () => {
	it("prefers a usable src", () => {
		expect(urlFromCmsImage({ src: " /a.jpg ", meta: { storageKey: "k.jpg" } })).toBe("/a.jpg");
	});

	it("falls back to the local media route by storage key", () => {
		expect(urlFromCmsImage({ meta: { storageKey: "k.jpg" } })).toBe("/_emdash/api/media/file/k.jpg");
	});

	it("returns undefined without a src or storage key", () => {
		expect(urlFromCmsImage(undefined)).toBeUndefined();
		expect(urlFromCmsImage({ src: "  ", meta: {} })).toBeUndefined();
	});
});
