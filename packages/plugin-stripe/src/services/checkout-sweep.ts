import { CART_STATUS } from "../core/cart.js";
import type { CommerceContainer } from "../plugin/container.js";
import type { CheckoutSnapshot } from "../ports/repositories.js";
import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import { errorMessage } from "./payments/async.js";
import { MAINTENANCE } from "./maintenance.js";

/**
 * The sweep of checkouts nobody paid. Stripe's `checkout.session.expired` event and the reservation expiry sweep
 * already release the stock and reopen the cart; what stays behind are the records themselves: the checkout
 * snapshot, the released stock hold and a cart nobody came back to. This step removes them once the session ended
 * and the retention window passed.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
/** Snapshots are read in pages of `MAINTENANCE.cartBatch` so paid ones, which stay, cannot hide the unpaid ones behind them. */
const MAX_SNAPSHOT_PAGES = 5;

export interface CheckoutSweepResult {
	/** Snapshots of unpaid checkouts that were removed. */
	snapshots: number;
	/** Provider sessions that were still open and have been expired. */
	sessionsExpired: number;
	/** Stock holds that were still held and have been released. */
	holdsReleased: number;
	/** Anonymous carts of an abandoned checkout that were deleted. */
	carts: number;
	/** Released stock hold records that were deleted. */
	holdRecords: number;
	/** Snapshots of paid checkouts removed after the long retention. */
	settledSnapshots: number;
}

export interface CheckoutSweepOptions {
	/** Overrides `checkout.abandonedRetentionHours` (0 removes everything that already ended). */
	retentionMs?: number;
}

const isoBefore = (container: CommerceContainer, ms: number): string => new Date(container.clock.now().getTime() - ms).toISOString();

type SessionOutcome = "expired" | "paid" | "closed";

/**
 * Closes an open session early so it cannot be paid while its records go. A session the buyer paid is reported as
 * `paid`: its webhook may still be waiting in the inbox, so settlement keeps the snapshot and the stock hold.
 */
const closeSession = async (container: CommerceContainer, sessionId: string): Promise<SessionOutcome> => {
	const provider = await container.provider();
	const session = await provider.checkout.retrieveSession(sessionId);
	if (session?.status === "complete") return "paid";
	if (session?.status !== "open") return "closed";
	await provider.checkout.expireSession(sessionId);
	return "expired";
};

const sweepAbandoned = async (container: CommerceContainer, snapshot: CheckoutSnapshot, cutoff: string, hasProvider: boolean, result: CheckoutSweepResult): Promise<void> => {
	if (hasProvider && snapshot.sessionId) {
		const outcome = await closeSession(container, snapshot.sessionId);
		if (outcome === "paid") return;
		if (outcome === "expired") result.sessionsExpired += 1;
	}
	if (snapshot.reservationId) {
		const reservation = await container.inventory.getReservation(snapshot.reservationId);
		if (reservation?.status === "held") {
			await container.inventory.release(snapshot.reservationId);
			result.holdsReleased += 1;
		}
	}
	const stored = (await container.carts.get(snapshot.cartId))?.value;
	// Only the cart this checkout belongs to, idle since before the sweep window, without an email to win back.
	const isOwnCheckout = stored?.status === CART_STATUS.checkoutOpen && (stored.checkout?.sessionId === snapshot.sessionId || stored.checkout?.reservationId === snapshot.reservationId);
	const isIdleAnonymous = stored && !stored.email && stored.updatedAt < cutoff && (stored.status === CART_STATUS.active || isOwnCheckout);
	if (stored && isIdleAnonymous) {
		await container.carts.delete(stored.id);
		result.carts += 1;
	} else if (stored && isOwnCheckout) {
		const loaded = await container.carts.get(stored.id);
		if (loaded?.value.status === CART_STATUS.checkoutOpen) {
			await container.carts.put({ ...loaded.value, status: CART_STATUS.active, checkout: null, updatedAt: container.clock.now().toISOString() }, loaded.revision);
		}
	}
	await container.snapshots.delete(snapshot.checkoutId);
	result.snapshots += 1;
};

/**
 * Removes what unpaid checkouts leave behind, bounded per run. A snapshot is swept when its session ended
 * (`checkout.sessionMinutes`) and `checkout.abandonedRetentionHours` passed and no order exists for its session;
 * a paid checkout's snapshot is removed only after `MAINTENANCE.retentionMs`. Each snapshot is isolated: a failure
 * is logged and the next run tries again.
 */
export const sweepCheckouts = async (container: CommerceContainer, options: CheckoutSweepOptions = {}): Promise<CheckoutSweepResult> => {
	const result: CheckoutSweepResult = { snapshots: 0, sessionsExpired: 0, holdsReleased: 0, carts: 0, holdRecords: 0, settledSnapshots: 0 };
	const retentionMs = options.retentionMs ?? container.options.checkout.abandonedRetentionHours * HOUR_MS;
	const cutoff = isoBefore(container, container.options.checkout.sessionMinutes * MINUTE_MS + retentionMs);
	const settledCutoff = isoBefore(container, MAINTENANCE.retentionMs);
	const hasProvider = Boolean((await container.secrets()).stripeSecretKey);

	let after: string | undefined;
	for (let page = 0; page < MAX_SNAPSHOT_PAGES; page += 1) {
		const snapshots = await container.snapshots.listCreatedBefore(cutoff, MAINTENANCE.cartBatch, after);
		for (const snapshot of snapshots) {
			try {
				const isPaid = snapshot.sessionId ? Boolean(await container.recordIndex.get(RECORD_INDEX_KEY.orderBySession(snapshot.sessionId))) : false;
				if (!isPaid) await sweepAbandoned(container, snapshot, cutoff, hasProvider, result);
				else if (snapshot.createdAt < settledCutoff) {
					await container.snapshots.delete(snapshot.checkoutId);
					result.settledSnapshots += 1;
				}
			} catch (error) {
				container.log.warn("Abandoned checkout could not be swept", { checkoutId: snapshot.checkoutId, error: errorMessage(error) });
			}
		}
		after = snapshots.at(-1)?.createdAt;
		if (snapshots.length < MAINTENANCE.cartBatch || !after) break;
	}
	result.holdRecords = await container.inventory.purgeReleasedReservations(isoBefore(container, retentionMs), MAINTENANCE.purgeBatch);
	return result;
};
