import { describe, expect, it } from "vitest";
import { ARCHIVE_VIEW } from "./archive-controls-shared";
import {
	SHOP_DEFAULT_CONTROLS,
	SHOP_PRODUCT_TYPE,
	SHOP_SORT,
	isShopCustomised,
	isShopFiltered,
	parseShopArchiveControls,
	shopArchiveHref,
	shopOrderByFor,
	shopResultLabel,
	shopWhereFor,
} from "./shop-archive-controls";

const parse = (query: string) => parseShopArchiveControls(new URLSearchParams(query));

describe("parseShopArchiveControls", () => {
	it("falls back to newest first, list view and no type filter", () => {
		expect(parse("")).toEqual(SHOP_DEFAULT_CONTROLS);
	});

	it("reads a valid sort, view and type", () => {
		expect(parse("sort=price-asc&view=grid&type=subscription")).toEqual({
			sort: SHOP_SORT.PRICE_ASC,
			view: ARCHIVE_VIEW.GRID,
			type: SHOP_PRODUCT_TYPE.SUBSCRIPTION,
		});
	});

	it("ignores an unknown sort, view or type", () => {
		expect(parse("sort=random&view=masonry&type=weekly")).toEqual(SHOP_DEFAULT_CONTROLS);
	});

	it("treats an empty form value as no filter", () => {
		expect(parse("type=&sort=newest&view=list")).toEqual(SHOP_DEFAULT_CONTROLS);
	});
});

describe("shopOrderByFor", () => {
	it.each([
		[SHOP_SORT.NEWEST, { published_at: "desc" }],
		[SHOP_SORT.OLDEST, { published_at: "asc" }],
		[SHOP_SORT.PRICE_ASC, { published_at: "desc" }],
		[SHOP_SORT.PRICE_DESC, { published_at: "desc" }],
		[SHOP_SORT.TITLE_ASC, { title: "asc" }],
		[SHOP_SORT.TITLE_DESC, { title: "desc" }],
	])("%s → %j", (sort, expected) => {
		expect(shopOrderByFor(sort)).toEqual(expected);
	});
});

describe("shopWhereFor and isShopFiltered", () => {
	it("is empty without a type filter", () => {
		expect(shopWhereFor(SHOP_DEFAULT_CONTROLS)).toEqual({});
		expect(isShopFiltered(SHOP_DEFAULT_CONTROLS)).toBe(false);
	});

	it("does not push type into the CMS query (catalog filters on the storefront)", () => {
		const controls = { ...SHOP_DEFAULT_CONTROLS, type: SHOP_PRODUCT_TYPE.ONE_TIME };
		expect(shopWhereFor(controls)).toEqual({});
		expect(isShopFiltered(controls)).toBe(true);
	});

	it("counts a changed sort or view as customised, but not as filtered", () => {
		const sorted = { ...SHOP_DEFAULT_CONTROLS, sort: SHOP_SORT.PRICE_DESC };
		expect(isShopFiltered(sorted)).toBe(false);
		expect(isShopCustomised(sorted)).toBe(true);
		expect(isShopCustomised({ ...SHOP_DEFAULT_CONTROLS, view: ARCHIVE_VIEW.GRID })).toBe(true);
		expect(isShopCustomised(SHOP_DEFAULT_CONTROLS)).toBe(false);
	});
});

describe("shopArchiveHref", () => {
	it("is the bare path for the defaults", () => {
		expect(shopArchiveHref("/shop", SHOP_DEFAULT_CONTROLS)).toBe("/shop");
	});

	it("keeps only what differs from the defaults", () => {
		expect(
			shopArchiveHref("/shop", { ...SHOP_DEFAULT_CONTROLS, view: ARCHIVE_VIEW.GRID }),
		).toBe("/shop?view=grid");
		expect(
			shopArchiveHref("/shop", {
				sort: SHOP_SORT.PRICE_ASC,
				view: ARCHIVE_VIEW.LIST,
				type: SHOP_PRODUCT_TYPE.SUBSCRIPTION,
			}),
		).toBe("/shop?type=subscription&sort=price-asc");
	});

	it("adds the cursor only when it is passed", () => {
		const controls = { ...SHOP_DEFAULT_CONTROLS, view: ARCHIVE_VIEW.GRID };
		expect(shopArchiveHref("/shop", controls, { cursor: "abc=" })).toBe(
			"/shop?view=grid&cursor=abc%3D",
		);
		expect(shopArchiveHref("/shop", controls)).not.toContain("cursor");
	});

	it("round-trips through the parser", () => {
		const controls = {
			sort: SHOP_SORT.PRICE_DESC,
			view: ARCHIVE_VIEW.GRID,
			type: SHOP_PRODUCT_TYPE.ONE_TIME,
		} as const;
		const href = shopArchiveHref("/shop", controls);
		expect(parse(href.split("?")[1] ?? "")).toEqual(controls);
	});
});

describe("shopResultLabel", () => {
	it.each([
		[0, false, "0 products"],
		[1, false, "1 product"],
		[4, false, "4 products"],
		[20, true, "20+ products"],
	])("%i products, more=%s → %s", (count, hasMore, expected) => {
		expect(shopResultLabel(count, hasMore)).toBe(expected);
	});
});
