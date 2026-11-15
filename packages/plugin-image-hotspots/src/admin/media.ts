import type { MediaItem } from "@emdash-cms/admin";

import type { ImageValue } from "../value/schema.js";

const LOCAL_PROVIDER = "local";
const EXTERNAL_PROVIDER = "external";

/**
 * A media library item as EmDash's own image field stores it, so the value reads the same on the site as any
 * image field: the file is addressed by `id`, a local file by `meta.storageKey`, an external image by `src`.
 */
export const mediaItemToImageValue = (item: MediaItem): ImageValue => {
	const provider = item.provider ?? LOCAL_PROVIDER;
	const isLocal = provider === LOCAL_PROVIDER;
	const isExternal = provider === EXTERNAL_PROVIDER;
	const meta: Record<string, unknown> = { ...(item.meta ?? {}) };
	if (isLocal && item.storageKey) meta.storageKey = item.storageKey;

	const value: ImageValue = { id: item.id, provider, alt: item.alt ?? "", meta };
	if (isExternal) value.src = item.url;
	if (!isLocal && !isExternal) value.previewUrl = item.url;
	if (item.caption) value.caption = item.caption;
	if (item.width) value.width = item.width;
	if (item.height) value.height = item.height;
	if (item.focalX != null) value.focalX = item.focalX;
	if (item.focalY != null) value.focalY = item.focalY;
	if (item.filename) value.filename = item.filename;
	if (item.mimeType) value.mimeType = item.mimeType;
	if (item.blurhash) value.blurhash = item.blurhash;
	if (item.dominantColor) value.dominantColor = item.dominantColor;
	return value;
};
