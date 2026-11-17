import { COORDINATE, KEY_STEP } from "./constants.js";

export interface Position {
	x: number;
	y: number;
}

/** The part of a DOMRect the maths needs. */
export interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}

const FACTOR = 10 ** COORDINATE.decimals;

/** Clamps to 0..100 and rounds to two decimals; anything non-finite becomes 0. */
export const roundCoordinate = (value: number): number => {
	if (!Number.isFinite(value)) return COORDINATE.min;
	const clamped = Math.min(COORDINATE.max, Math.max(COORDINATE.min, value));
	return Math.round(clamped * FACTOR) / FACTOR;
};

/** Pointer position (viewport pixels) to percentages of the image box; null for a box without area. */
export const positionFromPointer = (pointer: { clientX: number; clientY: number }, box: Box): Position | null => {
	if (!(box.width > 0) || !(box.height > 0)) return null;
	return {
		x: roundCoordinate(((pointer.clientX - box.left) / box.width) * 100),
		y: roundCoordinate(((pointer.clientY - box.top) / box.height) * 100),
	};
};

const ARROW_DELTA: Record<string, Position> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 },
};

export const isArrowKey = (key: string): boolean => key in ARROW_DELTA;

/** The position after an arrow key (1% step, Shift = 5%), or null when the key is not an arrow. */
export const positionAfterKey = (position: Position, key: string, isShift: boolean): Position | null => {
	const delta = ARROW_DELTA[key];
	if (!delta) return null;
	const step = isShift ? KEY_STEP.large : KEY_STEP.normal;
	return { x: roundCoordinate(position.x + delta.x * step), y: roundCoordinate(position.y + delta.y * step) };
};

/** Aspect ratio for the stage; a missing size falls back to 3:2 so the area never collapses. */
export const aspectRatioOf = (image: { width?: number; height?: number } | null): number => {
	const width = image?.width;
	const height = image?.height;
	if (!width || !height || width <= 0 || height <= 0) return 3 / 2;
	return width / height;
};
