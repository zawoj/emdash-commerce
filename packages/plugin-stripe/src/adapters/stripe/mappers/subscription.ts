import type Stripe from "stripe";

import { BILLING_INTERVAL, type BillingInterval } from "../../../core/catalog.js";
import { SUBSCRIPTION_STATUS, type SubscriptionStatus } from "../../../core/subscription.js";
import { ProviderError, type ProviderInvoice, type ProviderSubscription } from "../../../ports/payment-provider.js";
import { STRIPE_ERROR_CODE } from "../errors.js";
import { currencyOf, idOf, metadataOf } from "./common.js";

/** Invoice ↔ payment links live in `payments` (an expandable list); the intent is expanded for its `latest_charge`. */
export const INVOICE_RETRIEVE_EXPAND = ["payments.data.payment.payment_intent"] as const;

const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = Object.values(SUBSCRIPTION_STATUS);
const BILLING_INTERVALS: readonly BillingInterval[] = Object.values(BILLING_INTERVAL);

/** An unknown status is treated as not entitled: it can only withhold access, never grant it. */
const subscriptionStatusOf = (status: string): SubscriptionStatus =>
	SUBSCRIPTION_STATUSES.find((candidate) => candidate === status) ?? SUBSCRIPTION_STATUS.incomplete;

/**
 * Billing periods moved from the Subscription to its items in API 2025-03-31 (`SubscriptionItem.current_period_*`,
 * Subscriptions.d.ts). Older event payloads still carry them on the Subscription, so fall back to those.
 */
const periodOf = (subscription: Stripe.Subscription, field: "current_period_start" | "current_period_end"): number | null => {
	const fromItem = subscription.items?.data?.[0]?.[field];
	if (typeof fromItem === "number") return fromItem;
	const legacy = (subscription as unknown as Record<string, unknown>)[field];
	return typeof legacy === "number" ? legacy : null;
};

export const toProviderSubscription = (subscription: Stripe.Subscription): ProviderSubscription => {
	const items = subscription.items?.data ?? [];
	const recurring = items.find((item) => item.price?.recurring)?.price.recurring;
	if (!recurring) {
		throw new ProviderError(`Subscription ${subscription.id} has no recurring item`, {
			isRetryable: false,
			providerCode: STRIPE_ERROR_CODE.invalidResponse,
		});
	}
	const interval = BILLING_INTERVALS.find((candidate) => candidate === recurring.interval);
	if (!interval) {
		throw new ProviderError(`Subscription ${subscription.id} has unsupported interval "${recurring.interval}"`, {
			isRetryable: false,
			providerCode: STRIPE_ERROR_CODE.invalidResponse,
		});
	}
	return {
		subscriptionId: subscription.id,
		providerCustomerId: idOf(subscription.customer) ?? "",
		status: subscriptionStatusOf(subscription.status),
		items: items.map((item) => ({
			providerPriceId: item.price.id,
			quantity: item.quantity ?? 1,
			description: item.price.nickname ?? null,
		})),
		interval,
		intervalCount: recurring.interval_count,
		currency: currencyOf(subscription.currency, `Subscription ${subscription.id}`),
		amount: items.reduce((sum, item) => sum + (item.price.unit_amount ?? 0) * (item.quantity ?? 1), 0),
		currentPeriodStart: periodOf(subscription, "current_period_start"),
		currentPeriodEnd: periodOf(subscription, "current_period_end"),
		trialEnd: subscription.trial_end ?? null,
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
		canceledAt: subscription.canceled_at ?? null,
		latestInvoiceId: idOf(subscription.latest_invoice),
		metadata: metadataOf(subscription.metadata),
	};
};

const INVOICE_STATUSES: readonly ProviderInvoice["status"][] = ["draft", "open", "paid", "uncollectible", "void"];

const invoiceStatusOf = (status: string | null): ProviderInvoice["status"] =>
	INVOICE_STATUSES.find((candidate) => candidate === status) ?? "draft";

/** A paid payment is preferred; an invoice can hold several attempts (`payments` lists each). */
const settlingPayment = (invoice: Stripe.Invoice): Stripe.InvoicePayment | null => {
	const payments = invoice.payments?.data ?? [];
	return payments.find((payment) => payment.status === "paid") ?? payments[0] ?? null;
};

export const toProviderInvoice = (invoice: Stripe.Invoice): ProviderInvoice => {
	const payment = settlingPayment(invoice)?.payment;
	const intent = payment?.payment_intent;
	const expandedIntent = intent && typeof intent === "object" ? intent : null;
	const subscriptionDetails = invoice.parent?.subscription_details;
	return {
		invoiceId: invoice.id,
		subscriptionId: idOf(subscriptionDetails?.subscription),
		providerCustomerId: idOf(invoice.customer),
		paymentIntentId: idOf(intent),
		chargeId: idOf(expandedIntent?.latest_charge) ?? idOf(payment?.charge),
		status: invoiceStatusOf(invoice.status),
		billingReason: invoice.billing_reason ?? null,
		amountPaid: invoice.amount_paid,
		amountDue: invoice.amount_due,
		currency: currencyOf(invoice.currency, `Invoice ${invoice.id}`),
		attemptCount: invoice.attempt_count,
	};
};
