import type { PluginContext, StorageCollection } from "emdash";

import { createCatalogMirror, type CatalogMirror } from "../adapters/emdash/content/catalog-mirror.js";
import { createEmDashRelations, type RelationsPort } from "../adapters/emdash/relations/index.js";
import { createRegistryPort } from "../adapters/emdash/schema/registry-port.js";
import { PLUGIN_VERSION, STORAGE } from "../adapters/emdash/constants.js";
import { createCartMirror, createCatalogRepository, requireWritableContent, type WritableContent } from "../adapters/emdash/content/repositories.js";
import {
	createCustomerRepository,
	createOrderRepository,
	createPaymentRepository,
	createSubscriptionRepository,
} from "../adapters/emdash/content/sales-repositories.js";
import { resolveIntegrationIdentifier } from "../adapters/emdash/integration-identifier.js";
import { buildCollectionDefinitions } from "../adapters/emdash/schema/collections.js";
import { ensureSchema, type SchemaPort } from "../adapters/emdash/schema/reconcile.js";
import { runDataMigrations } from "../adapters/emdash/schema/migrations.js";
import { isDeferringRelations, resolveSecrets, type CommerceSecrets } from "../adapters/emdash/settings.js";
import { createInventoryStore, type StockLevelDoc, type StoredReservation } from "../adapters/emdash/storage/inventory-store.js";
import { createRecordIndex, type IndexEntry } from "../adapters/emdash/storage/record-index.js";
import {
	createCartStore,
	createCatalogLinkStore,
	createCheckoutSnapshotStore,
	createRateLimiter,
	createRefundStore,
	type CatalogLinkDoc,
	type RateLimitDoc,
} from "../adapters/emdash/storage/simple-stores.js";
import { createEventOutbox, type OutboxDoc } from "../adapters/emdash/storage/event-outbox.js";
import { createWebhookInbox, type InboxDoc } from "../adapters/emdash/storage/webhook-inbox.js";
import { createStripeProvider } from "../adapters/stripe/index.js";
import type { CommerceExtensions } from "../contracts/extensions.js";
import type { CommerceOptions } from "../contracts/options.js";
import type { Cart } from "../core/cart.js";
import { CommerceError } from "../core/errors.js";
import { webCryptoIdGenerator, type IdGenerator } from "../core/ids.js";
import type { Refund } from "../core/payment.js";
import type { PaymentProvider } from "../ports/payment-provider.js";
import type {
	CartMirror,
	CartStore,
	CatalogLinkStore,
	CatalogRepository,
	CheckoutSnapshot,
	CheckoutSnapshotStore,
	Clock,
	CustomerRepository,
	EventOutbox,
	InventoryStore,
	Logger,
	Mailer,
	OrderRepository,
	PaymentRepository,
	RateLimiter,
	RecordIndex,
	RefundStore,
	SubscriptionRepository,
	WebhookInbox,
} from "../ports/repositories.js";

/**
 * Everything a service needs for one invocation (a route or a hook), built from EmDash's context. Ports
 * are cheap wrappers; the payment provider is lazy and only constructed (and the Stripe key only read)
 * when a use case that talks to Stripe asks for it, so catalog reads work on a site with no key yet.
 */
export interface CommerceContainer {
	options: CommerceOptions;
	extensions: CommerceExtensions;
	clock: Clock;
	ids: IdGenerator;
	log: Logger;
	siteUrl: string;
	catalog: CatalogRepository;
	catalogLinks: CatalogLinkStore;
	/** Content-side mirror of Stripe sync state and variant stock; writes variants and prices, never products. */
	catalogMirror: CatalogMirror;
	carts: CartStore;
	cartMirror: CartMirror;
	snapshots: CheckoutSnapshotStore;
	inventory: InventoryStore;
	recordIndex: RecordIndex;
	orders: OrderRepository;
	payments: PaymentRepository;
	refunds: RefundStore;
	subscriptions: SubscriptionRepository;
	customers: CustomerRepository;
	inbox: WebhookInbox;
	outbox: EventOutbox;
	rateLimiter: RateLimiter;
	/** Links between plugin collections (native EmDash relations); the only way to read or write them. */
	relations: RelationsPort;
	/**
	 * Raw content access, for catalog tooling that needs the draft revision or writes a plugin-owned field. Always set by
	 * `createContainer`; hand-built test containers may leave it out (use `requireContent`).
	 */
	content?: WritableContent;
	mailer: Mailer;
	secrets(): Promise<CommerceSecrets>;
	/** Throws `CommerceError("notConfigured")` when no Stripe key is configured. */
	provider(): Promise<PaymentProvider>;
	/** Schema reconcile + data migrations, once per process; call before the first content access. */
	ensureReady(): Promise<void>;
}

/** The container's raw content access; a container built without it cannot run the catalog editor tools. */
export const requireContent = (container: Pick<CommerceContainer, "content">): WritableContent => {
	if (!container.content) throw new Error("This container has no raw content access");
	return container.content;
};

export interface ContainerDeps {
	createProvider?: (config: { secretKey: string; webhookSecret: string | null; integrationIdentifier: string; appVersion: string; log?: Logger }) => PaymentProvider;
	createSchemaPort?: () => Promise<SchemaPort>;
	/** Overrides the relations port (tests); defaults to the EmDash handlers over the request-scoped database. */
	relations?: RelationsPort;
	clock?: Clock;
	ids?: IdGenerator;
	/** Overrides the environment variable source for secrets (tests). */
	env?: Readonly<Record<string, string | undefined>>;
}

const systemClock: Clock = { now: () => new Date() };

const toLogger = (log: PluginContext["log"]): Logger => ({
	debug: (message, meta) => log.debug(message, meta),
	info: (message, meta) => log.info(message, meta),
	warn: (message, meta) => log.warn(message, meta),
	error: (message, meta) => log.error(message, meta),
});

const toMailer = (ctx: PluginContext, log: Logger): Mailer => ({
	async send(message) {
		if (!ctx.email) return false;
		try {
			await ctx.email.send({ to: message.to, subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) });
			return true;
		} catch (error) {
			log.warn("Email could not be sent", { error: error instanceof Error ? error.message : "unknown" });
			throw error;
		}
	},
});

/** Per-process memo of the data migrations (the schema reconcile has its own memo). */
const migrationsDone = new Set<string>();
export const resetContainerMemo = (): void => migrationsDone.clear();

export const createContainer = (
	ctx: PluginContext,
	options: CommerceOptions,
	extensions: CommerceExtensions,
	deps: ContainerDeps = {},
): CommerceContainer => {
	const clock = deps.clock ?? systemClock;
	const ids = deps.ids ?? webCryptoIdGenerator;
	const log = toLogger(ctx.log);
	const slugs = options.collections;
	const content = requireWritableContent(ctx.content);
	const storage = <T>(name: string) => ctx.storage[name] as unknown as StorageCollection<T>;

	const relations = deps.relations ?? createEmDashRelations();
	const recordIndex = createRecordIndex(storage<IndexEntry>(STORAGE.recordIndex), clock);
	const inventory = createInventoryStore(storage<StockLevelDoc>(STORAGE.inventory), storage<StoredReservation>(STORAGE.reservations), clock);
	let providerPromise: Promise<PaymentProvider> | null = null;

	return {
		options,
		extensions,
		clock,
		ids,
		log,
		siteUrl: ctx.site.url,
		catalog: createCatalogRepository(content, relations, slugs),
		catalogLinks: createCatalogLinkStore(storage<CatalogLinkDoc>(STORAGE.catalogLinks)),
		catalogMirror: createCatalogMirror(content, slugs, inventory, log),
		carts: createCartStore(storage<Cart>(STORAGE.carts)),
		cartMirror: createCartMirror(content, slugs, recordIndex, log),
		snapshots: createCheckoutSnapshotStore(storage<CheckoutSnapshot>(STORAGE.checkoutSnapshots)),
		inventory,
		recordIndex,
		orders: createOrderRepository(content, slugs, { relations, kv: ctx.kv }),
		payments: createPaymentRepository(content, slugs, { relations }),
		refunds: createRefundStore(storage<Refund>(STORAGE.refunds)),
		subscriptions: createSubscriptionRepository(content, slugs, { relations }),
		customers: createCustomerRepository(content, slugs, log),
		inbox: createWebhookInbox(storage<InboxDoc>(STORAGE.webhookInbox), ctx.kv, clock),
		outbox: createEventOutbox(storage<OutboxDoc>(STORAGE.eventOutbox), clock),
		rateLimiter: createRateLimiter(storage<RateLimitDoc>(STORAGE.rateLimits), clock),
		relations,
		content,
		mailer: toMailer(ctx, log),
		secrets: () => resolveSecrets(ctx.settings, deps.env),
		provider() {
			if (providerPromise) return providerPromise;
			const attempt = (async () => {
				const secrets = await resolveSecrets(ctx.settings, deps.env);
				if (!secrets.stripeSecretKey) {
					throw new CommerceError("notConfigured", "Stripe is not configured: set the secret key in the plugin settings or STRIPE_SECRET_KEY.");
				}
				const integrationIdentifier = await resolveIntegrationIdentifier(ctx.kv, ids);
				return (deps.createProvider ?? createStripeProvider)({
					secretKey: secrets.stripeSecretKey,
					webhookSecret: secrets.stripeWebhookSecret,
					integrationIdentifier,
					appVersion: PLUGIN_VERSION,
					log,
				});
			})();
			providerPromise = attempt;
			// A failed construction (missing key) must not be cached: the key may be set a moment later.
			attempt.catch(() => {
				if (providerPromise === attempt) providerPromise = null;
			});
			return attempt;
		},
		async ensureReady() {
			const createPort = deps.createSchemaPort ?? createRegistryPort;
			const { isDeferred } = await ensureSchema(ctx, options, { createPort, log: ctx.log, isDeferringRelations: isDeferringRelations(deps.env) });
			// Migrations read relation fields that a deferred schema does not have yet; they run once the schema is complete.
			if (isDeferred) return;
			const memoKey = `${ctx.plugin.id}:${JSON.stringify(slugs)}`;
			if (migrationsDone.has(memoKey)) return;
			const result = await runDataMigrations({
				kv: ctx.kv,
				log: ctx.log,
				plugin: ctx,
				collections: slugs,
				definitions: buildCollectionDefinitions(slugs, options.supportedCurrencies),
				schema: createPort,
			});
			// Only a clean run is final; a failure (or another process holding the lock) is retried next time.
			if (!result.failed && !result.isLocked) migrationsDone.add(memoKey);
		},
	};
};
