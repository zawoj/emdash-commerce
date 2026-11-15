import { describe, expect, it } from "vitest";
import {
	ARCHIVE_SORT,
	ARCHIVE_VIEW,
	DEFAULT_CONTROLS,
	archiveHref,
	isCustomised,
	isFiltered,
	orderByFor,
	parseArchiveControls,
	resultLabel,
	whereFor,
} from "./archive-controls";

const TERMS = { categories: ["design", "development"], tags: ["opinion", "webdev"] };

const parse = (query: string) => parseArchiveControls(new URLSearchParams(query), TERMS);

describe("parseArchiveControls", () => {
	it("falls back to newest first, list view and no filters", () => {
		expect(parse("")).toEqual(DEFAULT_CONTROLS);
	});

	it("reads a valid sort, view, category and tag", () => {
		expect(parse("sort=title-desc&view=grid&category=design&tag=opinion")).toEqual({
			sort: ARCHIVE_SORT.TITLE_DESC,
			view: ARCHIVE_VIEW.GRID,
			category: "design",
			tag: "opinion",
		});
	});

	it("ignores an unknown sort or view", () => {
		expect(parse("sort=random&view=masonry")).toEqual(DEFAULT_CONTROLS);
	});

	it("ignores a category or tag the site does not have, so an old link still shows posts", () => {
		expect(parse("category=gone&tag=nope")).toEqual(DEFAULT_CONTROLS);
	});

	it("treats an empty form value as no filter", () => {
		expect(parse("category=&tag=&sort=newest&view=list")).toEqual(DEFAULT_CONTROLS);
	});

	it("does not take a tag slug as a category", () => {
		expect(parse("category=opinion").category).toBeNull();
	});
});

describe("orderByFor", () => {
	it.each([
		[ARCHIVE_SORT.NEWEST, { published_at: "desc" }],
		[ARCHIVE_SORT.OLDEST, { published_at: "asc" }],
		[ARCHIVE_SORT.TITLE_ASC, { title: "asc" }],
		[ARCHIVE_SORT.TITLE_DESC, { title: "desc" }],
	])("%s → %j", (sort, expected) => {
		expect(orderByFor(sort)).toEqual(expected);
	});
});

describe("whereFor and isFiltered", () => {
	it("is empty without filters", () => {
		expect(whereFor(DEFAULT_CONTROLS)).toEqual({});
		expect(isFiltered(DEFAULT_CONTROLS)).toBe(false);
	});

	it("carries each selected taxonomy under its own name", () => {
		const controls = { ...DEFAULT_CONTROLS, category: "design", tag: "opinion" };
		expect(whereFor(controls)).toEqual({ category: "design", tag: "opinion" });
		expect(isFiltered(controls)).toBe(true);
		expect(whereFor({ ...DEFAULT_CONTROLS, tag: "webdev" })).toEqual({ tag: "webdev" });
	});

	it("counts a changed sort or view as customised, but not as filtered", () => {
		const sorted = { ...DEFAULT_CONTROLS, sort: ARCHIVE_SORT.OLDEST };
		expect(isFiltered(sorted)).toBe(false);
		expect(isCustomised(sorted)).toBe(true);
		expect(isCustomised({ ...DEFAULT_CONTROLS, view: ARCHIVE_VIEW.GRID })).toBe(true);
		expect(isCustomised(DEFAULT_CONTROLS)).toBe(false);
	});
});

describe("archiveHref", () => {
	it("is the bare path for the defaults", () => {
		expect(archiveHref("/posts", DEFAULT_CONTROLS)).toBe("/posts");
	});

	it("keeps only what differs from the defaults", () => {
		expect(archiveHref("/posts", { ...DEFAULT_CONTROLS, view: ARCHIVE_VIEW.GRID })).toBe("/posts?view=grid");
		expect(
			archiveHref("/posts", { sort: ARCHIVE_SORT.TITLE_ASC, view: ARCHIVE_VIEW.LIST, category: "design", tag: "webdev" }),
		).toBe("/posts?category=design&tag=webdev&sort=title-asc");
	});

	it("adds the cursor only when it is passed (a new filter starts on the first page)", () => {
		const controls = { ...DEFAULT_CONTROLS, view: ARCHIVE_VIEW.GRID };
		expect(archiveHref("/posts", controls, { cursor: "abc=" })).toBe("/posts?view=grid&cursor=abc%3D");
		expect(archiveHref("/posts", controls)).not.toContain("cursor");
	});

	it("round-trips through the parser", () => {
		const controls = { sort: ARCHIVE_SORT.OLDEST, view: ARCHIVE_VIEW.GRID, category: "development", tag: "opinion" } as const;
		const href = archiveHref("/posts", controls);
		expect(parse(href.split("?")[1] ?? "")).toEqual(controls);
	});
});

describe("resultLabel", () => {
	it.each([
		[0, false, "0 posts"],
		[1, false, "1 post"],
		[4, false, "4 posts"],
		[20, true, "20+ posts"],
		[1, true, "1+ posts"],
	])("%i posts, more=%s → %s", (count, hasMore, expected) => {
		expect(resultLabel(count, hasMore)).toBe(expected);
	});
});
