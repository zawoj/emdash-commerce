import { describe, expect, it } from "vitest";
import { isValidCartId } from "./cart-id";

describe("isValidCartId", () => {
	it("accepts a 32-char base64url id", () => {
		expect(isValidCartId("abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
		expect(isValidCartId("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef")).toBe(true);
	});

	it("rejects malformed ids", () => {
		expect(isValidCartId("")).toBe(false);
		expect(isValidCartId("short")).toBe(false);
		expect(isValidCartId("a".repeat(33))).toBe(false);
		expect(isValidCartId("invalid+chars/are+not+allowed!!")).toBe(false);
	});
});
