import type { KVAccess } from "emdash";

import { CART_STATUS, type Cart } from "../core/cart.js";
import type { CommerceContainer } from "../plugin/container.js";
import type { EventPublisher } from "./contracts.js";
import { createInventoryService } from "./inventory.js";
import { runCatalogCron } from "./catalog-sync.js";
import { loadPricedCart } from "./cart/pricing.js";
import { mirrorCart } from "./cart/mirror.js";
import { createExtensionContext } from "./extension-context.js";
import { processDueInbox, type DueSummary } from "./webhook-inbox.js";
import { makeEvent } from "./payments/deps.js";
import { reconcile, type ReconcileResult } from "./reconcile.js";

/**
 * The use cases the cron hook runs (plugin/cron.ts orchestrates them). Each is bounded by a batch size, so
 * one run never grows with the backlog; a backlog is worked off over several runs. None of them throws for a
 * single bad record: they log and move on, and the orchestrator isolates whole steps on top of that.
 */

export const MAINTENANCE = {
	inboxBatch: 25,
	outboxBatch: 50,
	catalogBatch: 25,
	reservationBatch: 100,
	cartBatch: 100,
	purgeBatch: 200,
	/** Reconciliation lists the provider's events; once per this interval is plenty next to live webhooks. */
	reconcileIntervalMs: 15 * 60 * 1000,
	/** An expired or converted cart is kept this long (mirror and support lookups), then deleted. */
	cartGraceMs: 7 * 24 * 60 * 60 * 1000,
	/** Finished inbox and outbox records are audit data; they are dropped after this. */
	retentionMs: 30 * 24 * 60 * 60 * 1000,
} as const;

/** Plugin KV key (`state:` = internal) holding the epoch ms of the last reconciliation attempt. */
export const KV_LAST_RECONCILE = "state:last-reconcile-at";

const isoBefore = (container: CommerceContainer, ms: number): string => new Date(container.clock.now().getTime() - ms).toISOString();

export const retryDueInbox = (container: CommerceContainer): Promise<DueSummary> => processDueInbox(container, MAINTENANCE.inboxBatch);

export const deliverDueOutbox = (publisher: EventPublisher): Promise<number> => publisher.processDue(MAINTENANCE.outboxBatch);

export const syncDueCatalog = (container: CommerceContainer, publisher: EventPublisher): Promise<number> =>
	runCatalogCron(container, publisher, MAINTENANCE.catalogBatch);

export const releaseExpiredReservations = (container: CommerceContainer, publisher: EventPublisher) =>
	createInventoryService(container, { publisher }).releaseExpired(MAINTENANCE.reservationBatch);

export interface CartSweepResult {
	abandoned: number;
	expired: number;
	deleted: number;
}

/** Compare-and-set a cart into `status`; false when it changed meanwhile (the next run sees the new state). */
const transition = async (container: CommerceContainer, cartId: string, expectedStatus: Cart["status"], status: Cart["status"]): Promise<Cart | null> => {
	const stored = await container.carts.get(cartId);
	if (!stored || stored.value.status !== expectedStatus) return null;
	const next: Cart = { ...stored.value, status, updatedAt: container.clock.now().toISOString() };
	return (await container.carts.put(next, stored.revision)).applied ? next : null;
};

/** Best-effort refresh of the admin-visible cart mirror after a status change. */
const refreshMirror = async (container: CommerceContainer, cart: Cart): Promise<void> => {
	try {
		const priced = await loadPricedCart(container, createExtensionContext(container), cart);
		await mirrorCart(container, priced);
	} catch (error) {
		container.log.warn("Cart mirror refresh failed", { cartId: cart.id, error: error instanceof Error ? error.message : "unknown" });
	}
};

/**
 * Cart lifecycle:
 * - an `active` cart that holds lines and an email and was idle longer than `cart.abandonAfterHours` becomes
 *   `abandoned` and emits `cart.abandoned` (the event id carries the cart's last activity, so a cart that is
 *   revived and abandoned again emits again while a repeat of the same sweep does not);
 * - a cart past `expiresAt` becomes `expired` (stock holds are released by the reservation sweep, not here);
 * - an `expired` or `converted` cart is deleted from storage after the grace period.
 */
export const sweepCarts = async (container: CommerceContainer, publisher: EventPublisher): Promise<CartSweepResult> => {
	const result: CartSweepResult = { abandoned: 0, expired: 0, deleted: 0 };
	const nowIso = container.clock.now().toISOString();
	const idleCutoff = isoBefore(container, container.options.cart.abandonAfterHours * 60 * 60 * 1000);

	for (const cart of await container.carts.listByStatus(CART_STATUS.active, idleCutoff, MAINTENANCE.cartBatch)) {
		if (!cart.email || cart.lines.length === 0 || cart.expiresAt <= nowIso) continue;
		const next = await transition(container, cart.id, CART_STATUS.active, CART_STATUS.abandoned);
		if (!next) continue;
		result.abandoned += 1;
		const itemCount = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
		await publisher.publish([makeEvent(container, "cart.abandoned", `${cart.id}:${cart.updatedAt}`, { cartId: cart.id, email: cart.email, itemCount })]);
		await refreshMirror(container, next);
	}

	for (const cart of await container.carts.listExpiringBefore(nowIso, MAINTENANCE.cartBatch)) {
		const next = await transition(container, cart.id, cart.status, CART_STATUS.expired);
		if (!next) continue;
		result.expired += 1;
		await refreshMirror(container, next);
	}

	const graceCutoff = isoBefore(container, MAINTENANCE.cartGraceMs);
	for (const status of [CART_STATUS.expired, CART_STATUS.converted] as const) {
		for (const cart of await container.carts.listByStatus(status, graceCutoff, MAINTENANCE.cartBatch)) {
			await container.carts.delete(cart.id);
			result.deleted += 1;
		}
	}
	return result;
};

export type ReconcileStep = { ran: false; reason: "disabled" | "throttled" } | { ran: true; result: ReconcileResult };

/**
 * Reconciliation at most once per `reconcileIntervalMs`. The slot is claimed with a KV compare-and-set before
 * the provider is asked, so two overlapping cron runs (at-least-once delivery) cannot both reconcile, and a
 * failing reconciliation is not hammered: it is retried at the next interval.
 */
export const reconcileIfDue = async (container: CommerceContainer, kv: Pick<KVAccess, "getVersioned" | "compareAndSet">): Promise<ReconcileStep> => {
	if (!container.options.webhooks.isReconcileEnabled) return { ran: false, reason: "disabled" };
	const nowMs = container.clock.now().getTime();
	const last = await kv.getVersioned<number>(KV_LAST_RECONCILE);
	if (last && nowMs - last.value < MAINTENANCE.reconcileIntervalMs) return { ran: false, reason: "throttled" };
	const claimed = await kv.compareAndSet(KV_LAST_RECONCILE, last?.revision ?? null, nowMs);
	if (!claimed.applied) return { ran: false, reason: "throttled" };
	return { ran: true, result: await reconcile(container) };
};

export interface PurgeResult {
	rateLimits: number;
	inbox: number;
	outbox: number;
}

/** Retention: rate-limit windows that ended, finished inbox events and fully delivered outbox events older than 30 days. */
export const purgeStale = async (container: CommerceContainer): Promise<PurgeResult> => {
	const before = isoBefore(container, MAINTENANCE.retentionMs);
	return {
		rateLimits: await container.rateLimiter.purgeExpired(MAINTENANCE.purgeBatch),
		inbox: await container.inbox.purgeFinished(before, MAINTENANCE.purgeBatch),
		outbox: await container.outbox.purgeDelivered(before, MAINTENANCE.purgeBatch),
	};
};
