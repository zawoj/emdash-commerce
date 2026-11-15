import type { StorageCollection } from "emdash";

import { sellableKey, type SellableRef } from "../../../core/catalog.js";
import { RESERVATION_STATUS, type Reservation, type ReservationLine, type StockLevel } from "../../../core/inventory.js";
import type { Clock, InventoryStore } from "../../../ports/repositories.js";
import { updateWithCas, withSerializationRetry } from "./cas.js";

export interface StoredReservationLine extends ReservationLine {
	isGuarded: boolean;
	/** True once the units were really moved from `available` to `reserved` (untracked sellables have no level). */
	isTaken: boolean;
}

export interface StoredReservation extends Omit<Reservation, "lines"> {
	lines: StoredReservationLine[];
}

export type StockLevelDoc = StockLevel & { lastReason?: string };

const numericDelta = (amount: number): { inc: number } | { dec: number } => (amount >= 0 ? { inc: amount } : { dec: -amount });

const toReservation = (stored: StoredReservation): Reservation => ({
	id: stored.id,
	cartId: stored.cartId,
	checkoutSessionId: stored.checkoutSessionId,
	lines: stored.lines.map(({ sellable, quantity }) => ({ sellable, quantity })),
	status: stored.status,
	expiresAt: stored.expiresAt,
	createdAt: stored.createdAt,
	updatedAt: stored.updatedAt,
});

const toLevel = (doc: StockLevelDoc): StockLevel => ({
	sellable: doc.sellable,
	onHand: doc.onHand,
	reserved: doc.reserved,
	available: doc.available,
	mirroredOnHand: doc.mirroredOnHand,
	updatedAt: doc.updatedAt,
});

/**
 * Inventory on guarded single-row updates (no cross-document transactions exist):
 *
 * - `reserve` decrements `available` with a `gte` guard in the same statement, so N concurrent buyers of
 *   the last unit cannot oversell; lines are taken one by one and rolled back (compensation) when a later
 *   one fails. The reservation record is created first and updated per taken line, so a crash leaves an
 *   accurate record that the expiry sweep releases exactly.
 * - `commit` / `release` flip the record's status with a compare-and-set first (the exactly-once gate), then
 *   apply the counters. A crash between the two leaves units reserved (conservative: never oversells) until
 *   an admin adjustment (`admin/inventory/adjust`); it can never apply a transition twice.
 */
export const createInventoryStore = (
	levels: StorageCollection<StockLevelDoc>,
	reservations: StorageCollection<StoredReservation>,
	clock: Clock,
): InventoryStore => {
	const now = (): string => clock.now().toISOString();
	const levelId = (sellable: SellableRef): string => sellableKey(sellable);

	const createLevel = (sellable: SellableRef, onHand: number, reason?: string): StockLevelDoc => ({
		sellable,
		onHand,
		reserved: 0,
		available: onHand,
		mirroredOnHand: onHand,
		updatedAt: now(),
		...(reason ? { lastReason: reason } : {}),
	});

	const applyToLevel = async (
		sellable: SellableRef,
		delta: { onHand?: number; reserved?: number; available?: number },
		guard: { available?: { gte: number } } = {},
	): Promise<boolean> => {
		const result = await withSerializationRetry(() =>
			levels.updateIf(levelId(sellable), {
				where: guard,
				delta: {
					...(delta.onHand !== undefined ? { onHand: numericDelta(delta.onHand) } : {}),
					...(delta.reserved !== undefined ? { reserved: numericDelta(delta.reserved) } : {}),
					...(delta.available !== undefined ? { available: numericDelta(delta.available) } : {}),
				},
				set: { updatedAt: now() },
			}),
		);
		return result.applied;
	};

	/** Turns one held line back into available units (reserve compensation and release). */
	const giveBack = (line: StoredReservationLine): Promise<boolean> =>
		applyToLevel(line.sellable, { available: line.quantity, reserved: -line.quantity });

	const markTaken = async (reservationId: string, index: number): Promise<boolean> => {
		let wasHeld = true;
		await updateWithCas(reservations, reservationId, (current) => {
			wasHeld = current.status === RESERVATION_STATUS.held;
			if (!wasHeld) return null;
			current.lines[index]!.isTaken = true;
			current.updatedAt = now();
			return current;
		});
		return wasHeld;
	};

	const settle = async (reservationId: string, target: "committed" | "released"): Promise<Reservation | null> => {
		let transitioned: StoredReservation | null = null;
		const stored = await updateWithCas(reservations, reservationId, (current) => {
			// `change` reruns on a lost race; only the attempt that finally applies may leave `transitioned` set.
			transitioned = null;
			if (current.status !== RESERVATION_STATUS.held) return null;
			transitioned = { ...current, status: target, updatedAt: now() };
			return transitioned;
		});
		if (!stored) return null;
		const settled = transitioned as StoredReservation | null;
		if (settled) {
			for (const line of settled.lines) {
				if (!line.isTaken) continue;
				if (target === RESERVATION_STATUS.committed) {
					await applyToLevel(line.sellable, { onHand: -line.quantity, reserved: -line.quantity });
				} else {
					await giveBack(line);
				}
			}
		}
		return toReservation(stored);
	};

	const readShortfalls = async (lines: StoredReservationLine[]) => {
		const found = await levels.getMany([...new Set(lines.filter((line) => line.isGuarded).map((line) => levelId(line.sellable)))]);
		return lines
			.filter((line) => line.isGuarded)
			.map((line) => ({ sellable: line.sellable, requested: line.quantity, available: found.get(levelId(line.sellable))?.available ?? 0 }))
			.filter((entry) => entry.available < entry.requested);
	};

	const reserve: InventoryStore["reserve"] = async ({ reservationId, cartId, lines, expiresAt }) => {
		const stored: StoredReservation = {
			id: reservationId,
			cartId,
			checkoutSessionId: null,
			lines: lines.map((line) => ({ sellable: line.sellable, quantity: line.quantity, isGuarded: line.isGuarded, isTaken: false })),
			status: RESERVATION_STATUS.held,
			expiresAt,
			createdAt: now(),
			updatedAt: now(),
		};
		const created = await withSerializationRetry(() => reservations.compareAndSet(reservationId, null, stored));
		if (!created.applied) {
			// The same reservation id is a retry of the same request: return what exists, never reserve twice.
			const existing = await reservations.get(reservationId);
			if (existing) return { ok: true, reservation: toReservation(existing) };
			return reserve({ reservationId, cartId, lines, expiresAt });
		}

		for (const [index, line] of stored.lines.entries()) {
			const taken = await applyToLevel(
				line.sellable,
				{ available: -line.quantity, reserved: line.quantity },
				line.isGuarded ? { available: { gte: line.quantity } } : {},
			);
			if (!taken) {
				if (!line.isGuarded) continue; // no level row: the sellable does not track stock
				await settle(reservationId, RESERVATION_STATUS.released);
				await reservations.delete(reservationId);
				const shortfalls = await readShortfalls(stored.lines);
				const failing = { sellable: line.sellable, requested: line.quantity, available: 0 };
				return { ok: false, shortfalls: shortfalls.length > 0 ? shortfalls : [failing] };
			}
			if (!(await markTaken(reservationId, index))) {
				// Released by the expiry sweep while we were still taking lines: undo this one and report it.
				await giveBack(line);
				return { ok: false, shortfalls: [{ sellable: line.sellable, requested: line.quantity, available: 0 }] };
			}
		}
		return { ok: true, reservation: toReservation((await reservations.get(reservationId)) ?? stored) };
	};

	return {
		async get(sellable) {
			const doc = await levels.get(levelId(sellable));
			return doc ? toLevel(doc) : null;
		},
		async getMany(sellables) {
			const keys = [...new Set(sellables.map(levelId))];
			const found = await levels.getMany(keys);
			return new Map([...found].map(([key, doc]) => [key, toLevel(doc)]));
		},
		reserve,
		commit: (reservationId) => settle(reservationId, RESERVATION_STATUS.committed),
		release: (reservationId) => settle(reservationId, RESERVATION_STATUS.released),
		async getReservation(reservationId) {
			const stored = await reservations.get(reservationId);
			return stored ? toReservation(stored) : null;
		},
		async listExpiredReservations(at, limit) {
			const page = await reservations.query({
				where: { status: RESERVATION_STATUS.held, expiresAt: { lte: at } },
				orderBy: { expiresAt: "asc" },
				limit,
			});
			return page.items.map((item) => toReservation(item.data));
		},
		async purgeReleasedReservations(before, limit) {
			const page = await reservations.query({
				where: { status: RESERVATION_STATUS.released, expiresAt: { lt: before } },
				orderBy: { expiresAt: "asc" },
				limit,
			});
			return reservations.deleteMany(page.items.map((item) => item.id));
		},
		async adjust(sellable, delta, reason) {
			for (;;) {
				const updated = await withSerializationRetry(() =>
					levels.updateIf(levelId(sellable), {
						where: {},
						delta: { onHand: numericDelta(delta), available: numericDelta(delta) },
						set: { updatedAt: now(), lastReason: reason },
					}),
				);
				if (updated.applied) return toLevel(updated.data);
				const created = await levels.compareAndSet(levelId(sellable), null, createLevel(sellable, delta, reason));
				if (created.applied) return toLevel(createLevel(sellable, delta, reason));
			}
		},
		async setMirroredOnHand(sellable, onHand) {
			for (;;) {
				const updated = await withSerializationRetry(() =>
					levels.updateIf(levelId(sellable), { where: {}, set: { mirroredOnHand: onHand, updatedAt: now() } }),
				);
				if (updated.applied) return;
				const created = await levels.compareAndSet(levelId(sellable), null, createLevel(sellable, onHand));
				if (created.applied) return;
			}
		},
	};
};
