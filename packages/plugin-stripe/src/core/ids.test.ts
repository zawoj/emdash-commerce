import { describe, expect, it } from "vitest";

import { createWebCryptoIdGenerator, fromBase64Url, toBase64Url } from "./ids.js";

describe("id generator", () => {
	const ids = createWebCryptoIdGenerator();

	it("returns base64url ids of the requested entropy", () => {
		expect(ids.randomId(24)).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(ids.randomId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
	});

	it("returns distinct values and the requested number of bytes", () => {
		expect(ids.randomId()).not.toBe(ids.randomId());
		expect(ids.randomBytes(100_000)).toHaveLength(100_000);
		expect(() => ids.randomBytes(-1)).toThrow(RangeError);
	});

	it("round-trips base64url without padding", () => {
		for (const length of [0, 1, 2, 3, 31, 32, 33]) {
			const bytes = ids.randomBytes(length);
			const encoded = toBase64Url(bytes);
			expect(encoded).not.toMatch(/[=+/]/);
			expect([...fromBase64Url(encoded)]).toEqual([...bytes]);
		}
	});
});
