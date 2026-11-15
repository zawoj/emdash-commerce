import type { ContentAccess, KVAccess } from "emdash";

import { CommerceError } from "../../../core/errors.js";
import type { Order } from "../../../core/order.js";
import type { OrderTimelineEvent } from "../../../core/order-timeline.js";
import type {
	CustomerRepository,
	Logger,
	OrderEventRepository,
	OrderRepository,
	Page,
	PaymentRepository,
	SubscriptionRepository,
} from "../../../ports/repositories.js";
import type { RelationsPort } from "../relations/port.js";
import { ORDER_EVENT_FIELD, ORDER_FIELD, PAYMENT_FIELD, SUBSCRIPTION_FIELD } from "../schema/field-names.js";
import { allocateOrderSequence } from "../storage/order-sequence.js";
import {
	customerPatchToData,
	orderEventToData,
	orderPatchToData,
	paymentPatchToData,
	subscriptionPatchToData,
	toCustomer,
	toOrder,
	toOrderEvent,
	toPayment,
	toSubscription,
	type OrderLinks,
	type SubscriptionLinks,
} from "./record-mappers.js";
import { createAndPublish, type CollectionSlugs, type WritableContent } from "./repositories.js";
import type { ContentEntry } from "./values.js";

/**
 * The plugin-owned sales records (orders, payments, subscriptions, customers, the order timeline) on EmDash content.
 *
 * Links between them are native relations. `ctx.content` can neither write nor read a relation-bound field, so:
 * - a record with links is created through `RelationsPort.createWithReferences` (data and edges in one write) and
 *   its links change through `setParent` / `setChildren`;
 * - a record is read with `content.get` plus one `parentOf` / `children` read per link it carries;
 * - queries over an unbounded set never use a relation (reads stop at one page of 50 and cannot be filtered): payments
 *   and timeline events are queried through the indexed `order_id` scalar, an order through its indexed session id.
 *   The one relation read of a set (an order's subscriptions) is bounded by the data model and throws a
 *   `CommerceError` when it is not, instead of silently dropping entries.
 */

const MAX_LIST_LIMIT = 100;
const MAX_RELATED = 500;

export interface SalesRepositoryDeps {
	relations: RelationsPort;
	/** The order number counter lives in plugin KV. */
	kv: Pick<KVAccess, "getVersioned" | "compareAndSet">;
}

const READ = { includeDrafts: true } as const;

const toPage = <T>(items: T[], cursor: string | undefined, hasMore: boolean): Page<T> => ({ items, cursor: hasMore ? (cursor ?? null) : null });

const missing = (collection: string, id: string): Error => new Error(`Entry ${id} not found in ${collection}`);

/** The ids of a field that is bounded by the data model; a page that says there is more is a modelling error. */
const readBounded = async (relations: RelationsPort, collection: string, id: string, field: string): Promise<string[]> => {
	const page = await relations.children(collection, id, field, READ);
	if (page.hasMore) {
		throw new CommerceError("internal", `${collection} ${id} links more entries through "${field}" than one relation page holds`, { collection, field });
	}
	return page.items.map((entry) => entry.id);
};

const listAll = async (content: ContentAccess, collection: string, where: NonNullable<Parameters<ContentAccess["list"]>[1]>["where"]): Promise<ContentEntry[]> => {
	const items: ContentEntry[] = [];
	let cursor: string | undefined;
	do {
		const page = await content.list(collection, { where, limit: MAX_LIST_LIMIT, cursor });
		items.push(...page.items);
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && items.length < MAX_RELATED);
	return items;
};

/** Writes a patch's data through content; skips the call when the patch only carries links. */
const updateData = async (content: WritableContent, collection: string, id: string, existing: ContentEntry, data: Record<string, unknown>): Promise<ContentEntry> =>
	Object.keys(data).length === 0 ? existing : content.update(collection, id, data);

// --- Orders ----------------------------------------------------------------------------------------------

export const createOrderRepository = (content: WritableContent, slugs: CollectionSlugs, deps: SalesRepositoryDeps): OrderRepository => {
	const { relations } = deps;

	const readLinks = async (id: string): Promise<OrderLinks> => {
		const [customer, subscriptionIds] = await Promise.all([
			relations.parentOf(slugs.orders, id, ORDER_FIELD.customer, READ),
			readBounded(relations, slugs.orders, id, ORDER_FIELD.subscriptions),
		]);
		return { customerId: customer?.id ?? null, subscriptionId: subscriptionIds[0] ?? null };
	};
	const hydrate = async (item: ContentEntry): Promise<Order> => toOrder(item, await readLinks(item.id));

	return {
		events: createOrderEventRepository(content, slugs, deps),
		async create(order) {
			const references: Record<string, string[]> = {};
			if (order.customerId) references[ORDER_FIELD.customer] = [order.customerId];
			if (order.subscriptionId) references[ORDER_FIELD.subscriptions] = [order.subscriptionId];
			const { id } = await relations.createWithReferences(slugs.orders, { data: orderPatchToData(order), status: "published" }, references);
			const item = await content.get(slugs.orders, id);
			if (!item) throw missing(slugs.orders, id);
			return toOrder(item, { customerId: order.customerId, subscriptionId: order.subscriptionId });
		},
		async get(id) {
			const item = await content.get(slugs.orders, id);
			return item ? hydrate(item) : null;
		},
		async update(id, patch) {
			const existing = await content.get(slugs.orders, id);
			if (!existing) throw missing(slugs.orders, id);
			const item = await updateData(content, slugs.orders, id, existing, orderPatchToData(patch));
			if (patch.customerId !== undefined) await relations.setParent(slugs.orders, id, ORDER_FIELD.customer, patch.customerId);
			if (patch.subscriptionId !== undefined) {
				await relations.setChildren(slugs.orders, id, ORDER_FIELD.subscriptions, patch.subscriptionId ? [patch.subscriptionId] : []);
			}
			return hydrate(item);
		},
		async list({ status, orderStatus, cursor, limit }) {
			const fieldFilters = {
				...(status ? { [ORDER_FIELD.paymentStatus]: status } : {}),
				...(orderStatus ? { [ORDER_FIELD.orderStatus]: orderStatus } : {}),
			};
			const page = await content.list(slugs.orders, {
				where: Object.keys(fieldFilters).length > 0 ? { fieldFilters } : undefined,
				orderBy: { [ORDER_FIELD.placedAt]: "desc" },
				limit: Math.min(Math.max(limit, 1), MAX_LIST_LIMIT),
				cursor: cursor ?? undefined,
			});
			return toPage<Order>(await Promise.all(page.items.map(hydrate)), page.cursor, page.hasMore);
		},
		async findByCheckoutSession(sessionId) {
			const page = await content.list(slugs.orders, { where: { fieldFilters: { [ORDER_FIELD.stripeCheckoutSessionId]: sessionId } }, limit: 1 });
			const item = page.items[0];
			return item ? hydrate(item) : null;
		},
		nextSequence: (year) => allocateOrderSequence(deps.kv, year),
	};
};

// --- Order timeline --------------------------------------------------------------------------------------

export const createOrderEventRepository = (content: WritableContent, slugs: CollectionSlugs, deps: Pick<SalesRepositoryDeps, "relations">): OrderEventRepository => {
	const findBySourceKey = async (sourceKey: string): Promise<OrderTimelineEvent | null> => {
		const page = await content.list(slugs.orderEvents, { where: { fieldFilters: { [ORDER_EVENT_FIELD.sourceKey]: sourceKey } }, limit: 1 });
		return page.items[0] ? toOrderEvent(page.items[0]) : null;
	};
	return {
		async create(event) {
			const existing = await findBySourceKey(event.sourceKey);
			if (existing) return { event: existing, isNew: false };
			try {
				const { id } = await deps.relations.createWithReferences(
					slugs.orderEvents,
					{ data: orderEventToData(event), status: "published" },
					{ [ORDER_EVENT_FIELD.order]: [event.orderId] },
				);
				return { event: { ...event, id }, isNew: true };
			} catch (error) {
				// A concurrent writer won the unique `source_key`: its entry is the one that counts.
				const winner = await findBySourceKey(event.sourceKey);
				if (winner) return { event: winner, isNew: false };
				throw error;
			}
		},
		async listByOrder(orderId, { cursor, limit }) {
			const page = await content.list(slugs.orderEvents, {
				where: { fieldFilters: { [ORDER_EVENT_FIELD.orderId]: orderId } },
				orderBy: { [ORDER_EVENT_FIELD.occurredAt]: "desc" },
				limit: Math.min(Math.max(limit, 1), MAX_LIST_LIMIT),
				cursor: cursor ?? undefined,
			});
			return toPage(page.items.map(toOrderEvent), page.cursor, page.hasMore);
		},
	};
};

// --- Payments --------------------------------------------------------------------------------------------

export const createPaymentRepository = (content: WritableContent, slugs: CollectionSlugs, deps: Pick<SalesRepositoryDeps, "relations">): PaymentRepository => {
	const { relations } = deps;
	return {
		async create(payment) {
			const references: Record<string, string[]> = {};
			if (payment.orderId) references[PAYMENT_FIELD.order] = [payment.orderId];
			if (payment.subscriptionId) references[PAYMENT_FIELD.subscription] = [payment.subscriptionId];
			const { id } = await relations.createWithReferences(slugs.payments, { data: paymentPatchToData(payment), status: "published" }, references);
			const item = await content.get(slugs.payments, id);
			if (!item) throw missing(slugs.payments, id);
			return toPayment(item);
		},
		async get(id) {
			const item = await content.get(slugs.payments, id);
			return item ? toPayment(item) : null;
		},
		async update(id, patch) {
			const existing = await content.get(slugs.payments, id);
			if (!existing) throw missing(slugs.payments, id);
			const item = await updateData(content, slugs.payments, id, existing, paymentPatchToData(patch));
			if (patch.orderId !== undefined) await relations.setParent(slugs.payments, id, PAYMENT_FIELD.order, patch.orderId);
			if (patch.subscriptionId !== undefined) await relations.setParent(slugs.payments, id, PAYMENT_FIELD.subscription, patch.subscriptionId);
			return toPayment(item);
		},
		async listByOrder(orderId) {
			const items = await listAll(content, slugs.payments, { fieldFilters: { [PAYMENT_FIELD.orderId]: orderId } });
			return items.map(toPayment);
		},
	};
};

// --- Subscriptions ---------------------------------------------------------------------------------------

export const createSubscriptionRepository = (content: WritableContent, slugs: CollectionSlugs, deps: Pick<SalesRepositoryDeps, "relations">): SubscriptionRepository => {
	const { relations } = deps;
	const readLinks = async (id: string): Promise<SubscriptionLinks> => {
		const [customer, initialOrder] = await Promise.all([
			relations.parentOf(slugs.subscriptions, id, SUBSCRIPTION_FIELD.customer, READ),
			relations.parentOf(slugs.subscriptions, id, SUBSCRIPTION_FIELD.initialOrder, READ),
		]);
		return { customerId: customer?.id ?? null, initialOrderId: initialOrder?.id ?? null };
	};
	return {
		async create(subscription) {
			const references: Record<string, string[]> = {};
			if (subscription.customerId) references[SUBSCRIPTION_FIELD.customer] = [subscription.customerId];
			if (subscription.initialOrderId) references[SUBSCRIPTION_FIELD.initialOrder] = [subscription.initialOrderId];
			const { id } = await relations.createWithReferences(slugs.subscriptions, { data: subscriptionPatchToData(subscription), status: "published" }, references);
			const item = await content.get(slugs.subscriptions, id);
			if (!item) throw missing(slugs.subscriptions, id);
			return toSubscription(item, { customerId: subscription.customerId, initialOrderId: subscription.initialOrderId });
		},
		async get(id) {
			const item = await content.get(slugs.subscriptions, id);
			return item ? toSubscription(item, await readLinks(id)) : null;
		},
		async update(id, patch) {
			const existing = await content.get(slugs.subscriptions, id);
			if (!existing) throw missing(slugs.subscriptions, id);
			const item = await updateData(content, slugs.subscriptions, id, existing, subscriptionPatchToData(patch));
			if (patch.customerId !== undefined) await relations.setParent(slugs.subscriptions, id, SUBSCRIPTION_FIELD.customer, patch.customerId);
			if (patch.initialOrderId !== undefined) await relations.setParent(slugs.subscriptions, id, SUBSCRIPTION_FIELD.initialOrder, patch.initialOrderId);
			return toSubscription(item, await readLinks(id));
		},
	};
};

// --- Customers -------------------------------------------------------------------------------------------

/** A customer carries no link of its own: its orders and subscriptions are the parent side of relations they own. */
export const createCustomerRepository = (content: WritableContent, slugs: CollectionSlugs, log: Logger): CustomerRepository => ({
	async create(customer) {
		return toCustomer(await createAndPublish(content, log, slugs.customers, customerPatchToData(customer)));
	},
	async get(id) {
		const item = await content.get(slugs.customers, id);
		return item ? toCustomer(item) : null;
	},
	async update(id, patch) {
		if (!(await content.get(slugs.customers, id))) throw missing(slugs.customers, id);
		return toCustomer(await content.update(slugs.customers, id, customerPatchToData(patch)));
	},
});
