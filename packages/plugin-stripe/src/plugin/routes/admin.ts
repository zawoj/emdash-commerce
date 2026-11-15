import type { PluginRoute, RouteContext } from "emdash";
import { z } from "zod";

import { PLUGIN_ID } from "../../adapters/emdash/constants.js";
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
} from "../../contracts/api.js";
import { SETTINGS_KEY } from "../../contracts/options.js";
import {
	addOrderNote,
	adjustInventory,
	cancelOrderSubscription,
	createAdminContext,
	getAdminStatus,
	getInventory,
	getOrderDetail,
	listOrders,
	listWebhookEvents,
	performOrderAction,
	reconcileNow,
	refundOrder,
	registerWebhook,
	replayWebhookEvent,
	resyncCatalog,
	retryOutboxEvent,
	setFulfillment,
} from "../../services/admin/index.js";
import { listOrderEvents } from "../../services/order-events.js";
import { ensureCronScheduled, getCronInfo } from "../cron.js";
import { handleAdminPage, blockInteractionSchema } from "../admin-page/index.js";
import type { RouteBuilder, RouteModule } from "../route-builder.js";

type Permission = NonNullable<PluginRoute["permission"]>;

/**
 * Two levels, both from the core permission table (`@emdash-cms/auth` rbac.ts):
 * - `read` = `content:edit_any` (EDITOR): looking at orders, stock, queue state. Editors already manage the
 *   content these records live in.
 * - `manage` = `plugins:manage` (ADMIN): anything that moves money or changes system state (refunds,
 *   cancelling subscriptions, webhook setup and replay, reconciliation, catalog resync, stock adjustment,
 *   fulfilment). The admin page itself is `manage`: it carries those buttons.
 */
export const PERMISSION = { read: "content:edit_any", manage: "plugins:manage" } as const satisfies Record<string, Permission>;

/** The URL Stripe delivers to: this site's own public webhook route. */
export const webhookUrlOf = (ctx: Pick<RouteContext, "url">): string => ctx.url(`/_emdash/api/plugins/${PLUGIN_ID}/${ROUTE.webhook}`);

const noInput = z.object({}).nullish();

const adminCtx = (invocation: { ctx: RouteContext; container: Parameters<typeof createAdminContext>[0] }) => createAdminContext(invocation.container);

const caller = (ctx: RouteContext) => (ctx.user ? { id: ctx.user.id, email: ctx.user.email } : null);

export const adminRoutes: RouteModule = (builder: RouteBuilder) => {
	const read = <TInput, TOutput>(config: Omit<Parameters<typeof builder.privateRoute<TInput, TOutput>>[0], "methods" | "permission">) =>
		builder.privateRoute<TInput, TOutput>({ methods: ["POST"], permission: PERMISSION.read, ...config });
	const manage = <TInput, TOutput>(config: Omit<Parameters<typeof builder.privateRoute<TInput, TOutput>>[0], "methods" | "permission">) =>
		builder.privateRoute<TInput, TOutput>({ methods: ["POST"], permission: PERMISSION.manage, ...config });

	return {
		[ROUTE.admin]: manage({
			schema: blockInteractionSchema,
			handler: (invocation) => handleAdminPage(invocation, webhookUrlOf(invocation.ctx)),
		}),

		[ROUTE.adminStatus]: read({
			schema: noInput,
			async handler(invocation) {
				const status = await getAdminStatus(invocation.container, { webhookUrl: webhookUrlOf(invocation.ctx) });
				// The first visit after an upgrade also repairs a missing schedule (there is no upgrade hook).
				await ensureCronScheduled(invocation.ctx);
				return { ...status, cron: await getCronInfo(invocation.ctx) };
			},
		}),
		[ROUTE.adminOrdersList]: read({ schema: adminOrdersListInput, handler: ({ container, input }) => listOrders(container, input) }),
		[ROUTE.adminOrdersGet]: read({ schema: adminOrdersGetInput, handler: ({ container, input }) => getOrderDetail(container, input) }),
		[ROUTE.adminOrdersEvents]: read({
			schema: adminOrdersEventsInput,
			handler: ({ container, input }) => listOrderEvents(container, input.orderId, { cursor: input.cursor, limit: input.limit }),
		}),
		[ROUTE.adminInventoryGet]: read({ schema: adminInventoryGetInput, handler: (invocation) => getInventory(adminCtx(invocation), invocation.input) }),
		[ROUTE.adminWebhooksList]: read({ schema: adminWebhooksListInput, handler: ({ container, input }) => listWebhookEvents(container, input) }),

		[ROUTE.adminOrdersRefund]: manage({
			schema: adminOrdersRefundInput,
			handler: (invocation) => refundOrder(adminCtx(invocation), invocation.input, caller(invocation.ctx)),
		}),
		[ROUTE.adminOrdersFulfillment]: manage({
			schema: adminOrdersFulfillmentInput,
			handler: (invocation) => setFulfillment(adminCtx(invocation), invocation.input, caller(invocation.ctx)),
		}),
		[ROUTE.adminOrdersAction]: manage({
			schema: adminOrdersActionInput,
			handler: (invocation) => performOrderAction(adminCtx(invocation), invocation.input, caller(invocation.ctx)),
		}),
		[ROUTE.adminOrdersNote]: manage({
			schema: adminOrdersNoteInput,
			handler: ({ container, ctx, input }) => addOrderNote(container, input, caller(ctx)),
		}),
		[ROUTE.adminSubscriptionsCancel]: manage({
			schema: adminSubscriptionsCancelInput,
			handler: (invocation) => cancelOrderSubscription(adminCtx(invocation), invocation.input),
		}),
		[ROUTE.adminInventoryAdjust]: manage({ schema: adminInventoryAdjustInput, handler: (invocation) => adjustInventory(adminCtx(invocation), invocation.input) }),
		[ROUTE.adminCatalogResync]: manage({ schema: adminCatalogResyncInput, handler: (invocation) => resyncCatalog(adminCtx(invocation), invocation.input) }),
		[ROUTE.adminWebhooksRegister]: manage({
			schema: noInput,
			handler: ({ ctx, container }) =>
				registerWebhook(container, { webhookUrl: webhookUrlOf(ctx), saveSecret: (secret) => ctx.settings.set(SETTINGS_KEY.stripeWebhookSecret, secret) }),
		}),
		[ROUTE.adminWebhooksReplay]: manage({ schema: adminWebhooksReplayInput, handler: ({ container, input }) => replayWebhookEvent(container, input) }),
		[ROUTE.adminReconcile]: manage({ schema: adminReconcileInput, handler: ({ container, input }) => reconcileNow(container, input) }),
		[ROUTE.adminOutboxRetry]: manage({ schema: adminOutboxRetryInput, handler: (invocation) => retryOutboxEvent(adminCtx(invocation), invocation.input) }),
	};
};
