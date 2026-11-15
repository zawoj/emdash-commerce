import { DISPUTE_STATUS, type DisputeStatus } from "../core/payment.js";
import { ORDER_EVENT, ORDER_PAYMENT_STATUS, type Order } from "../core/order.js";
import type { CommerceContainer } from "../plugin/container.js";
import type { ProviderDispute } from "../ports/payment-provider.js";
import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE } from "../core/order-timeline.js";
import { tryRecordOrderEvent } from "./order-events.js";
import { HANDLED, ignored, INDEX_KEY, makeEvent, type Deps, type HandlerResult } from "./payments/deps.js";
import { transitionLocked, withOrderLock } from "./payments/order-transitions.js";
import { isPaymentOfThisStore, SettlementPendingError } from "./payments/ownership.js";

/**
 * Disputes (chargebacks). An open dispute moves a paid order to `disputed`, remembering the status it came
 * from; winning restores that status, losing is final. The dispute's last known state lives in the record
 * index so a late `open` event cannot reopen a dispute that is already won or lost.
 */

const isClosed = (status: string | null): boolean => status === DISPUTE_STATUS.won || status === DISPUTE_STATUS.lost;

const findOrderId = async (container: CommerceContainer, dispute: ProviderDispute): Promise<string | null> => {
	if (dispute.paymentIntentId) {
		const byIntent = await container.recordIndex.get(RECORD_INDEX_KEY.orderByPaymentIntent(dispute.paymentIntentId));
		if (byIntent) return byIntent;
	}
	const paymentId = await container.recordIndex.get(RECORD_INDEX_KEY.paymentByCharge(dispute.chargeId));
	return paymentId ? ((await container.payments.get(paymentId))?.orderId ?? null) : null;
};

/** Applies the dispute transition to the freshly read order; returns the order afterwards. */
const applyDispute = async (container: CommerceContainer, orderId: string, dispute: ProviderDispute): Promise<Order> => {
	if (dispute.status === DISPUTE_STATUS.open) {
		return (await transitionLocked(container, orderId, { type: ORDER_EVENT.disputeOpened }, undefined, { source: dispute.disputeId })).order;
	}
	// A closing event for a dispute we never saw open (the open event was lost): open it first so the closing
	// transition has a status to restore.
	const current = await container.orders.get(orderId);
	if (current && (current.paymentStatus === ORDER_PAYMENT_STATUS.paid || current.paymentStatus === ORDER_PAYMENT_STATUS.partiallyRefunded)) {
		await transitionLocked(container, orderId, { type: ORDER_EVENT.disputeOpened }, undefined, { source: dispute.disputeId });
	}
	const closing = dispute.status === DISPUTE_STATUS.won ? ORDER_EVENT.disputeWon : ORDER_EVENT.disputeLost;
	const { order } = await transitionLocked(container, orderId, { type: closing }, undefined, { source: dispute.disputeId });
	if (dispute.status !== DISPUTE_STATUS.won || order.totals.refunded <= 0) return order;
	// Refunds that landed while the order was disputed could not change its status; settle them now.
	return (
		await transitionLocked(
			container,
			orderId,
			(fresh) => ({
				type: ORDER_EVENT.refundUpdated,
				amountRefunded: fresh.totals.refunded,
				amountTotal: fresh.totals.total,
			}),
			undefined,
			{ source: dispute.disputeId },
		)
	).order;
};

export const handleDisputeUpdated = async ({ container, publisher }: Deps, dispute: ProviderDispute): Promise<HandlerResult> => {
	const orderId = await findOrderId(container, dispute);
	if (!orderId) {
		if (await isPaymentOfThisStore(container, dispute.paymentIntentId)) throw new SettlementPendingError("A dispute", dispute.paymentIntentId!);
		return ignored("Dispute belongs to a payment this store does not know");
	}

	const stateKey = INDEX_KEY.disputeState(dispute.disputeId);
	const result = await withOrderLock(container, orderId, async () => {
		const known = (await container.recordIndex.get(stateKey)) || null;
		if (isClosed(known) && dispute.status === DISPUTE_STATUS.open) return null;
		// A closed dispute keeps its outcome, whatever a delayed update says.
		const effective: DisputeStatus = isClosed(known) ? (known as DisputeStatus) : dispute.status;
		const order = await applyDispute(container, orderId, { ...dispute, status: effective });
		await container.recordIndex.set(stateKey, effective);
		return { order, status: effective };
	});
	if (!result) return ignored("Dispute is already closed; a late open event was dropped");

	const { order, status } = result;
	await tryRecordOrderEvent(container, {
		orderId: order.id,
		type: status === DISPUTE_STATUS.open ? ORDER_TIMELINE_TYPE.disputeOpened : ORDER_TIMELINE_TYPE.disputeClosed,
		message:
			status === DISPUTE_STATUS.open
				? `Dispute opened${dispute.reason ? ` (${dispute.reason})` : ""}`
				: `Dispute closed: ${status === DISPUTE_STATUS.won ? "won" : "lost"}`,
		actorKind: ORDER_ACTOR_KIND.provider,
		data: { disputeId: dispute.disputeId, amount: dispute.amount, reason: dispute.reason, outcome: status },
		source: dispute.disputeId,
	});
	if (status === DISPUTE_STATUS.open) {
		if (order.paymentStatus === ORDER_PAYMENT_STATUS.disputed) {
			await publisher.publish([
				makeEvent(container, "order.disputed", dispute.disputeId, {
					orderId: order.id,
					orderNumber: order.orderNumber,
					amount: dispute.amount,
					reason: dispute.reason,
				}),
			]);
		}
		return HANDLED;
	}
	await publisher.publish([
		makeEvent(container, "order.dispute_closed", dispute.disputeId, {
			orderId: order.id,
			orderNumber: order.orderNumber,
			outcome: status === DISPUTE_STATUS.won ? "won" : "lost",
		}),
	]);
	return HANDLED;
};
