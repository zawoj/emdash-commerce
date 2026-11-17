import { z } from "zod";

import { COORDINATE, HOTSPOT_MODE, LIMITS, MAX_POINTS, POINT_SIDE } from "./constants.js";

/**
 * The image exactly as EmDash's core image field stores it. Only the fields the plugin reads are typed; the
 * rest passes through untouched so a round trip never drops metadata (blurhash, focal point, dark variant).
 */
export const imageValueSchema = z.looseObject({
	id: z.string(),
	provider: z.string().optional(),
	src: z.string().optional(),
	previewUrl: z.string().optional(),
	alt: z.string().optional(),
	width: z.number().optional(),
	height: z.number().optional(),
	filename: z.string().optional(),
	mimeType: z.string().optional(),
	meta: z.record(z.string(), z.unknown()).optional(),
});
export type ImageValue = z.infer<typeof imageValueSchema>;

const coordinate = z.number().min(COORDINATE.min).max(COORDINATE.max);

export const hotspotPointSchema = z.object({
	id: z.string().min(1).max(LIMITS.pointId),
	x: coordinate,
	y: coordinate,
	title: z.string().max(LIMITS.title).optional(),
	text: z.string().max(LIMITS.text).optional(),
	side: z.enum([POINT_SIDE.start, POINT_SIDE.end]).optional(),
	productSlug: z.string().max(LIMITS.productSlug).optional(),
});
export type HotspotPoint = z.infer<typeof hotspotPointSchema>;

export const hotspotsValueSchema = z.object({
	image: imageValueSchema.nullable(),
	points: z.array(hotspotPointSchema).max(MAX_POINTS.hard),
});
export type HotspotsValue = z.infer<typeof hotspotsValueSchema>;

/** The widget's `field.options`. */
export const widgetOptionsSchema = z.object({
	mode: z.enum([HOTSPOT_MODE.products, HOTSPOT_MODE.callouts]),
	maxPoints: z.number().int().min(1).max(MAX_POINTS.hard).optional(),
});
export type WidgetOptions = z.infer<typeof widgetOptionsSchema>;
