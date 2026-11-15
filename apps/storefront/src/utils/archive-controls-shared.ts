/** Layouts of an archive list; the value is what goes in `?view=`. */
export const ARCHIVE_VIEW = {
	LIST: "list",
	GRID: "grid",
} as const;

export type ArchiveView = (typeof ARCHIVE_VIEW)[keyof typeof ARCHIVE_VIEW];

const VIEW_VALUES = new Set<string>(Object.values(ARCHIVE_VIEW));

export const parseArchiveView = (
	value: string | null,
	fallback: ArchiveView,
): ArchiveView => (value && VIEW_VALUES.has(value) ? (value as ArchiveView) : fallback);

/**
 * Link to an archive with only non-default query params. The cursor is only kept when passed — a new
 * filter or sort starts from the first page.
 */
export const archiveHrefFromDefaults = (
	basePath: string,
	values: Record<string, string | null | undefined>,
	defaults: Record<string, string>,
	options: { cursor?: string } = {},
): string => {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(values)) {
		if (value != null && value !== "" && value !== defaults[key]) {
			params.set(key, value);
		}
	}
	if (options.cursor) params.set("cursor", options.cursor);
	const query = params.toString();
	return query ? `${basePath}?${query}` : basePath;
};

/** e.g. "4 posts", "1 product", or "20+ products" when the page is full and there is more. */
export const resultCountLabel = (
	count: number,
	hasMore: boolean,
	labels: { one: string; other: string },
): string => {
	const suffix = count === 1 && !hasMore ? labels.one : labels.other;
	return `${count}${hasMore ? "+" : ""} ${suffix}`;
};
