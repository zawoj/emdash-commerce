import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";

import type { HomeRailConfig } from "./config";

export const FEATURED_RAIL_LIMIT = 8;

export interface HomeRailLoaded {
	key: string;
	title: string;
	config: HomeRailConfig;
	items: ProductCardView[];
}

/** Category rails skip only hero/spotlight products; featured is capped and not cross-deduped. */
export const dedupeRails = (
	rails: readonly HomeRailLoaded[],
	reservedIds: ReadonlySet<string>,
): HomeRailLoaded[] =>
	rails
		.map((rail) => {
			const isFeatured = rail.key === "featured";
			const items = isFeatured
				? rail.items.slice(0, FEATURED_RAIL_LIMIT)
				: rail.items.filter((item) => !reservedIds.has(item.id));
			return { ...rail, items };
		})
		.filter((rail) => rail.items.length >= 2);

export const railByKey = (
	rails: readonly HomeRailLoaded[],
	key: string,
): HomeRailLoaded | undefined => rails.find((rail) => rail.key === key);
