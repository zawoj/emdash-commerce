import { beforeEach, describe, expect, it } from "vitest";

import { CART_STATUS } from "../core/cart.js";
import { isCommerceError } from "../core/errors.js";
import type { SellableRef } from "../core/catalog.js";
import { createInventoryService, publishStockAlerts, type InventoryService } from "./inventory.js";
import { createEmptyCart } from "./cart/lifecycle.js";
import { createStorefrontWorld, product, variant, type StorefrontWorld } from "./cart/test-support.js";

const P_TRACKED: SellableRef = { kind: "product", id: "tracked" };
const P_BACKORDER: SellableRef = { kind: "product", id: "backorder" };
const P_FREE: SellableRef = { kind: "product", id: "free" };
const V1: SellableRef = { kind: "variant", id: "v1" };
const IN_30_MIN = "2026-01-15T12:30:00.000Z";

describe("inventory service", () => {
	let w: StorefrontWorld;
	let inventory: InventoryService;

	beforeEach(async () => {
		w = createStorefrontWorld({ options: { inventory: { lowStockThreshold: 3 } } });
		w.world.catalog.addProduct(product({ id: "tracked", slug: "t", inventory: { isTracked: true, allowsBackorder: false } }));
		w.world.catalog.addProduct(product({ id: "backorder", slug: "b", inventory: { isTracked: true, allowsBackorder: true } }));
		w.world.catalog.addProduct(product({ id: "free", slug: "f" }));
		w.world.catalog.addProduct(product({ id: "p3", slug: "tee", hasVariants: true }));
		w.world.catalog.addVariant(variant({ id: "v1", productId: "p3" }));
		await w.world.inventory.adjust(P_TRACKED, 5, "seed");
		await w.world.inventory.adjust(P_BACKORDER, 1, "seed");
		await w.world.inventory.adjust(V1, 10, "seed");
		inventory = createInventoryService(w.container, w.deps);
	});

	it("reports availability per sellable, null when stock is not tracked, never negative", async () => {
		await w.world.inventory.adjust(P_BACKORDER, -3, "oversold");
		const found = await inventory.availability([P_TRACKED, P_BACKORDER, P_FREE, V1]);
		expect(Object.fromEntries(found)).toEqual({ "product:tracked": 5, "product:backorder": 0, "product:free": null, "variant:v1": 10 });
	});

	describe("reserve", () => {
		const reserve = (id: string, lines: Array<[SellableRef, number]>) =>
			inventory.reserve({ reservationId: id, cartId: `cart-${id}`, lines: lines.map(([sellable, quantity]) => ({ sellable, quantity })), expiresAt: IN_30_MIN });

		it("guards tracked stock: cannot take more than is available, and reports the shortfall", async () => {
			const result = await reserve("r1", [[P_TRACKED, 6]]);
			expect(result).toEqual({ ok: false, shortfalls: [{ sellable: P_TRACKED, requested: 6, available: 5 }] });
			expect(await w.world.inventory.get(P_TRACKED)).toMatchObject({ available: 5, reserved: 0 });
		});

		it("does not guard a backorderable or an untracked sellable", async () => {
			const result = await reserve("r2", [[P_BACKORDER, 4], [P_FREE, 100]]);
			expect(result.ok).toBe(true);
			expect(await w.world.inventory.get(P_BACKORDER)).toMatchObject({ available: -3, reserved: 4 });
		});

		it("holds all lines or none", async () => {
			const result = await reserve("r3", [[P_TRACKED, 2], [V1, 11]]);
			expect(result.ok).toBe(false);
			expect(await w.world.inventory.get(P_TRACKED)).toMatchObject({ available: 5, reserved: 0 });
		});

		it("never oversells the last unit under concurrency", async () => {
			const results = await Promise.all(Array.from({ length: 8 }, (_, index) => reserve(`c${index}`, [[P_TRACKED, 3]])));
			expect(results.filter((result) => result.ok)).toHaveLength(1);
			expect((await w.world.inventory.get(P_TRACKED))?.available).toBe(2);
		});
	});

	it("releases expired holds, and only reopens a cart that is still waiting on that very reservation", async () => {
		const waiting = await reserveFor("waiting", 2);
		const moved = await reserveFor("moved", 1);
		const live = await reserveFor("live", 1, "2026-01-15T13:00:00.000Z");
		for (const [cartId, reservationId, sessionId] of [
			[waiting.cartId, "waiting", "cs_a"],
			[moved.cartId, "moved", "cs_b"],
			[live.cartId, "live", "cs_c"],
		] as const) {
			const stored = (await w.world.carts.get(cartId))!;
			await w.world.carts.put({ ...stored.value, status: CART_STATUS.checkoutOpen, checkout: { sessionId, reservationId: cartId === moved.cartId ? "another" : reservationId, expiresAt: IN_30_MIN } }, stored.revision);
		}
		w.world.clock.advance(31 * 60_000);

		const result = await inventory.releaseExpired(10);
		expect(result).toEqual({ released: 2, cartsReopened: 1 });
		expect(await w.world.inventory.getReservation("waiting")).toMatchObject({ status: "released" });
		expect(await w.world.inventory.getReservation("live")).toMatchObject({ status: "held" });
		expect((await w.world.carts.get(waiting.cartId))?.value).toMatchObject({ status: "active", checkout: null });
		expect((await w.world.carts.get(moved.cartId))?.value.status).toBe("checkout_open");
		expect((await w.world.carts.get(live.cartId))?.value.status).toBe("checkout_open");
		expect(await w.world.inventory.get(P_TRACKED)).toMatchObject({ reserved: 1, available: 4 });
		// A second sweep finds nothing.
		expect(await inventory.releaseExpired(10)).toEqual({ released: 0, cartsReopened: 0 });
	});

	async function reserveFor(id: string, quantity: number, expiresAt = IN_30_MIN) {
		const cartId = `${id}`.padEnd(32, "x");
		const view = { ...createEmptyCart(w.container, { userAgent: null, country: null }), id: cartId };
		await w.world.carts.put({ ...view, lines: [{ priceId: "pr", quantity, addedAt: view.createdAt }] }, null);
		const result = await w.world.inventory.reserve({ reservationId: id, cartId, lines: [{ sellable: P_TRACKED, quantity, isGuarded: true }], expiresAt });
		expect(result.ok).toBe(true);
		return { cartId };
	}

	describe("stock alerts", () => {
		it("publishes out_of_stock and low_stock for tracked sellables only, with deterministic ids", async () => {
			await w.world.inventory.adjust(P_TRACKED, -2, "sale"); // 3 left = threshold
			await w.world.inventory.adjust(V1, -10, "sale"); // 0 left
			await w.world.inventory.adjust(P_FREE, 1, "seed");
			await publishStockAlerts(w.container, w.publisher, [P_TRACKED, V1, P_FREE]);
			const byType = Object.fromEntries(w.publisher.events.map((event) => [event.type, event]));
			expect(byType["inventory.low_stock"]).toMatchObject({ data: { sellable: P_TRACKED, available: 3, threshold: 3 } });
			expect(byType["inventory.out_of_stock"]).toMatchObject({ data: { sellable: V1 } });
			expect(w.publisher.events).toHaveLength(2);
			const first = w.publisher.events.map((event) => event.id);
			w.publisher.events.length = 0;
			await publishStockAlerts(w.container, w.publisher, [P_TRACKED, V1]);
			expect(w.publisher.events.map((event) => event.id)).toEqual(first);
		});

		it("stays silent above the threshold and never throws when publishing fails", async () => {
			await publishStockAlerts(w.container, w.publisher, [P_TRACKED]);
			expect(w.publisher.events).toEqual([]);
			await w.world.inventory.adjust(P_TRACKED, -5, "sale");
			w.publisher.publish = async () => {
				throw new Error("outbox down");
			};
			await expect(publishStockAlerts(w.container, w.publisher, [P_TRACKED])).resolves.toBeUndefined();
			expect(w.logs.some((entry) => entry.level === "warn")).toBe(true);
		});
	});

	describe("admin adjust", () => {
		it("adjusts stock, mirrors a variant's on-hand into content and alerts", async () => {
			const view = await inventory.adjust({ kind: "variant", id: "v1", delta: -8, reason: "damaged" });
			expect(view).toEqual({ sellable: V1, isTracked: true, onHand: 2, reserved: 0, available: 2 });
			expect(w.stockMirrorCalls).toEqual([["v1", 2]]);
			expect(w.publisher.events.map((event) => event.type)).toEqual(["inventory.low_stock"]);
		});

		it("does not mirror products (no content field) and keeps the adjustment when the mirror write fails", async () => {
			const product = await inventory.adjust({ kind: "product", id: "tracked", delta: 1, reason: "found" });
			expect(product.onHand).toBe(6);
			expect(w.stockMirrorCalls).toEqual([]);
			w.container.catalogMirror.writeVariantStock = async () => {
				throw new Error("content down");
			};
			const view = await inventory.adjust({ kind: "variant", id: "v1", delta: 1, reason: "found" });
			expect(view.onHand).toBe(11);
			expect(w.logs.some((entry) => entry.level === "warn" && /mirror/.test(entry.message))).toBe(true);
		});

		it("rejects an unknown target and a change that would take stock below zero", async () => {
			const missing = await inventory.adjust({ kind: "product", id: "nope", delta: 1, reason: "x" }).catch((error: unknown) => error);
			expect(isCommerceError(missing) && missing.status).toBe(404);
			const below = await inventory.adjust({ kind: "product", id: "tracked", delta: -6, reason: "x" }).catch((error: unknown) => error);
			expect(isCommerceError(below) && below.status).toBe(409);
			expect((await w.world.inventory.get(P_TRACKED))?.onHand).toBe(5);
		});
	});
});
