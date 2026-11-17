import { describe, expect, it } from "vitest";

import { cartCopy } from "./copy";
import { cartNoticeHref, checkoutNoticeFor, checkoutNoticeMessage } from "./checkout-notice";

describe("checkoutNoticeFor", () => {
	it("sends an empty or missing cart back to the cart, not to an error page", () => {
		expect(checkoutNoticeFor(404, "NOT_FOUND")).toBe("empty");
		expect(cartNoticeHref("empty")).toBe("/cart?checkout=empty");
	});

	it("sends a cart that cannot be checked out back to the cart", () => {
		for (const code of ["CART_NOT_CHECKOUT_READY", "INSUFFICIENT_STOCK", "CART_LOCKED", "CONFLICT"])
			expect(checkoutNoticeFor(409, code)).toBe("not_ready");
	});

	it("keeps provider and server failures as errors", () => {
		expect(checkoutNoticeFor(502, "PROVIDER_ERROR")).toBeNull();
		expect(checkoutNoticeFor(503, "NOT_CONFIGURED")).toBeNull();
		expect(checkoutNoticeFor(500, "INTERNAL")).toBeNull();
		expect(checkoutNoticeFor(502, undefined)).toBeNull();
	});
});

describe("checkoutNoticeMessage", () => {
	it("explains every notice and shows nothing for an unknown query value", () => {
		const copy = cartCopy.en;
		expect(checkoutNoticeMessage("empty", copy)).toMatch(/empty/i);
		expect(checkoutNoticeMessage("rate_limited", copy)).toBeTruthy();
		expect(checkoutNoticeMessage("<script>", copy)).toBeNull();
		expect(checkoutNoticeMessage(null, copy)).toBeNull();
	});
});