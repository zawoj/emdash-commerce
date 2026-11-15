import { RESERVATION_STATUS, type Reservation, type StockLevel } from "../../core/inventory.js";
import { sellableKey, type SellableRef } from "../../core/catalog.js";
import type { Clock, InventoryStore } from "../../ports/repositories.js";
import { clone, tick } from "./runtime.js";

interface HeldLine {
	sellable: SellableRef;
	quantity: number;
	/** True when the units were really taken from a stock level (untracked sellables have none). */
	isTaken: boolean;
}

interface StoredReservation extends Omit<Reservation, "lines"> {
	lines: HeldLine[];
}

const toReservation = (stored: StoredReservation): Reservation => ({
	...clone(stored),
	lines: stored.lines.map(({ sellable, quantity }) => ({ sellable: { ...sellable }, quantity })),
});

/**
 * Atomic by construction (JavaScript runs each synchronous block to completion), so "reserve all or
 * none" needs no compensation here; the production store reaches the same observable result with
 * guarded single-row updates and compensation.
 */
export const createInMemoryInventoryStore = (clock: Clock): InventoryStore => {
	const levels = new Map<string, StockLevel>();
	const reservations = new Map<string, StoredReservation>();
	const now = (): string => clock.now().toISOString();

	const upsertLevel = (sellable: SellableRef, onHand: number, mirroredOnHand?: number): StockLevel => {
		const level: StockLevel = {
			sellable: { ...sellable },
			onHand,
			reserved: 0,
			available: onHand,
			mirroredOnHand: mirroredOnHand ?? onHand,
			updatedAt: now(),
		};
		levels.set(sellableKey(sellable), level);
		return level;
	};

	return {
		async get(sellable) {
			await tick();
			const level = levels.get(sellableKey(sellable));
			return level ? clone(level) : null;
		},
		async getMany(sellables) {
			await tick();
			const found = new Map<string, StockLevel>();
			for (const sellable of sellables) {
				const level = levels.get(sellableKey(sellable));
				if (level) found.set(sellableKey(sellable), clone(level));
			}
			return found;
		},
		async reserve({ reservationId, cartId, lines, expiresAt }) {
			await tick();
			const existing = reservations.get(reservationId);
			if (existing) return { ok: true, reservation: toReservation(existing) };

			const shortfalls: Array<{ sellable: SellableRef; requested: number; available: number }> = [];
			for (const line of lines) {
				if (!line.isGuarded) continue;
				const available = levels.get(sellableKey(line.sellable))?.available ?? 0;
				if (available < line.quantity) shortfalls.push({ sellable: line.sellable, requested: line.quantity, available });
			}
			if (shortfalls.length > 0) return { ok: false, shortfalls };

			const held: HeldLine[] = lines.map((line) => {
				const level = levels.get(sellableKey(line.sellable));
				if (level) {
					level.available -= line.quantity;
					level.reserved += line.quantity;
					level.updatedAt = now();
				}
				return { sellable: line.sellable, quantity: line.quantity, isTaken: level !== undefined };
			});
			const stored: StoredReservation = {
				id: reservationId,
				cartId,
				checkoutSessionId: null,
				lines: held,
				status: RESERVATION_STATUS.held,
				expiresAt,
				createdAt: now(),
				updatedAt: now(),
			};
			reservations.set(reservationId, stored);
			return { ok: true, reservation: toReservation(stored) };
		},
		async commit(reservationId) {
			await tick();
			const stored = reservations.get(reservationId);
			if (!stored) return null;
			if (stored.status === RESERVATION_STATUS.held) {
				for (const line of stored.lines) {
					const level = levels.get(sellableKey(line.sellable));
					if (!line.isTaken || !level) continue;
					level.onHand -= line.quantity;
					level.reserved -= line.quantity;
					level.updatedAt = now();
				}
				stored.status = RESERVATION_STATUS.committed;
				stored.updatedAt = now();
			}
			return toReservation(stored);
		},
		async release(reservationId) {
			await tick();
			const stored = reservations.get(reservationId);
			if (!stored) return null;
			if (stored.status === RESERVATION_STATUS.held) {
				for (const line of stored.lines) {
					const level = levels.get(sellableKey(line.sellable));
					if (!line.isTaken || !level) continue;
					level.available += line.quantity;
					level.reserved -= line.quantity;
					level.updatedAt = now();
				}
				stored.status = RESERVATION_STATUS.released;
				stored.updatedAt = now();
			}
			return toReservation(stored);
		},
		async getReservation(reservationId) {
			await tick();
			const stored = reservations.get(reservationId);
			return stored ? toReservation(stored) : null;
		},
		async listExpiredReservations(at, limit) {
			await tick();
			return [...reservations.values()]
				.filter((item) => item.status === RESERVATION_STATUS.held && item.expiresAt <= at)
				.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
				.slice(0, limit)
				.map(toReservation);
		},
		async purgeReleasedReservations(before, limit) {
			await tick();
			const doomed = [...reservations.values()]
				.filter((item) => item.status === RESERVATION_STATUS.released && item.updatedAt < before)
				.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
				.slice(0, limit);
			for (const item of doomed) reservations.delete(item.id);
			return doomed.length;
		},
		async adjust(sellable, delta) {
			await tick();
			const level = levels.get(sellableKey(sellable));
			if (!level) return clone(upsertLevel(sellable, delta));
			level.onHand += delta;
			level.available += delta;
			level.updatedAt = now();
			return clone(level);
		},
		async setMirroredOnHand(sellable, onHand) {
			await tick();
			const level = levels.get(sellableKey(sellable));
			if (level) level.mirroredOnHand = onHand;
			else upsertLevel(sellable, onHand, onHand);
		},
	};
};
