import { commerceOptionsSchema, type CommerceOptionsInput } from "../../contracts/options.js";
import type { CommerceExtensions, ExtensionContext } from "../../contracts/extensions.js";
import { PRICE_TYPE, TAX_BEHAVIOR, type Price, type Product, type Variant } from "../../core/catalog.js";
import type { AnyCommerceEvent } from "../../core/events.js";
import { toCurrencyCode } from "../../core/money.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { createFakePaymentProvider, createInMemoryWorld, createNullLogger, type FakePaymentProvider, type InMemoryWorld } from "../../testing/index.js";
import type { CatalogSyncService, EventPublisher } from "../contracts.js";
import type { StorefrontDeps } from "./deps.js";

/** Test fixtures and a wired in-memory world shared by the storefront service and route tests. */

export const pln = toCurrencyCode("pln");

export const product = (over: Partial<Product> = {}): Product => ({
	id: "p1",
	slug: "mug",
	title: "Mug",
	description: null,
	imageUrls: [],
	isPublished: true,
	hasVariants: false,
	inventory: { isTracked: false, allowsBackorder: false },
	taxCode: null,
	price: null,
	sku: null,
	typeId: null,
	brandId: null,
	categoryIds: [],
	specs: {},
	...over,
});

export const variant = (over: Partial<Variant> = {}): Variant => ({
	id: "v1",
	productId: "p3",
	title: "Large",
	sku: null,
	optionValueIds: [],
	optionsKey: "",
	price: null,
	imageUrls: [],
	isActive: true,
	inventory: { isTracked: true, allowsBackorder: false },
	...over,
});

export const price = (over: Partial<Price> = {}): Price => ({
	id: "pr1",
	productId: "p1",
	variantId: null,
	nickname: null,
	type: PRICE_TYPE.oneTime,
	unitAmount: 1000,
	currency: pln,
	recurring: null,
	taxBehavior: TAX_BEHAVIOR.exclusive,
	lookupKey: null,
	isActive: true,
	isDefault: true,
	isManaged: false,
	...over,
});

export const recurringPrice = (over: Partial<Price> = {}): Price =>
	price({ id: "prsub", productId: "p4", type: PRICE_TYPE.recurring, unitAmount: 4900, recurring: { interval: "month", intervalCount: 1, trialDays: 14 }, ...over });

export const recordingPublisher = (): EventPublisher & { events: AnyCommerceEvent[] } => {
	const events: AnyCommerceEvent[] = [];
	return {
		events,
		publish: async (batch) => {
			events.push(...batch);
		},
		processDue: async () => 0,
		retry: async () => {},
	};
};

export interface StubCatalogSync extends CatalogSyncService {
	/** Price ids the stub reports as not sellable (provider price null). */
	unsellable: Set<string>;
	ensureCalls: string[][];
}

export const stubCatalogSync = (): StubCatalogSync => {
	const unsellable = new Set<string>();
	const ensureCalls: string[][] = [];
	return {
		unsellable,
		ensureCalls,
		syncEntity: async () => {},
		ensurePricesSynced: async (priceIds) => {
			ensureCalls.push([...priceIds]);
			return new Map(priceIds.map((id) => [id, unsellable.has(id) ? null : `price_${id}`] as const));
		},
		deactivateProduct: async () => {},
		archiveDeleted: async () => {},
		prepareDelete: async () => {},
		handleProviderProductChanged: async () => {},
		handleProviderPriceChanged: async () => {},
		processDue: async () => 0,
		resync: async () => ({ queued: 0 }),
	};
};

export interface StorefrontWorld {
	world: InMemoryWorld;
	provider: FakePaymentProvider;
	container: CommerceContainer;
	deps: StorefrontDeps;
	publisher: ReturnType<typeof recordingPublisher>;
	catalogSync: StubCatalogSync;
	logs: Array<{ level: string; message: string }>;
	/** `[variantId, onHand]` for every variant stock mirror write. */
	stockMirrorCalls: Array<[string, number]>;
	/** Adds a published, untracked product with one default price (`p1` / `pr1`). */
	seedBasic(): void;
}

export const createStorefrontWorld = (
	input: { options?: CommerceOptionsInput; extensions?: CommerceExtensions; siteUrl?: string } = {},
): StorefrontWorld => {
	const world = createInMemoryWorld();
	const provider = createFakePaymentProvider();
	const publisher = recordingPublisher();
	const catalogSync = stubCatalogSync();
	const logs: StorefrontWorld["logs"] = [];
	const log = (level: string) => (message: string): void => void logs.push({ level, message });
	const extensions = input.extensions ?? {};
	const extensionContext: ExtensionContext = {
		log: createNullLogger(),
		storeName: "Test store",
		siteUrl: input.siteUrl ?? "https://shop.test",
		getOrder: (id) => world.orders.get(id),
		getCustomer: (id) => world.customers.get(id),
		getSubscription: (id) => world.subscriptions.get(id),
	};
	const stockMirrorCalls: Array<[string, number]> = [];
	const container: CommerceContainer = {
		options: commerceOptionsSchema.parse({ supportedCurrencies: ["pln"], ...input.options }),
		extensions,
		clock: world.clock,
		ids: world.ids,
		log: { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") },
		siteUrl: input.siteUrl ?? "https://shop.test",
		catalog: world.catalog,
		catalogLinks: world.catalogLinks,
		catalogMirror: {
			writeVariantSync: async () => {},
			writePriceSync: async () => {},
			writePriceActive: async () => {},
			writeVariantStock: async (variantId, onHand) => void stockMirrorCalls.push([variantId, onHand]),
		},
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
		mailer: { send: async () => false },
		secrets: async () => ({ stripeSecretKey: "sk_test", stripeWebhookSecret: null, accessTokenSecret: "secret" }),
		provider: async () => provider,
		ensureReady: async () => {},
	};
	return {
		world,
		provider,
		container,
		deps: { catalogSync, publisher, extensionContext },
		publisher,
		catalogSync,
		logs,
		stockMirrorCalls,
		seedBasic: () => {
			world.catalog.addProduct(product());
			world.catalog.addPrice(price());
		},
	};
};
