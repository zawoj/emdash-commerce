import type Stripe from "stripe";

import { PAYMENT_STATUS, REFUND_STATUS, DISPUTE_STATUS, type DisputeStatus, type PaymentStatus, type RefundStatus } from "../../../core/payment.js";
import type { ProviderDispute, ProviderPayment, ProviderRefund } from "../../../ports/payment-provider.js";
import { ADAPTER_METADATA } from "../constants.js";
import { currencyOf, expandedOf, idOf, metadataOf } from "./common.js";

/** What `retrievePayment` expands: the charge carries `amount_refunded` and the payment method details. */
export const PAYMENT_RETRIEVE_EXPAND = ["latest_charge"] as const;

/**
 * `requires_payment_method` is both "not attempted yet" and "attempt failed"; only the latter has a
 * `last_payment_error`. `requires_capture` cannot occur (capture is automatic) and maps to processing.
 */
export const paymentStatusOf = (intent: Stripe.PaymentIntent): PaymentStatus => {
	switch (intent.status) {
		case "succeeded":
			return PAYMENT_STATUS.succeeded;
		case "canceled":
			return PAYMENT_STATUS.canceled;
		case "processing":
		case "requires_capture":
			return PAYMENT_STATUS.processing;
		case "requires_payment_method":
			return intent.last_payment_error ? PAYMENT_STATUS.failed : PAYMENT_STATUS.requiresAction;
		default:
			return PAYMENT_STATUS.requiresAction;
	}
};

const methodTypeOf = (intent: Stripe.PaymentIntent, charge: Stripe.Charge | null): string | null =>
	charge?.payment_method_details?.type ??
	expandedOf(intent.payment_method)?.type ??
	intent.last_payment_error?.payment_method?.type ??
	intent.last_payment_error?.payment_method_type ??
	null;

/**
 * `amountRefunded` is known only when `latest_charge` is expanded (retrieve); event snapshots report 0 and
 * refunds are tracked through `refund.*` events instead.
 */
export const toProviderPayment = (intent: Stripe.PaymentIntent, options: { forceFailed?: boolean } = {}): ProviderPayment => {
	const charge = expandedOf(intent.latest_charge);
	const error = intent.last_payment_error;
	return {
		paymentIntentId: intent.id,
		status: options.forceFailed ? PAYMENT_STATUS.failed : paymentStatusOf(intent),
		amount: intent.amount,
		amountRefunded: charge?.amount_refunded ?? 0,
		currency: currencyOf(intent.currency, `PaymentIntent ${intent.id}`),
		latestChargeId: idOf(intent.latest_charge),
		methodType: methodTypeOf(intent, charge),
		failureCode: error?.code ?? error?.decline_code ?? charge?.failure_code ?? null,
		failureMessage: error?.message ?? charge?.failure_message ?? null,
		metadata: metadataOf(intent.metadata),
	};
};

const REFUND_STATUSES: readonly RefundStatus[] = Object.values(REFUND_STATUS);

/** A refund without a status (older objects) is still in flight. */
const refundStatusOf = (status: string | null): RefundStatus =>
	REFUND_STATUSES.find((candidate) => candidate === status) ?? REFUND_STATUS.pending;

export const toProviderRefund = (refund: Stripe.Refund): ProviderRefund => ({
	refundId: refund.id,
	paymentIntentId: idOf(refund.payment_intent),
	chargeId: idOf(refund.charge),
	amount: refund.amount,
	currency: currencyOf(refund.currency, `Refund ${refund.id}`),
	status: refundStatusOf(refund.status),
	reason: refund.reason ?? null,
	refundRecordId: metadataOf(refund.metadata)[ADAPTER_METADATA.refundRecordId] ?? null,
});

/** needs_response / under_review / warning_* / appeal_* are all still contestable or pending; `prevented` cost nothing. */
export const disputeStatusOf = (status: string): DisputeStatus => {
	switch (status) {
		case "won":
		case "prevented":
		case "warning_closed":
			return DISPUTE_STATUS.won;
		case "lost":
			return DISPUTE_STATUS.lost;
		default:
			return DISPUTE_STATUS.open;
	}
};

export const toProviderDispute = (dispute: Stripe.Dispute): ProviderDispute => ({
	disputeId: dispute.id,
	chargeId: idOf(dispute.charge) ?? "",
	paymentIntentId: idOf(dispute.payment_intent),
	amount: dispute.amount,
	currency: currencyOf(dispute.currency, `Dispute ${dispute.id}`),
	status: disputeStatusOf(dispute.status),
	reason: dispute.reason ?? null,
});
