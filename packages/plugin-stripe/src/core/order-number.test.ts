import { describe, expect, it } from "vitest";

import { DEFAULT_ORDER_NUMBER_FORMAT, formatOrderNumber, normalisePrefix, validateOrderNumberFormat } from "./order-number.js";

const placedAt = new Date("2026-11-12T10:00:00.000Z");

describe("formatOrderNumber", () => {
	it("renders the default format as PREFIX-YYYY-00042 from the UTC year", () => {
		expect(formatOrderNumber({ format: DEFAULT_ORDER_NUMBER_FORMAT, prefix: "ORD", placedAt, sequence: 42 })).toBe("ORD-2026-00042");
		const nye = new Date("2026-12-31T23:59:59.000Z");
		expect(formatOrderNumber({ format: DEFAULT_ORDER_NUMBER_FORMAT, prefix: "ORD", placedAt: nye, sequence: 1 })).toBe("ORD-2026-00001");
	});

	it("pads to the requested width and lets a larger sequence overflow the padding", () => {
		expect(formatOrderNumber({ format: "{YYYY}/{seq:3}", prefix: "x", placedAt, sequence: 7 })).toBe("2026/007");
		expect(formatOrderNumber({ format: "{YYYY}/{seq:3}", prefix: "x", placedAt, sequence: 12345 })).toBe("2026/12345");
	});

	it("normalises the prefix and falls back to ORD", () => {
		expect(normalisePrefix(" sh-op! ")).toBe("SHOP");
		expect(formatOrderNumber({ format: "{PREFIX}-{seq:2}", prefix: "---", placedAt, sequence: 3 })).toBe("ORD-03");
	});
});

describe("validateOrderNumberFormat", () => {
	it("accepts the default and rejects a format without exactly one sequence token", () => {
		expect(validateOrderNumberFormat(DEFAULT_ORDER_NUMBER_FORMAT)).toBeNull();
		expect(validateOrderNumberFormat("{PREFIX}-{YYYY}")).toMatch(/exactly one/);
		expect(validateOrderNumberFormat("{seq:3}-{seq:3}")).toMatch(/exactly one/);
	});

	it("rejects unknown tokens, a bad width and stray characters", () => {
		expect(validateOrderNumberFormat("{seq:5}-{MM}")).toMatch(/Unknown token \{MM\}/);
		expect(validateOrderNumberFormat("{seq:0}")).toMatch(/from 1 to 9/);
		expect(validateOrderNumberFormat("{seq:5}<script>")).toMatch(/may only contain/);
		expect(validateOrderNumberFormat(`${"A".repeat(40)}{seq:5}`)).toMatch(/at most 40/);
	});
});
