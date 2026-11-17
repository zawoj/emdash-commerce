import type { z } from "zod";

import type { adminInventoryAdjustInput } from "../contracts/api.js";
import { CART_STATUS } from "../core/cart.js";
import { commerceEventId, type AnyCommerceEvent } from "../core/events.js";
import { sellableKey, type SellableRef } from "../core/catalog.js";
import { CommerceError } from "../core/errors.js";
import { INVENTORY_ADJUSTMENT_REASON, type ReservationLine, type ReserveResult } from "../core/inventory.js";
import { writeVariantStockMirror } from "../adapters/emdash/content/catalog-mirror.js";
import type { CommerceContainer } from "../plugin/container.js";
import type { EventPublisher } from "./contracts.js";
import { readAvailability } from "./inventory/availability.js";
import { isGuardedPolicy, loadPolicies } from "./inventory/policy.js";

export type AdminInventoryAdjustInput = z.infer<typeof adminInventoryAdjustInput>;

export interface StockView {
	sellable: SellableRef;
	isTracked: boolean;
	onHand: number;
	reserved: number;
	available: number;
}

export interface InventoryService {
	/** Units a buyer could still take per `sellableKey`; null when the sellable does not track stock. */
	availability(refs: readonly SellableRef[]): Promise<Map<string, number | null>>;
	/** Holds every line or none (`isGuarded` is derived from the catalog policy, never from the caller). */
	reserve(input: { reservationId: string; cartId: string; lines: readonly ReservationLine[]; expiresAt: string }): Promise<ReserveResult>;
	release(reservationId: string): Promise<void>;
	/** Cron: releases expired holds and reopens the carts that were waiting on them. */
	releaseExpired(limit: number): Promise<{ released: number; cartsReopened: number }>;
	get(sellable: SellableRef): Promise<StockView>;
	/** Admin adjustment; variants also update the editor-facing content mirror. */
	adjust(input: AdminInventoryAdjustInput): Promise<StockView>;
}

const MAX_CART_REOPEN_ATTEMPTS = 5;

/**
 * Stock alerts for sellables whose level just changed (settlement calls this after a commit). Out of stock
 * is `available <= 0`; low stock is `0 < available <= lowStockThreshold`. Only tracked sellables alert. The
 * event id carries the level's `updatedAt`, so a replay of the same change is deduplicated by the outbox
 * while a later change alerts again. Never throws: an alert is a notification, not part of the sale.
 */
export const publishStockAlerts = async (
	container: CommerceContainer,
	publisher: EventPublisher,
	sellables: readonly SellableRef[],
): Promise<void> => {
	try {
		const [levels, policies] = await Promise.all([container.inventory.getMany(sellables), loadPolicies(container, sellables)]);
		const threshold = container.options.inventory.lowStockThreshold;
		const occurredAt = container.clock.now().toISOString();
		const events: AnyCommerceEvent[] = [];
		for (const ref of sellables) {
			const level = levels.get(sellableKey(ref));
			if (!level || !policies.get(sellableKey(ref))?.isTracked) continue;
			const sourceId = `${sellableKey(ref)}@${level.updatedAt}`;
			if (level.available <= 0) {
				events.push({ id: commerceEventId("inventory.out_of_stock", sourceId), type: "inventory.out_of_stock", occurredAt, data: { sellable: ref } });
			} else if (level.available <= threshold) {
				events.push({
					id: commerceEventId("inventory.low_stock", sourceId),
					type: "inventory.low_stock",
					occurredAt,
					data: { sellable: ref, available: level.available, threshold },
				});
			}
		}
		if (events.length > 0) await publisher.publish(events);
	} catch (error) {
		container.log.warn("Stock alerts could not be published", { error: error instanceof Error ? error.message : "unknown" });
	}
};

export const createInventoryService = (container: CommerceContainer, deps: { publisher: EventPublisher }): InventoryService => {
	const stockView = async (sellable: SellableRef): Promise<StockView> => {
		const [level, policies] = await Promise.all([container.inventory.get(sellable), loadPolicies(container, [sellable])]);
		return {
			sellable,
			isTracked: policies.get(sellableKey(sellable))?.isTracked ?? false,
			onHand: level?.onHand ?? 0,
			reserved: level?.reserved ?? 0,
			available: level?.available ?? 0,
		};
	};

	/** Puts a cart whose checkout hold expired back to `active`, unless it moved on to another checkout. */
	const reopenCart = async (cartId: string, reservationId: string): Promise<boolean> => {
		for (let attempt = 0; attempt < MAX_CART_REOPEN_ATTEMPTS; attempt += 1) {
			const stored = await container.carts.get(cartId);
			const cart = stored?.value;
			if (!stored || !cart || cart.status !== CART_STATUS.checkoutOpen || cart.checkout?.reservationId !== reservationId) return false;
			const result = await container.carts.put(
				{ ...cart, status: CART_STATUS.active, checkout: null, updatedAt: container.clock.now().toISOString() },
				stored.revision,
			);
			if (result.applied) return true;
		}
		return false;
	};

	return {
		availability: (refs) => readAvailability(container, refs),
		async reserve({ reservationId, cartId, lines, expiresAt }) {
			const policies = await loadPolicies(container, lines.map((line) => line.sellable));
			return container.inventory.reserve({
				reservationId,
				cartId,
				expiresAt,
				lines: lines.map((line) => ({ ...line, isGuarded: isGuardedPolicy(policies.get(sellableKey(line.sellable))) })),
			});
		},
		async release(reservationId) {
			await container.inventory.release(reservationId);
		},
		async releaseExpired(limit) {
			const expired = await container.inventory.listExpiredReservations(container.clock.now().toISOString(), limit);
			let released = 0;
			let cartsReopened = 0;
			for (const reservation of expired) {
				try {
					await container.inventory.release(reservation.id);
					released += 1;
					if (await reopenCart(reservation.cartId, reservation.id)) cartsReopened += 1;
				} catch (error) {
					// One bad record must not stall the sweep; the next run picks it up again.
					container.log.warn("Expired reservation could not be released", { reservationId: reservation.id, error: error instanceof Error ? error.message : "unknown" });
				}
			}
			return { released, cartsReopened };
		},
		get: stockView,
		async adjust(input) {
			const sellable: SellableRef = { kind: input.kind, id: input.id };
			const record = input.kind === "variant" ? await container.catalog.getVariant(input.id) : await container.catalog.getProduct(input.id);
			if (!record) throw new CommerceError("notFound", `${input.kind} not found`, { kind: input.kind, id: input.id });
			const current = await container.inventory.get(sellable);
			if ((current?.onHand ?? 0) + input.delta < 0) {
				throw new CommerceError("conflict", "Stock cannot go below zero.", { onHand: current?.onHand ?? 0, delta: input.delta });
			}
			const level = await container.inventory.adjust(sellable, input.delta, `${INVENTORY_ADJUSTMENT_REASON.adminAdjust}: ${input.reason}`);
			if (input.kind === "variant") {
				try {
					await writeVariantStockMirror(container, input.id, level.onHand);
				} catch (error) {
					container.log.warn("Variant stock mirror could not be written", { variantId: input.id, error: error instanceof Error ? error.message : "unknown" });
				}
			}
			await publishStockAlerts(container, deps.publisher, [sellable]);
			return stockView(sellable);
		},
	};
};
