import type { PluginDefinition } from "emdash";
import { z } from "zod";

import {
	adminCatalogResyncInput,
	adminInventoryAdjustInput,
	adminInventoryGetInput,
	adminOrdersActionInput,
	adminOrdersEventsInput,
	adminOrdersFulfillmentInput,
	adminOrdersGetInput,
	adminOrdersListInput,
	adminOrdersNoteInput,
	adminOrdersRefundInput,
	adminOutboxRetryInput,
	adminReconcileInput,
	adminSubscriptionsCancelInput,
	adminWebhooksListInput,
	adminWebhooksReplayInput,
	ROUTE,
} from "../contracts/api.js";

/**
 * MCP tools: one per admin route, so an AI agent gets the same operations (and the same permission check, which
 * EmDash runs against the route's `permission`) as the admin UI. EmDash requires every tool route to be private,
 * POST and JSON, with a permission (define-plugin.ts, checked at `definePlugin`).
 *
 * Descriptions are written for the agent: what the tool does, what it costs, whether it moves money, and how
 * to repeat it safely. `destructive` marks calls that are hard or impossible to undo, so an MCP client asks the
 * human first.
 */

const noInput = z.object({});

interface ToolSpec {
	route: string;
	description: string;
	input: z.ZodType;
	destructive?: boolean;
}

export const MCP_TOOLS = {
	commerce_status: {
		route: ROUTE.adminStatus,
		description:
			"Read-only health overview of the Stripe commerce plugin: whether the Stripe key and webhook secret are configured, test or live mode, whether this site's webhook endpoint is registered for every event, counts of failed or dead webhook events, dead outbox events, failed catalog syncs, held stock reservations and low-stock items, plus the 10 most recent orders. Never returns secrets. Call this first when something looks wrong.",
		input: noInput,
	},
	commerce_orders_list: {
		route: ROUTE.adminOrdersList,
		description:
			"Read-only. Lists orders, newest first. An order has three status axes: orderStatus (lifecycle: open, completed, cancelled, archived), paymentStatus (pending, paid, failed, partially_refunded, refunded, disputed, dispute_lost, cancelled; driven by Stripe) and fulfillmentStatus (unfulfilled, partially_fulfilled, fulfilled, partially_returned, returned). Filter with `status` (payment status) and/or `orderStatus` (lifecycle). Returns a summary per order and a cursor for the next page.",
		input: adminOrdersListInput,
	},
	commerce_orders_get: {
		route: ROUTE.adminOrdersGet,
		description:
			"Read-only. Returns one order (by orderId or by its order number, e.g. ORD-2026-00042) with its lines, totals, payments, refunds, subscription and the latest timeline entries. Contains the buyer's email and addresses: treat as personal data.",
		input: adminOrdersGetInput,
	},
	commerce_orders_refund: {
		route: ROUTE.adminOrdersRefund,
		description:
			"MONEY: refunds a paid order through Stripe, fully (omit amount) or partially (amount in minor units, e.g. 1999 = 19.99). Bounded by what is still refundable. Safe to repeat: use a fresh unique requestId (8 to 64 characters) per intended refund and reuse the SAME requestId when retrying after a timeout, so the customer is never refunded twice. restock=true puts stock back (full refunds only). Cannot be undone.",
		input: adminOrdersRefundInput,
		destructive: true,
	},
	commerce_orders_events: {
		route: ROUTE.adminOrdersEvents,
		description: "Read-only. Pages through an order's timeline (status changes, refunds, disputes, emails, notes), newest first.",
		input: adminOrdersEventsInput,
	},
	commerce_orders_fulfillment: {
		route: ROUTE.adminOrdersFulfillment,
		description:
			"Sets an order's fulfillment status (unfulfilled, partially_fulfilled, fulfilled, partially_returned, returned). No money moves and no email is sent. Idempotent: setting the current value changes nothing. Refused for an archived order, and a cancelled order cannot be fulfilled.",
		input: adminOrdersFulfillmentInput,
	},
	commerce_orders_action: {
		route: ROUTE.adminOrdersAction,
		description:
			"Moves an order along its lifecycle (orderStatus): complete (needs payment paid and fulfillment fulfilled), cancel (refused while the order holds money: refund it first), archive (completed or cancelled orders only) or reopen. No money moves. Not repeatable: an action the current status does not allow is refused with a reason.",
		input: adminOrdersActionInput,
	},
	commerce_orders_note: {
		route: ROUTE.adminOrdersNote,
		description: "Adds an internal note to an order's timeline. NOT idempotent: repeating it adds another note.",
		input: adminOrdersNoteInput,
	},
	commerce_subscriptions_cancel: {
		route: ROUTE.adminSubscriptionsCancel,
		description:
			"MONEY: cancels a subscription (use the plugin's subscription id, not Stripe's). atPeriodEnd=true (default) keeps access until the paid period ends; atPeriodEnd=false cancels immediately and cannot be undone. Safe to repeat: cancelling an already cancelled subscription changes nothing.",
		input: adminSubscriptionsCancelInput,
		destructive: true,
	},
	commerce_inventory_get: {
		route: ROUTE.adminInventoryGet,
		description: "Read-only. Stock of a product (without variants) or a variant: on hand, reserved by open checkouts, available, and the open reservations holding stock.",
		input: adminInventoryGetInput,
	},
	commerce_inventory_adjust: {
		route: ROUTE.adminInventoryAdjust,
		description:
			"Changes stock by a signed delta (positive adds, negative removes; never below zero) with a reason for the audit trail. This is the only way to change stock of a product without variants. NOT idempotent: repeating it applies the delta again, so check commerce_inventory_get before retrying.",
		input: adminInventoryAdjustInput,
		destructive: true,
	},
	commerce_catalog_resync: {
		route: ROUTE.adminCatalogResync,
		description: "Queues products, variants and prices for synchronisation to Stripe (one product by productId, or the whole catalog when omitted). The maintenance task performs the syncs within minutes. Safe to repeat.",
		input: adminCatalogResyncInput,
	},
	commerce_webhooks_register: {
		route: ROUTE.adminWebhooksRegister,
		description:
			"Registers this site's Stripe webhook endpoint for every event the plugin handles and stores the signing secret in the plugin settings. If the endpoint already exists its event list is updated instead (the secret cannot be read back from Stripe then). Safe to repeat.",
		input: noInput,
	},
	commerce_webhooks_list: {
		route: ROUTE.adminWebhooksList,
		description: "Read-only. Lists stored Stripe webhook events by processing status (default failed; also received, processing, processed, dead, ignored) with attempts and last error. Payloads are not included.",
		input: adminWebhooksListInput,
	},
	commerce_webhooks_replay: {
		route: ROUTE.adminWebhooksReplay,
		description:
			"Runs a stored webhook event again from the start, whatever state it ended in (failed or dead events are the usual target). Handlers are idempotent, but replaying re-applies the event's effects (orders, refunds, stock), so inspect the event with commerce_webhooks_list first.",
		input: adminWebhooksReplayInput,
		destructive: true,
	},
	commerce_reconcile: {
		route: ROUTE.adminReconcile,
		description:
			"Asks Stripe for recent events (since the last one seen, or an epoch-seconds 'since') and processes the ones the webhook endpoint missed. Bounded per call (100 new events); run it again if the result says it was truncated. It applies payment effects (orders paid, refunds) for events that were missed.",
		input: adminReconcileInput,
		destructive: true,
	},
	commerce_outbox_retry: {
		route: ROUTE.adminOutboxRetry,
		description: "Retries the undelivered subscriber deliveries of a domain event (for example a failed email or extension) by event id. Subscribers that already received it are not called again.",
		input: adminOutboxRetryInput,
	},
} as const satisfies Record<string, ToolSpec>;

export const mcpConfig: NonNullable<PluginDefinition["mcp"]> = {
	tools: Object.fromEntries(
		Object.entries(MCP_TOOLS as Record<string, ToolSpec>).map(([name, tool]) => [
			name,
			{ description: tool.description, route: tool.route, input: tool.input, ...(tool.destructive ? { destructive: true } : {}) },
		]),
	),
};
