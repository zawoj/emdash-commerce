import type { Address, Customer } from "../core/customer.js";
import { normaliseEmail } from "../core/customer.js";
import type { Order } from "../core/order.js";
import type { ProviderCustomer } from "../ports/payment-provider.js";
import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import type { CommerceContainer } from "../plugin/container.js";
import { LOCK_KEY, withLock } from "./locks.js";
import { claimOrAwait, HANDLED, ignored, INDEX_KEY, makeEvent, type Deps, type EventMeta, type HandlerResult } from "./payments/deps.js";

/**
 * Guest customers, keyed by normalised email. EmDash has no customer accounts: a customer exists because
 * somebody paid, so the record is created at settlement and linked to the Stripe Customer of the session.
 */

export interface CheckoutCustomerInput {
	email: string;
	name: string | null;
	phone: string | null;
	billingAddress: Address | null;
	shippingAddress: Address | null;
	providerCustomerId: string | null;
}

const isSameAddress = (a: Address | null, b: Address | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Fields a newer checkout or a provider update may refresh; a missing value never erases what we know. */
const profilePatch = (
	current: Customer,
	next: { name: string | null; phone: string | null; billingAddress: Address | null; shippingAddress: Address | null; providerCustomerId: string | null },
): Partial<Omit<Customer, "id">> => {
	const patch: Partial<Omit<Customer, "id">> = {};
	if (next.name && next.name !== current.name) patch.name = next.name;
	if (next.phone && next.phone !== current.phone) patch.phone = next.phone;
	if (next.billingAddress && !isSameAddress(next.billingAddress, current.billingAddress)) patch.billingAddress = next.billingAddress;
	if (next.shippingAddress && !isSameAddress(next.shippingAddress, current.shippingAddress)) patch.shippingAddress = next.shippingAddress;
	if (next.providerCustomerId && current.stripeCustomerId === null) patch.stripeCustomerId = next.providerCustomerId;
	return patch;
};

const updateProfile = (
	container: CommerceContainer,
	customerId: string,
	next: Parameters<typeof profilePatch>[1],
): Promise<Customer | null> =>
	withLock(container, LOCK_KEY.customer(customerId), async () => {
		const current = await container.customers.get(customerId);
		if (!current) return null;
		const patch = profilePatch(current, next);
		return Object.keys(patch).length === 0 ? current : container.customers.update(customerId, patch);
	});

const linkIndexes = async (container: CommerceContainer, customerId: string, email: string, providerCustomerId: string | null): Promise<void> => {
	await container.recordIndex.set(RECORD_INDEX_KEY.customerByEmail(email), customerId);
	if (providerCustomerId) await container.recordIndex.set(RECORD_INDEX_KEY.customerByProviderId(providerCustomerId), customerId);
};

const createCustomer = async (container: CommerceContainer, input: CheckoutCustomerInput, email: string): Promise<Customer> => {
	const customer = await container.customers.create({
		email,
		name: input.name,
		phone: input.phone,
		billingAddress: input.billingAddress,
		shippingAddress: input.shippingAddress,
		stripeCustomerId: input.providerCustomerId,
		orderCount: 0,
		totalSpent: {},
		firstOrderAt: null,
		lastOrderAt: null,
	});
	await linkIndexes(container, customer.id, email, input.providerCustomerId);
	return customer;
};

/**
 * Finds or creates the customer of a checkout. Two concurrent checkouts with one email create one customer:
 * the email key is an exactly-once claim, and the loser waits for the winner's id. A Stripe customer id
 * already linked to a customer wins over the email (the buyer typed another address in Checkout).
 */
export const upsertCustomerFromCheckout = async (
	container: CommerceContainer,
	input: CheckoutCustomerInput,
): Promise<{ customer: Customer; isNew: boolean }> => {
	const email = normaliseEmail(input.email);
	const emailKey = RECORD_INDEX_KEY.customerByEmail(email);
	let customerId: string | null = input.providerCustomerId ? await container.recordIndex.get(RECORD_INDEX_KEY.customerByProviderId(input.providerCustomerId)) : null;
	customerId ||= await container.recordIndex.get(emailKey);

	if (!customerId) {
		const claim = await claimOrAwait(container, emailKey);
		if (claim.isWinner) {
			try {
				return { customer: await createCustomer(container, input, email), isNew: true };
			} catch (error) {
				await container.recordIndex.releaseClaim(emailKey);
				throw error;
			}
		}
		customerId = claim.recordId;
	}

	const updated = await updateProfile(container, customerId, input);
	if (updated) {
		if (input.providerCustomerId) await container.recordIndex.set(RECORD_INDEX_KEY.customerByProviderId(input.providerCustomerId), customerId);
		return { customer: updated, isNew: false };
	}
	// The record was deleted in the admin while the index still points at it: start over with a fresh one.
	return { customer: await createCustomer(container, input, email), isNew: true };
};

/**
 * Adds a paid order to its customer's aggregates exactly once. The claim on `customer:counted:<orderId>` is
 * taken before the update and marked done after it, so a retry after a crash neither skips nor repeats the
 * order (a crash between update and mark is the one window; it needs the claim to go stale, 5 minutes, and
 * is why the mark is retried here).
 */
export const countOrderForCustomer = async (container: CommerceContainer, order: Pick<Order, "id" | "customerId" | "totals" | "placedAt">): Promise<void> => {
	if (!order.customerId) return;
	const key = INDEX_KEY.customerCounted(order.id);
	const claim = await container.recordIndex.claim(key);
	if (!claim.isWinner) return;
	const customerId = order.customerId;
	try {
		await withLock(container, LOCK_KEY.customer(customerId), async () => {
			const customer = await container.customers.get(customerId);
			if (!customer) return;
			const currency = order.totals.currency;
			await container.customers.update(customerId, {
				orderCount: customer.orderCount + 1,
				totalSpent: { ...customer.totalSpent, [currency]: (customer.totalSpent[currency] ?? 0) + order.totals.total },
				firstOrderAt: customer.firstOrderAt && customer.firstOrderAt < order.placedAt ? customer.firstOrderAt : order.placedAt,
				lastOrderAt: customer.lastOrderAt && customer.lastOrderAt > order.placedAt ? customer.lastOrderAt : order.placedAt,
			});
		});
	} catch (error) {
		await container.recordIndex.releaseClaim(key);
		throw error;
	}
	for (let attempt = 0; ; attempt += 1) {
		try {
			await container.recordIndex.set(key, order.id);
			return;
		} catch (error) {
			if (attempt >= 3) throw error;
		}
	}
};

/** `customer.created|updated|deleted` from the provider: refreshes the profile of a customer we know. */
export const handleCustomerUpdated = async ({ container, publisher }: Deps, provider: ProviderCustomer, meta: EventMeta): Promise<HandlerResult> => {
	let customerId = await container.recordIndex.get(RECORD_INDEX_KEY.customerByProviderId(provider.providerCustomerId));
	const isLinkedByProviderId = Boolean(customerId);
	if (!customerId && provider.email) customerId = await container.recordIndex.get(RECORD_INDEX_KEY.customerByEmail(normaliseEmail(provider.email)));
	if (!customerId) return ignored("Customer is not known to this store");

	const knownId = customerId;
	const result = await withLock(container, LOCK_KEY.customer(knownId), async () => {
		const current = await container.customers.get(knownId);
		if (!current) return null;
		// Another Stripe customer carrying the same email is not ours to overwrite.
		if (!isLinkedByProviderId && current.stripeCustomerId !== null && current.stripeCustomerId !== provider.providerCustomerId) return "foreign";
		if (provider.isDeleted) {
			return current.stripeCustomerId === null ? current : container.customers.update(knownId, { stripeCustomerId: null });
		}
		const patch = profilePatch(current, { ...provider, providerCustomerId: provider.providerCustomerId });
		return Object.keys(patch).length === 0 ? current : container.customers.update(knownId, patch);
	});
	if (!result) return ignored("Customer record no longer exists");
	if (result === "foreign") return ignored("Another Stripe customer with the same email");
	if (provider.isDeleted) await container.recordIndex.set(RECORD_INDEX_KEY.customerByProviderId(provider.providerCustomerId), "");
	else await container.recordIndex.set(RECORD_INDEX_KEY.customerByProviderId(provider.providerCustomerId), knownId);
	await publisher.publish([makeEvent(container, "customer.updated", `${knownId}:${meta.eventId}`, { customerId: knownId })]);
	return HANDLED;
};
