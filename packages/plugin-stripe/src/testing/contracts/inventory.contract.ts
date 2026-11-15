import { describe, expect, it } from "vitest";

import { RESERVATION_STATUS } from "../../core/inventory.js";
import type { SellableRef } from "../../core/catalog.js";
import type { InventoryStore } from "../../ports/repositories.js";
import type { FixedClock } from "../clock.js";

export interface InventoryHarness {
	store: InventoryStore;
	clock: FixedClock;
}

const A: SellableRef = { kind: "variant", id: "a" };
const B: SellableRef = { kind: "product", id: "b" };
const key = (ref: SellableRef): string => `${ref.kind}:${ref.id}`;
const future = "2026-01-15T12:30:00.000Z";

/** The behaviour every InventoryStore must have, in memory or on plugin storage. */
export const inventoryContract = (name: string, create: () => InventoryHarness): void => {
	describe(`InventoryStore contract: ${name}`, () => {
		const stocked = async (levels: Array<[SellableRef, number]>) => {
			const harness = create();
			for (const [sellable, onHand] of levels) await harness.store.adjust(sellable, onHand, "seed");
			return harness;
		};
		const reserveInput = (id: string, lines: Array<[SellableRef, number, boolean?]>) => ({
			reservationId: id,
			cartId: `cart-${id}`,
			lines: lines.map(([sellable, quantity, isGuarded = true]) => ({ sellable, quantity, isGuarded })),
			expiresAt: future,
		});

		it("creates a level on first adjust and adds deltas afterwards", async () => {
			const { store } = create();
			expect(await store.get(A)).toBeNull();
			const first = await store.adjust(A, 10, "seed");
			expect(first).toMatchObject({ onHand: 10, available: 10, reserved: 0 });
			const second = await store.adjust(A, -3, "sale");
			expect(second).toMatchObject({ onHand: 7, available: 7 });
			expect((await store.getMany([A, B])).get(key(A))?.onHand).toBe(7);
		});

		it("reserve moves units from available to reserved", async () => {
			const { store } = await stocked([[A, 5]]);
			const result = await store.reserve(reserveInput("r1", [[A, 2]]));
			expect(result.ok).toBe(true);
			expect(await store.get(A)).toMatchObject({ onHand: 5, available: 3, reserved: 2 });
		});

		it("reports every shortfall and leaves stock untouched when it cannot reserve", async () => {
			const { store } = await stocked([[A, 1], [B, 5]]);
			const result = await store.reserve(reserveInput("r1", [[B, 2], [A, 3]]));
			expect(result).toEqual({ ok: false, shortfalls: [{ sellable: A, requested: 3, available: 1 }] });
			expect(await store.get(B)).toMatchObject({ available: 5, reserved: 0 });
			expect(await store.get(A)).toMatchObject({ available: 1, reserved: 0 });
			expect(await store.getReservation("r1")).toBeNull();
		});

		it("is all-or-nothing: a failing later line releases the lines already taken", async () => {
			const { store } = await stocked([[A, 5], [B, 1]]);
			const result = await store.reserve(reserveInput("r1", [[A, 5], [B, 2]]));
			expect(result.ok).toBe(false);
			expect(await store.get(A)).toMatchObject({ available: 5, reserved: 0, onHand: 5 });
		});

		it("never oversells under concurrent reservations of the last units", async () => {
			const { store } = await stocked([[A, 5]]);
			const results = await Promise.all(Array.from({ length: 12 }, (_, index) => store.reserve(reserveInput(`r${index}`, [[A, 1]]))));
			expect(results.filter((result) => result.ok)).toHaveLength(5);
			expect(await store.get(A)).toMatchObject({ available: 0, reserved: 5, onHand: 5 });
		});

		it("never oversells across overlapping multi-line reservations", async () => {
			const { store } = await stocked([[A, 3], [B, 3]]);
			const results = await Promise.all([
				store.reserve(reserveInput("x", [[A, 2], [B, 2]])),
				store.reserve(reserveInput("y", [[B, 2], [A, 2]])),
			]);
			expect(results.filter((result) => result.ok).length).toBeLessThanOrEqual(1);
			const [a, b] = await Promise.all([store.get(A), store.get(B)]);
			expect(a!.available).toBeGreaterThanOrEqual(0);
			expect(b!.available).toBeGreaterThanOrEqual(0);
			expect(a!.reserved).toBe(b!.reserved);
		});

		it("treats a repeated reservation id as the same reservation", async () => {
			const { store } = await stocked([[A, 5]]);
			await store.reserve(reserveInput("r1", [[A, 2]]));
			const again = await store.reserve(reserveInput("r1", [[A, 2]]));
			expect(again.ok).toBe(true);
			expect(await store.get(A)).toMatchObject({ available: 3, reserved: 2 });
		});

		it("commit is idempotent: onHand and reserved drop exactly once", async () => {
			const { store } = await stocked([[A, 5]]);
			await store.reserve(reserveInput("r1", [[A, 2]]));
			const [first, second] = await Promise.all([store.commit("r1"), store.commit("r1")]);
			const third = await store.commit("r1");
			expect([first, second, third].every((item) => item?.status === RESERVATION_STATUS.committed)).toBe(true);
			expect(await store.get(A)).toMatchObject({ onHand: 3, reserved: 0, available: 3 });
		});

		it("release is idempotent: available returns exactly once", async () => {
			const { store } = await stocked([[A, 5]]);
			await store.reserve(reserveInput("r1", [[A, 2]]));
			await Promise.all([store.release("r1"), store.release("r1")]);
			await store.release("r1");
			expect(await store.get(A)).toMatchObject({ onHand: 5, reserved: 0, available: 5 });
			expect((await store.getReservation("r1"))?.status).toBe(RESERVATION_STATUS.released);
		});

		it("a settled reservation cannot be settled the other way", async () => {
			const { store } = await stocked([[A, 5]]);
			await store.reserve(reserveInput("c", [[A, 1]]));
			await store.reserve(reserveInput("r", [[A, 1]]));
			await store.commit("c");
			await store.release("r");
			const afterRelease = await store.release("c");
			const afterCommit = await store.commit("r");
			expect(afterRelease?.status).toBe(RESERVATION_STATUS.committed);
			expect(afterCommit?.status).toBe(RESERVATION_STATUS.released);
			expect(await store.get(A)).toMatchObject({ onHand: 4, reserved: 0, available: 4 });
		});

		it("returns null for an unknown reservation", async () => {
			const { store } = create();
			expect(await store.commit("nope")).toBeNull();
			expect(await store.release("nope")).toBeNull();
			expect(await store.getReservation("nope")).toBeNull();
		});

		it("skips unguarded lines that have no level and lets backorder go below zero", async () => {
			const { store } = await stocked([[A, 1]]);
			const result = await store.reserve(reserveInput("r1", [[A, 3, false], [B, 2, false]]));
			expect(result.ok).toBe(true);
			expect(await store.get(A)).toMatchObject({ available: -2, reserved: 3 });
			expect(await store.get(B)).toBeNull();
			await store.release("r1");
			expect(await store.get(A)).toMatchObject({ available: 1, reserved: 0 });
			expect(await store.get(B)).toBeNull();
		});

		it("lists only held reservations that have expired", async () => {
			const { store } = await stocked([[A, 9]]);
			await store.reserve({ ...reserveInput("old", [[A, 1]]), expiresAt: "2026-01-15T12:10:00.000Z" });
			await store.reserve({ ...reserveInput("new", [[A, 1]]), expiresAt: "2026-01-15T13:00:00.000Z" });
			await store.reserve({ ...reserveInput("done", [[A, 1]]), expiresAt: "2026-01-15T12:05:00.000Z" });
			await store.commit("done");
			const expired = await store.listExpiredReservations("2026-01-15T12:20:00.000Z", 10);
			expect(expired.map((item) => item.id)).toEqual(["old"]);
		});

		it("tracks the content mirror separately from the level", async () => {
			const { store } = await stocked([[A, 4]]);
			await store.setMirroredOnHand(A, 4);
			await store.adjust(A, 2, "admin_adjust");
			expect(await store.get(A)).toMatchObject({ onHand: 6, mirroredOnHand: 4 });
			await store.setMirroredOnHand(B, 7);
			expect(await store.get(B)).toMatchObject({ onHand: 7, mirroredOnHand: 7 });
		});
	});
};
