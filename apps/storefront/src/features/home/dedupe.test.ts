import { describe, expect, it } from "vitest";

import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";

import type { HomeRailConfig } from "./config";
import { dedupeRails, FEATURED_RAIL_LIMIT } from "./dedupe";

const product = (id: string): ProductCardView =>
	({
		id,
		slug: id,
		title: id,
	}) as ProductCardView;

const rail = (key: string, ids: readonly string[]): { key: string; title: string; config: HomeRailConfig; items: ProductCardView[] } => ({
	key,
	title: key,
	config: { key, title: key },
	items: ids.map(product),
});

describe("dedupeRails", () => {
	it("caps featured at eight without removing hero or spotlight ids", () => {
		const ids = Array.from({ length: 12 }, (_, index) => `p${index}`);
		const reserved = new Set(["hero", "spotlight"]);
		const [featured] = dedupeRails([rail("featured", ids)], reserved);
		expect(featured?.items).toHaveLength(FEATURED_RAIL_LIMIT);
		expect(featured?.items[0]?.id).toBe("p0");
	});

	it("drops hero and spotlight from category rails only", () => {
		const reserved = new Set(["hero", "spotlight"]);
		const result = dedupeRails(
			[
				rail("featured", ["a", "b", "c"]),
				rail("new", ["hero", "d", "e"]),
				rail("sale", ["spotlight", "f", "g"]),
				rail("apparel", ["d", "hero", "h", "i"]),
			],
			reserved,
		);
		const byKey = Object.fromEntries(result.map((entry) => [entry.key, entry.items.map((item) => item.id)]));
		expect(byKey.featured).toEqual(["a", "b", "c"]);
		expect(byKey.new).toEqual(["d", "e"]);
		expect(byKey.sale).toEqual(["f", "g"]);
		expect(byKey.apparel).toEqual(["d", "h", "i"]);
	});

	it("does not dedupe category rails against each other", () => {
		const reserved = new Set<string>();
		const result = dedupeRails([rail("new", ["x", "y"]), rail("sale", ["x", "z"])], reserved);
		const byKey = Object.fromEntries(result.map((entry) => [entry.key, entry.items.map((item) => item.id)]));
		expect(byKey.new).toEqual(["x", "y"]);
		expect(byKey.sale).toEqual(["x", "z"]);
	});

	it("hides rails with fewer than two products after filtering", () => {
		const result = dedupeRails([rail("sale", ["hero"])], new Set(["hero"]));
		expect(result).toHaveLength(0);
	});
});
