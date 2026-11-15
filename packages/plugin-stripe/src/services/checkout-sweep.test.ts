import { describe, expect, it } from "vitest";

import { CART_STATUS } from "../core/cart.js";
import { RESERVATION_STATUS } from "../core/inventory.js";
import { sweepCheckouts } from "./checkout-sweep.js";
import { advance, completeCheckout, createHarness, paidOrder, seedCheckout } from "./payments/test-support.js";

const HOUR = 60 * 60 * 1000;

describe("sweepCheckouts", () => {
	it("keeps a checkout until its session ended and the retention window passed", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		advance(h, 2 * HOUR);
		expect(await sweepCheckouts(h.container)).toMatchObject({ snapshots: 0, carts: 0, holdRecords: 0 });
		expect(await h.container.snapshots.get(seeded.checkoutId)).not.toBeNull();
	});

	it("removes the snapshot, the released hold and the anonymous cart of an unpaid checkout, and expires the open session", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const before = await h.container.inventory.get(seeded.sellable);
		expect(before?.reserved).toBe(2);
		advance(h, 49 * HOUR);

		const result = await sweepCheckouts(h.container);

		expect(result).toMatchObject({ snapshots: 1, sessionsExpired: 1, holdsReleased: 1, carts: 1, holdRecords: 1 });
		expect(h.provider.sessions.get(seeded.sessionId)?.session.status).toBe("expired");
		expect(await h.container.snapshots.get(seeded.checkoutId)).toBeNull();
		expect(await h.container.inventory.getReservation(seeded.reservationId)).toBeNull();
		expect(await h.container.carts.get(seeded.cartId)).toBeNull();
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ reserved: 0, available: 10 });
	});

	it("also removes the record of a hold the webhook already released", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		await h.container.inventory.release(seeded.reservationId);
		advance(h, 49 * HOUR);
		expect(await sweepCheckouts(h.container)).toMatchObject({ holdsReleased: 0, holdRecords: 1, snapshots: 1 });
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ reserved: 0 });
	});

	it("reopens instead of deleting a cart that has an email to win back", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const stored = (await h.container.carts.get(seeded.cartId))!;
		await h.container.carts.put({ ...stored.value, email: "buyer@example.com" }, stored.revision);
		advance(h, 49 * HOUR);
		expect(await sweepCheckouts(h.container)).toMatchObject({ carts: 0, snapshots: 1 });
		expect((await h.container.carts.get(seeded.cartId))?.value).toMatchObject({ status: CART_STATUS.active, checkout: null });
	});

	it("honours an explicit retention, including none", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		advance(h, 31 * 60_000);
		expect(await sweepCheckouts(h.container, { retentionMs: 0 })).toMatchObject({ snapshots: 1, carts: 1 });
		expect(await h.container.snapshots.get(seeded.checkoutId)).toBeNull();
	});

	it("never touches a paid checkout: its snapshot, reservation and order stay", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		advance(h, 49 * HOUR);
		const result = await sweepCheckouts(h.container);
		expect(result).toMatchObject({ snapshots: 0, settledSnapshots: 0, holdRecords: 0 });
		expect(await h.container.snapshots.get(seeded.checkoutId)).not.toBeNull();
		expect((await h.container.inventory.getReservation(seeded.reservationId))?.status).toBe(RESERVATION_STATUS.committed);
		expect(await h.container.orders.get(order.id)).not.toBeNull();
	});

	it("is not starved by paid checkouts ahead of the unpaid ones in the same window", async () => {
		const h = createHarness();
		for (let index = 0; index < 3; index += 1) await paidOrder(h);
		const unpaid = await seedCheckout(h);
		advance(h, 49 * HOUR);
		expect(await sweepCheckouts(h.container)).toMatchObject({ snapshots: 1 });
		expect(await h.container.snapshots.get(unpaid.checkoutId)).toBeNull();
	});

	it("leaves a paid session whose webhook has not been settled yet to settlement", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		completeCheckout(h, seeded);
		advance(h, 49 * HOUR);
		const result = await sweepCheckouts(h.container);
		expect(result).toMatchObject({ sessionsExpired: 0, snapshots: 0, holdsReleased: 0, carts: 0 });
		expect(await h.container.snapshots.get(seeded.checkoutId)).not.toBeNull();
		expect((await h.container.inventory.getReservation(seeded.reservationId))?.status).toBe(RESERVATION_STATUS.held);
	});

	it("skips the provider when no key is configured", async () => {
		const h = createHarness();
		h.setSecrets({ stripeSecretKey: null });
		const seeded = await seedCheckout(h);
		advance(h, 49 * HOUR);
		expect(await sweepCheckouts(h.container)).toMatchObject({ sessionsExpired: 0, snapshots: 1 });
		expect(h.provider.callsOf("expireSession")).toHaveLength(0);
		expect(await h.container.snapshots.get(seeded.checkoutId)).toBeNull();
	});
});
