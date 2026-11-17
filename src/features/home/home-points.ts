import { hasPlacedPoints, normaliseValue } from "@emdash-commerce/plugin-image-hotspots/value";

import { urlFromCmsImage } from "../../lib/media";

export interface LookPoint {
	productSlug: string;
	x: number;
	y: number;
}

export interface Callout {
	title: string;
	text: string;
	x: number;
	y: number;
	side?: "start" | "end";
}

export interface PointsImage {
	url: string;
	alt: string;
}

const imageOf = (value: ReturnType<typeof normaliseValue>): PointsImage | null => {
	const url = urlFromCmsImage(value.image ?? undefined);
	return url ? { url, alt: value.image?.alt ?? "" } : null;
};

/** The shop-the-look image and its product points; null (hide the section) without an image or a product point. */
export const readLook = (field: unknown): { image: PointsImage; points: LookPoint[] } | null => {
	const value = normaliseValue(field);
	const image = imageOf(value);
	if (!image || !hasPlacedPoints(value)) return null;
	const points = value.points.flatMap((point) =>
		point.productSlug ? [{ productSlug: point.productSlug, x: point.x, y: point.y }] : [],
	);
	return points.length > 0 ? { image, points } : null;
};

/** The spotlight image and callouts; null when there is no image or no callout with a title (use the product image). */
export const readSpotlight = (field: unknown): { image: PointsImage; callouts: Callout[] } | null => {
	const value = normaliseValue(field);
	const image = imageOf(value);
	if (!image) return null;
	const callouts = value.points.flatMap((point) =>
		point.title ? [{ title: point.title, text: point.text ?? "", x: point.x, y: point.y, ...(point.side ? { side: point.side } : {}) }] : [],
	);
	return callouts.length > 0 ? { image, callouts } : null;
};
