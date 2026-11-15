export const PLUGIN_ID = "stripe-commerce" as const;
export const PLUGIN_VERSION = "0.2.0" as const;

/** Plugin storage collections (machine state: atomic counters, claims, queues, indexes). */
export const STORAGE = {
	catalogLinks: "catalog_links",
	carts: "commerce_carts",
	checkoutSnapshots: "checkout_snapshots",
	inventory: "inventory_levels",
	reservations: "inventory_reservations",
	recordIndex: "record_index",
	refunds: "refunds",
	webhookInbox: "webhook_inbox",
	eventOutbox: "event_outbox",
	rateLimits: "rate_limits",
} as const;
export type StorageName = (typeof STORAGE)[keyof typeof STORAGE];

/** Plugin KV keys (`state:` = internal, never shown to users). */
export const KV_KEY = {
	schemaMarker: "state:schema-marker",
	schemaLock: "state:schema-lock",
	migrationsLock: "state:migrations-lock",
	migrationDone: (id: string): string => `state:migration:${id}`,
	integrationSuffix: "state:checkout-integration-suffix",
	webhookCursor: "state:webhook-cursor",
	/** Last order sequence number handed out in a year (a number; see storage/order-sequence.ts). */
	orderSequence: (year: number): string => `state:order-seq:${year}`,
} as const;

/** Prefix of the Checkout `integration_identifier` label (kept from the prototype). */
export const INTEGRATION_IDENTIFIER_PREFIX = "emdash-stripe" as const;

/**
 * Admin sidebar folders. Collections sharing a group render as one collapsible folder under Content, and the
 * Commerce page joins the sales folder (a plugin page whose group matches a collection group goes there).
 */
export const ADMIN_NAV_GROUP = {
	catalog: "Catalog",
	sales: "Sales",
} as const;
export type AdminNavGroup = (typeof ADMIN_NAV_GROUP)[keyof typeof ADMIN_NAV_GROUP];
