import type { CatalogMirror } from "../../adapters/emdash/content/catalog-mirror.js";
import { commerceOptionsSchema } from "../../contracts/options.js";
import { PRICE_TYPE, TAX_BEHAVIOR, type Price, type Product, type Variant } from "../../core/catalog.js";
import type { AnyCommerceEvent } from "../../core/events.js";
import { toCurrencyCode } from "../../core/money.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { createNullLogger, type FakePaymentProvider, type InMemoryWorld } from "../../testing/index.js";
import type { EventPublisher } from "../contracts.js";

/** Fixtures and a wired container shared by the catalog sync tests. */

export const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln"] });

export const product = (over: Partial<Product> = {}): Product => ({
	id: "prod_1",
	slug: "mug",
	title: "Mug",
	description: "A mug",
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
	id: "var_1",
	productId: "prod_1",
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
	id: "price_1",
	productId: "prod_1",
	variantId: null,
	nickname: "Default",
	type: PRICE_TYPE.oneTime,
	unitAmount: 2500,
	currency: toCurrencyCode("pln"),
	recurring: null,
	taxBehavior: TAX_BEHAVIOR.exclusive,
	lookupKey: "mug-default",
	isActive: true,
	isDefault: true,
	isManaged: false,
	...over,
});

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

export const mirrorRecorder = () => {
	const variants = new Map<string, unknown>();
	const prices = new Map<string, unknown>();
	const activeFlags = new Map<string, boolean>();
	const mirror: CatalogMirror = {
		writeVariantSync: async (id, fields) => {
			variants.set(id, fields);
		},
		writePriceSync: async (id, fields) => {
			prices.set(id, fields);
		},
		writeVariantStock: async () => {},
		writePriceActive: async (id, isActive) => {
			activeFlags.set(id, isActive);
		},
	};
	return { variants, prices, activeFlags, mirror };
};

export const buildContainer = (world: InMemoryWorld, provider: FakePaymentProvider, mirror: CatalogMirror = mirrorRecorder().mirror): CommerceContainer => ({
	options,
	extensions: {},
	clock: world.clock,
	ids: world.ids,
	log: createNullLogger(),
	siteUrl: "https://shop.test",
	catalog: world.catalog,
	catalogLinks: world.catalogLinks,
	catalogMirror: mirror,
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
	secrets: async () => ({ stripeSecretKey: "sk_test", stripeWebhookSecret: null, accessTokenSecret: "sec" }),
	provider: async () => provider,
	ensureReady: async () => {},
});

/** Stripe's view of one catalog entity's product, by entity key. */
export const stripeProductOf = (provider: FakePaymentProvider, entityKey: string) =>
	[...provider.products.values()].find((entry) => entry.entityKey === entityKey);
