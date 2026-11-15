import { BILLING_INTERVAL } from "../../../core/catalog.js";
import type { Customer } from "../../../core/customer.js";
import { toCurrencyCode } from "../../../core/money.js";
import {
	FULFILLMENT_STATUS,
	ORDER_LIFECYCLE_STATUS,
	ORDER_PAYMENT_STATUS,
	REVIEW_FLAG,
	type Order,
	type OrderLine,
	type ReviewFlag,
} from "../../../core/order.js";
import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE, type OrderTimelineEvent } from "../../../core/order-timeline.js";
import { PAYMENT_PURPOSE, PAYMENT_STATUS, type Payment } from "../../../core/payment.js";
import { SUBSCRIPTION_STATUS, type Subscription, type SubscriptionItem } from "../../../core/subscription.js";
import { CUSTOMER_FIELD, ORDER_EVENT_FIELD, ORDER_FIELD, ORDER_LINE_FIELD, PAYMENT_FIELD, SUBSCRIPTION_FIELD } from "../schema/field-names.js";
import { asAddress, asArray, asBool, asInt, asRecord, asString, compact, oneOf, oneOfOrNull, type ContentEntry, type Data } from "./values.js";

/**
 * Entry <-> domain mapping for the plugin-owned collections. `to*` reads a `ContentEntry`; `*PatchToData`
 * turns a (partial) domain object into the field values for `content.create` / `content.update`, writing
 * only the keys that are present (an `update` must not blank fields it did not mention).
 */

const paymentStatuses = Object.values(ORDER_PAYMENT_STATUS);
const reviewFlags = Object.values(REVIEW_FLAG);

/** The links of an order, read through `RelationsPort` (relation-bound fields never appear in `item.data`). */
export interface OrderLinks {
	customerId: string | null;
	subscriptionId: string | null;
}

/** The links of a subscription, read through `RelationsPort`. */
export interface SubscriptionLinks {
	customerId: string | null;
	initialOrderId: string | null;
}

export const toOrderLines = (value: unknown): OrderLine[] =>
	asArray(value).flatMap((row) => {
		const record = asRecord(row);
		if (!record) return [];
		return [
			{
				priceId: asString(record[ORDER_LINE_FIELD.priceId]) ?? "",
				productId: asString(record[ORDER_LINE_FIELD.productId]) ?? "",
				variantId: asString(record[ORDER_LINE_FIELD.variantId]),
				title: asString(record[ORDER_LINE_FIELD.title]) ?? "",
				variantTitle: asString(record[ORDER_LINE_FIELD.variantTitle]),
				sku: asString(record[ORDER_LINE_FIELD.sku]),
				optionsText: asString(record[ORDER_LINE_FIELD.options]),
				quantity: asInt(record[ORDER_LINE_FIELD.quantity]) ?? 0,
				unitAmount: asInt(record[ORDER_LINE_FIELD.unitAmount]) ?? 0,
				amountSubtotal: asInt(record[ORDER_LINE_FIELD.subtotalAmount]) ?? 0,
				discountAmount: asInt(record[ORDER_LINE_FIELD.discountAmount]) ?? 0,
				taxAmount: asInt(record[ORDER_LINE_FIELD.taxAmount]) ?? 0,
				amountTotal: asInt(record[ORDER_LINE_FIELD.totalAmount]) ?? 0,
				priceType: record[ORDER_LINE_FIELD.priceType] === "recurring" ? "recurring" : "one_time",
				stripePriceId: asString(record[ORDER_LINE_FIELD.stripePriceId]) ?? "",
			},
		];
	});

/** Repeater rows of the lines snapshot; a null text is left out (a repeater holds scalars, and an absent key reads back as null). */
export const orderLinesToRows = (lines: readonly OrderLine[]): Array<Record<string, string | number>> =>
	lines.map((line) =>
		Object.fromEntries(
			Object.entries({
				[ORDER_LINE_FIELD.title]: line.title,
				[ORDER_LINE_FIELD.variantTitle]: line.variantTitle,
				[ORDER_LINE_FIELD.sku]: line.sku,
				[ORDER_LINE_FIELD.options]: line.optionsText,
				[ORDER_LINE_FIELD.quantity]: line.quantity,
				[ORDER_LINE_FIELD.unitAmount]: line.unitAmount,
				[ORDER_LINE_FIELD.subtotalAmount]: line.amountSubtotal,
				[ORDER_LINE_FIELD.discountAmount]: line.discountAmount,
				[ORDER_LINE_FIELD.taxAmount]: line.taxAmount,
				[ORDER_LINE_FIELD.totalAmount]: line.amountTotal,
				[ORDER_LINE_FIELD.productId]: line.productId,
				[ORDER_LINE_FIELD.variantId]: line.variantId,
				[ORDER_LINE_FIELD.priceId]: line.priceId,
				[ORDER_LINE_FIELD.stripePriceId]: line.stripePriceId,
				[ORDER_LINE_FIELD.priceType]: line.priceType,
			}).filter((entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== ""),
		),
	);

export const toOrder = (item: ContentEntry, links: OrderLinks): Order => {
	const d = item.data;
	return {
		id: item.id,
		orderNumber: asString(d[ORDER_FIELD.orderNumber]) ?? "",
		orderStatus: oneOf(d[ORDER_FIELD.orderStatus], Object.values(ORDER_LIFECYCLE_STATUS), ORDER_LIFECYCLE_STATUS.open),
		paymentStatus: oneOf(d[ORDER_FIELD.paymentStatus], paymentStatuses, ORDER_PAYMENT_STATUS.pending),
		statusBeforeDispute: oneOfOrNull(d[ORDER_FIELD.statusBeforeDispute], paymentStatuses),
		fulfillmentStatus: oneOf(d[ORDER_FIELD.fulfillmentStatus], Object.values(FULFILLMENT_STATUS), FULFILLMENT_STATUS.unfulfilled),
		mode: d[ORDER_FIELD.orderMode] === "subscription" ? "subscription" : "payment",
		customerId: links.customerId,
		email: asString(d[ORDER_FIELD.email]) ?? "",
		customerName: asString(d[ORDER_FIELD.customerName]),
		phone: asString(d[ORDER_FIELD.phone]),
		billingAddress: asAddress(d[ORDER_FIELD.billingAddress]),
		shippingAddress: asAddress(d[ORDER_FIELD.shippingAddress]),
		lines: toOrderLines(d[ORDER_FIELD.lines]),
		totals: {
			subtotal: asInt(d[ORDER_FIELD.subtotalAmount]) ?? 0,
			discount: asInt(d[ORDER_FIELD.discountAmount]) ?? 0,
			tax: asInt(d[ORDER_FIELD.taxAmount]) ?? 0,
			shipping: asInt(d[ORDER_FIELD.shippingAmount]) ?? 0,
			total: asInt(d[ORDER_FIELD.totalAmount]) ?? 0,
			refunded: asInt(d[ORDER_FIELD.refundedAmount]) ?? 0,
			currency: toCurrencyCode(asString(d[ORDER_FIELD.currency]) ?? "pln"),
		},
		reviewFlags: asArray(d[ORDER_FIELD.reviewFlags]).filter((flag): flag is ReviewFlag => typeof flag === "string" && (reviewFlags as string[]).includes(flag)),
		cartId: asString(d[ORDER_FIELD.cartId]),
		subscriptionId: links.subscriptionId,
		stripe: {
			checkoutSessionId: asString(d[ORDER_FIELD.stripeCheckoutSessionId]) ?? "",
			paymentIntentId: asString(d[ORDER_FIELD.stripePaymentIntentId]),
			customerId: asString(d[ORDER_FIELD.stripeCustomerId]),
			subscriptionId: asString(d[ORDER_FIELD.stripeSubscriptionId]),
			invoiceId: asString(d[ORDER_FIELD.stripeInvoiceId]),
			isLivemode: asBool(d[ORDER_FIELD.isLivemode]),
		},
		placedAt: asString(d[ORDER_FIELD.placedAt]) ?? item.createdAt,
		paidAt: asString(d[ORDER_FIELD.paidAt]),
	};
};

/** Link fields are not part of the data: `RelationsPort` writes them (see `sales-repositories.ts`). */
export const orderPatchToData = (patch: Partial<Omit<Order, "id">>): Data => {
	const totals = patch.totals;
	const stripe = patch.stripe;
	return compact({
		[ORDER_FIELD.orderNumber]: patch.orderNumber,
		[ORDER_FIELD.orderStatus]: patch.orderStatus,
		[ORDER_FIELD.paymentStatus]: patch.paymentStatus,
		[ORDER_FIELD.statusBeforeDispute]: patch.statusBeforeDispute,
		[ORDER_FIELD.fulfillmentStatus]: patch.fulfillmentStatus,
		[ORDER_FIELD.orderMode]: patch.mode,
		[ORDER_FIELD.email]: patch.email,
		[ORDER_FIELD.customerName]: patch.customerName,
		[ORDER_FIELD.phone]: patch.phone,
		[ORDER_FIELD.billingAddress]: patch.billingAddress,
		[ORDER_FIELD.shippingAddress]: patch.shippingAddress,
		[ORDER_FIELD.lines]: patch.lines ? orderLinesToRows(patch.lines) : undefined,
		[ORDER_FIELD.subtotalAmount]: totals?.subtotal,
		[ORDER_FIELD.discountAmount]: totals?.discount,
		[ORDER_FIELD.taxAmount]: totals?.tax,
		[ORDER_FIELD.shippingAmount]: totals?.shipping,
		[ORDER_FIELD.totalAmount]: totals?.total,
		[ORDER_FIELD.refundedAmount]: totals?.refunded,
		[ORDER_FIELD.currency]: totals?.currency,
		[ORDER_FIELD.reviewFlags]: patch.reviewFlags,
		[ORDER_FIELD.cartId]: patch.cartId,
		[ORDER_FIELD.stripeCheckoutSessionId]: stripe?.checkoutSessionId,
		[ORDER_FIELD.stripePaymentIntentId]: stripe?.paymentIntentId,
		[ORDER_FIELD.stripeCustomerId]: stripe?.customerId,
		[ORDER_FIELD.stripeSubscriptionId]: stripe?.subscriptionId,
		[ORDER_FIELD.stripeInvoiceId]: stripe?.invoiceId,
		[ORDER_FIELD.isLivemode]: stripe?.isLivemode,
		[ORDER_FIELD.placedAt]: patch.placedAt,
		[ORDER_FIELD.paidAt]: patch.paidAt,
	});
};

// --- Payments --------------------------------------------------------------------------------------------

export const toPayment = (item: ContentEntry): Payment => {
	const d = item.data;
	return {
		id: item.id,
		// The indexed scalar mirrors of the two relation links (see PAYMENT_FIELD).
		orderId: asString(d[PAYMENT_FIELD.orderId]),
		subscriptionId: asString(d[PAYMENT_FIELD.subscriptionId]),
		purpose: oneOf(d[PAYMENT_FIELD.purpose], Object.values(PAYMENT_PURPOSE), PAYMENT_PURPOSE.checkout),
		status: oneOf(d[PAYMENT_FIELD.paymentStatus], Object.values(PAYMENT_STATUS), PAYMENT_STATUS.processing),
		amount: asInt(d[PAYMENT_FIELD.amount]) ?? 0,
		amountRefunded: asInt(d[PAYMENT_FIELD.amountRefunded]) ?? 0,
		currency: toCurrencyCode(asString(d[PAYMENT_FIELD.currency]) ?? "pln"),
		methodType: asString(d[PAYMENT_FIELD.methodType]),
		failureCode: asString(d[PAYMENT_FIELD.failureCode]),
		failureMessage: asString(d[PAYMENT_FIELD.failureMessage]),
		stripe: {
			paymentIntentId: asString(d[PAYMENT_FIELD.stripePaymentIntentId]),
			chargeId: asString(d[PAYMENT_FIELD.stripeChargeId]),
			invoiceId: asString(d[PAYMENT_FIELD.stripeInvoiceId]),
		},
		createdAt: asString(d[PAYMENT_FIELD.paymentCreatedAt]) ?? item.createdAt,
		updatedAt: asString(d[PAYMENT_FIELD.paymentUpdatedAt]) ?? item.updatedAt,
	};
};

export const paymentPatchToData = (patch: Partial<Omit<Payment, "id">>): Data =>
	compact({
		[PAYMENT_FIELD.orderId]: patch.orderId,
		[PAYMENT_FIELD.subscriptionId]: patch.subscriptionId,
		[PAYMENT_FIELD.purpose]: patch.purpose,
		[PAYMENT_FIELD.paymentStatus]: patch.status,
		[PAYMENT_FIELD.amount]: patch.amount,
		[PAYMENT_FIELD.amountRefunded]: patch.amountRefunded,
		[PAYMENT_FIELD.currency]: patch.currency,
		[PAYMENT_FIELD.methodType]: patch.methodType,
		[PAYMENT_FIELD.failureCode]: patch.failureCode,
		[PAYMENT_FIELD.failureMessage]: patch.failureMessage,
		[PAYMENT_FIELD.stripePaymentIntentId]: patch.stripe?.paymentIntentId,
		[PAYMENT_FIELD.stripeChargeId]: patch.stripe?.chargeId,
		[PAYMENT_FIELD.stripeInvoiceId]: patch.stripe?.invoiceId,
		[PAYMENT_FIELD.paymentCreatedAt]: patch.createdAt,
		[PAYMENT_FIELD.paymentUpdatedAt]: patch.updatedAt,
	});

// --- Subscriptions ---------------------------------------------------------------------------------------

const toSubscriptionItems = (value: unknown): SubscriptionItem[] =>
	asArray(value).flatMap((row) => {
		const record = asRecord(row);
		if (!record) return [];
		return [
			{
				priceId: asString(record.priceId),
				productId: asString(record.productId),
				variantId: asString(record.variantId),
				title: asString(record.title) ?? "",
				quantity: asInt(record.quantity) ?? 1,
				stripePriceId: asString(record.stripePriceId) ?? "",
			},
		];
	});

export const toSubscription = (item: ContentEntry, links: SubscriptionLinks): Subscription => {
	const d = item.data;
	return {
		id: item.id,
		customerId: links.customerId,
		initialOrderId: links.initialOrderId,
		status: oneOf(d[SUBSCRIPTION_FIELD.subscriptionStatus], Object.values(SUBSCRIPTION_STATUS), SUBSCRIPTION_STATUS.incomplete),
		items: toSubscriptionItems(d[SUBSCRIPTION_FIELD.items]),
		interval: oneOf(d[SUBSCRIPTION_FIELD.billingInterval], Object.values(BILLING_INTERVAL), BILLING_INTERVAL.month),
		intervalCount: asInt(d[SUBSCRIPTION_FIELD.intervalCount]) ?? 1,
		currency: toCurrencyCode(asString(d[SUBSCRIPTION_FIELD.currency]) ?? "pln"),
		amount: asInt(d[SUBSCRIPTION_FIELD.amount]) ?? 0,
		currentPeriodStart: asString(d[SUBSCRIPTION_FIELD.currentPeriodStart]),
		currentPeriodEnd: asString(d[SUBSCRIPTION_FIELD.currentPeriodEnd]),
		trialEnd: asString(d[SUBSCRIPTION_FIELD.trialEnd]),
		cancelAtPeriodEnd: asBool(d[SUBSCRIPTION_FIELD.cancelAtPeriodEnd]),
		canceledAt: asString(d[SUBSCRIPTION_FIELD.canceledAt]),
		stripe: {
			subscriptionId: asString(d[SUBSCRIPTION_FIELD.stripeSubscriptionId]) ?? "",
			customerId: asString(d[SUBSCRIPTION_FIELD.stripeCustomerId]) ?? "",
			latestInvoiceId: asString(d[SUBSCRIPTION_FIELD.latestInvoiceId]),
		},
		providerUpdatedAt: asInt(d[SUBSCRIPTION_FIELD.providerUpdatedAt]) ?? 0,
	};
};

export const subscriptionPatchToData = (patch: Partial<Omit<Subscription, "id">>): Data =>
	compact({
		[SUBSCRIPTION_FIELD.subscriptionStatus]: patch.status,
		[SUBSCRIPTION_FIELD.items]: patch.items,
		[SUBSCRIPTION_FIELD.billingInterval]: patch.interval,
		[SUBSCRIPTION_FIELD.intervalCount]: patch.intervalCount,
		[SUBSCRIPTION_FIELD.currency]: patch.currency,
		[SUBSCRIPTION_FIELD.amount]: patch.amount,
		[SUBSCRIPTION_FIELD.currentPeriodStart]: patch.currentPeriodStart,
		[SUBSCRIPTION_FIELD.currentPeriodEnd]: patch.currentPeriodEnd,
		[SUBSCRIPTION_FIELD.trialEnd]: patch.trialEnd,
		[SUBSCRIPTION_FIELD.cancelAtPeriodEnd]: patch.cancelAtPeriodEnd,
		[SUBSCRIPTION_FIELD.canceledAt]: patch.canceledAt,
		[SUBSCRIPTION_FIELD.stripeSubscriptionId]: patch.stripe?.subscriptionId,
		[SUBSCRIPTION_FIELD.stripeCustomerId]: patch.stripe?.customerId,
		[SUBSCRIPTION_FIELD.latestInvoiceId]: patch.stripe?.latestInvoiceId,
		[SUBSCRIPTION_FIELD.providerUpdatedAt]: patch.providerUpdatedAt,
	});

// --- Customers -------------------------------------------------------------------------------------------

const toTotalSpent = (value: unknown): Record<string, number> => {
	const record = asRecord(value);
	if (!record) return {};
	return Object.fromEntries(Object.entries(record).flatMap(([currency, amount]) => (asInt(amount) === null ? [] : [[currency, asInt(amount)!]])));
};

export const toCustomer = (item: ContentEntry): Customer => {
	const d = item.data;
	return {
		id: item.id,
		email: asString(d[CUSTOMER_FIELD.email]) ?? "",
		name: asString(d[CUSTOMER_FIELD.name]),
		phone: asString(d[CUSTOMER_FIELD.phone]),
		billingAddress: asAddress(d[CUSTOMER_FIELD.billingAddress]),
		shippingAddress: asAddress(d[CUSTOMER_FIELD.shippingAddress]),
		stripeCustomerId: asString(d[CUSTOMER_FIELD.stripeCustomerId]),
		orderCount: asInt(d[CUSTOMER_FIELD.orderCount]) ?? 0,
		totalSpent: toTotalSpent(d[CUSTOMER_FIELD.totalSpent]),
		firstOrderAt: asString(d[CUSTOMER_FIELD.firstOrderAt]),
		lastOrderAt: asString(d[CUSTOMER_FIELD.lastOrderAt]),
	};
};

export const customerPatchToData = (patch: Partial<Omit<Customer, "id">>): Data =>
	compact({
		[CUSTOMER_FIELD.email]: patch.email,
		[CUSTOMER_FIELD.name]: patch.name,
		[CUSTOMER_FIELD.phone]: patch.phone,
		[CUSTOMER_FIELD.billingAddress]: patch.billingAddress,
		[CUSTOMER_FIELD.shippingAddress]: patch.shippingAddress,
		[CUSTOMER_FIELD.stripeCustomerId]: patch.stripeCustomerId,
		[CUSTOMER_FIELD.orderCount]: patch.orderCount,
		[CUSTOMER_FIELD.totalSpent]: patch.totalSpent,
		[CUSTOMER_FIELD.firstOrderAt]: patch.firstOrderAt,
		[CUSTOMER_FIELD.lastOrderAt]: patch.lastOrderAt,
	});

// --- Order timeline ----------------------------------------------------------------------------------------

export const toOrderEvent = (item: ContentEntry): OrderTimelineEvent => {
	const d = item.data;
	return {
		id: item.id,
		orderId: asString(d[ORDER_EVENT_FIELD.orderId]) ?? "",
		type: oneOf(d[ORDER_EVENT_FIELD.eventType], Object.values(ORDER_TIMELINE_TYPE), ORDER_TIMELINE_TYPE.note),
		message: asString(d[ORDER_EVENT_FIELD.message]) ?? "",
		actorKind: oneOf(d[ORDER_EVENT_FIELD.actorKind], Object.values(ORDER_ACTOR_KIND), ORDER_ACTOR_KIND.system),
		actorLabel: asString(d[ORDER_EVENT_FIELD.actorLabel]),
		data: asRecord(d[ORDER_EVENT_FIELD.data]),
		occurredAt: asString(d[ORDER_EVENT_FIELD.occurredAt]) ?? item.createdAt,
		sourceKey: asString(d[ORDER_EVENT_FIELD.sourceKey]) ?? "",
	};
};

export const orderEventToData = (event: Omit<OrderTimelineEvent, "id">): Data =>
	compact({
		[ORDER_EVENT_FIELD.message]: event.message,
		[ORDER_EVENT_FIELD.eventType]: event.type,
		[ORDER_EVENT_FIELD.actorKind]: event.actorKind,
		[ORDER_EVENT_FIELD.actorLabel]: event.actorLabel,
		[ORDER_EVENT_FIELD.data]: event.data,
		[ORDER_EVENT_FIELD.occurredAt]: event.occurredAt,
		[ORDER_EVENT_FIELD.sourceKey]: event.sourceKey,
		[ORDER_EVENT_FIELD.orderId]: event.orderId,
	});
