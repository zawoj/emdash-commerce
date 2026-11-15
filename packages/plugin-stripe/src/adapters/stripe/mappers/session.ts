import type Stripe from "stripe";

import type { CheckoutMode } from "../../../core/cart.js";
import {
	ProviderError,
	type CheckoutSessionResult,
	type ProviderCheckoutLine,
	type ProviderCheckoutSession,
} from "../../../ports/payment-provider.js";
import { STRIPE_ERROR_CODE } from "../errors.js";
import { addressOf, currencyOf, idOf, metadataOf } from "./common.js";

/** What settlement needs from a Session; passed as `expand` on retrieve (the Session itself is never trusted from an event). */
export const SESSION_RETRIEVE_EXPAND = ["line_items"] as const;

const SESSION_STATUS = ["open", "complete", "expired"] as const;
const PAYMENT_STATUS = ["paid", "unpaid", "no_payment_required"] as const;

const modeOf = (session: Stripe.Checkout.Session): CheckoutMode => {
	if (session.mode === "payment") return "payment";
	if (session.mode === "subscription") return "subscription";
	throw new ProviderError(`Checkout Session ${session.id} has unsupported mode "${session.mode}"`, {
		isRetryable: false,
		providerCode: STRIPE_ERROR_CODE.invalidResponse,
	});
};

const statusOf = (status: string | null): ProviderCheckoutSession["status"] =>
	SESSION_STATUS.find((candidate) => candidate === status) ?? "open";

const paymentStatusOf = (status: string): ProviderCheckoutSession["paymentStatus"] =>
	PAYMENT_STATUS.find((candidate) => candidate === status) ?? "unpaid";

const lineOf = (line: Stripe.LineItem, sessionCurrency: ProviderCheckoutSession["currency"]): ProviderCheckoutLine => ({
	providerPriceId: idOf(line.price) ?? "",
	quantity: line.quantity ?? 1,
	description: line.description ?? "",
	amountSubtotal: line.amount_subtotal,
	amountDiscount: line.amount_discount,
	amountTax: line.amount_tax,
	amountTotal: line.amount_total,
	currency: line.currency ? currencyOf(line.currency, `line item ${line.id}`) : sessionCurrency,
});

/**
 * Shipping is `shipping_cost.amount_subtotal` (before discounts and taxes), so that
 * `total = subtotal - discount + shipping + tax` holds; its tax is already inside `total_details.amount_tax`.
 */
export const toProviderCheckoutSession = (session: Stripe.Checkout.Session): ProviderCheckoutSession => {
	const currency = currencyOf(session.currency, `Checkout Session ${session.id}`);
	const details = session.customer_details;
	return {
		sessionId: session.id,
		status: statusOf(session.status),
		paymentStatus: paymentStatusOf(session.payment_status),
		mode: modeOf(session),
		isLivemode: session.livemode,
		currency,
		amountSubtotal: session.amount_subtotal ?? 0,
		amountDiscount: session.total_details?.amount_discount ?? 0,
		amountTax: session.total_details?.amount_tax ?? 0,
		amountShipping: session.shipping_cost?.amount_subtotal ?? session.total_details?.amount_shipping ?? 0,
		amountTotal: session.amount_total ?? 0,
		email: details?.email ?? session.customer_email ?? null,
		name: details?.name ?? details?.individual_name ?? null,
		phone: details?.phone ?? null,
		billingAddress: addressOf(details?.address),
		shippingAddress: addressOf(session.collected_information?.shipping_details?.address),
		providerCustomerId: idOf(session.customer),
		paymentIntentId: idOf(session.payment_intent),
		subscriptionId: idOf(session.subscription),
		invoiceId: idOf(session.invoice),
		metadata: metadataOf(session.metadata),
		lines: (session.line_items?.data ?? []).map((line) => lineOf(line, currency)),
		createdAt: session.created,
	};
};

export const toCheckoutSessionResult = (session: Stripe.Checkout.Session): CheckoutSessionResult => ({
	sessionId: session.id,
	url: session.url ?? null,
	clientSecret: session.client_secret ?? null,
	expiresAt: new Date(session.expires_at * 1000).toISOString(),
});
