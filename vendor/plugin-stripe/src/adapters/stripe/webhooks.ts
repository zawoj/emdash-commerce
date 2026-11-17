import Stripe from "stripe";

import { WebhookSignatureError, type WebhookEndpointInfo, type WebhooksProvider } from "../../ports/payment-provider.js";
import { getCryptoProvider, type StripeProviderConfig } from "./client.js";
import { EVENT_LIST_MAX_TYPES, STRIPE_API_VERSION, STRIPE_PAGE_LIMIT } from "./constants.js";
import { callStripe, redactSecrets } from "./errors.js";
import { toEndpointInfo } from "./mappers/endpoint.js";
import { toProviderWebhookEvent, type WebhookEventOptions } from "./webhook-events.js";

type EnabledEvent = Stripe.WebhookEndpointCreateParams.EnabledEvent;

const chunk = <T>(items: readonly T[], size: number): T[][] => {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
	return chunks;
};

export const createWebhooksProvider = (
	getClient: () => Stripe,
	config: Pick<StripeProviderConfig, "webhookSecret"> & WebhookEventOptions,
): WebhooksProvider => ({
	/**
	 * Signature check on the exact raw body (HMAC-SHA256 via Web Crypto, with Stripe's 5 minute timestamp
	 * tolerance). Uses the static `Stripe.webhooks` so verification works before an API key is configured.
	 */
	async verifyAndParse(rawBody, signature) {
		if (!config.webhookSecret) throw new WebhookSignatureError("Webhook signing secret is not configured");
		if (!signature) throw new WebhookSignatureError("Missing Stripe-Signature header");
		let event: Stripe.Event;
		try {
			event = await Stripe.webhooks.constructEventAsync(rawBody, signature, config.webhookSecret, undefined, getCryptoProvider());
		} catch (error) {
			const reason = error instanceof Error ? redactSecrets(error.message) : "verification failed";
			throw new WebhookSignatureError(`Invalid webhook signature: ${reason}`);
		}
		return toProviderWebhookEvent(event, config);
	},

	/**
	 * Events newer than `createdAfter`, oldest first. `events.list` takes at most 20 `types` per call, so the
	 * filter is split; each slice is paged to the end and the union is ordered by creation time. Stripe keeps
	 * events for 30 days, which bounds how far back reconciliation can reach.
	 */
	async *listEventsSince(createdAfter, types) {
		const seen = new Set<string>();
		const collected: Stripe.Event[] = [];
		for (const slice of chunk([...new Set(types)], EVENT_LIST_MAX_TYPES)) {
			const page = await callStripe("events list", async () => {
				const events: Stripe.Event[] = [];
				for await (const event of getClient().events.list({ created: { gt: createdAfter }, types: slice, limit: STRIPE_PAGE_LIMIT })) {
					events.push(event);
				}
				return events;
			});
			// Stripe lists newest first; reversing keeps same-second events in delivery order after the stable sort.
			for (const event of page.reverse()) {
				if (seen.has(event.id)) continue;
				seen.add(event.id);
				collected.push(event);
			}
		}
		collected.sort((a, b) => a.created - b.created);
		for (const event of collected) yield toProviderWebhookEvent(event, config);
	},

	async listEndpoints() {
		const endpoints = await callStripe("webhook endpoints list", () =>
			getClient().webhookEndpoints.list({ limit: STRIPE_PAGE_LIMIT }).autoPagingToArray({ limit: STRIPE_PAGE_LIMIT }),
		);
		return endpoints.map(toEndpointInfo);
	},

	/** `api_version` pins the payload shape to the one the mappers are written for, whatever the account default is. */
	async createEndpoint(input, idempotencyKey): Promise<WebhookEndpointInfo & { secret: string | null }> {
		const endpoint = await callStripe("webhook endpoint create", () =>
			getClient().webhookEndpoints.create(
				{ url: input.url, enabled_events: [...input.events] as EnabledEvent[], api_version: STRIPE_API_VERSION },
				{ idempotencyKey },
			),
		);
		return { ...toEndpointInfo(endpoint), secret: endpoint.secret ?? null };
	},

	async updateEndpoint(endpointId, input) {
		const endpoint = await callStripe("webhook endpoint update", () =>
			getClient().webhookEndpoints.update(endpointId, { enabled_events: [...input.events] as EnabledEvent[] }),
		);
		return toEndpointInfo(endpoint);
	},
});
