import { resolveGallery, resolveMediaImage, type ResolvedImage } from "../../adapters/emdash/content/media.js";
import { asArray, asRecord, asString } from "../../adapters/emdash/content/values.js";

export interface StorefrontImage {
	url: string;
	alt: string;
	/** Pixel size when the media value carries it (the media library records it on upload). */
	width?: number;
	height?: number;
}

const toStorefrontImage = (image: ResolvedImage, fallbackAlt: string): StorefrontImage => ({
	url: image.url,
	alt: image.alt ?? fallbackAlt,
	...(image.width && image.height ? { width: image.width, height: image.height } : {}),
});

/**
 * An EmDash `image` field value as storefront images: a media-library value (no `src`, resolved to the public file
 * route), an external URL value or a bare URL string; see `resolveMediaImage` for every shape. A value without a
 * usable URL yields nothing. `fallbackAlt` stands in for a missing alt.
 */
export const imagesOf = (value: unknown, fallbackAlt: string): StorefrontImage[] => {
	const image = resolveMediaImage(value);
	return image ? [toStorefrontImage(image, fallbackAlt)] : [];
};

/** The rows of a `gallery` repeater as storefront images, in order (rows without an image are skipped). */
export const galleryOf = (value: unknown, fallbackAlt: string): StorefrontImage[] => resolveGallery(value).map((image) => toStorefrontImage(image, fallbackAlt));

/** The images in order, the first occurrence of each URL only. */
export const uniqueImages = (images: readonly StorefrontImage[]): StorefrontImage[] => {
	const seen = new Set<string>();
	return images.filter((image) => (seen.has(image.url) ? false : (seen.add(image.url), true)));
};

const EXCERPT_LENGTH = 160;

/** The first non-empty paragraph of a Portable Text body as plain text, cut at a word near 160 characters; null when empty. */
export const excerptOf = (blocks: unknown): string | null => {
	for (const block of asArray(blocks)) {
		const text = asArray(asRecord(block)?.children)
			.map((child) => asString(asRecord(child)?.text) ?? "")
			.join("")
			.replace(/\s+/g, " ")
			.trim();
		if (!text) continue;
		if (text.length <= EXCERPT_LENGTH) return text;
		const cut = text.slice(0, EXCERPT_LENGTH);
		const boundary = cut.lastIndexOf(" ");
		return `${(boundary > EXCERPT_LENGTH / 2 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
	}
	return null;
};

/** A Portable Text body as stored (an array of blocks), or null when there is none. */
export const bodyOf = (value: unknown): Array<Record<string, unknown>> | null => {
	const blocks = asArray(value).flatMap((block) => {
		const record = asRecord(block);
		return record ? [record] : [];
	});
	return blocks.length > 0 ? blocks : null;
};
