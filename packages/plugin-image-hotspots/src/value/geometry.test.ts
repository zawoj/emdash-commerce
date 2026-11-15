import { describe, expect, it } from "vitest";

import { aspectRatioOf, isArrowKey, positionAfterKey, positionFromPointer, roundCoordinate } from "./geometry.js";

describe("roundCoordinate", () => {
	it("rounds to two decimals", () => {
		expect(roundCoordinate(12.3456)).toBe(12.35);
		expect(roundCoordinate(0.004)).toBe(0);
	});

	it("clamps to 0..100", () => {
		expect(roundCoordinate(-5)).toBe(0);
		expect(roundCoordinate(100.01)).toBe(100);
		expect(roundCoordinate(250)).toBe(100);
	});

	it("turns non-finite numbers into 0", () => {
		expect(roundCoordinate(Number.NaN)).toBe(0);
		expect(roundCoordinate(Number.POSITIVE_INFINITY)).toBe(0);
	});
});

describe("positionFromPointer", () => {
	const box = { left: 100, top: 50, width: 400, height: 200 };

	it("maps viewport pixels to percentages of the box", () => {
		expect(positionFromPointer({ clientX: 300, clientY: 150 }, box)).toEqual({ x: 50, y: 50 });
		expect(positionFromPointer({ clientX: 100, clientY: 250 }, box)).toEqual({ x: 0, y: 100 });
	});

	it("clamps a pointer outside the box (drag past the edge)", () => {
		expect(positionFromPointer({ clientX: 9999, clientY: -40 }, box)).toEqual({ x: 100, y: 0 });
	});

	it("keeps two decimals", () => {
		expect(positionFromPointer({ clientX: 101, clientY: 51 }, box)).toEqual({ x: 0.25, y: 0.5 });
	});

	it("returns null for a box without area (not laid out yet)", () => {
		expect(positionFromPointer({ clientX: 1, clientY: 1 }, { left: 0, top: 0, width: 0, height: 10 })).toBeNull();
		expect(positionFromPointer({ clientX: 1, clientY: 1 }, { left: 0, top: 0, width: 10, height: 0 })).toBeNull();
	});
});

describe("positionAfterKey", () => {
	const at = { x: 50, y: 50 };

	it("moves 1% per arrow key", () => {
		expect(positionAfterKey(at, "ArrowLeft", false)).toEqual({ x: 49, y: 50 });
		expect(positionAfterKey(at, "ArrowRight", false)).toEqual({ x: 51, y: 50 });
		expect(positionAfterKey(at, "ArrowUp", false)).toEqual({ x: 50, y: 49 });
		expect(positionAfterKey(at, "ArrowDown", false)).toEqual({ x: 50, y: 51 });
	});

	it("moves 5% with Shift", () => {
		expect(positionAfterKey(at, "ArrowRight", true)).toEqual({ x: 55, y: 50 });
		expect(positionAfterKey(at, "ArrowUp", true)).toEqual({ x: 50, y: 45 });
	});

	it("stops at the edges instead of leaving the image", () => {
		expect(positionAfterKey({ x: 0, y: 100 }, "ArrowLeft", true)).toEqual({ x: 0, y: 100 });
		expect(positionAfterKey({ x: 0, y: 100 }, "ArrowDown", false)).toEqual({ x: 0, y: 100 });
		expect(positionAfterKey({ x: 98, y: 2 }, "ArrowRight", true)).toEqual({ x: 100, y: 2 });
	});

	it("ignores other keys", () => {
		expect(positionAfterKey(at, "Enter", false)).toBeNull();
		expect(isArrowKey("ArrowUp")).toBe(true);
		expect(isArrowKey("a")).toBe(false);
	});
});

describe("aspectRatioOf", () => {
	it("is width over height", () => {
		expect(aspectRatioOf({ width: 1600, height: 800 })).toBe(2);
	});

	it("falls back to 3:2 without a usable size", () => {
		expect(aspectRatioOf(null)).toBe(1.5);
		expect(aspectRatioOf({})).toBe(1.5);
		expect(aspectRatioOf({ width: 0, height: 10 })).toBe(1.5);
	});
});
