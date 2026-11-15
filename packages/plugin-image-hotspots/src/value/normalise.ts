import { COORDINATE, LIMITS, MAX_POINTS, POINT_SIDE } from "./constants.js";
import { roundCoordinate } from "./geometry.js";
import { EMPTY_VALUE, nextPointId } from "./points.js";
import { imageValueSchema, type HotspotPoint, type HotspotsValue } from "./schema.js";

const isRecord = (input: unknown): input is Record<string, unknown> =>
	typeof input === "object" && input !== null && !Array.isArray(input);

const cleanText = (input: unknown, max: number, shouldTrim: boolean): string | undefined => {
	if (typeof input !== "string") return undefined;
	const text = (shouldTrim ? input.trim() : input).slice(0, max);
	return text === "" ? undefined : text;
};

const cleanCoordinate = (input: unknown): number | null => {
	const number = typeof input === "string" && input.trim() !== "" ? Number(input) : input;
	if (typeof number !== "number" || !Number.isFinite(number)) return null;
	return roundCoordinate(Math.min(COORDINATE.max, Math.max(COORDINATE.min, number)));
};

const cleanPoint = (input: unknown, taken: readonly HotspotPoint[], shouldTrim: boolean): HotspotPoint | null => {
	if (!isRecord(input)) return null;
	const x = cleanCoordinate(input.x);
	const y = cleanCoordinate(input.y);
	if (x === null || y === null) return null;
	const rawId = cleanText(input.id, LIMITS.pointId, true);
	const id = rawId && !taken.some((point) => point.id === rawId) ? rawId : nextPointId(taken);
	const point: HotspotPoint = { id, x, y };
	const title = cleanText(input.title, LIMITS.title, shouldTrim);
	const text = cleanText(input.text, LIMITS.text, shouldTrim);
	const productSlug = cleanText(input.productSlug, LIMITS.productSlug, true);
	if (title) point.title = title;
	if (text) point.text = text;
	if (productSlug) point.productSlug = productSlug;
	if (input.side === POINT_SIDE.start || input.side === POINT_SIDE.end) point.side = input.side;
	return point;
};

const parseJson = (input: unknown): unknown => {
	if (typeof input !== "string") return input;
	try {
		return JSON.parse(input);
	} catch {
		return null;
	}
};

/**
 * Turns whatever a json field holds (an object, a JSON string, null, garbage) into a valid value: drops
 * points without usable coordinates, clamps and rounds the rest, trims text, makes ids unique and caps the
 * count. Never throws, so the widget and the site can both call it on untrusted stored data. The widget passes
 * `shouldTrim: false` so a space typed at the end of a title is not eaten while the editor is still typing.
 */
export const normaliseValue = (
	input: unknown,
	maxPoints: number = MAX_POINTS.hard,
	{ shouldTrim = true }: { shouldTrim?: boolean } = {},
): HotspotsValue => {
	const raw = parseJson(input);
	if (!isRecord(raw)) return EMPTY_VALUE;
	const image = imageValueSchema.safeParse(raw.image);
	const limit = Math.min(maxPoints, MAX_POINTS.hard);
	const points: HotspotPoint[] = [];
	for (const candidate of Array.isArray(raw.points) ? raw.points : []) {
		if (points.length >= limit) break;
		const point = cleanPoint(candidate, points, shouldTrim);
		if (point) points.push(point);
	}
	return { image: image.success ? image.data : null, points };
};

/** True when the site has something to draw: an image and at least one point. */
export const hasPlacedPoints = (value: HotspotsValue): boolean => value.image !== null && value.points.length > 0;
