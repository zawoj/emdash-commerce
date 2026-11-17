import { FULFILLMENT_STATUS } from "../../core/order.js";
import { ORDER_ACTION, planOrderAction, type OrderAction } from "../../core/order-lifecycle.js";
import type { Order } from "../../core/order.js";
import type { OrderTimelineEvent } from "../../core/order-timeline.js";

/**
 * Pure rendering of the order Timeline panel: data in, Block Kit out. The subset of Block Kit it uses is declared
 * here (the host's `validateBlockResponse` is the authority; the tests run every response through it).
 */

export const PANEL_ACTION = {
	complete: "order_complete",
	cancel: "order_cancel",
	archive: "order_archive",
	reopen: "order_reopen",
	setFulfillment: "set_fulfillment",
	addNote: "add_note",
	page: "timeline_page",
} as const;

export const ACTION_OF_PANEL_ID: Readonly<Record<string, OrderAction>> = {
	[PANEL_ACTION.complete]: ORDER_ACTION.complete,
	[PANEL_ACTION.cancel]: ORDER_ACTION.cancel,
	[PANEL_ACTION.archive]: ORDER_ACTION.archive,
	[PANEL_ACTION.reopen]: ORDER_ACTION.reopen,
};

interface ConfirmDialog {
	title: string;
	text: string;
	confirm: string;
	deny: string;
	style?: "danger";
}

interface PanelButton {
	type: "button";
	action_id: string;
	label: string;
	style?: "primary" | "danger" | "secondary";
	confirm?: ConfirmDialog;
}

type FormField =
	| { type: "select"; action_id: string; label: string; options: Array<{ label: string; value: string }>; initial_value?: string }
	| { type: "text_input"; action_id: string; label: string; placeholder?: string; multiline?: boolean };

export type TimelineBlock =
	| { type: "header"; text: string }
	| { type: "context"; text: string }
	| { type: "fields"; fields: Array<{ label: string; value: string }> }
	| { type: "banner"; title?: string; description?: string; variant?: "default" | "alert" | "error" }
	| { type: "actions"; elements: PanelButton[] }
	| { type: "form"; block_id: string; fields: FormField[]; submit: { label: string; action_id: string } }
	| {
			type: "table";
			columns: Array<{ key: string; label: string; format?: "text" | "badge" | "relative_time" }>;
			rows: Array<Record<string, string>>;
			page_action_id: string;
			next_cursor?: string;
			empty_text?: string;
	  };

export interface TimelineResponse {
	blocks: TimelineBlock[];
	toast?: { message: string; type: "success" | "error" | "info" };
}

export interface TimelineView {
	order: Order;
	events: OrderTimelineEvent[];
	nextCursor: string | null;
	/** Only an administrator may change the order; an editor sees the timeline. */
	canManage: boolean;
}

const ACTION_BUTTON: Record<OrderAction, Omit<PanelButton, "type">> = {
	[ORDER_ACTION.complete]: { action_id: PANEL_ACTION.complete, label: "Complete order", style: "primary" },
	[ORDER_ACTION.cancel]: {
		action_id: PANEL_ACTION.cancel,
		label: "Cancel order",
		style: "danger",
		confirm: { title: "Cancel this order?", text: "The order is marked cancelled. No money moves.", confirm: "Cancel order", deny: "Keep", style: "danger" },
	},
	[ORDER_ACTION.archive]: { action_id: PANEL_ACTION.archive, label: "Archive order", style: "secondary" },
	[ORDER_ACTION.reopen]: { action_id: PANEL_ACTION.reopen, label: "Reopen order", style: "secondary" },
};

const FULFILLMENT_LABEL: Record<string, string> = {
	[FULFILLMENT_STATUS.unfulfilled]: "Unfulfilled",
	[FULFILLMENT_STATUS.partiallyFulfilled]: "Partially fulfilled",
	[FULFILLMENT_STATUS.fulfilled]: "Fulfilled",
	[FULFILLMENT_STATUS.partiallyReturned]: "Partially returned",
	[FULFILLMENT_STATUS.returned]: "Returned",
};

const allowedActions = (order: Order): PanelButton[] =>
	(Object.values(ORDER_ACTION) as OrderAction[])
		.filter((action) => planOrderAction(order, action).isAllowed)
		.map((action) => ({ type: "button", ...ACTION_BUTTON[action] }));

export const renderOrderTimeline = (view: TimelineView): TimelineBlock[] => {
	const { order } = view;
	const blocks: TimelineBlock[] = [
		{
			type: "fields",
			fields: [
				{ label: "Order status", value: order.orderStatus },
				{ label: "Payment", value: order.paymentStatus },
				{ label: "Fulfillment", value: order.fulfillmentStatus },
			],
		},
	];
	if (view.canManage) {
		const actions = allowedActions(order);
		if (actions.length > 0) blocks.push({ type: "actions", elements: actions });
		blocks.push(
			{
				type: "form",
				block_id: "fulfillment",
				fields: [
					{
						type: "select",
						action_id: "fulfillment",
						label: "Fulfillment",
						options: Object.values(FULFILLMENT_STATUS).map((value) => ({ label: FULFILLMENT_LABEL[value] ?? value, value })),
						initial_value: order.fulfillmentStatus,
					},
				],
				submit: { label: "Update fulfillment", action_id: PANEL_ACTION.setFulfillment },
			},
			{
				type: "form",
				block_id: "note",
				fields: [{ type: "text_input", action_id: "note", label: "Internal note", placeholder: "Visible to staff only", multiline: true }],
				submit: { label: "Add note", action_id: PANEL_ACTION.addNote },
			},
		);
	} else {
		blocks.push({ type: "context", text: "Only an administrator can change the order status, fulfillment or add notes." });
	}
	blocks.push({
		type: "table",
		page_action_id: PANEL_ACTION.page,
		empty_text: "Nothing recorded yet.",
		columns: [
			{ key: "when", label: "When", format: "relative_time" },
			{ key: "type", label: "Event", format: "badge" },
			{ key: "message", label: "What happened" },
			{ key: "actor", label: "By" },
		],
		rows: view.events.map((event) => ({ when: event.occurredAt, type: event.type, message: event.message, actor: event.actorLabel ?? event.actorKind })),
		...(view.nextCursor ? { next_cursor: view.nextCursor } : {}),
	});
	return blocks;
};
