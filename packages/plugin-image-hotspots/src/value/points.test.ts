import { describe, expect, it } from "vitest";

import {
	addPoint,
	canAddPoint,
	movePointTo,
	nextPointId,
	patchPoint,
	removePoint,
	reorderPoint,
	REORDER,
	resolveOptions,
	setImage,
} from "./points.js";
import type { HotspotsValue } from "./schema.js";

const image = { id: "m1", alt: "" };
const base = (): HotspotsValue => ({
	image,
	points: [
		{ id: "point-1", x: 10, y: 10 },
		{ id: "point-2", x: 20, y: 20 },
		{ id: "point-3", x: 30, y: 30 },
	],
});

describe("resolveOptions", () => {
	it("reads mode and maxPoints", () => {
		expect(resolveOptions({ mode: "products", maxPoints: 6 })).toEqual({ mode: "products", maxPoints: 6 });
	});

	it("defaults maxPoints", () => {
		expect(resolveOptions({ mode: "callouts" })).toEqual({ mode: "callouts", maxPoints: 12 });
	});

	it("falls back to callouts for a missing or unknown mode and keeps a sane maxPoints", () => {
		expect(resolveOptions(undefined)).toEqual({ mode: "callouts", maxPoints: 12 });
		expect(resolveOptions({ mode: "nope", maxPoints: 4 })).toEqual({ mode: "callouts", maxPoints: 4 });
		expect(resolveOptions({ mode: "products", maxPoints: 9999 })).toEqual({ mode: "callouts", maxPoints: 50 });
		expect(resolveOptions({ mode: "products", maxPoints: -1 })).toEqual({ mode: "callouts", maxPoints: 12 });
	});
});

describe("addPoint", () => {
	it("appends a numbered point at the rounded position", () => {
		const next = addPoint({ image, points: [] }, { x: 12.345, y: 99.999 }, 6);
		expect(next.points).toEqual([{ id: "point-1", x: 12.35, y: 100 }]);
	});

	it("does not exceed maxPoints and returns the same value", () => {
		const value = base();
		expect(canAddPoint(value, 3)).toBe(false);
		expect(addPoint(value, { x: 1, y: 1 }, 3)).toBe(value);
	});

	it("never reuses an id after a delete", () => {
		const value = removePoint(base(), "point-1");
		expect(nextPointId(value.points)).toBe("point-4");
		const next = addPoint(value, { x: 5, y: 5 }, 6);
		const ids = next.points.map((point) => point.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("movePointTo", () => {
	it("moves one point and leaves the others", () => {
		const next = movePointTo(base(), "point-2", { x: 55.555, y: -3 });
		expect(next.points[1]).toEqual({ id: "point-2", x: 55.56, y: 0 });
		expect(next.points[0]).toEqual({ id: "point-1", x: 10, y: 10 });
	});

	it("returns the same value when nothing changes or the id is unknown", () => {
		const value = base();
		expect(movePointTo(value, "point-1", { x: 10, y: 10 })).toBe(value);
		expect(movePointTo(value, "missing", { x: 1, y: 1 })).toBe(value);
	});
});

describe("patchPoint", () => {
	it("sets text fields", () => {
		const next = patchPoint(base(), "point-1", { title: "Pockets", side: "end", productSlug: "run-cap" });
		expect(next.points[0]).toEqual({ id: "point-1", x: 10, y: 10, title: "Pockets", side: "end", productSlug: "run-cap" });
	});

	it("clears a field set to an empty string or undefined", () => {
		const set = patchPoint(base(), "point-1", { title: "A", text: "B" });
		const cleared = patchPoint(set, "point-1", { title: "", text: undefined });
		expect(cleared.points[0]).toEqual({ id: "point-1", x: 10, y: 10 });
	});

	it("ignores an unknown id", () => {
		const value = base();
		expect(patchPoint(value, "missing", { title: "x" })).toBe(value);
	});
});

describe("removePoint", () => {
	it("removes by id", () => {
		expect(removePoint(base(), "point-2").points.map((point) => point.id)).toEqual(["point-1", "point-3"]);
	});

	it("returns the same value for an unknown id", () => {
		const value = base();
		expect(removePoint(value, "missing")).toBe(value);
	});
});

describe("reorderPoint", () => {
	it("moves a point up and down", () => {
		expect(reorderPoint(base(), "point-2", REORDER.up).points.map((point) => point.id)).toEqual(["point-2", "point-1", "point-3"]);
		expect(reorderPoint(base(), "point-2", REORDER.down).points.map((point) => point.id)).toEqual(["point-1", "point-3", "point-2"]);
	});

	it("keeps the ends in place", () => {
		const value = base();
		expect(reorderPoint(value, "point-1", REORDER.up)).toBe(value);
		expect(reorderPoint(value, "point-3", REORDER.down)).toBe(value);
	});
});

describe("setImage", () => {
	it("replaces and removes the image but keeps the points", () => {
		const replaced = setImage(base(), { id: "m2" });
		expect(replaced.image).toEqual({ id: "m2" });
		expect(replaced.points).toHaveLength(3);
		expect(setImage(replaced, null).image).toBeNull();
	});
});
