import type { BillingInterval } from "./catalog.js";
import type { CurrencyCode } from "./money.js";

/** Mirrors Stripe's subscription statuses one to one; Stripe owns the lifecycle. */
export const SUBSCRIPTION_STATUS = {
	incomplete: "incomplete",
	incompleteExpired: "incomplete_expired",
	trialing: "trialing",
	active: "active",
	pastDue: "past_due",
	canceled: "canceled",
	unpaid: "unpaid",
	paused: "paused",
} as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

/** Statuses in which the customer is entitled to what they subscribed to. */
export const isEntitledStatus = (status: SubscriptionStatus): boolean =>
	status === SUBSCRIPTION_STATUS.active || status === SUBSCRIPTION_STATUS.trialing;

export interface SubscriptionItem {
	priceId: string | null;
	productId: string | null;
	variantId: string | null;
	title: string;
	quantity: number;
	stripePriceId: string;
}

export interface Subscription {
	id: string;
	customerId: string | null;
	initialOrderId: string | null;
	status: SubscriptionStatus;
	items: SubscriptionItem[];
	interval: BillingInterval;
	intervalCount: number;
	currency: CurrencyCode;
	/** Recurring amount per period, minor units. */
	amount: number;
	currentPeriodStart: string | null;
	currentPeriodEnd: string | null;
	trialEnd: string | null;
	cancelAtPeriodEnd: boolean;
	canceledAt: string | null;
	stripe: {
		subscriptionId: string;
		customerId: string;
		latestInvoiceId: string | null;
	};
	/** Provider `created` of the last event applied; older events are ignored. */
	providerUpdatedAt: number;
}
