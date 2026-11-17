import { variantDisplayNameOf } from "../core/catalog-rules.js";
import { CommerceError } from "../core/errors.js";
import type { Subscription, SubscriptionItem } from "../core/subscription.js";
import { SUBSCRIPTION_STATUS } from "../core/subscription.js";
import type { CommerceContainer } from "../plugin/container.js";
import type { ProviderSubscription } from "../ports/payment-provider.js";
import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import type { EventPublisher } from "./contracts.js";
import { LOCK_KEY, withLock } from "./locks.js";
import { claimOrAwait, HANDLED, ignored, isCreatedByPlugin, makeEvent, type Deps, type EventMeta, type HandlerResult } from "./payments/deps.js";

/**
 * Subscription records mirror Stripe one to one (Stripe owns the lifecycle). Events are applied in provider
 * time order: an event older than `providerUpdatedAt` is dropped, so a late `incomplete` can never overwrite
 * `active`. State fetched fresh from the provider (checkout settlement, a cancel call) does not move that
 * watermark: it is the newest state there is, and the next real event must still apply.
 */

const toIso = (seconds: number | null): string | null => (seconds === null ? null : new Date(seconds * 1000).toISOString());

const priceIdOfEntityKey = (entityKey: string): string | null => (entityKey.startsWith("price:") ? entityKey.slice("price:".length) : null);

/** Maps provider price ids back to our catalog (titles for the admin and emails); unknown ones keep a generic title. */
const resolveItems = async (container: CommerceContainer, provider: ProviderSubscription): Promise<SubscriptionItem[]> => {
	const items: SubscriptionItem[] = [];
	for (const item of provider.items) {
		const link = await container.catalogLinks.findByProviderId(item.providerPriceId);
		const priceId = link ? priceIdOfEntityKey(link.entityKey) : null;
		const price = priceId ? await container.catalog.getPrice(priceId) : null;
		const product = price ? await container.catalog.getProduct(price.productId) : null;
		const variant = price?.variantId ? await container.catalog.getVariant(price.variantId) : null;
		items.push({
			priceId: price?.id ?? null,
			productId: price?.productId ?? null,
			variantId: price?.variantId ?? null,
			title: product ? variantDisplayNameOf(product.title, variant?.title ?? null) : (item.description ?? "Subscription"),
			quantity: item.quantity,
			stripePriceId: item.providerPriceId,
		});
	}
	return items;
};

const customerIdOf = async (container: CommerceContainer, providerCustomerId: string): Promise<string | null> =>
	providerCustomerId ? ((await container.recordIndex.get(RECORD_INDEX_KEY.customerByProviderId(providerCustomerId))) || null) : null;

const fieldsOf = async (container: CommerceContainer, provider: ProviderSubscription) => ({
	status: provider.status,
	items: await resolveItems(container, provider),
	interval: provider.interval,
	intervalCount: provider.intervalCount,
	currency: provider.currency,
	amount: provider.amount,
	currentPeriodStart: toIso(provider.currentPeriodStart),
	currentPeriodEnd: toIso(provider.currentPeriodEnd),
	trialEnd: toIso(provider.trialEnd),
	cancelAtPeriodEnd: provider.cancelAtPeriodEnd,
	canceledAt: toIso(provider.canceledAt),
});

export interface SubscriptionUpsert {
	subscription: Subscription;
	previous: Subscription | null;
	/** True when the event was older than what is stored and nothing changed. */
	isStale: boolean;
}

export const upsertSubscription = async (
	container: CommerceContainer,
	provider: ProviderSubscription,
	options: { eventCreated: number | null; initialOrderId?: string | null },
): Promise<SubscriptionUpsert> => {
	const key = RECORD_INDEX_KEY.subscriptionByProviderId(provider.subscriptionId);
	let id = await container.recordIndex.get(key);
	if (!id) {
		const claim = await claimOrAwait(container, key);
		if (claim.isWinner) {
			try {
				const created = await container.subscriptions.create({
					customerId: await customerIdOf(container, provider.providerCustomerId),
					initialOrderId: options.initialOrderId ?? null,
					...(await fieldsOf(container, provider)),
					stripe: { subscriptionId: provider.subscriptionId, customerId: provider.providerCustomerId, latestInvoiceId: provider.latestInvoiceId },
					providerUpdatedAt: options.eventCreated ?? 0,
				});
				await container.recordIndex.set(key, created.id);
				return { subscription: created, previous: null, isStale: false };
			} catch (error) {
				await container.recordIndex.releaseClaim(key);
				throw error;
			}
		}
		id = claim.recordId;
	}
	const subscriptionId = id;
	return withLock(container, LOCK_KEY.subscription(subscriptionId), async () => {
		const current = await container.subscriptions.get(subscriptionId);
		if (!current) throw new Error(`Subscription ${subscriptionId} is indexed but missing`);
		if (options.eventCreated !== null && options.eventCreated < current.providerUpdatedAt) {
			return { subscription: current, previous: current, isStale: true };
		}
		const patch: Partial<Omit<Subscription, "id">> = {
			...(await fieldsOf(container, provider)),
			stripe: { ...current.stripe, latestInvoiceId: provider.latestInvoiceId ?? current.stripe.latestInvoiceId },
		};
		if (options.eventCreated !== null) patch.providerUpdatedAt = options.eventCreated;
		if (current.customerId === null) patch.customerId = await customerIdOf(container, provider.providerCustomerId);
		if (current.initialOrderId === null && options.initialOrderId) patch.initialOrderId = options.initialOrderId;
		return { subscription: await container.subscriptions.update(subscriptionId, patch), previous: current, isStale: false };
	});
};

/**
 * Links the checkout's order as the subscription's initial order, once, and the order's customer when the record
 * has none: `customer.subscription.created` usually lands before settlement created the customer, and a trial
 * produces no later subscription event that would fill it in.
 */
export const linkInitialOrder = (
	container: CommerceContainer,
	subscriptionId: string,
	orderId: string,
	customerId: string | null = null,
): Promise<void> =>
	withLock(container, LOCK_KEY.subscription(subscriptionId), async () => {
		const current = await container.subscriptions.get(subscriptionId);
		if (!current) return;
		const patch: Partial<Omit<Subscription, "id">> = {};
		if (current.initialOrderId === null) patch.initialOrderId = orderId;
		if (current.customerId === null && customerId) patch.customerId = customerId;
		if (Object.keys(patch).length > 0) await container.subscriptions.update(subscriptionId, patch);
	});

/**
 * The record for a provider subscription, creating it from a fresh retrieve when no event got there first
 * (settlement and invoices can run before `customer.subscription.created`). Null for a subscription that
 * is not ours (no plugin metadata) or no longer exists.
 */
export const ensureSubscriptionRecord = async (
	container: CommerceContainer,
	providerSubscriptionId: string,
	options: { initialOrderId?: string | null; customerId?: string | null } = {},
): Promise<Subscription | null> => {
	const existing = await container.recordIndex.get(RECORD_INDEX_KEY.subscriptionByProviderId(providerSubscriptionId));
	if (existing) {
		if (options.initialOrderId) await linkInitialOrder(container, existing, options.initialOrderId, options.customerId ?? null);
		return container.subscriptions.get(existing);
	}
	const provider = await (await container.provider()).subscriptions.retrieveSubscription(providerSubscriptionId);
	if (!provider || !isCreatedByPlugin(provider.metadata)) return null;
	return (await upsertSubscription(container, provider, { eventCreated: null, initialOrderId: options.initialOrderId ?? null })).subscription;
};

const hasMaterialChange = (previous: Subscription, next: Subscription): boolean =>
	previous.status !== next.status ||
	previous.cancelAtPeriodEnd !== next.cancelAtPeriodEnd ||
	previous.currentPeriodEnd !== next.currentPeriodEnd ||
	previous.amount !== next.amount ||
	JSON.stringify(previous.items) !== JSON.stringify(next.items);

const publishChange = (
	container: CommerceContainer,
	publisher: EventPublisher,
	change: { subscription: Subscription; previous: Subscription | null },
	updateSourceId: string,
) => {
	const { subscription, previous } = change;
	const events = [
		// Deterministic id: re-publishing on every pass is how a crash after the write still emits it.
		makeEvent(container, "subscription.created", subscription.id, {
			subscriptionId: subscription.id,
			customerId: subscription.customerId,
			status: subscription.status,
		}),
	];
	if (previous && hasMaterialChange(previous, subscription)) {
		events.push(
			makeEvent(container, "subscription.updated", `${subscription.id}:${updateSourceId}`, {
				subscriptionId: subscription.id,
				status: subscription.status,
				previousStatus: previous.status,
				cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
			}),
		);
	}
	if (subscription.status === SUBSCRIPTION_STATUS.canceled) {
		events.push(makeEvent(container, "subscription.canceled", subscription.id, { subscriptionId: subscription.id, customerId: subscription.customerId }));
	}
	return publisher.publish(events);
};

export const handleSubscriptionUpdated = async ({ container, publisher }: Deps, provider: ProviderSubscription, meta: EventMeta): Promise<HandlerResult> => {
	const isKnown = Boolean(await container.recordIndex.get(RECORD_INDEX_KEY.subscriptionByProviderId(provider.subscriptionId)));
	if (!isKnown && !isCreatedByPlugin(provider.metadata)) return ignored("Subscription was not created by this store");
	const result = await upsertSubscription(container, provider, { eventCreated: meta.created });
	if (result.isStale) return ignored("Subscription event is older than the stored state");
	await publishChange(container, publisher, result, meta.eventId);
	return HANDLED;
};

export const handleSubscriptionTrialWillEnd = async (
	{ container, publisher }: Deps,
	input: { subscriptionId: string; trialEnd: number },
): Promise<HandlerResult> => {
	const id = await container.recordIndex.get(RECORD_INDEX_KEY.subscriptionByProviderId(input.subscriptionId));
	if (!id) return ignored("Subscription is not known to this store");
	await publisher.publish([
		makeEvent(container, "subscription.trial_will_end", `${id}:${input.trialEnd}`, { subscriptionId: id, trialEnd: new Date(input.trialEnd * 1000).toISOString() }),
	]);
	return HANDLED;
};

export interface CancelSubscriptionInput {
	subscriptionId: string;
	atPeriodEnd: boolean;
}

/** Admin use case: cancels now or at the period end. Safe to repeat (provider idempotency key per target). */
export const cancelSubscription = async (container: CommerceContainer, publisher: EventPublisher, input: CancelSubscriptionInput): Promise<Subscription> => {
	const record = await container.subscriptions.get(input.subscriptionId);
	if (!record) throw new CommerceError("notFound", "Subscription not found");
	if (record.status === SUBSCRIPTION_STATUS.canceled) return record;
	const provider = await container.provider();
	const updated = await provider.subscriptions.cancelSubscription(
		record.stripe.subscriptionId,
		{ atPeriodEnd: input.atPeriodEnd },
		`stripe-commerce:subscription:cancel:${record.id}:${input.atPeriodEnd}`,
	);
	const result = await upsertSubscription(container, updated, { eventCreated: null });
	await publishChange(container, publisher, result, `cancel:${input.atPeriodEnd}`);
	return result.subscription;
};
