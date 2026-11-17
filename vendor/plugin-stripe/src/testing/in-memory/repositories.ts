import type { Cart } from "../../core/cart.js";
import type { Customer } from "../../core/customer.js";
import type { IdGenerator } from "../../core/ids.js";
import type { Order } from "../../core/order.js";
import type { OrderTimelineEvent } from "../../core/order-timeline.js";
import type { Payment } from "../../core/payment.js";
import type { Subscription } from "../../core/subscription.js";
import { allocateOrderSequence } from "../../adapters/emdash/storage/order-sequence.js";
import type {
	CartMirror,
	CustomerRepository,
	OrderEventRepository,
	OrderRepository,
	PaymentRepository,
	SubscriptionRepository,
} from "../../ports/repositories.js";
import { createFakeKv } from "../fakes/storage.js";
import { clone, tick, toCursorPage } from "./runtime.js";

export { createInMemoryCatalog, type InMemoryCatalog } from "./catalog.js";

/** Shared shape of the content-backed record repositories (create, get, update). */
const createRecordMap = <T extends { id: string }>(ids: IdGenerator, label: string) => {
	const rows = new Map<string, T>();
	return {
		rows,
		async create(value: Omit<T, "id">): Promise<T> {
			await tick();
			const created = { ...clone(value), id: ids.randomId(8) } as T;
			rows.set(created.id, created);
			return clone(created);
		},
		async get(id: string): Promise<T | null> {
			await tick();
			const found = rows.get(id);
			return found ? clone(found) : null;
		},
		async update(id: string, patch: Partial<Omit<T, "id">>): Promise<T> {
			await tick();
			const current = rows.get(id);
			if (!current) throw new Error(`${label} not found: ${id}`);
			const next = { ...current, ...clone(patch), id } as T;
			rows.set(id, next);
			return clone(next);
		},
	};
};

export const createInMemoryOrderEvents = (ids: IdGenerator): OrderEventRepository => {
	const rows = new Map<string, OrderTimelineEvent>();
	return {
		async create(event) {
			await tick();
			const existing = [...rows.values()].find((row) => row.sourceKey === event.sourceKey);
			if (existing) return { event: clone(existing), isNew: false };
			const created = { ...clone(event), id: ids.randomId(8) };
			rows.set(created.id, created);
			return { event: clone(created), isNew: true };
		},
		async listByOrder(orderId, { cursor, limit }) {
			await tick();
			const matches = [...rows.values()]
				.filter((row) => row.orderId === orderId)
				.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
				.map(clone);
			return toCursorPage(matches, cursor, limit);
		},
	};
};

export const createInMemoryOrders = (ids: IdGenerator): OrderRepository => {
	const base = createRecordMap<Order>(ids, "Order");
	// The same compare-and-set loop as production, over a fake KV that interleaves concurrent callers.
	const kv = createFakeKv();
	return {
		create: base.create,
		get: base.get,
		update: base.update,
		events: createInMemoryOrderEvents(ids),
		nextSequence: (year) => allocateOrderSequence(kv, year),
		async findByCheckoutSession(sessionId) {
			await tick();
			const found = [...base.rows.values()].find((order) => order.stripe.checkoutSessionId === sessionId);
			return found ? clone(found) : null;
		},
		async list({ status, orderStatus, cursor, limit }) {
			await tick();
			const matches = [...base.rows.values()]
				.filter((order) => !status || order.paymentStatus === status)
				.filter((order) => !orderStatus || order.orderStatus === orderStatus)
				.sort((a, b) => b.placedAt.localeCompare(a.placedAt) || b.id.localeCompare(a.id))
				.map(clone);
			return toCursorPage(matches, cursor, limit);
		},
	};
};

export const createInMemoryPayments = (ids: IdGenerator): PaymentRepository => {
	const base = createRecordMap<Payment>(ids, "Payment");
	return {
		create: base.create,
		get: base.get,
		update: base.update,
		async listByOrder(orderId) {
			await tick();
			return [...base.rows.values()].filter((payment) => payment.orderId === orderId).map(clone);
		},
	};
};

export const createInMemorySubscriptions = (ids: IdGenerator): SubscriptionRepository => createRecordMap<Subscription>(ids, "Subscription");

export const createInMemoryCustomers = (ids: IdGenerator): CustomerRepository => createRecordMap<Customer>(ids, "Customer");

export interface InMemoryCartMirror extends CartMirror {
	readonly mirrored: Map<string, { cart: Cart; summary: Parameters<CartMirror["upsert"]>[1] }>;
}

export const createInMemoryCartMirror = (): InMemoryCartMirror => {
	const mirrored: InMemoryCartMirror["mirrored"] = new Map();
	return {
		mirrored,
		async upsert(cart, summary) {
			await tick();
			mirrored.set(cart.id, { cart: clone(cart), summary: clone(summary) });
		},
	};
};
