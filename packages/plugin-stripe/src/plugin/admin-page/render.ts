import type { AdminPageData } from "../../services/admin/page-data.js";
import { KEY_MODE, WEBHOOK_HEALTH, type Counter, type WebhookHealth } from "../../services/admin/status.js";
import { formatAmount } from "../../services/emails/html.js";
import { ACTION } from "./schema.js";
import type { Block, ButtonElement } from "./types.js";

/** Pure rendering of the Commerce page: data in, Block Kit out. Strings are plain text (the host escapes them). */

const WEBHOOK_MESSAGE: Record<WebhookHealth, { text: string; variant: "default" | "alert" | "error" | null }> = {
	[WEBHOOK_HEALTH.ok]: { text: "Webhook endpoint registered and the signing secret is stored.", variant: null },
	[WEBHOOK_HEALTH.missingKey]: { text: "No Stripe key is configured. Set it in the plugin settings or STRIPE_SECRET_KEY.", variant: "error" },
	[WEBHOOK_HEALTH.missingSecret]: { text: "The endpoint exists but no signing secret is stored, so Stripe's events are rejected. Copy the secret from the Stripe dashboard into the plugin settings.", variant: "error" },
	[WEBHOOK_HEALTH.notRegistered]: { text: "This site's webhook endpoint is not registered in Stripe. Use Register webhook.", variant: "alert" },
	[WEBHOOK_HEALTH.eventsOutdated]: { text: "The endpoint does not listen to every event the plugin handles. Use Register webhook to update it.", variant: "alert" },
	[WEBHOOK_HEALTH.disabled]: { text: "The webhook endpoint is disabled in Stripe.", variant: "error" },
	[WEBHOOK_HEALTH.unknown]: { text: "Webhook health could not be determined (Stripe unreachable or the key lacks permissions).", variant: "alert" },
};

const countLabel = (counter: Counter): string => (counter.isCapped ? `${counter.count}+` : String(counter.count));

const button = (action_id: string, label: string, options: Partial<ButtonElement> = {}): ButtonElement => ({ type: "button", action_id, label, ...options });

const orderRows = (data: AdminPageData) =>
	data.status.recentOrders.map((order) => ({
		number: order.orderNumber,
		orderStatus: order.orderStatus,
		payment: order.paymentStatus,
		fulfillment: order.fulfillmentStatus,
		email: order.email,
		total: formatAmount(order.total, order.currency),
		placed: order.placedAt,
		review: order.hasReviewFlags ? "needs review" : "",
	}));

const eventRows = (data: AdminPageData) =>
	data.failedEvents.map((event) => ({
		type: event.type,
		status: event.status,
		attempts: event.attempts,
		error: event.lastError ?? "",
		received: event.receivedAt,
		replay: button(ACTION.replayEvent, "Replay", {
			value: event.eventId,
			style: "secondary",
			confirm: { title: "Replay this event?", text: `Runs ${event.type} again. Handlers are idempotent, but its effects are applied again.`, confirm: "Replay", deny: "Cancel" },
		}),
	}));

const linkRows = (data: AdminPageData) =>
	data.failedLinks.map((link) => ({
		entity: link.entityKey,
		attempts: link.attempts,
		error: link.lastError ?? "",
		resync: button(ACTION.resyncEntity, "Resync", { value: link.entityKey, style: "secondary" }),
	}));

export const renderAdminPage = (data: AdminPageData): Block[] => {
	const { status } = data;
	const blocks: Block[] = [{ type: "header", text: `Commerce - ${status.storeName}` }];

	if (status.stripe.mode === KEY_MODE.live) {
		blocks.push({ type: "banner", variant: "alert", title: "LIVE mode", description: "Actions on this page affect real customers and real money." });
	}
	const webhook = WEBHOOK_MESSAGE[status.webhook.health];
	if (webhook.variant) blocks.push({ type: "banner", variant: webhook.variant, title: "Webhook", description: webhook.text });
	if (status.stripe.accountError) blocks.push({ type: "banner", variant: "alert", title: "Stripe", description: status.stripe.accountError });

	blocks.push({
		type: "fields",
		fields: [
			{ label: "Mode", value: status.stripe.mode.toUpperCase() },
			{ label: "Stripe key", value: status.stripe.isKeyPresent ? `configured (ends ${status.stripe.keyLast4 ?? "????"})` : "missing" },
			{ label: "Account", value: status.stripe.account?.displayName ?? status.stripe.account?.accountId ?? "unknown" },
			{ label: "API version", value: status.stripe.apiVersion ?? "unknown" },
			{ label: "Webhook", value: status.webhook.health },
			{ label: "Webhook URL", value: status.webhook.url },
		],
	});

	blocks.push({
		type: "actions",
		elements: [
			button(ACTION.registerWebhook, "Register webhook", { style: "primary" }),
			button(ACTION.reconcile, "Reconcile now", {
				confirm: { title: "Reconcile with Stripe?", text: "Lists recent Stripe events and processes the ones this site missed.", confirm: "Reconcile", deny: "Cancel" },
			}),
			button(ACTION.resyncCatalog, "Resync catalog"),
			button(ACTION.sweepCheckouts, "Clean up abandoned checkouts", {
				confirm: { title: "Clean up abandoned checkouts?", text: "Expires unpaid checkout sessions and removes their leftover records once the retention period has passed. Paid orders are never touched.", confirm: "Clean up", deny: "Cancel" },
			}),
			button(ACTION.refresh, "Refresh"),
		],
	});

	const { counters } = status;
	blocks.push({
		type: "stats",
		items: [
			{ label: "Failed webhook events", value: countLabel(counters.inboxFailed), trend: counters.inboxFailed.count > 0 ? "down" : "neutral" },
			{ label: "Dead webhook events", value: countLabel(counters.inboxDead), trend: counters.inboxDead.count > 0 ? "down" : "neutral" },
			{ label: "Dead outbox events", value: countLabel(counters.outboxDead), trend: counters.outboxDead.count > 0 ? "down" : "neutral" },
			{ label: "Failed catalog syncs", value: countLabel(counters.catalogLinksFailed), trend: counters.catalogLinksFailed.count > 0 ? "down" : "neutral" },
			{ label: "Held stock reservations", value: countLabel(counters.heldReservations) },
			{ label: "Low-stock items", value: countLabel(counters.lowStock), trend: counters.lowStock.count > 0 ? "down" : "neutral" },
		],
	});

	blocks.push(
		{ type: "header", text: "Recent orders" },
		{
			type: "table",
			page_action_id: ACTION.refresh,
			empty_text: "No orders yet.",
			columns: [
				{ key: "number", label: "Order", format: "code" },
				{ key: "orderStatus", label: "Order", format: "badge" },
				{ key: "payment", label: "Payment", format: "badge" },
				{ key: "fulfillment", label: "Fulfillment", format: "badge" },
				{ key: "email", label: "Email" },
				{ key: "total", label: "Total" },
				{ key: "placed", label: "Placed", format: "relative_time" },
				{ key: "review", label: "Review" },
			],
			rows: orderRows(data),
		},
		{ type: "header", text: "Failed webhook events" },
		{
			type: "table",
			page_action_id: ACTION.refresh,
			empty_text: "No failed or dead events.",
			columns: [
				{ key: "type", label: "Event", format: "code" },
				{ key: "status", label: "Status", format: "badge" },
				{ key: "attempts", label: "Attempts", format: "number" },
				{ key: "error", label: "Last error" },
				{ key: "received", label: "Received", format: "relative_time" },
				{ key: "replay", label: "", format: "element" },
			],
			rows: eventRows(data),
		},
		{ type: "header", text: "Failed catalog syncs" },
		{
			type: "table",
			page_action_id: ACTION.refresh,
			empty_text: "Every catalog entity is in sync.",
			columns: [
				{ key: "entity", label: "Entity", format: "code" },
				{ key: "attempts", label: "Attempts", format: "number" },
				{ key: "error", label: "Last error" },
				{ key: "resync", label: "", format: "element" },
			],
			rows: linkRows(data),
		},
		{ type: "header", text: "Low stock" },
		{
			type: "table",
			page_action_id: ACTION.refresh,
			empty_text: "No tracked item is at or below the low-stock threshold.",
			columns: [
				{ key: "item", label: "Item" },
				{ key: "available", label: "Available", format: "number" },
				{ key: "onHand", label: "On hand", format: "number" },
			],
			rows: status.lowStock.map((entry) => ({ item: entry.title, available: entry.available, onHand: entry.onHand })),
		},
		{ type: "context", text: "Stock of a product without variants is changed with the inventory adjust tool, not in the content editor." },
	);
	return blocks;
};
