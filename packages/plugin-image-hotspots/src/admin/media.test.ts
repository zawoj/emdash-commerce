import type { MediaItem } from "@emdash-cms/admin";
import { describe, expect, it } from "vitest";

import { imageUrlOf } from "../value/image.js";
import { mediaItemToImageValue } from "./media.js";

const item = (patch: Partial<MediaItem> = {}): MediaItem => ({
	id: "01M7AGCTE11E5D29W329HAGVF2",
	filename: "run.jpg",
	mimeType: "image/jpeg",
	url: "/_emdash/api/media/file/01M7AGCTBS5ASHH98FH2CNK75Z.jpg",
	storageKey: "01M7AGCTBS5ASHH98FH2CNK75Z.jpg",
	size: 1,
	width: 1600,
	height: 1067,
	alt: "Runners",
	createdAt: "2026-01-01",
	...patch,
});

describe("mediaItemToImageValue", () => {
	it("stores a local file the way the core image field does (id plus storage key)", () => {
		const value = mediaItemToImageValue(item());
		expect(value).toMatchObject({
			id: "01M7AGCTE11E5D29W329HAGVF2",
			provider: "local",
			alt: "Runners",
			width: 1600,
			height: 1067,
			filename: "run.jpg",
			mimeType: "image/jpeg",
			meta: { storageKey: "01M7AGCTBS5ASHH98FH2CNK75Z.jpg" },
		});
		expect(value.src).toBeUndefined();
		expect(imageUrlOf(value)).toBe("/_emdash/api/media/file/01M7AGCTBS5ASHH98FH2CNK75Z.jpg");
	});

	it("keeps an external image by its URL", () => {
		const value = mediaItemToImageValue(item({ provider: "external", storageKey: undefined, url: "https://x/y.jpg" }));
		expect(value.src).toBe("https://x/y.jpg");
		expect(imageUrlOf(value)).toBe("https://x/y.jpg");
	});

	it("uses a preview URL for another provider", () => {
		const value = mediaItemToImageValue(item({ provider: "cloudflare-images", storageKey: undefined, url: "https://cdn/p" }));
		expect(value.previewUrl).toBe("https://cdn/p");
	});

	it("carries optional metadata only when present", () => {
		const bare = mediaItemToImageValue(item({ width: undefined, height: undefined, alt: undefined }));
		expect(bare).not.toHaveProperty("width");
		expect(bare.alt).toBe("");
		const rich = mediaItemToImageValue(item({ focalX: 40, focalY: 60, blurhash: "abc", dominantColor: "rgb(1,2,3)", caption: "c" }));
		expect(rich).toMatchObject({ focalX: 40, focalY: 60, blurhash: "abc", dominantColor: "rgb(1,2,3)", caption: "c" });
	});
});
