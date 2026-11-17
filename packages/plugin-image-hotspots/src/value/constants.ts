/** Plugin identity and the vocabularies shared by the value, the widget and the site. */

import packageJson from "../../package.json" with { type: "json" };

export const PLUGIN_ID = "image-hotspots";
/** The package version, so a `changeset version` bump is the only place the number changes. */
export const PLUGIN_VERSION: string = packageJson.version;

/** The widget name; a field selects it with `widget: "image-hotspots:hotspots"`. */
export const WIDGET_NAME = "hotspots";
export const WIDGET_REF = `${PLUGIN_ID}:${WIDGET_NAME}`;

/** What a point carries: a product (by slug) or a title/text callout. */
export const HOTSPOT_MODE = {
	products: "products",
	callouts: "callouts",
} as const;
export type HotspotMode = (typeof HOTSPOT_MODE)[keyof typeof HOTSPOT_MODE];

/** Which side of the marker a callout card opens on. */
export const POINT_SIDE = {
	start: "start",
	end: "end",
} as const;
export type PointSide = (typeof POINT_SIDE)[keyof typeof POINT_SIDE];

/** Coordinates are percentages of the image, kept to two decimals. */
export const COORDINATE = {
	min: 0,
	max: 100,
	decimals: 2,
} as const;

/** Arrow-key nudge in percent of the image; Shift takes the large step. */
export const KEY_STEP = {
	normal: 1,
	large: 5,
} as const;

export const MAX_POINTS = {
	/** Used when the field does not set `maxPoints`. */
	default: 12,
	/** Upper bound for any field, whatever `maxPoints` says. */
	hard: 50,
} as const;

export const LIMITS = {
	pointId: 64,
	title: 120,
	text: 500,
	productSlug: 200,
} as const;

/** The collection the product picker lists. */
export const PRODUCT_COLLECTION = "products";
