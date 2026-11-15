import { z } from "zod";

import { ROUTE } from "../../contracts/api.js";
import { CommerceError } from "../../core/errors.js";
import { WebhookSignatureError } from "../../ports/payment-provider.js";
import { INBOX_OUTCOME, processInboxEvent, serializeEvent } from "../../services/webhook-inbox.js";
import type { CommerceContainer } from "../container.js";
import type { RouteModule } from "../route-builder.js";

/** Stripe's own header; the only one the route declares. */
export const SIGNATURE_HEADER = "stripe-signature";

export interface WebhookAnswer {
	received: true;
	duplicate?: true;
	ignored?: true;
}

/**
 * Status codes are the contract with Stripe, which retries any non-2xx for up to three days:
 * - 503 no signing secret configured yet (Stripe retries until it is);
 * - 400 the signature does not verify (an attacker or a wrong secret; retrying cannot help);
 * - 200 `duplicate` the event was already handled, or is held by another worker;
 * - 500 handling failed: the event is stored with backoff for the cron retry and Stripe retries too;
 * - 200 otherwise (including events that are ignored on purpose).
 */
export const receiveWebhook = async (container: CommerceContainer, rawBody: string, signature: string | null): Promise<WebhookAnswer> => {
	const secrets = await container.secrets();
	if (!secrets.stripeWebhookSecret) {
		throw new CommerceError("notConfigured", "The Stripe webhook signing secret is not configured.");
	}
	const provider = await container.provider();
	let event;
	try {
		event = await provider.webhooks.verifyAndParse(rawBody, signature);
	} catch (error) {
		if (error instanceof WebhookSignatureError || (error instanceof Error && error.name === "WebhookSignatureError")) {
			throw new CommerceError("invalidSignature", "The webhook signature is invalid.");
		}
		throw error;
	}

	const { isNew, record } = await container.inbox.record(event, serializeEvent(event), "webhook");
	if (!isNew && (record.status === "processed" || record.status === "ignored" || record.status === "dead")) {
		return { received: true, duplicate: true };
	}

	const result = await processInboxEvent(container, event.eventId, "webhook");
	if (result.outcome === INBOX_OUTCOME.busy || result.outcome === INBOX_OUTCOME.duplicate) return { received: true, duplicate: true };
	if (result.outcome === INBOX_OUTCOME.failed || result.outcome === INBOX_OUTCOME.dead || result.outcome === INBOX_OUTCOME.missing) {
		throw new CommerceError("internal", "The event could not be processed and will be retried.");
	}
	// Only a handled event advances the reconciliation cursor: it is a promise that nothing before it is missing.
	await container.inbox.setCursor(event.created);
	return result.outcome === INBOX_OUTCOME.ignored ? { received: true, ignored: true } : { received: true };
};

export const webhookRoutes: RouteModule = (builder) => ({
	[ROUTE.webhook]: builder.publicRoute({
		methods: ["POST"],
		// The signature is computed over the exact bytes, so the body is read as text, never parsed first.
		request: { body: "text", headers: [SIGNATURE_HEADER] },
		schema: z.string(),
		handler: ({ ctx, container, input }) => receiveWebhook(container, input, ctx.request.headers.get(SIGNATURE_HEADER)),
	}),
});

