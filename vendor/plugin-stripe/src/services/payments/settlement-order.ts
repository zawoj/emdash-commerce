import { formatOrderNumber } from "../../core/order-number.js";
import { FULFILLMENT_STATUS, ORDER_LIFECYCLE_STATUS, ORDER_PAYMENT_STATUS, type Order, type OrderLine, type ReviewFlag } from "../../core/order.js";
import type { CommerceContainer } from "../../plugin/container.js";
import type { ProviderCheckoutSession } from "../../ports/payment-provider.js";
import { RECORD_INDEX_KEY, type CheckoutSnapshot } from "../../ports/repositories.js";
import { loadAxes, optionsTextOf, resolveOptions, type ProductAxes } from "../catalog/axes.js";
import { upsertCustomerFromCheckout } from "../customers.js";
import { PROVIDER_METADATA } from "../../ports/payment-provider.js";

const MAX_NUMBER_ATTEMPTS = 5;

const priceIdOfEntityKey = (entityKey: string): string | null => (entityKey.startsWith("price:") ? entityKey.slice("price:".length) : null);

/**
 * Order lines from the session (what was charged) and the catalog (names). The snapshot supplies our price
 * ids and the unit amount the buyer saw; without one the lines are rebuilt from the session alone and the
 * provider price id is mapped back through the catalog links.
 */
export const buildOrderLines = async (container: CommerceContainer, session: ProviderCheckoutSession, snapshot: CheckoutSnapshot | null): Promise<OrderLine[]> => {
	// Option labels come from the product type's axes; lines of one type read them once.
	const axesByType = new Map<string, Promise<ProductAxes>>();
	const axesOf = (typeId: string | null): Promise<ProductAxes> => {
		if (!typeId) return loadAxes(container.catalog, null);
		const cached = axesByType.get(typeId);
		if (cached) return cached;
		const pending = loadAxes(container.catalog, typeId);
		axesByType.set(typeId, pending);
		return pending;
	};
	return Promise.all(
		session.lines.map(async (line): Promise<OrderLine> => {
			const snapLine = snapshot?.lines.find((candidate) => candidate.providerPriceId === line.providerPriceId) ?? null;
			let priceId = snapLine?.priceId ?? null;
			if (!priceId) {
				const link = await container.catalogLinks.findByProviderId(line.providerPriceId);
				priceId = link ? priceIdOfEntityKey(link.entityKey) : null;
			}
			const price = priceId ? await container.catalog.getPrice(priceId) : null;
			const product = price ? await container.catalog.getProduct(price.productId) : null;
			const variant = price?.variantId ? await container.catalog.getVariant(price.variantId) : null;
			const quantity = line.quantity;
			return {
				// An unresolvable price (deleted since, or no snapshot) keeps the provider id so the line stays traceable.
				priceId: priceId ?? line.providerPriceId,
				productId: price?.productId ?? "",
				variantId: price?.variantId ?? null,
				title: product?.title ?? line.description,
				variantTitle: variant?.title ?? null,
				sku: variant?.sku ?? null,
				optionsText: variant ? optionsTextOf(resolveOptions((await axesOf(product?.typeId ?? null)).axes, variant.optionValueIds)) : null,
				quantity,
				unitAmount: snapLine?.unitAmount ?? price?.unitAmount ?? Math.round(line.amountSubtotal / Math.max(quantity, 1)),
				amountSubtotal: line.amountSubtotal,
				discountAmount: line.amountDiscount,
				taxAmount: line.amountTax,
				amountTotal: line.amountTotal,
				priceType: price?.type ?? (session.mode === "subscription" ? "recurring" : "one_time"),
				stripePriceId: line.providerPriceId,
			};
		}),
	);
};

/**
 * A winner that died between `orders.create` and indexing leaves an order nobody points at; the next winner
 * (after the claim goes stale) must not create a second one. The order is found through its indexed session id.
 */
export const findOrderBySession = (container: CommerceContainer, sessionId: string): Promise<Order | null> => container.orders.findByCheckoutSession(sessionId);

/**
 * The order number: the `generateOrderNumber` extension when a site has one, otherwise the configured format over
 * the per-year counter. Either way the number is claimed in the record index, so a number is never handed to two
 * orders (the counter alone guarantees it for the built-in format; the claim guards an extension's choices).
 */
const nextOrderNumber = async (container: CommerceContainer, placedAt: Date): Promise<string> => {
	const { numberPrefix, numberFormat } = container.options.orders;
	for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt += 1) {
		const candidate = container.extensions.generateOrderNumber
			? container.extensions.generateOrderNumber({ placedAt, prefix: numberPrefix })
			: formatOrderNumber({ format: numberFormat, prefix: numberPrefix, placedAt, sequence: await container.orders.nextSequence(placedAt.getUTCFullYear()) });
		const claim = await container.recordIndex.claim(RECORD_INDEX_KEY.orderByNumber(candidate));
		if (claim.isWinner) return candidate;
	}
	throw new Error(`Could not allocate a unique order number in ${MAX_NUMBER_ATTEMPTS} attempts`);
};

/**
 * Creates the order for a settled session (caller holds the `orderBySession` claim). It is created `pending`
 * with the server-validated review flags; the paid transition is a separate, idempotent step so a crash
 * between the two is repaired by the retry. The order and number indexes are written right after creation.
 */
export const createOrderForSession = async (
	container: CommerceContainer,
	input: { session: ProviderCheckoutSession; snapshot: CheckoutSnapshot | null; flags: ReviewFlag[] },
): Promise<Order> => {
	const { session, snapshot, flags } = input;
	const placedAt = container.clock.now();
	const customerResult = session.email
		? await upsertCustomerFromCheckout(container, {
				email: session.email,
				name: session.name,
				phone: session.phone,
				billingAddress: session.billingAddress,
				shippingAddress: session.shippingAddress,
				providerCustomerId: session.providerCustomerId,
			})
		: null;
	const lines = await buildOrderLines(container, session, snapshot);
	const orderNumber = await nextOrderNumber(container, placedAt);
	const order = await container.orders.create({
		orderNumber,
		orderStatus: ORDER_LIFECYCLE_STATUS.open,
		paymentStatus: ORDER_PAYMENT_STATUS.pending,
		statusBeforeDispute: null,
		fulfillmentStatus: FULFILLMENT_STATUS.unfulfilled,
		mode: session.mode,
		customerId: customerResult?.customer.id ?? null,
		email: session.email ?? "",
		customerName: session.name,
		phone: session.phone,
		billingAddress: session.billingAddress,
		shippingAddress: session.shippingAddress,
		lines,
		totals: {
			subtotal: session.amountSubtotal,
			discount: session.amountDiscount,
			tax: session.amountTax,
			shipping: session.amountShipping,
			total: session.amountTotal,
			refunded: 0,
			currency: session.currency,
		},
		reviewFlags: flags,
		cartId: session.metadata[PROVIDER_METADATA.cartId] ?? snapshot?.cartId ?? null,
		subscriptionId: null,
		stripe: {
			checkoutSessionId: session.sessionId,
			paymentIntentId: session.paymentIntentId,
			customerId: session.providerCustomerId,
			subscriptionId: session.subscriptionId,
			invoiceId: session.invoiceId,
			isLivemode: session.isLivemode,
		},
		placedAt: placedAt.toISOString(),
		paidAt: null,
	});
	await container.recordIndex.set(RECORD_INDEX_KEY.orderBySession(session.sessionId), order.id);
	await container.recordIndex.set(RECORD_INDEX_KEY.orderByNumber(orderNumber), order.id);
	return order;
};
