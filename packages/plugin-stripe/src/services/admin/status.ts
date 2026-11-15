import { WEBHOOK_EVENT_TYPES } from "../../adapters/stripe/webhook-events.js";
import { sellableKey, type SellableRef } from "../../core/catalog.js";
import type { Order } from "../../core/order.js";
import type { CommerceContainer } from "../../plugin/container.js";
import type { ProviderAccountInfo, WebhookEndpointInfo } from "../../ports/payment-provider.js";
import { RECENT_ORDERS_LIMIT } from "./constants.js";
import { loadPolicies } from "../inventory/policy.js";
import { errorMessage } from "../payments/async.js";
import { toOrderSummary, type OrderSummary } from "./orders.js";

/**
 * The configuration-health and queue-depth overview behind `admin/status` and the Commerce admin page.
 * It never returns a secret: only booleans, the mode derived from the key prefix, and the last four
 * characters of the Stripe key (enough to tell two keys apart, useless to an attacker).
 */

export const KEY_MODE = { test: "test", live: "live", unknown: "unknown" } as const;
export type KeyMode = (typeof KEY_MODE)[keyof typeof KEY_MODE];

export const WEBHOOK_HEALTH = {
	/** A secret is stored and an enabled endpoint for this site covers every event the plugin handles. */
	ok: "ok",
	missingKey: "missing_key",
	missingSecret: "missing_secret",
	notRegistered: "not_registered",
	eventsOutdated: "events_outdated",
	disabled: "disabled",
	/** The provider could not be asked (network, permissions). */
	unknown: "unknown",
} as const;
export type WebhookHealth = (typeof WEBHOOK_HEALTH)[keyof typeof WEBHOOK_HEALTH];

export interface Counter {
	count: number;
	/** True when the count stopped at the scan limit: there are at least `count`. */
	isCapped: boolean;
}

export interface LowStockEntry {
	sellable: SellableRef;
	title: string;
	available: number;
	onHand: number;
}

export interface AdminStatus {
	storeName: string;
	stripe: {
		isKeyPresent: boolean;
		keyLast4: string | null;
		mode: KeyMode;
		keyKind: ProviderAccountInfo["keyKind"] | null;
		apiVersion: string | null;
		account: { accountId: string; displayName: string | null; isLivemode: boolean } | null;
		accountError: string | null;
	};
	webhook: {
		health: WebhookHealth;
		isSecretPresent: boolean;
		url: string;
		endpoint: { endpointId: string; status: string; enabledEventCount: number } | null;
		missingEvents: string[];
		error: string | null;
		cursor: number | null;
	};
	counters: {
		inboxFailed: Counter;
		inboxDead: Counter;
		outboxDead: Counter;
		catalogLinksFailed: Counter;
		heldReservations: Counter;
		lowStock: Counter;
	};
	lowStock: LowStockEntry[];
	recentOrders: OrderSummary[];
}

const SCAN_LIMIT = 100;
/** Past every real expiry: lists all held reservations, oldest first (the store only filters by an upper bound). */
const FAR_FUTURE = "9999-12-31T23:59:59.999Z";

const counter = (count: number, isCapped: boolean): Counter => ({ count, isCapped });
const counterOf = (items: readonly unknown[], isMore = items.length >= SCAN_LIMIT): Counter => counter(items.length, isMore);

export const keyModeOf = (key: string | null): KeyMode => {
	if (!key) return KEY_MODE.unknown;
	if (/^[a-z]{2}_live_/.test(key)) return KEY_MODE.live;
	if (/^[a-z]{2}_test_/.test(key)) return KEY_MODE.test;
	return KEY_MODE.unknown;
};

export const last4Of = (key: string | null): string | null => (key && key.length >= 8 ? key.slice(-4) : null);

const isWildcard = (endpoint: WebhookEndpointInfo): boolean => endpoint.enabledEvents.includes("*");

export const missingEventsOf = (endpoint: WebhookEndpointInfo): string[] =>
	isWildcard(endpoint) ? [] : WEBHOOK_EVENT_TYPES.filter((type) => !endpoint.enabledEvents.includes(type));

interface WebhookProbe {
	health: WebhookHealth;
	endpoint: AdminStatus["webhook"]["endpoint"];
	missingEvents: string[];
	error: string | null;
}

const probeWebhook = async (
	container: CommerceContainer,
	provider: Awaited<ReturnType<CommerceContainer["provider"]>>,
	webhookUrl: string,
	isSecretPresent: boolean,
): Promise<WebhookProbe> => {
	try {
		const endpoints = await provider.webhooks.listEndpoints();
		const endpoint = endpoints.find((candidate) => candidate.url === webhookUrl);
		if (!endpoint) return { health: WEBHOOK_HEALTH.notRegistered, endpoint: null, missingEvents: [], error: null };
		const missingEvents = missingEventsOf(endpoint);
		const summary = { endpointId: endpoint.endpointId, status: endpoint.status, enabledEventCount: endpoint.enabledEvents.length };
		let health: WebhookHealth = WEBHOOK_HEALTH.ok;
		if (endpoint.status !== "enabled") health = WEBHOOK_HEALTH.disabled;
		else if (missingEvents.length > 0) health = WEBHOOK_HEALTH.eventsOutdated;
		else if (!isSecretPresent) health = WEBHOOK_HEALTH.missingSecret;
		return { health, endpoint: summary, missingEvents, error: null };
	} catch (error) {
		container.log.warn("Webhook endpoints could not be listed", { error: errorMessage(error) });
		return { health: WEBHOOK_HEALTH.unknown, endpoint: null, missingEvents: [], error: "The payment provider could not list webhook endpoints." };
	}
};

const lowStockOf = async (container: CommerceContainer): Promise<{ entries: LowStockEntry[]; isCapped: boolean }> => {
	const threshold = container.options.inventory.lowStockThreshold;
	const page = await container.catalog.listProducts(null, SCAN_LIMIT);
	const sellables: Array<{ ref: SellableRef; title: string }> = [];
	for (const product of page.items) {
		if (!product.hasVariants) {
			sellables.push({ ref: { kind: "product", id: product.id }, title: product.title });
			continue;
		}
		for (const variant of await container.catalog.listVariants(product.id)) {
			if (variant.isActive) sellables.push({ ref: { kind: "variant", id: variant.id }, title: `${product.title} / ${variant.title}` });
		}
	}
	const refs = sellables.map((entry) => entry.ref);
	const [policies, levels] = await Promise.all([loadPolicies(container, refs), container.inventory.getMany(refs)]);
	const entries: LowStockEntry[] = [];
	for (const { ref, title } of sellables) {
		const key = sellableKey(ref);
		if (!policies.get(key)?.isTracked) continue;
		const level = levels.get(key);
		const available = level?.available ?? 0;
		if (available <= threshold) entries.push({ sellable: ref, title, available, onHand: level?.onHand ?? 0 });
	}
	entries.sort((a, b) => a.available - b.available);
	return { entries, isCapped: page.cursor !== null };
};

/** Each probe is isolated: a failing counter must not blank the whole status page. */
const safely = async <T>(container: CommerceContainer, what: string, fallback: T, run: () => Promise<T>): Promise<T> => {
	try {
		return await run();
	} catch (error) {
		container.log.warn(`Admin status: ${what} failed`, { error: errorMessage(error) });
		return fallback;
	}
};

export const getAdminStatus = async (container: CommerceContainer, input: { webhookUrl: string }): Promise<AdminStatus> => {
	const secrets = await container.secrets();
	const isKeyPresent = Boolean(secrets.stripeSecretKey);
	const isSecretPresent = Boolean(secrets.stripeWebhookSecret);

	let apiVersion: string | null = null;
	let keyKind: ProviderAccountInfo["keyKind"] | null = null;
	let account: AdminStatus["stripe"]["account"] = null;
	let accountError: string | null = null;
	let webhook: WebhookProbe = {
		health: isKeyPresent ? WEBHOOK_HEALTH.unknown : WEBHOOK_HEALTH.missingKey,
		endpoint: null,
		missingEvents: [],
		error: null,
	};

	if (isKeyPresent) {
		try {
			const provider = await container.provider();
			try {
				const info = await provider.describeAccount();
				apiVersion = info.apiVersion;
				keyKind = info.keyKind;
				account = { accountId: info.accountId, displayName: info.displayName, isLivemode: info.isLivemode };
			} catch (error) {
				container.log.warn("Stripe account could not be described", { error: errorMessage(error) });
				accountError = "The payment provider rejected the account lookup; check the key's permissions.";
			}
			webhook = await probeWebhook(container, provider, input.webhookUrl, isSecretPresent);
		} catch (error) {
			container.log.warn("Payment provider unavailable for the status page", { error: errorMessage(error) });
			accountError = "The payment provider could not be reached.";
		}
	}

	const [inboxFailed, inboxDead, outboxDead, links, held, lowStock, recent, cursor] = await Promise.all([
		safely(container, "failed inbox events", { items: [], cursor: null }, () => container.inbox.listByStatus("failed", SCAN_LIMIT, null)),
		safely(container, "dead inbox events", { items: [], cursor: null }, () => container.inbox.listByStatus("dead", SCAN_LIMIT, null)),
		safely(container, "dead outbox events", [], () => container.outbox.listDead(SCAN_LIMIT)),
		safely(container, "failed catalog links", [], () => container.catalogLinks.listFailed(SCAN_LIMIT)),
		safely(container, "held reservations", [], () => container.inventory.listExpiredReservations(FAR_FUTURE, SCAN_LIMIT)),
		safely(container, "low stock", { entries: [], isCapped: false }, () => lowStockOf(container)),
		safely(container, "recent orders", { items: [] as Order[], cursor: null }, () => container.orders.list({ cursor: null, limit: RECENT_ORDERS_LIMIT })),
		safely(container, "webhook cursor", null, () => container.inbox.getCursor()),
	]);

	return {
		storeName: container.options.storeName,
		stripe: {
			isKeyPresent,
			keyLast4: last4Of(secrets.stripeSecretKey),
			mode: keyModeOf(secrets.stripeSecretKey),
			keyKind,
			apiVersion,
			account,
			accountError,
		},
		webhook: { ...webhook, isSecretPresent, url: input.webhookUrl, cursor },
		counters: {
			inboxFailed: counter(inboxFailed.items.length, inboxFailed.cursor !== null),
			inboxDead: counter(inboxDead.items.length, inboxDead.cursor !== null),
			outboxDead: counterOf(outboxDead),
			catalogLinksFailed: counterOf(links),
			heldReservations: counterOf(held),
			lowStock: counter(lowStock.entries.length, lowStock.isCapped),
		},
		lowStock: lowStock.entries.slice(0, 20),
		recentOrders: recent.items.map(toOrderSummary),
	};
};
