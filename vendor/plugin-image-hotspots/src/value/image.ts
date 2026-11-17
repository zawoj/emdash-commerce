import type { ImageValue } from "./schema.js";

/** The URL EmDash serves a local media file from; the storage key is what the file is stored under. */
export const MEDIA_FILE_PATH = "/_emdash/api/media/file";

const isUsable = (url: string | undefined): url is string => typeof url === "string" && url.trim() !== "";

/** A URL the browser can load for an image value: its own `src`, a provider preview, or the local media file. */
export const imageUrlOf = (image: ImageValue | null): string | null => {
	if (!image) return null;
	if (isUsable(image.src)) return image.src.trim();
	if (isUsable(image.previewUrl)) return image.previewUrl.trim();
	const key = image.meta?.storageKey;
	if (typeof key === "string" && key !== "") return `${MEDIA_FILE_PATH}/${key}`;
	return null;
};
