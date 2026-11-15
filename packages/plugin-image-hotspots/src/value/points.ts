import { COORDINATE, HOTSPOT_MODE, MAX_POINTS, type HotspotMode } from "./constants.js";
import { roundCoordinate, type Position } from "./geometry.js";
import {
	widgetOptionsSchema,
	type HotspotPoint,
	type HotspotsValue,
	type ImageValue,
	type WidgetOptions,
} from "./schema.js";

export const EMPTY_VALUE: HotspotsValue = { image: null, points: [] };

export interface ResolvedOptions {
	mode: HotspotMode;
	maxPoints: number;
}

/** Reads `field.options`; an unknown or missing mode falls back to callouts, `maxPoints` to the default. */
export const resolveOptions = (options: unknown): ResolvedOptions => {
	const parsed = widgetOptionsSchema.safeParse(options);
	if (parsed.success) return { mode: parsed.data.mode, maxPoints: parsed.data.maxPoints ?? MAX_POINTS.default };
	const loose = (typeof options === "object" && options !== null ? options : {}) as Partial<WidgetOptions>;
	const maxPoints =
		typeof loose.maxPoints === "number" && Number.isInteger(loose.maxPoints) && loose.maxPoints > 0
			? Math.min(loose.maxPoints, MAX_POINTS.hard)
			: MAX_POINTS.default;
	return { mode: HOTSPOT_MODE.callouts, maxPoints };
};

export const canAddPoint = (value: HotspotsValue, maxPoints: number): boolean => value.points.length < maxPoints;

/** `point-1`, `point-2`, ... the smallest one not yet taken. */
export const nextPointId = (points: readonly HotspotPoint[]): string => {
	const taken = new Set(points.map((point) => point.id));
	let n = points.length + 1;
	while (taken.has(`point-${n}`)) n += 1;
	return `point-${n}`;
};

/** Appends a point at `position`; returns the same value when `maxPoints` is reached. */
export const addPoint = (value: HotspotsValue, position: Position, maxPoints: number): HotspotsValue => {
	if (!canAddPoint(value, maxPoints)) return value;
	const point: HotspotPoint = {
		id: nextPointId(value.points),
		x: roundCoordinate(position.x),
		y: roundCoordinate(position.y),
	};
	return { ...value, points: [...value.points, point] };
};

const indexOfPoint = (value: HotspotsValue, id: string): number => value.points.findIndex((point) => point.id === id);

export const getPoint = (value: HotspotsValue, id: string): HotspotPoint | undefined =>
	value.points.find((point) => point.id === id);

export const movePointTo = (value: HotspotsValue, id: string, position: Position): HotspotsValue => {
	const point = getPoint(value, id);
	if (!point) return value;
	const x = roundCoordinate(position.x);
	const y = roundCoordinate(position.y);
	if (point.x === x && point.y === y) return value;
	return { ...value, points: value.points.map((entry) => (entry.id === id ? { ...entry, x, y } : entry)) };
};

export type TextPatch = Partial<Pick<HotspotPoint, "title" | "text" | "side" | "productSlug">>;

/** Sets or clears (empty string / undefined) the text fields of one point. */
export const patchPoint = (value: HotspotsValue, id: string, patch: TextPatch): HotspotsValue => {
	if (indexOfPoint(value, id) === -1) return value;
	return {
		...value,
		points: value.points.map((point) => {
			if (point.id !== id) return point;
			const next: HotspotPoint = { ...point, ...patch };
			for (const key of ["title", "text", "side", "productSlug"] as const) {
				if (next[key] === undefined || next[key] === "") delete next[key];
			}
			return next;
		}),
	};
};

export const removePoint = (value: HotspotsValue, id: string): HotspotsValue => {
	if (indexOfPoint(value, id) === -1) return value;
	return { ...value, points: value.points.filter((point) => point.id !== id) };
};

export const REORDER = { up: -1, down: 1 } as const;
export type ReorderDirection = (typeof REORDER)[keyof typeof REORDER];

/** Swaps a point with its neighbour; the ends stay where they are. */
export const reorderPoint = (value: HotspotsValue, id: string, direction: ReorderDirection): HotspotsValue => {
	const from = indexOfPoint(value, id);
	const to = from + direction;
	if (from === -1 || to < 0 || to >= value.points.length) return value;
	const points = [...value.points];
	[points[from], points[to]] = [points[to]!, points[from]!];
	return { ...value, points };
};

/** Replaces the image; null removes it (points stay, so re-picking an image keeps the work). */
export const setImage = (value: HotspotsValue, image: ImageValue | null): HotspotsValue => ({ ...value, image });

export const COORDINATE_RANGE = { min: COORDINATE.min, max: COORDINATE.max } as const;
