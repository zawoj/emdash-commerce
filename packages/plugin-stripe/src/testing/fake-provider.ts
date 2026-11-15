import { toCurrencyCode } from "../core/money.js";
import {
	ProviderError,
	WebhookSignatureError,
	type CheckoutSessionInput,
	type CheckoutSessionResult,
	type PaymentProvider,
	type ProviderCheckoutSession,
	type ProviderCustomer,
	type ProviderInvoice,
	type ProviderPayment,
	type ProviderPriceInput,
	type ProviderPriceSnapshot,
	type ProviderProductInput,
	type ProviderProductSnapshot,
	type ProviderRefund,
	type ProviderSubscription,
	type ProviderWebhookEvent,
	type WebhookEndpointInfo,
} from "../ports/payment-provider.js";

/**
 * Stateful in-memory `PaymentProvider` for service tests. It keeps Stripe's semantics that services rely
 * on: idempotency keys (same key + same payload → same result; same key + other payload → non-retryable
 * error, like StripeIdempotencyError), immutable price terms, refund bounds, and an event log that
 * `listEventsSince` replays. Failures are injected per method with `failNext`.
 *
 * Webhooks: `verifyAndParse` accepts the JSON of a `ProviderWebhookEvent` (build one with `webhookEvent`)
 * when the signature equals `FAKE_WEBHOOK_SIGNATURE`, and throws `WebhookSignatureError` otherwise.
 */

export const FAKE_WEBHOOK_SIGNATURE = "fake-valid-signature";

export interface FakeProviderCall {
	method: string;
	idempotencyKey: string | null;
	args: unknown;
}

type Method =
	| "createProduct"
	| "updateProduct"
	| "createPrice"
	| "updatePrice"
	| "createSession"
	| "retrieveSession"
	| "expireSession"
	| "createRefund"
	| "createCustomer"
	| "createPortalSession"
	| "cancelSubscription"
	| "retrieveSubscription"
	| "retrieveInvoice"
	| "retrievePayment"
	| "listEventsSince"
	| "createEndpoint";

export interface FakePaymentProvider extends PaymentProvider {
	readonly calls: FakeProviderCall[];
	readonly products: Map<string, ProviderProductSnapshot>;
	readonly prices: Map<string, ProviderPriceSnapshot>;
	readonly sessions: Map<string, { input: CheckoutSessionInput; session: ProviderCheckoutSession }>;
	readonly paymentsById: Map<string, ProviderPayment>;
	readonly refunds: Map<string, ProviderRefund>;
	readonly customersById: Map<string, ProviderCustomer>;
	readonly subscriptionsById: Map<string, ProviderSubscription>;
	readonly invoices: Map<string, ProviderInvoice>;
	/** Events returned by `listEventsSince` (append with `recordEvent`). */
	readonly events: ProviderWebhookEvent[];
	failNext(method: Method, error?: Error): void;
	/** Test helper: moves a session to complete/paid (or the given overrides) and returns it. */
	completeSession(sessionId: string, overrides?: Partial<ProviderCheckoutSession>): ProviderCheckoutSession;
	recordEvent(event: ProviderWebhookEvent): void;
	callsOf(method: Method): FakeProviderCall[];
}

export const webhookEvent = (
	action: ProviderWebhookEvent["action"],
	overrides: Partial<Omit<ProviderWebhookEvent, "action">> = {},
): ProviderWebhookEvent => ({
	eventId: overrides.eventId ?? `evt_${Math.random().toString(36).slice(2, 12)}`,
	type: overrides.type ?? action.kind,
	created: overrides.created ?? Math.floor(Date.now() / 1000),
	isLivemode: overrides.isLivemode ?? false,
	action,
	raw: overrides.raw ?? { id: overrides.eventId ?? "evt_fake", type: overrides.type ?? action.kind },
});

export const createFakePaymentProvider = (options: { isLivemode?: boolean } = {}): FakePaymentProvider => {
	const isLivemode = options.isLivemode ?? false;
	const calls: FakeProviderCall[] = [];
	const failures = new Map<Method, Error[]>();
	const idempotency = new Map<string, { payload: string; result: unknown }>();
	let sequence = 0;
	const nextId = (prefix: string): string => `${prefix}_fake${String(++sequence).padStart(6, "0")}`;

	const products = new Map<string, ProviderProductSnapshot>();
	const prices = new Map<string, ProviderPriceSnapshot>();
	const sessions = new Map<string, { input: CheckoutSessionInput; session: ProviderCheckoutSession }>();
	const paymentsById = new Map<string, ProviderPayment>();
	const refunds = new Map<string, ProviderRefund>();
	const customersById = new Map<string, ProviderCustomer>();
	const subscriptionsById = new Map<string, ProviderSubscription>();
	const invoices = new Map<string, ProviderInvoice>();
	const endpoints = new Map<string, WebhookEndpointInfo>();
	const events: ProviderWebhookEvent[] = [];

	const takeFailure = (method: Method): void => {
		const queue = failures.get(method);
		const error = queue?.shift();
		if (error) throw error;
	};

	/** Runs a mutating call once per idempotency key, like Stripe. */
	const once = async <T>(method: Method, key: string, args: unknown, run: () => T): Promise<T> => {
		calls.push({ method, idempotencyKey: key, args });
		takeFailure(method);
		const payload = JSON.stringify(args);
		const previous = idempotency.get(key);
		if (previous) {
			if (previous.payload !== payload) {
				throw new ProviderError("Idempotency key reused with different parameters", { isRetryable: false, providerCode: "idempotency_error" });
			}
			return previous.result as T;
		}
		const result = run();
		idempotency.set(key, { payload, result });
		return result;
	};

	const read = <T>(method: Method, args: unknown, run: () => T): T => {
		calls.push({ method, idempotencyKey: null, args });
		takeFailure(method);
		return run();
	};

	const productSnapshot = (providerId: string, input: ProviderProductInput): ProviderProductSnapshot => ({
		providerId,
		name: input.name,
		isActive: input.isActive,
		entityKey: input.entityKey,
		updatedAt: Math.floor(Date.now() / 1000),
	});

	const priceSnapshot = (providerId: string, input: ProviderPriceInput): ProviderPriceSnapshot => ({
		providerId,
		providerProductId: input.providerProductId,
		unitAmount: input.unitAmount,
		currency: input.currency,
		isActive: true,
		entityKey: input.entityKey,
	});

	const provider: FakePaymentProvider = {
		id: "stripe",
		calls,
		products,
		prices,
		sessions,
		paymentsById,
		refunds,
		customersById,
		subscriptionsById,
		invoices,
		events,
		failNext(method, error) {
			const queue = failures.get(method) ?? [];
			queue.push(error ?? new ProviderError(`Injected ${method} failure`, { isRetryable: true }));
			failures.set(method, queue);
		},
		callsOf: (method) => calls.filter((call) => call.method === method),
		recordEvent: (event) => {
			events.push(event);
		},
		completeSession(sessionId, overrides = {}) {
			const entry = sessions.get(sessionId);
			if (!entry) throw new Error(`Unknown fake session ${sessionId}`);
			const session: ProviderCheckoutSession = { ...entry.session, status: "complete", paymentStatus: "paid", ...overrides };
			if (session.paymentIntentId && !paymentsById.has(session.paymentIntentId)) {
				paymentsById.set(session.paymentIntentId, {
					paymentIntentId: session.paymentIntentId,
					status: session.paymentStatus === "paid" ? "succeeded" : "processing",
					amount: session.amountTotal,
					amountRefunded: 0,
					currency: session.currency,
					latestChargeId: nextId("ch"),
					methodType: "card",
					failureCode: null,
					failureMessage: null,
					metadata: { ...session.metadata },
				});
			}
			sessions.set(sessionId, { input: entry.input, session });
			return session;
		},

		catalog: {
			createProduct: (input, key) =>
				once("createProduct", key, input, () => {
					const snapshot = productSnapshot(nextId("prod"), input);
					products.set(snapshot.providerId, snapshot);
					return snapshot;
				}),
			updateProduct: (providerId, input, key) =>
				once("updateProduct", key, { providerId, input }, () => {
					if (!products.has(providerId)) throw new ProviderError("No such product", { isRetryable: false, providerCode: "resource_missing" });
					const snapshot = productSnapshot(providerId, input);
					products.set(providerId, snapshot);
					return snapshot;
				}),
			archiveProduct: (providerId, key) =>
				once("updateProduct", key, { providerId, archive: true }, () => {
					const current = products.get(providerId);
					if (!current) throw new ProviderError("No such product", { isRetryable: false, providerCode: "resource_missing" });
					const next = { ...current, isActive: false };
					products.set(providerId, next);
					return next;
				}),
			retrieveProduct: async (providerId) => products.get(providerId) ?? null,
			findProductByEntity: async (entityKey) => [...products.values()].find((product) => product.entityKey === entityKey) ?? null,
			createPrice: (input, key) =>
				once("createPrice", key, input, () => {
					if (!products.has(input.providerProductId)) throw new ProviderError("No such product", { isRetryable: false, providerCode: "resource_missing" });
					const snapshot = priceSnapshot(nextId("price"), input);
					prices.set(snapshot.providerId, snapshot);
					return snapshot;
				}),
			updatePrice: (providerId, patch, key) =>
				once("updatePrice", key, { providerId, patch }, () => {
					const current = prices.get(providerId);
					if (!current) throw new ProviderError("No such price", { isRetryable: false, providerCode: "resource_missing" });
					const next = { ...current, ...(patch.isActive === undefined ? {} : { isActive: patch.isActive }) };
					prices.set(providerId, next);
					return next;
				}),
			retrievePrice: async (providerId) => prices.get(providerId) ?? null,
		},

		checkout: {
			createSession: (input, key) =>
				once("createSession", key, input, (): CheckoutSessionResult => {
					const sessionId = nextId("cs_test");
					const lines = input.lines.map((line) => {
						const price = prices.get(line.providerPriceId);
						const amount = (price?.unitAmount ?? 0) * line.quantity;
						return {
							providerPriceId: line.providerPriceId,
							quantity: line.quantity,
							description: line.providerPriceId,
							amountSubtotal: amount,
							amountDiscount: 0,
							amountTax: 0,
							amountTotal: amount,
							currency: input.currency,
						};
					});
					const subtotal = lines.reduce((sum, line) => sum + line.amountSubtotal, 0);
					const session: ProviderCheckoutSession = {
						sessionId,
						status: "open",
						paymentStatus: "unpaid",
						mode: input.mode,
						isLivemode,
						currency: input.currency,
						amountSubtotal: subtotal,
						amountDiscount: 0,
						amountTax: 0,
						amountShipping: 0,
						amountTotal: subtotal,
						email: input.customerEmail ?? "buyer@example.com",
						name: "Test Buyer",
						phone: null,
						billingAddress: { line1: "Main 1", line2: null, city: "Warsaw", postalCode: "00-001", state: null, country: "PL" },
						shippingAddress: null,
						providerCustomerId: input.providerCustomerId ?? nextId("cus"),
						paymentIntentId: input.mode === "payment" ? nextId("pi") : null,
						subscriptionId: input.mode === "subscription" ? nextId("sub") : null,
						invoiceId: input.mode === "subscription" ? nextId("in") : null,
						metadata: { emdash_cart_id: input.cartId, emdash_checkout_id: input.checkoutId, ...input.extraMetadata },
						lines,
						createdAt: Math.floor(Date.now() / 1000),
					};
					sessions.set(sessionId, { input, session });
					return {
						sessionId,
						url: input.uiMode === "hosted" ? `https://checkout.stripe.test/${sessionId}` : null,
						clientSecret: input.uiMode === "embedded" ? `${sessionId}_secret_fake` : null,
						expiresAt: input.expiresAt,
					};
				}),
			retrieveSession: async (sessionId) => read("retrieveSession", { sessionId }, () => sessions.get(sessionId)?.session ?? null),
			expireSession: async (sessionId) =>
				read("expireSession", { sessionId }, () => {
					const entry = sessions.get(sessionId);
					if (entry && entry.session.status === "open") sessions.set(sessionId, { ...entry, session: { ...entry.session, status: "expired" } });
				}),
		},

		payments: {
			retrievePayment: async (paymentIntentId) => read("retrievePayment", { paymentIntentId }, () => paymentsById.get(paymentIntentId) ?? null),
			createRefund: (input, key) =>
				once("createRefund", key, input, (): ProviderRefund => {
					const payment = paymentsById.get(input.paymentIntentId);
					if (!payment) throw new ProviderError("No such payment_intent", { isRetryable: false, providerCode: "resource_missing" });
					if (payment.amountRefunded + input.amount > payment.amount) {
						throw new ProviderError("Refund amount exceeds the refundable amount", { isRetryable: false, providerCode: "charge_already_refunded" });
					}
					paymentsById.set(payment.paymentIntentId, { ...payment, amountRefunded: payment.amountRefunded + input.amount });
					const refund: ProviderRefund = {
						refundId: nextId("re"),
						paymentIntentId: payment.paymentIntentId,
						chargeId: payment.latestChargeId,
						amount: input.amount,
						currency: payment.currency,
						status: "succeeded",
						reason: input.reason,
						refundRecordId: input.refundRecordId,
					};
					refunds.set(refund.refundId, refund);
					return refund;
				}),
		},

		customers: {
			createCustomer: (input, key) =>
				once("createCustomer", key, input, (): ProviderCustomer => {
					const customer: ProviderCustomer = {
						providerCustomerId: nextId("cus"),
						email: input.email,
						name: input.name,
						phone: input.phone,
						billingAddress: null,
						shippingAddress: null,
						isDeleted: false,
					};
					customersById.set(customer.providerCustomerId, customer);
					return customer;
				}),
			retrieveCustomer: async (providerCustomerId) => customersById.get(providerCustomerId) ?? null,
			createPortalSession: async (input) =>
				read("createPortalSession", input, () => ({ url: `https://billing.stripe.test/session/${input.providerCustomerId}` })),
		},

		subscriptions: {
			retrieveSubscription: async (subscriptionId) =>
				read("retrieveSubscription", { subscriptionId }, () => subscriptionsById.get(subscriptionId) ?? null),
			cancelSubscription: (subscriptionId, cancelOptions, key) =>
				once("cancelSubscription", key, { subscriptionId, cancelOptions }, (): ProviderSubscription => {
					const current = subscriptionsById.get(subscriptionId);
					if (!current) throw new ProviderError("No such subscription", { isRetryable: false, providerCode: "resource_missing" });
					const next: ProviderSubscription = cancelOptions.atPeriodEnd
						? { ...current, cancelAtPeriodEnd: true }
						: { ...current, status: "canceled", canceledAt: Math.floor(Date.now() / 1000) };
					subscriptionsById.set(subscriptionId, next);
					return next;
				}),
			retrieveInvoice: async (invoiceId) => read("retrieveInvoice", { invoiceId }, () => invoices.get(invoiceId) ?? null),
		},

		webhooks: {
			async verifyAndParse(rawBody, signature) {
				if (signature !== FAKE_WEBHOOK_SIGNATURE) throw new WebhookSignatureError("Invalid fake signature");
				return JSON.parse(rawBody) as ProviderWebhookEvent;
			},
			async *listEventsSince(createdAfter, types) {
				read("listEventsSince", { createdAfter, types }, () => undefined);
				const matching = events
					.filter((event) => event.created > createdAfter && types.includes(event.type))
					.sort((a, b) => a.created - b.created);
				for (const event of matching) yield event;
			},
			listEndpoints: async () => [...endpoints.values()],
			createEndpoint: (input, key) =>
				once("createEndpoint", key, input, () => {
					const endpoint = { endpointId: nextId("we"), url: input.url, enabledEvents: [...input.events], status: "enabled" };
					endpoints.set(endpoint.endpointId, endpoint);
					return { ...endpoint, secret: "whsec_fake" };
				}),
			async updateEndpoint(endpointId, input) {
				const current = endpoints.get(endpointId);
				if (!current) throw new ProviderError("No such webhook endpoint", { isRetryable: false, providerCode: "resource_missing" });
				const next = { ...current, enabledEvents: [...input.events] };
				endpoints.set(endpointId, next);
				return next;
			},
		},

		describeAccount: async () => ({
			accountId: "acct_fake",
			isLivemode,
			apiVersion: "2026-10-28.endive",
			keyKind: "restricted",
			displayName: "Fake account",
		}),
	};

	return provider;
};

/** Convenience for tests that need a currency literal. */
export const pln = toCurrencyCode("pln");
