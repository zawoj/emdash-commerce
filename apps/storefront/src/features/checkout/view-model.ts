import type { OrderConfirmationProps } from "@emdash-commerce/design-system";
import { orderConfirmationTones } from "@emdash-commerce/design-system/components/parts/order-confirmation/types.ts";
import type { CheckoutStatusView } from "@emdash-commerce/plugin-stripe/contracts";

import { format } from "../../lib/strings";
import type { CheckoutCopy } from "./copy";

export const CHECKOUT_STATUS_TEST_ID = "checkout-status";
export const CHECKOUT_ORDER_NUMBER_TEST_ID = "checkout-order-number";

export interface CheckoutSuccessModel {
	confirmation: OrderConfirmationProps;
	isPolling: boolean;
}

const toneOf = (status: CheckoutStatusView): OrderConfirmationProps["tone"] => {
	if (status.status === "expired") return orderConfirmationTones.failed;
	if (status.paymentStatus === "paid" || status.paymentStatus === "no_payment_required") return orderConfirmationTones.success;
	return orderConfirmationTones.pending;
};

const headingOf = (status: CheckoutStatusView, copy: CheckoutCopy): string => {
	if (status.status === "expired") return copy.headingFailed;
	if (status.paymentStatus === "paid" || status.paymentStatus === "no_payment_required") return copy.headingPaid;
	return copy.headingPending;
};

const statusLineOf = (status: CheckoutStatusView, copy: CheckoutCopy): string => {
	if (status.status === "expired") return copy.statusExpired;
	if (status.paymentStatus === "paid") return copy.statusPaid;
	if (status.paymentStatus === "no_payment_required") return copy.statusNoPayment;
	return copy.statusUnpaid;
};

const textOf = (status: CheckoutStatusView, copy: CheckoutCopy): string => {
	const statusLine = statusLineOf(status, copy);
	if (status.status === "expired") return `${statusLine}. ${copy.textFailed}`;
	if (status.paymentStatus === "paid" || status.paymentStatus === "no_payment_required") {
		const detail = status.maskedEmail ? format(copy.textPaidWithEmail, { email: status.maskedEmail }) : copy.textPaid;
		return `${statusLine}. ${detail}`;
	}
	return `${statusLine}. ${copy.textPending}`;
};

/** Shapes checkout status polling results into `OrderConfirmation` props. */
export const checkoutSuccessOf = (status: CheckoutStatusView, copy: CheckoutCopy): CheckoutSuccessModel => {
	const hasOrderNumber = Boolean(status.orderNumber);
	return {
		isPolling: !hasOrderNumber && status.status !== "expired",
		confirmation: {
			tone: toneOf(status),
			heading: headingOf(status, copy),
			text: textOf(status, copy),
			textTestId: CHECKOUT_STATUS_TEST_ID,
			numberLabel: copy.numberLabel,
			number: status.orderNumber ?? copy.numberPending,
			numberTestId: hasOrderNumber ? CHECKOUT_ORDER_NUMBER_TEST_ID : undefined,
		},
	};
};