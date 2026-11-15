import { GALLERY_ITEM_FIELD } from "../schema/field-names/index.js";
import { asArray, asRecord, asString } from "./values.js";

/**
 * An EmDash `image` value turned into something a storefront can render. Verified in emdash 1.5
 * (`media/normalize.ts`, `media/url.ts`, `media/local-runtime.ts` `getEmbed`, `loader.ts` `normalizeLocalMediaValue`):
 *
 * - a value picked from the media library is `{ provider: "local", id, filename, mimeType, width, height, meta:
 *   { storageKey } }` and has no `src` (it is "derived at display time from storageKey"); its public URL is the
 *   file route `/_emdash/api/media/file/<storageKey>` (`meta.storageKey`, else the id);
 * - a pasted URL or a seed value is `{ provider: "external", id: "", src }` (legacy `external-url` is the same);
 * - a value written through the loader may carry a site-relative or bare `src` for the local provider;
 * - any other provider (Unsplash, Cloudflare Images, …) builds its URL in a provider module the plugin cannot load,
 *   so only an explicit `src` / `url` / `previewUrl` on the value is usable.
 */
export const LOCAL_MEDIA_FILE_PREFIX = "/_emdash/api/media/file/";

export interface ResolvedImage {
	url: string;
	alt: string | null;
	width: number | null;
	height: number | null;
}

const LOCAL_PROVIDER = "local";
const EXTERNAL_PROVIDERS: ReadonlySet<string> = new Set(["external", "external-url"]);
const URL_SCHEME = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

/** The file route of a storage key, each path segment encoded (the same rule as emdash's `localMediaFileUrl`). */
const localFileUrl = (key: string): string => {
	const segments = key.split("/");
	if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return `${LOCAL_MEDIA_FILE_PREFIX}${encodeURIComponent(key)}`;
	return `${LOCAL_MEDIA_FILE_PREFIX}${segments.map(encodeURIComponent).join("/")}`;
};

const isBareKey = (src: string): boolean => !src.startsWith("/") && !URL_SCHEME.test(src);

const dimension = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null);

const urlOf = (record: Record<string, unknown>): string | null => {
	const provider = asString(record.provider) ?? LOCAL_PROVIDER;
	const explicit = asString(record.src) ?? asString(record.url) ?? asString(record.previewUrl);
	if (EXTERNAL_PROVIDERS.has(provider)) return explicit;
	if (provider !== LOCAL_PROVIDER) return explicit;
	if (explicit) return isBareKey(explicit) ? localFileUrl(explicit) : explicit;
	const storageKey = asString(asRecord(record.meta)?.storageKey) ?? asString(record.id);
	return storageKey ? localFileUrl(storageKey) : null;
};

/** The image an `image` field value stands for, or null when it has no usable URL. */
export const resolveMediaImage = (value: unknown): ResolvedImage | null => {
	const direct = asString(value);
	if (direct) return { url: direct, alt: null, width: null, height: null };
	const record = asRecord(value);
	if (!record) return null;
	const url = urlOf(record);
	if (!url) return null;
	return { url, alt: asString(record.alt), width: dimension(record.width), height: dimension(record.height) };
};

/**
 * The rows of a `gallery` repeater (`{ image, alt }`, both optional) as images, in order. A row without a usable image
 * is skipped (an editor may have just clicked "Add item"); the row's own alt wins over the media item's.
 */
export const resolveGallery = (value: unknown): ResolvedImage[] =>
	asArray(value).flatMap((row) => {
		const record = asRecord(row);
		const image = record ? resolveMediaImage(record[GALLERY_ITEM_FIELD.image]) : null;
		return image ? [{ ...image, alt: asString(record?.[GALLERY_ITEM_FIELD.alt]) ?? image.alt }] : [];
	});
