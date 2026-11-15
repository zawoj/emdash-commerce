import { CommerceError } from "../core/errors.js";
import { INVENTORY_ADJUSTMENT_REASON, type StockLevel } from "../core/inventory.js";
import { ORDER_EVENT, ORDER_PAYMENT_STATUS, type Order } from "../core/order.js";
import { PAYMENT_PURPOSE, PAYMENT_STATUS, REFUND_STATUS, type Payment, type Refund, type RefundReason, type RefundStatus } from "../core/payment.js";
import type { SellableRef } from "../core/catalog.js";
import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE } from "../core/order-timeline.js";
import type { CommerceContainer } from "../plugin/container.js";
import { ProviderError, type ProviderRefund } from "../ports/payment-provider.js";
import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import { writeVariantStockMirror } from "../adapters/emdash/content/catalog-mirror.js";
import type { EventPublisher } from "./contracts.js";
import { tryRecordOrderEvent } from "./order-events.js";
import { errorMessage } from "./payments/async.js";
import { HANDLED, ignored, INDEX_KEY, makeEvent, type Deps, type EventMeta, type HandlerResult } from "./payments/deps.js";
import { transitionLocked, withOrderLock } from "./payments/order-transitions.js";
import { upsertPaymentByIntent } from "./payments/payment-records.js";
import { isPaymentOfThisStore, SettlementPendingError } from "./payments/ownership.js";

/**
 * Refunds. A refund is recorded before the provider is called, under a deterministic id (from the caller's
 * `requestId`), and that id is the provider idempotency key: a repeated request, or a retry after a crash
 * between the record and the call, reaches the same Stripe refund and never a second one. The order's
 * refunded total is never accumulated from deltas; it is the provider's cumulative `amountRefunded`, read
 * while the order is locked, so replays and out-of-order refund events converge.
 */

export interface RefundRequest {
	orderId: string;
	/** Minor units; null refunds everything still refundable. */
	amount: number | null;
	reason: RefundReason | null;
	note: string | null;
	/** Client-chosen id: the same id always means the same refund. */
	requestId: string;
	requestedBy: string | null;
	/** Put stock back: all lines of a full refund, or exactly `restockLines`. */
	restock: boolean;
	restockLines?: ReadonlyArray<{ priceId: string; quantity: number }>;
}

interface RestockEntry {
	priceId: string;
	quantity: number;
}

const OPEN_REFUND_STATUSES: readonly RefundStatus[] = [REFUND_STATUS.pending, REFUND_STATUS.requiresAction];
const isTerminalRefund = (status: RefundStatus): boolean => !OPEN_REFUND_STATUSES.includes(status);

const sha256Hex = async (value: string): Promise<string> => {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** `rf_` + 24 hex characters of SHA-256(orderId, requestId): stable, unguessable, safe inside an idempotency key. */
export const refundIdFor = async (orderId: string, requestId: string): Promise<string> => `rf_${(await sha256Hex(`${orderId}\n${requestId}`)).slice(0, 24)}`;

const sellableOfLine = (line: Order["lines"][number]): SellableRef =>
	line.variantId ? { kind: "variant", id: line.variantId } : { kind: "product", id: line.productId };

const REFUNDABLE_ORDER_STATUSES: readonly Order["paymentStatus"][] = [ORDER_PAYMENT_STATUS.paid, ORDER_PAYMENT_STATUS.partiallyRefunded];

const pickPayment = (payments: readonly Payment[]): Payment | null =>
	payments.find((payment) => payment.purpose === PAYMENT_PURPOSE.checkout && payment.stripe.paymentIntentId && payment.status === PAYMENT_STATUS.succeeded) ??
	payments.find((payment) => payment.stripe.paymentIntentId && payment.status === PAYMENT_STATUS.succeeded) ??
	null;

const refundable = (order: Order, existing: readonly Refund[]): number => {
	const inFlight = existing.filter((refund) => OPEN_REFUND_STATUSES.includes(refund.status)).reduce((sum, refund) => sum + refund.amount, 0);
	return Math.max(0, order.totals.total - order.totals.refunded - inFlight);
};

const restockPlan = (order: Order, input: RefundRequest, amount: number, refundableAmount: number): RestockEntry[] | null => {
	if (input.restockLines && input.restockLines.length > 0) {
		for (const entry of input.restockLines) {
			const line = order.lines.find((candidate) => candidate.priceId === entry.priceId);
			if (!line || entry.quantity < 1 || entry.quantity > line.quantity) {
				throw new CommerceError("invalidInput", "restockLines must refer to order lines and not exceed their quantity");
			}
		}
		return input.restockLines.map((entry) => ({ priceId: entry.priceId, quantity: entry.quantity }));
	}
	if (!input.restock) return null;
	if (amount !== refundableAmount || order.totals.refunded > 0) {
		throw new CommerceError("invalidInput", "restock without restockLines is only possible for a full refund of an untouched order");
	}
	return order.lines.map((line) => ({ priceId: line.priceId, quantity: line.quantity }));
};

/** One timeline entry per refund, keyed by the refund id (the dashboard path and the admin path share the key). */
const recordRefundCreated = (container: CommerceContainer, refund: Refund, actorKind: typeof ORDER_ACTOR_KIND.admin | typeof ORDER_ACTOR_KIND.provider): Promise<void> =>
	tryRecordOrderEvent(container, {
		orderId: refund.orderId,
		type: ORDER_TIMELINE_TYPE.refundCreated,
		message: `Refund of ${(refund.amount / 100).toFixed(2)} ${refund.currency.toUpperCase()} requested`,
		actorKind,
		actorLabel: refund.requestedBy,
		data: { refundId: refund.id, amount: refund.amount, currency: refund.currency, reason: refund.reason },
		source: refund.id,
	});

/** Validates and records the refund (pending) under the order lock, so concurrent requests cannot jointly exceed the total. */
const recordRefund = async (container: CommerceContainer, input: RefundRequest, refundId: string): Promise<Refund> =>
	withOrderLock(container, input.orderId, async () => {
		const repeated = await container.refunds.get(refundId);
		if (repeated) return repeated;
		const order = await container.orders.get(input.orderId);
		if (!order) throw new CommerceError("notFound", "Order not found");
		if (!REFUNDABLE_ORDER_STATUSES.includes(order.paymentStatus)) {
			throw new CommerceError("refundNotAllowed", `An order that is ${order.paymentStatus} cannot be refunded`);
		}
		const payment = pickPayment(await container.payments.listByOrder(order.id));
		if (!payment) throw new CommerceError("refundNotAllowed", "The order has no settled payment to refund");
		const refundableAmount = refundable(order, await container.refunds.listByOrder(order.id));
		const amount = input.amount ?? refundableAmount;
		if (amount < 1 || amount > refundableAmount) {
			throw new CommerceError("refundNotAllowed", "The amount exceeds what is still refundable", { refundable: refundableAmount });
		}
		const plan = restockPlan(order, input, amount, refundableAmount);
		const nowIso = container.clock.now().toISOString();
		const refund: Refund = {
			id: refundId,
			orderId: order.id,
			paymentId: payment.id,
			amount,
			currency: order.totals.currency,
			reason: input.reason,
			note: input.note,
			status: REFUND_STATUS.pending,
			stripeRefundId: null,
			requestedBy: input.requestedBy,
			createdAt: nowIso,
			updatedAt: nowIso,
		};
		if (plan) await container.recordIndex.set(INDEX_KEY.refundRestockPlan(refundId), JSON.stringify(plan));
		await container.refunds.put(refund);
		await recordRefundCreated(container, refund, ORDER_ACTOR_KIND.admin);
		return refund;
	});

const putBack = async (container: CommerceContainer, order: Order, refundId: string): Promise<void> => {
	const key = INDEX_KEY.refundRestocked(refundId);
	const rawPlan = await container.recordIndex.get(INDEX_KEY.refundRestockPlan(refundId));
	if (!rawPlan) return;
	const claim = await container.recordIndex.claim(key);
	if (!claim.isWinner) return;
	try {
		const plan = JSON.parse(rawPlan) as RestockEntry[];
		const touched: SellableRef[] = [];
		for (const entry of plan) {
			const line = order.lines.find((candidate) => candidate.priceId === entry.priceId);
			if (!line) continue;
			const sellable = sellableOfLine(line);
			if (!(await container.inventory.get(sellable))) continue; // untracked: there is no count to restore
			await container.inventory.adjust(sellable, entry.quantity, INVENTORY_ADJUSTMENT_REASON.refundRestock);
			touched.push(sellable);
		}
		for (const sellable of touched) {
			if (sellable.kind !== "variant") continue;
			try {
				const level: StockLevel | null = await container.inventory.get(sellable);
				if (level) await writeVariantStockMirror(container, sellable.id, level.onHand);
			} catch (error) {
				container.log.warn("Variant stock mirror could not be written", { variantId: sellable.id, error: errorMessage(error) });
			}
		}
	} catch (error) {
		await container.recordIndex.releaseClaim(key);
		throw error;
	}
	await container.recordIndex.set(key, refundId);
};

/**
 * Folds a provider refund into our record and the order, in one locked section: merge the refund's status
 * (a final status never reverts), then set the order's refunded total from the provider's cumulative figure
 * and let `transitionOrder` pick the status. Afterwards, once per refund that succeeded: restock and `order.refunded`.
 */
const applyProviderRefund = async ({ container, publisher }: Deps, refundId: string, provider: ProviderRefund): Promise<Refund> => {
	const refund = await container.refunds.get(refundId);
	if (!refund) throw new Error(`Refund ${refundId} not found`);
	const paymentRecord = await container.payments.get(refund.paymentId);
	const paymentIntentId = paymentRecord?.stripe.paymentIntentId ?? provider.paymentIntentId;
	const providerApi = await container.provider();

	const result = await withOrderLock(container, refund.orderId, async () => {
		const current = (await container.refunds.get(refundId)) ?? refund;
		const merged: Refund = {
			...current,
			stripeRefundId: provider.refundId,
			status: isTerminalRefund(current.status) ? current.status : provider.status,
			updatedAt: container.clock.now().toISOString(),
		};
		await container.refunds.put(merged);
		await container.recordIndex.set(RECORD_INDEX_KEY.refundByProviderId(provider.refundId), merged.id);

		const fresh = paymentIntentId ? await providerApi.payments.retrievePayment(paymentIntentId) : null;
		if (!fresh) return { refund: merged, order: null };
		await upsertPaymentByIntent(container, fresh.paymentIntentId, async () => ({ payment: fresh, isFresh: true }));
		const change = await transitionLocked(
			container,
			merged.orderId,
			(order) => ({ type: ORDER_EVENT.refundUpdated, amountRefunded: fresh.amountRefunded, amountTotal: order.totals.total }),
			(order) => ({ totals: { ...order.totals, refunded: fresh.amountRefunded } }),
			{ source: refundId },
		);
		return { refund: merged, order: change.order };
	});
	if (!result.order) throw new Error(`Payment for refund ${refundId} could not be retrieved`);

	if (result.refund.status === REFUND_STATUS.succeeded) {
		await putBack(container, result.order, refundId);
		await publisher.publish([
			makeEvent(container, "order.refunded", refundId, {
				orderId: result.order.id,
				orderNumber: result.order.orderNumber,
				refundId,
				amount: result.refund.amount,
				amountRefundedTotal: result.order.totals.refunded,
				isFullyRefunded: result.order.paymentStatus === ORDER_PAYMENT_STATUS.refunded,
			}),
		]);
	}
	return result.refund;
};

/** Calls the provider for a recorded refund (idempotent on the refund id) and applies the answer. */
const completeRefund = async (deps: Deps, refund: Refund): Promise<Refund> => {
	const { container } = deps;
	if (refund.stripeRefundId || isTerminalRefund(refund.status)) return refund;
	const payment = await container.payments.get(refund.paymentId);
	const paymentIntentId = payment?.stripe.paymentIntentId;
	if (!paymentIntentId) throw new CommerceError("refundNotAllowed", "The payment of this refund has no provider reference");
	let provider: ProviderRefund;
	try {
		provider = await (await container.provider()).payments.createRefund(
			{ paymentIntentId, amount: refund.amount, reason: refund.reason, refundRecordId: refund.id },
			`stripe-commerce:refund:${refund.id}`,
		);
	} catch (error) {
		// A definitive rejection frees the amount again; a retryable failure leaves the refund pending so a
		// repeat of the same request completes it (the provider key makes that safe even if it went through).
		if (error instanceof ProviderError && !error.isRetryable) {
			await withOrderLock(container, refund.orderId, async () => {
				const latest = await container.refunds.get(refund.id);
				if (latest && !latest.stripeRefundId && !isTerminalRefund(latest.status)) {
					await container.refunds.put({ ...latest, status: REFUND_STATUS.failed, updatedAt: container.clock.now().toISOString() });
				}
			});
		}
		throw error;
	}
	return applyProviderRefund(deps, refund.id, provider);
};

/** Admin use case. Safe to repeat: the same `requestId` returns the same refund and never calls the provider twice. */
export const requestRefund = async (container: CommerceContainer, publisher: EventPublisher, input: RefundRequest): Promise<Refund> => {
	const refundId = await refundIdFor(input.orderId, input.requestId);
	const existing = await container.refunds.get(refundId);
	if (existing && input.amount !== null && existing.amount !== input.amount) {
		throw new CommerceError("conflict", "This requestId was already used for a different refund amount");
	}
	const refund = existing ?? (await recordRefund(container, input, refundId));
	return completeRefund({ container, publisher }, refund);
};

/** `refund.created|updated|failed`: refunds we recorded, and refunds made in the Stripe dashboard (recorded on sight). */
export const handleRefundUpdated = async (deps: Deps, provider: ProviderRefund, _meta: EventMeta): Promise<HandlerResult> => {
	const { container } = deps;
	let refundId: string | null = null;
	if (provider.refundRecordId && (await container.refunds.get(provider.refundRecordId))) refundId = provider.refundRecordId;
	refundId ??= (await container.recordIndex.get(RECORD_INDEX_KEY.refundByProviderId(provider.refundId))) || null;

	if (!refundId) {
		const orderId = provider.paymentIntentId ? await container.recordIndex.get(RECORD_INDEX_KEY.orderByPaymentIntent(provider.paymentIntentId)) : null;
		const paymentId = provider.paymentIntentId ? await container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent(provider.paymentIntentId)) : null;
		const viaCharge = !orderId && provider.chargeId ? await container.recordIndex.get(RECORD_INDEX_KEY.paymentByCharge(provider.chargeId)) : null;
		const payment = paymentId ? await container.payments.get(paymentId) : viaCharge ? await container.payments.get(viaCharge) : null;
		const resolvedOrderId = orderId || payment?.orderId || null;
		if (!resolvedOrderId) {
			if (await isPaymentOfThisStore(container, provider.paymentIntentId)) throw new SettlementPendingError("A refund", provider.paymentIntentId!);
			return ignored("Refund belongs to a payment this store does not know");
		}
		// The order exists but its payment is not recorded yet (settlement still running): retry the event later.
		if (!payment) throw new Error(`The payment of order ${resolvedOrderId} is not recorded yet`);
		const nowIso = container.clock.now().toISOString();
		refundId = `rf_${provider.refundId}`;
		if (!(await container.refunds.get(refundId))) {
			await container.refunds.put({
				id: refundId,
				orderId: resolvedOrderId,
				paymentId: payment.id,
				amount: provider.amount,
				currency: provider.currency,
				reason: null,
				note: "Created in the Stripe dashboard",
				status: provider.status,
				stripeRefundId: provider.refundId,
				requestedBy: null,
				createdAt: nowIso,
				updatedAt: nowIso,
			});
			await recordRefundCreated(container, (await container.refunds.get(refundId))!, ORDER_ACTOR_KIND.provider);
		}
	}
	await applyProviderRefund(deps, refundId, provider);
	return HANDLED;
};

