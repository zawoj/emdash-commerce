import type { PluginEditorPanel } from "emdash";

import { ROUTE, adminOrdersActionInput } from "../../contracts/api.js";
import type { CommerceOptions } from "../../contracts/options.js";
import { CommerceError, isCommerceError } from "../../core/errors.js";
import { FULFILLMENT_STATUS, type FulfillmentStatus } from "../../core/order.js";
import { ProviderError } from "../../ports/payment-provider.js";
import { addOrderNote, performOrderAction, setFulfillment } from "../../services/admin/index.js";
import { createAdminContext } from "../../services/admin/context.js";
import { listOrderEvents } from "../../services/order-events.js";
import type { RouteInvocation } from "../http.js";
import type { RouteModule } from "../route-builder.js";
import { editorPanelInteractionSchema, type EditorPanelInteraction } from "./blocks.js";
import { ACTION_OF_PANEL_ID, PANEL_ACTION, renderOrderTimeline, type TimelineResponse } from "./order-timeline-render.js";

/**
 * The order "Timeline" editor panel: status axes, the allowed lifecycle actions, a fulfillment control, a note form
 * and the order's event log (newest first). A Block Kit panel route (no React entry); EmDash posts `panel_load`,
 * `block_action` and `form_submit` here and renders the blocks that come back.
 *
 * The route is `content:edit_any` (an editor can read the timeline), and every mutation additionally requires the
 * administrator role (`plugins:manage`, the permission of the matching admin routes): a panel route has one
 * permission, so the stricter check happens here against the caller EmDash attests.
 */

export const ORDER_TIMELINE_PANEL_ID = "order-timeline" as const;

/** `Role.ADMIN` of `@emdash-cms/auth` (rbac.ts: `plugins:manage` is `Role.ADMIN`); the plugin does not import the auth package. */
const ADMIN_ROLE_LEVEL = 50;

const PAGE_SIZE = 25;

/** The panel declaration, scoped to the configured orders collection (composed by `buildEditorPanels` in ./index.ts). */
export const orderEditorPanels = (slugs: CommerceOptions["collections"]): PluginEditorPanel[] => [
	{ id: ORDER_TIMELINE_PANEL_ID, title: "Timeline", route: ROUTE.editorOrderTimeline, collections: [slugs.orders], order: 10 },
];

const errorToast = (error: unknown): NonNullable<TimelineResponse["toast"]> => {
	if (isCommerceError(error)) return { type: "error", message: error.message };
	if (error instanceof ProviderError || (error instanceof Error && error.name === "ProviderError")) {
		return { type: "error", message: "The payment provider could not complete the request. Try again shortly." };
	}
	return { type: "error", message: "The action failed. See the server log." };
};

const isFulfillment = (value: unknown): value is FulfillmentStatus => typeof value === "string" && (Object.values(FULFILLMENT_STATUS) as string[]).includes(value);

type Toast = NonNullable<TimelineResponse["toast"]>;

/** Runs the interaction's mutation, if it is one. Returns the toast to show, or null for a plain refresh. */
const runInteraction = async (invocation: RouteInvocation<EditorPanelInteraction>, orderId: string): Promise<Toast | null> => {
	const { container, ctx, input } = invocation;
	if (input.type === "panel_load") return null;
	if (input.type === "block_action" && input.action_id === PANEL_ACTION.page) return null;
	if ((ctx.user?.role ?? 0) < ADMIN_ROLE_LEVEL) return { type: "error", message: "Only an administrator can change an order." };
	const admin = createAdminContext(container);
	const caller = ctx.user ? { id: ctx.user.id, email: ctx.user.email } : null;

	if (input.type === "block_action") {
		const action = ACTION_OF_PANEL_ID[input.action_id];
		if (!action) return { type: "error", message: "Unknown action." };
		const parsed = adminOrdersActionInput.parse({ orderId, action });
		const summary = await performOrderAction(admin, parsed, caller);
		return { type: "success", message: `Order is now ${summary.orderStatus}.` };
	}
	if (input.action_id === PANEL_ACTION.setFulfillment) {
		const next = input.values.fulfillment;
		if (!isFulfillment(next)) return { type: "error", message: "Choose a fulfillment status." };
		const summary = await setFulfillment(admin, { orderId, fulfillmentStatus: next }, caller);
		return { type: "success", message: `Fulfillment is ${summary.fulfillmentStatus}.` };
	}
	if (input.action_id === PANEL_ACTION.addNote) {
		const note = typeof input.values.note === "string" ? input.values.note.trim() : "";
		if (note.length === 0) return { type: "error", message: "Write the note first." };
		await addOrderNote(container, { orderId, note }, caller);
		return { type: "success", message: "Note added." };
	}
	return { type: "error", message: "Unknown action." };
};

const pageCursorOf = (input: EditorPanelInteraction): string | null => {
	if (input.type !== "block_action" || input.action_id !== PANEL_ACTION.page) return null;
	const value = input.value;
	return typeof value === "object" && value !== null && typeof (value as { cursor?: unknown }).cursor === "string" ? (value as { cursor: string }).cursor : null;
};

/** The panel handler: every response is a freshly rendered panel, so a failed action still shows current state beside its error toast. */
export const handleOrderTimelinePanel = async (invocation: RouteInvocation<EditorPanelInteraction>): Promise<TimelineResponse> => {
	const { container, ctx, input } = invocation;
	const orderId = ctx.ui?.entry?.id;
	if (!orderId) throw new CommerceError("invalidInput", "The timeline panel needs a saved order");
	let toast: Toast | null = null;
	try {
		toast = await runInteraction(invocation, orderId);
	} catch (error) {
		if (!isCommerceError(error)) container.log.error("Order panel action failed", { error: error instanceof Error ? error.message : String(error) });
		toast = errorToast(error);
	}
	const order = await container.orders.get(orderId);
	if (!order) return { blocks: [{ type: "banner", variant: "error", title: "Order not found", description: "This entry is not an order of the commerce plugin." }] };
	const page = await listOrderEvents(container, orderId, { cursor: pageCursorOf(input), limit: PAGE_SIZE });
	return {
		blocks: renderOrderTimeline({ order, events: page.items, nextCursor: page.cursor, canManage: (ctx.user?.role ?? 0) >= ADMIN_ROLE_LEVEL }),
		...(toast ? { toast } : {}),
	};
};

/** Private POST route of the panel (EmDash requires a private JSON POST route for an editor extension). */
export const orderTimelineRoutes: RouteModule = (builder) => ({
	[ROUTE.editorOrderTimeline]: builder.privateRoute({
		methods: ["POST"],
		permission: "content:edit_any",
		schema: editorPanelInteractionSchema,
		handler: handleOrderTimelinePanel,
	}),
});
