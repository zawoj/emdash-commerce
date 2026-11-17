import type { z } from "zod";

import { WEBHOOK_EVENT_TYPES } from "../../adapters/stripe/webhook-events.js";
import type { adminCheckoutsSweepInput, adminOutboxRetryInput, adminReconcileInput, adminWebhooksListInput, adminWebhooksReplayInput } from "../../contracts/api.js";
import { CommerceError } from "../../core/errors.js";
import type { InboxRecord } from "../../ports/repositories.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { sweepCheckouts, type CheckoutSweepResult } from "../checkout-sweep.js";
import { reconcile, type ReconcileResult } from "../reconcile.js";
import { replayInboxEvent, type InboxResult } from "../webhook-inbox.js";
import type { AdminContext } from "./context.js";

/** An inbox record without its raw payload: the list is for diagnosis, and a payload can carry customer data. */
export type InboxEventSummary = Omit<InboxRecord, "payload">;

const withoutPayload = ({ payload: _payload, ...summary }: InboxRecord): InboxEventSummary => summary;

export const listWebhookEvents = async (container: CommerceContainer, input: z.infer<typeof adminWebhooksListInput>): Promise<{ items: InboxEventSummary[]; cursor: string | null }> => {
	const page = await container.inbox.listByStatus(input.status, input.limit, input.cursor);
	return { items: page.items.map(withoutPayload), cursor: page.cursor };
};

export const replayWebhookEvent = (container: CommerceContainer, input: z.infer<typeof adminWebhooksReplayInput>): Promise<InboxResult> =>
	replayInboxEvent(container, input.eventId);

export const reconcileNow = (container: CommerceContainer, input: z.infer<typeof adminReconcileInput>): Promise<ReconcileResult> =>
	reconcile(container, input.since === undefined ? {} : { since: input.since });

export const sweepAbandonedCheckouts = (container: CommerceContainer, input: z.infer<typeof adminCheckoutsSweepInput>): Promise<CheckoutSweepResult> =>
	sweepCheckouts(container, input.retentionHours === undefined ? {} : { retentionMs: input.retentionHours * 60 * 60 * 1000 });

export const retryOutboxEvent = async ({ publisher }: AdminContext, input: z.infer<typeof adminOutboxRetryInput>): Promise<{ eventId: string }> => {
	await publisher.retry(input.eventId);
	return { eventId: input.eventId };
};

const sha256Hex = async (value: string): Promise<string> => {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export interface RegisterWebhookResult {
	action: "created" | "updated";
	endpointId: string;
	url: string;
	enabledEventCount: number;
	/** True when the signing secret was stored in the plugin settings (creation only). */
	isSecretStored: boolean;
	message: string;
}

/**
 * Creates the webhook endpoint for this site (or updates its events when it already exists) and stores the
 * signing secret. Stripe returns the secret only when an endpoint is created, so an update cannot repair a
 * missing secret: the answer says so. The idempotency key covers the URL and the event list, which makes a
 * repeated click within Stripe's idempotency window (24 h) return the same endpoint and secret again, so a
 * failed secret write can be retried once the encryption key is configured.
 */
export const registerWebhook = async (
	container: CommerceContainer,
	input: { webhookUrl: string; saveSecret(secret: string): Promise<void> },
): Promise<RegisterWebhookResult> => {
	const provider = await container.provider();
	const events = [...WEBHOOK_EVENT_TYPES];
	const existing = (await provider.webhooks.listEndpoints()).find((endpoint) => endpoint.url === input.webhookUrl);

	if (existing) {
		// Keep events someone added in the Stripe dashboard (a site's `stripeWebhooks` extension may rely on them).
		const merged = [...new Set([...existing.enabledEvents, ...events])].sort();
		const updated = await provider.webhooks.updateEndpoint(existing.endpointId, { events: merged });
		const hasSecret = Boolean((await container.secrets()).stripeWebhookSecret);
		return {
			action: "updated",
			endpointId: updated.endpointId,
			url: updated.url,
			enabledEventCount: updated.enabledEvents.length,
			isSecretStored: false,
			message: hasSecret
				? "The endpoint already existed; its events were updated. The signing secret is unchanged."
				: "The endpoint already existed; its events were updated. Stripe does not return the signing secret again: copy it from the Stripe dashboard (Developers, Webhooks) into the plugin settings.",
		};
	}

	const key = `stripe-commerce:webhook:register:${(await sha256Hex(`${input.webhookUrl}\n${events.join(",")}`)).slice(0, 24)}`;
	const created = await provider.webhooks.createEndpoint({ url: input.webhookUrl, events }, key);
	if (!created.secret) {
		throw new CommerceError("providerError", "The endpoint was created but Stripe returned no signing secret. Copy it from the Stripe dashboard into the plugin settings.");
	}
	try {
		await input.saveSecret(created.secret);
	} catch (error) {
		container.log.error("The webhook signing secret could not be stored", { error: error instanceof Error ? error.message : "unknown" });
		throw new CommerceError(
			"notConfigured",
			"The webhook endpoint was created but its signing secret could not be stored (is EMDASH_ENCRYPTION_KEY set?). Register again within 24 hours to receive the secret again, or copy it from the Stripe dashboard.",
		);
	}
	return {
		action: "created",
		endpointId: created.endpointId,
		url: created.url,
		enabledEventCount: created.enabledEvents.length,
		isSecretStored: true,
		message: "The webhook endpoint was created and its signing secret stored.",
	};
};
