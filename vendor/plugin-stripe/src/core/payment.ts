import type { CurrencyCode } from "./money.js";

/** One provider payment (a Stripe PaymentIntent, or the charge of a subscription invoice). */

export const PAYMENT_STATUS = {
	processing: "processing",
	requiresAction: "requires_action",
	succeeded: "succeeded",
	failed: "failed",
	canceled: "canceled",
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const PAYMENT_PURPOSE = {
	checkout: "checkout",
	subscriptionRenewal: "subscription_renewal",
} as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSE)[keyof typeof PAYMENT_PURPOSE];

export interface Payment {
	id: string;
	orderId: string | null;
	subscriptionId: string | null;
	purpose: PaymentPurpose;
	status: PaymentStatus;
	amount: number;
	amountRefunded: number;
	currency: CurrencyCode;
	/** e.g. "card", "blik", "p24" */
	methodType: string | null;
	failureCode: string | null;
	failureMessage: string | null;
	stripe: {
		paymentIntentId: string | null;
		chargeId: string | null;
		invoiceId: string | null;
	};
	createdAt: string;
	updatedAt: string;
}

export const REFUND_STATUS = {
	pending: "pending",
	requiresAction: "requires_action",
	succeeded: "succeeded",
	failed: "failed",
	canceled: "canceled",
} as const;
export type RefundStatus = (typeof REFUND_STATUS)[keyof typeof REFUND_STATUS];

export const REFUND_REASON = {
	requestedByCustomer: "requested_by_customer",
	duplicate: "duplicate",
	fraudulent: "fraudulent",
} as const;
export type RefundReason = (typeof REFUND_REASON)[keyof typeof REFUND_REASON];

/**
 * A refund is recorded before the provider call (its id is the idempotency key) and then updated
 * from webhooks, so a crash between the two never issues a second refund.
 */
export interface Refund {
	id: string;
	orderId: string;
	paymentId: string;
	amount: number;
	currency: CurrencyCode;
	reason: RefundReason | null;
	note: string | null;
	status: RefundStatus;
	stripeRefundId: string | null;
	requestedBy: string | null;
	createdAt: string;
	updatedAt: string;
}

export const DISPUTE_STATUS = {
	open: "open",
	won: "won",
	lost: "lost",
} as const;
export type DisputeStatus = (typeof DISPUTE_STATUS)[keyof typeof DISPUTE_STATUS];
