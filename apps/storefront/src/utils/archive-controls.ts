import {
	ARCHIVE_VIEW,
	archiveHrefFromDefaults,
	parseArchiveView,
	resultCountLabel,
	type ArchiveView,
} from "./archive-controls-shared";

export { ARCHIVE_VIEW, type ArchiveView } from "./archive-controls-shared";

/** Sort orders offered on the posts archive; the value is what goes in `?sort=`. */
export const ARCHIVE_SORT = {
	NEWEST: "newest",
	OLDEST: "oldest",
	TITLE_ASC: "title-asc",
	TITLE_DESC: "title-desc",
} as const;

export type ArchiveSort = (typeof ARCHIVE_SORT)[keyof typeof ARCHIVE_SORT];

export const SORT_LABELS: Record<ArchiveSort, string> = {
	[ARCHIVE_SORT.NEWEST]: "Newest first",
	[ARCHIVE_SORT.OLDEST]: "Oldest first",
	[ARCHIVE_SORT.TITLE_ASC]: "Title A–Z",
	[ARCHIVE_SORT.TITLE_DESC]: "Title Z–A",
};

export interface ArchiveControls {
	sort: ArchiveSort;
	view: ArchiveView;
	/** Slug of a category, or null for all. */
	category: string | null;
	/** Slug of a tag, or null for all. */
	tag: string | null;
}

export interface ArchiveTerms {
	categories: readonly string[];
	tags: readonly string[];
}

export const DEFAULT_CONTROLS: ArchiveControls = {
	sort: ARCHIVE_SORT.NEWEST,
	view: ARCHIVE_VIEW.LIST,
	category: null,
	tag: null,
};

const isSort = (value: string | null): value is ArchiveSort =>
	Object.values(ARCHIVE_SORT).includes(value as ArchiveSort);

/** A slug from the query is only used when the site has that term, so a stale link shows everything. */
const knownSlug = (value: string | null, known: readonly string[]): string | null =>
	value && known.includes(value) ? value : null;

export const parseArchiveControls = (
	params: URLSearchParams,
	terms: ArchiveTerms,
): ArchiveControls => {
	const sort = params.get("sort");
	return {
		sort: isSort(sort) ? sort : DEFAULT_CONTROLS.sort,
		view: parseArchiveView(params.get("view"), DEFAULT_CONTROLS.view),
		category: knownSlug(params.get("category"), terms.categories),
		tag: knownSlug(params.get("tag"), terms.tags),
	};
};

export const orderByFor = (sort: ArchiveSort): Record<string, "asc" | "desc"> => {
	if (sort === ARCHIVE_SORT.OLDEST) return { published_at: "asc" };
	if (sort === ARCHIVE_SORT.TITLE_ASC) return { title: "asc" };
	if (sort === ARCHIVE_SORT.TITLE_DESC) return { title: "desc" };
	return { published_at: "desc" };
};

/** Taxonomy filters for `getEmDashCollection({ where })`; empty when nothing is selected. */
export const whereFor = (controls: ArchiveControls): Record<string, string> => ({
	...(controls.category ? { category: controls.category } : {}),
	...(controls.tag ? { tag: controls.tag } : {}),
});

export const isFiltered = (controls: ArchiveControls): boolean =>
	controls.category !== null || controls.tag !== null;

export const isCustomised = (controls: ArchiveControls): boolean =>
	isFiltered(controls) ||
	controls.sort !== DEFAULT_CONTROLS.sort ||
	controls.view !== DEFAULT_CONTROLS.view;

const archiveHrefValues = (
	controls: ArchiveControls,
): Record<string, string | null | undefined> => ({
	category: controls.category,
	tag: controls.tag,
	sort: controls.sort,
	view: controls.view,
});

const archiveDefaults = (): Record<string, string> => ({
	category: "",
	tag: "",
	sort: DEFAULT_CONTROLS.sort,
	view: DEFAULT_CONTROLS.view,
});

/**
 * Link to the archive with these controls. Defaults are left out, and the cursor is only kept when asked
 * for — a new filter or sort starts from the first page.
 */
export const archiveHref = (
	basePath: string,
	controls: ArchiveControls,
	options: { cursor?: string } = {},
): string =>
	archiveHrefFromDefaults(
		basePath,
		archiveHrefValues(controls),
		archiveDefaults(),
		options,
	);

/** "4 posts", "1 post", or "20+ posts" when the page is full and there is more. */
export const resultLabel = (count: number, hasMore: boolean): string =>
	resultCountLabel(count, hasMore, { one: "post", other: "posts" });

export const postArchiveFormDefaults = (): Record<string, string> =>
	archiveDefaults();
