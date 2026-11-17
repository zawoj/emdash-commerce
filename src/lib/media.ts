import type { ImageAttrs } from "@emdash-commerce/design-system";
interface CatalogImage {
	url: string;
	alt: string;
}

const DEFAULT_SIZES = "(min-width: 1100px) 22vw, (min-width: 640px) 33vw, 50vw";

export const imageFromUrl = (
	url: string,
	alt: string,
	options?: { sizes?: string; isEager?: boolean; isLead?: boolean },
): ImageAttrs => ({
	src: url,
	alt,
	sizes: options?.sizes ?? DEFAULT_SIZES,
	loading: options?.isEager ? "eager" : "lazy",
	fetchpriority: options?.isLead ? "high" : undefined,
});

export const isUsableImageUrl = (url: string | undefined): url is string => Boolean(url?.trim());

export const imageFromView = (
	image: CatalogImage | undefined,
	options?: { sizes?: string; isEager?: boolean; isLead?: boolean },
): ImageAttrs | undefined => {
	if (!isUsableImageUrl(image?.url)) return undefined;
	return imageFromUrl(image.url.trim(), image.alt || "", options);
};

interface CmsImageValue {
	src?: string;
	alt?: string;
	provider?: string;
	meta?: Record<string, unknown>;
}

/** The public URL of an EmDash image field value (local media is served by storage key). */
export const urlFromCmsImage = (image: CmsImageValue | undefined): string | undefined => {
	if (!image) return undefined;
	if (isUsableImageUrl(image.src)) return image.src.trim();
	const key = image.meta?.storageKey;
	if (typeof key !== "string" || key.length === 0) return undefined;
	return `/_emdash/api/media/file/${key}`;
};
