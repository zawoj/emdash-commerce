import { describe, expect, it } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { createFixedClock, createNullLogger } from "../../../testing/clock.js";
import { createFakeContent } from "../../../testing/fakes/content.js";
import { createInMemoryRecordIndex } from "../../../testing/in-memory/record-index.js";
import { buildCollectionDefinitions } from "../schema/collections.js";
import { createCartMirror, requireWritableContent } from "./repositories.js";

const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln", "eur"] });
const slugs = options.collections;
const definitions = buildCollectionDefinitions(slugs, options.supportedCurrencies);
const log = createNullLogger();

const setup = () => {
	const content = createFakeContent(definitions);
	return { content, writable: requireWritableContent(content) };
};

describe("cart mirror", () => {
	const cart = (over: Record<string, unknown> = {}) => ({
		id: "c".repeat(32),
		status: "active" as const,
		lines: [{ priceId: "pr1", quantity: 2, addedAt: "2026-01-15T12:00:00.000Z" }],
		email: "a@b.c",
		checkout: null,
		orderId: null,
		context: { userAgent: "UA".repeat(400), country: "PL" },
		createdAt: "2026-01-15T12:00:00.000Z",
		updatedAt: "2026-01-15T12:05:00.000Z",
		expiresAt: "2026-02-15T12:00:00.000Z",
		...over,
	});
	const summary = { itemCount: 2, subtotal: 2000, currency: "pln", lines: [{ title: "Mug" }] };

	it("creates one mirror entry per cart and updates it afterwards", async () => {
		const { content, writable } = setup();
		const mirror = createCartMirror(writable, slugs, createInMemoryRecordIndex(createFixedClock()), log);
		await mirror.upsert(cart(), summary);
		await mirror.upsert(cart({ email: "new@b.c" }), { ...summary, itemCount: 3 });
		const entries = content.entries(slugs.carts);
		expect(entries).toHaveLength(1);
		expect(entries[0]!.data).toMatchObject({ cart_id: "c".repeat(32), email: "new@b.c", item_count: 3, subtotal_amount: 2000 });
		expect(String(entries[0]!.data.user_agent).length).toBeLessThanOrEqual(300);
	});

	it("creates exactly one entry under concurrent upserts", async () => {
		const { content, writable } = setup();
		const mirror = createCartMirror(writable, slugs, createInMemoryRecordIndex(createFixedClock()), log);
		await Promise.all(Array.from({ length: 6 }, () => mirror.upsert(cart(), summary)));
		expect(content.entries(slugs.carts)).toHaveLength(1);
	});

	it("releases the claim when creating fails so the next upsert can try again, and recreates a deleted entry", async () => {
		const { content, writable } = setup();
		const mirror = createCartMirror(writable, slugs, createInMemoryRecordIndex(createFixedClock()), log);
		content.rejectNext("create");
		await expect(mirror.upsert(cart(), summary)).rejects.toThrow();
		await mirror.upsert(cart(), summary);
		expect(content.entries(slugs.carts)).toHaveLength(1);
		await content.delete(slugs.carts, content.entries(slugs.carts)[0]!.id);
		await mirror.upsert(cart(), summary);
		expect(content.entries(slugs.carts)).toHaveLength(1);
	});
});

describe("requireWritableContent", () => {
	it("explains a missing write capability", () => {
		expect(() => requireWritableContent(undefined)).toThrow(/content:write/);
		const readOnly = { get: async () => null, list: async () => ({ items: [], hasMore: false }) };
		expect(() => requireWritableContent(readOnly)).toThrow(/content:write/);
	});
});
