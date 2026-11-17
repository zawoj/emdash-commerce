import { describe, expect, it } from "vitest";

import { checkoutCopy } from "./copy";
import { CHECKOUT_ORDER_NUMBER_TEST_ID, CHECKOUT_STATUS_TEST_ID, checkoutSuccessOf } from "./view-model";

describe("checkoutSuccessOf", () => {
	it("uses a pending tone until payment settles", () => {
		const model = checkoutSuccessOf(
			{
				status: "open",
				paymentStatus: "unpaid",
				orderNumber: null,
				orderStatus: null,
				maskedEmail: null,
			},
			checkoutCopy.en,
		);
		expect(model.confirmation.tone).toBe("pending");
		expect(model.confirmation.textTestId).toBe(CHECKOUT_STATUS_TEST_ID);
		expect(model.isPolling).toBe(true);
	});

	it("exposes the order number hook once the webhook created the order", () => {
		const model = checkoutSuccessOf(
			{
				status: "complete",
				paymentStatus: "paid",
				orderNumber: "ORD-42",
				orderStatus: "paid",
				maskedEmail: "a***@example.com",
			},
			checkoutCopy.en,
		);
		expect(model.confirmation.number).toBe("ORD-42");
		expect(model.confirmation.numberTestId).toBe(CHECKOUT_ORDER_NUMBER_TEST_ID);
		expect(model.isPolling).toBe(false);
	});
});