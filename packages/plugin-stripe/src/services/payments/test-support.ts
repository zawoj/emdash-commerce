import type { CommerceExtensions } from "../../contracts/extensions.js";
import { commerceOptionsSchema, type CommerceOptionsInput } from "../../contracts/options.js";
import { CART_STATUS, type Cart } from "../../core/cart.js";
import { toCurrencyCode } from "../../core/money.js";
import type { Price, Product, SellableRef, Variant } from "../../core/catalog.js";
import type { CommerceContainer } from "../../plugin/container.js";
import type { CheckoutSessionInput, ProviderCheckoutSession, ProviderWebhookEvent, WebhookAction } from "../../ports/payment-provider.js";
import type { CatalogLink, CheckoutSnapshot } from "../../ports/repositories.js";
import { createFakePaymentProvider, FAKE_WEBHOOK_SIGNATURE, webhookEvent, type FakePaymentProvider } from "../../testing/fake-provider.js";
import { createInMemoryWorld, type InMemoryWorld } from "../../testing/index.js";
import type { CatalogMirror } from "../../adapters/emdash/content/catalog-mirror.js";
import { createEventPublisher } from "../outbox.js";
import { processInboxEvent, serializeEvent } from "../webhook-inbox.js";
import type { Deps } from "./deps.js";

export const pln = toCurrencyCode("pln");

export interface Harness {
	world: InMemoryWorld;
	provider: FakePaymentProvider;
	container: CommerceContainer;
	deps: Deps;
	mirrorCalls: Array<{ variantId: string; onHand: number }>;
	setSecrets(secrets: Partial<{ stripeSecretKey: string | null; stripeWebhookSecret: string | null; accessTokenSecret: string | null }>): void;
	/** Records the event in the inbox the way the route does, then runs it through the pipeline. */
	deliver(event: ProviderWebhookEvent): ReturnType<typeof processInboxEvent>;
}

export const createHarness = (
	input: { extensions?: CommerceExtensions; options?: CommerceOptionsInput; isLivemode?: boolean; secretKey?: string } = {},
): Harness => {
	const world = createInMemoryWorld();
	const provider = createFakePaymentProvider({ isLivemode: input.isLivemode });
	const options = commerceOptionsSchema.parse(input.options ?? {});
	const secrets = { stripeSecretKey: input.secretKey ?? "sk_test_fake", stripeWebhookSecret: "whsec_fake", accessTokenSecret: "token-secret" } as {
		stripeSecretKey: string | null;
		stripeWebhookSecret: string | null;
		accessTokenSecret: string | null;
	};
	const mirrorCalls: Harness["mirrorCalls"] = [];
	const catalogMirror: CatalogMirror = {
		writeVariantSync: async () => undefined,
		writePriceSync: async () => undefined,
		writePriceActive: async () => undefined,
		writeVariantStock: async (variantId, onHand) => {
			mirrorCalls.push({ variantId, onHand });
		},
	};
	const container: CommerceContainer & { catalogMirror: CatalogMirror } = {
		options,
		extensions: input.extensions ?? {},
		clock: world.clock,
		ids: world.ids,
		log: world.log,
		siteUrl: "https://shop.example",
		catalog: world.catalog,
		catalogLinks: world.catalogLinks,
		carts: world.carts,
		cartMirror: world.cartMirror,
		snapshots: world.snapshots,
		inventory: world.inventory,
		recordIndex: world.recordIndex,
		orders: world.orders,
		payments: world.payments,
		refunds: world.refunds,
		subscriptions: world.subscriptions,
		customers: world.customers,
		inbox: world.inbox,
		outbox: world.outbox,
		rateLimiter: world.rateLimiter,
		relations: world.relations,
		mailer: { send: async () => true },
		secrets: async () => ({ ...secrets }),
		provider: async () => provider,
		ensureReady: async () => undefined,
		catalogMirror,
	};
	const harness: Harness = {
		world,
		provider,
		container,
		deps: { container, publisher: createEventPublisher(container) },
		mirrorCalls,
		setSecrets: (patch) => void Object.assign(secrets, patch),
		async deliver(event) {
			await container.inbox.record(event, serializeEvent(event), "webhook");
			return processInboxEvent(container, event.eventId, "webhook");
		},
	};
	return harness;
};

let sequence = 0;
export const nextId = (prefix: string): string => `${prefix}_${String(++sequence).padStart(4, "0")}`;

export const event = (action: WebhookAction, over: Partial<Omit<ProviderWebhookEvent, "action">> = {}): ProviderWebhookEvent =>
	webhookEvent(action, { eventId: nextId("evt"), ...over });

export interface SeededCheckout {
	sessionId: string;
	checkoutId: string;
	cartId: string;
	reservationId: string;
	sellable: SellableRef;
	providerPriceId: string;
	priceId: string;
	paymentIntentId: string | null;
	subscriptionId: string | null;
	unitAmount: number;
}

/**
 * Everything checkout leaves behind before a customer pays: a catalog entry with a provider price, stock,
 * a reservation, a cart waiting on the session, a snapshot, and the open session at the provider.
 */
export const seedCheckout = async (
	h: Harness,
	over: { quantity?: number; stock?: number | null; unitAmount?: number; mode?: "payment" | "subscription"; email?: string; withSnapshot?: boolean } = {},
): Promise<SeededCheckout> => {
	const { container, provider, world } = h;
	const mode = over.mode ?? "payment";
	const quantity = over.quantity ?? 2;
	const unitAmount = over.unitAmount ?? 2500;
	const id = nextId("p");
	const product: Product = {
		id: `prod_${id}`,
		slug: `shirt-${id}`,
		title: "Shirt",
		description: null,
		imageUrls: [],
		isPublished: true,
		hasVariants: true,
		inventory: { isTracked: true, allowsBackorder: false },
		taxCode: null,
		price: null,
		sku: null,
		typeId: null,
		brandId: null,
		categoryIds: [],
		specs: {},
	};
	const variant: Variant = { id: `var_${id}`, productId: product.id, title: "Blue M", sku: `SKU-${id}`, optionValueIds: [], optionsKey: "", price: null, imageUrls: [], isActive: true, inventory: { isTracked: true, allowsBackorder: false } };
	const price: Price = {
		id: `price_${id}`,
		productId: product.id,
		variantId: variant.id,
		nickname: null,
		type: mode === "subscription" ? "recurring" : "one_time",
		unitAmount,
		currency: pln,
		recurring: mode === "subscription" ? { interval: "month", intervalCount: 1, trialDays: null } : null,
		taxBehavior: "unspecified",
		lookupKey: null,
		isActive: true,
		isDefault: true,
		isManaged: false,
	};
	world.catalog.addProduct(product);
	world.catalog.addVariant(variant);
	world.catalog.addPrice(price);
	const providerProduct = await provider.catalog.createProduct(
		{ entityKey: `variant:${variant.id}`, name: "Shirt", description: null, imageUrls: [], isActive: true, taxCode: null, extraMetadata: {} },
		`key-prod-${id}`,
	);
	const providerPrice = await provider.catalog.createPrice(
		{
			entityKey: `price:${price.id}`,
			providerProductId: providerProduct.providerId,
			unitAmount,
			currency: pln,
			recurring: price.recurring ? { interval: "month", intervalCount: 1 } : null,
			taxBehavior: "unspecified",
			nickname: null,
			lookupKey: null,
		},
		`key-price-${id}`,
	);
	const link: CatalogLink = {
		entityKey: `price:${price.id}`,
		providerId: providerPrice.providerId,
		providerPriceByFingerprint: {},
		fingerprint: null,
		syncStatus: "synced",
		lastError: null,
		attempts: 0,
		nextAttemptAt: null,
		syncedAt: null,
		driftFields: [],
	};
	await container.catalogLinks.put(link, null);

	const sellable: SellableRef = { kind: "variant", id: variant.id };
	if (over.stock !== null) await container.inventory.adjust(sellable, over.stock ?? 10, "test");
	const cartId = nextId("cart").padEnd(32, "x");
	const checkoutId = nextId("co");
	const reservationId = nextId("res");
	const expiresAt = new Date(container.clock.now().getTime() + 30 * 60_000).toISOString();
	if (over.stock !== null) {
		await container.inventory.reserve({ reservationId, cartId, lines: [{ sellable, quantity, isGuarded: true }], expiresAt });
	}
	const sessionInput: CheckoutSessionInput = {
		checkoutId,
		cartId,
		mode,
		uiMode: "hosted",
		currency: pln,
		lines: [{ providerPriceId: providerPrice.providerId, quantity }],
		customerEmail: over.email ?? "Buyer@Example.com",
		providerCustomerId: null,
		successUrl: "https://shop.example/ok",
		cancelUrl: "https://shop.example/cart",
		returnUrl: null,
		expiresAt,
		locale: null,
		allowPromotionCodes: false,
		billingAddressCollection: "required",
		shippingAddressCountries: [],
		shippingRates: [],
		collectPhone: false,
		automaticTax: false,
		trialDays: null,
		extraMetadata: {},
	};
	const created = await provider.checkout.createSession(sessionInput, `key-session-${checkoutId}`);
	const session = provider.sessions.get(created.sessionId)!.session;
	const now = container.clock.now().toISOString();
	const cart: Cart = {
		id: cartId,
		status: CART_STATUS.checkoutOpen,
		lines: [{ priceId: price.id, quantity, addedAt: now }],
		email: null,
		checkout: { sessionId: created.sessionId, reservationId, expiresAt },
		orderId: null,
		context: { userAgent: null, country: null },
		createdAt: now,
		updatedAt: now,
		expiresAt,
	};
	await container.carts.put(cart, null);
	if (over.withSnapshot !== false) {
		const snapshot: CheckoutSnapshot = {
			checkoutId,
			cartId,
			sessionId: created.sessionId,
			mode,
			currency: "pln",
			lines: [{ priceId: price.id, providerPriceId: providerPrice.providerId, quantity, unitAmount }],
			expectedSubtotal: unitAmount * quantity,
			reservationId,
			customerId: null,
			createdAt: now,
		};
		await container.snapshots.put(snapshot);
	}
	return {
		sessionId: created.sessionId,
		checkoutId,
		cartId,
		reservationId,
		sellable,
		providerPriceId: providerPrice.providerId,
		priceId: price.id,
		paymentIntentId: session.paymentIntentId,
		subscriptionId: session.subscriptionId,
		unitAmount,
	};
};

/** Marks the session complete at the provider (paid unless overridden) and returns the settled-checkout event. */
export const completeCheckout = (h: Harness, seeded: SeededCheckout, over: Partial<ProviderCheckoutSession> = {}): ProviderWebhookEvent => {
	h.provider.completeSession(seeded.sessionId, over);
	return event({ kind: "checkout_completed", sessionId: seeded.sessionId }, { type: "checkout.session.completed" });
};

export const flush = async (publisher: Deps["publisher"]): Promise<void> => {
	await publisher.processDue(1000);
};

export { FAKE_WEBHOOK_SIGNATURE };

export const outboxEvent = async (h: Harness, type: Parameters<typeof import("../../core/events.js").commerceEventId>[0], sourceId: string) => {
	const { commerceEventId } = await import("../../core/events.js");
	return (await h.container.outbox.get(commerceEventId(type, sourceId)))?.value.event ?? null;
};

export const allOrders = async (h: Harness) => (await h.container.orders.list({ cursor: null, limit: 100 })).items;

export const advance = (h: Harness, ms: number): void => h.world.clock.advance(ms);

import type { Order } from "../../core/order.js";
import type { ProviderRefund } from "../../ports/payment-provider.js";

/** A settled, paid one-time order (quantity 2 × 2500 = 5000 pln) with its checkout leftovers. */
export const paidOrder = async (h: Harness, over: Parameters<typeof seedCheckout>[1] = {}): Promise<{ order: Order; seeded: SeededCheckout }> => {
	const seeded = await seedCheckout(h, over);
	const result = await h.deliver(completeCheckout(h, seeded));
	if (result.outcome !== "processed") throw new Error(`settlement did not process: ${JSON.stringify(result)}`);
	const orders = await allOrders(h);
	const order = orders.find((candidate) => candidate.stripe.checkoutSessionId === seeded.sessionId)!;
	return { order, seeded };
};

export const providerRefund = (over: Partial<ProviderRefund> & Pick<ProviderRefund, "refundId" | "paymentIntentId" | "amount">): ProviderRefund => ({
	chargeId: null,
	currency: pln,
	status: "succeeded",
	reason: null,
	refundRecordId: null,
	...over,
});

import type { ProviderDispute, ProviderInvoice, ProviderSubscription } from "../../ports/payment-provider.js";

export const providerSubscription = (over: Partial<ProviderSubscription> = {}): ProviderSubscription => ({
	subscriptionId: "sub_test_1",
	providerCustomerId: "cus_test_1",
	status: "active",
	items: [{ providerPriceId: "price_unknown", quantity: 1, description: "Plan" }],
	interval: "month",
	intervalCount: 1,
	currency: pln,
	amount: 2500,
	currentPeriodStart: 1_768_478_400,
	currentPeriodEnd: 1_771_156_800,
	trialEnd: null,
	cancelAtPeriodEnd: false,
	canceledAt: null,
	latestInvoiceId: null,
	metadata: { emdash_checkout_id: "co_sub", emdash_cart_id: "cart_sub" },
	...over,
});

export const providerInvoice = (over: Partial<ProviderInvoice> = {}): ProviderInvoice => ({
	invoiceId: "in_test_1",
	subscriptionId: "sub_test_1",
	providerCustomerId: "cus_test_1",
	paymentIntentId: "pi_invoice_1",
	chargeId: "ch_invoice_1",
	status: "paid",
	billingReason: "subscription_cycle",
	amountPaid: 2500,
	amountDue: 2500,
	currency: pln,
	attemptCount: 1,
	...over,
});

export const providerDispute = (over: Partial<ProviderDispute> = {}): ProviderDispute => ({
	disputeId: "dp_test_1",
	chargeId: "ch_dispute_1",
	paymentIntentId: null,
	amount: 5000,
	currency: pln,
	status: "open",
	reason: "fraudulent",
	...over,
});
