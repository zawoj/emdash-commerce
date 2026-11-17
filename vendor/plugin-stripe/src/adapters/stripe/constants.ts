/** The Stripe API version the whole adapter is written and tested against; pinned on every client and endpoint. */
export const STRIPE_API_VERSION = "2026-10-28.endive" as const;

/** Reported to Stripe with every request (`appInfo`), so support can attribute traffic to the plugin. */
export const STRIPE_APP_NAME = "emdash-stripe-commerce";

/** Per-request timeout; `maxNetworkRetries` re-sends idempotently on connection errors and 409/429/5xx. */
export const STRIPE_TIMEOUT_MS = 20_000;
export const STRIPE_MAX_NETWORK_RETRIES = 2;

/** Stripe's documented metadata limits (https://docs.stripe.com/metadata). */
export const STRIPE_METADATA_LIMITS = {
	maxKeys: 50,
	maxKeyLength: 40,
	maxValueLength: 500,
} as const;

/** Stripe accepts 30 minutes to 24 hours for `expires_at`; verified against the API (400 below 30 minutes). */
export const CHECKOUT_MIN_LIFETIME_SECONDS = 30 * 60;
export const CHECKOUT_MAX_LIFETIME_SECONDS = 24 * 60 * 60;

/** `events.list` accepts at most 20 values in `types` (verified against the API). */
export const EVENT_LIST_MAX_TYPES = 20;

/** Stripe's maximum page size for list calls. */
export const STRIPE_PAGE_LIMIT = 100;

export const KEY_PREFIX = {
	secretLive: "sk_live_",
	secretTest: "sk_test_",
	restrictedLive: "rk_live_",
	restrictedTest: "rk_test_",
} as const;

/** Metadata keys the adapter writes beyond the shared `PROVIDER_METADATA`. */
export const ADAPTER_METADATA = {
	refundRecordId: "emdash_refund_id",
	customerRecordId: "emdash_customer_id",
} as const;

/** Value of `emdash_plugin` metadata on every object the plugin creates. */
export const PLUGIN_METADATA_VALUE = "stripe-commerce" as const;

/** Extension metadata is stored under this prefix so it can never shadow a plugin key. */
export const EXTENSION_METADATA_PREFIX = "ext_" as const;
