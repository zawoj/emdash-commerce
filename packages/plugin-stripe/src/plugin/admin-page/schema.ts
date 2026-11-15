import { z } from "zod";

/**
 * The interaction the admin posts to the `admin` route (`BlockInteraction` of `@emdash-cms/blocks`): the page
 * load, a block action (button, menu, table paging) or a form submit. A button's `value` comes back as sent.
 */
export const blockInteractionSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("page_load"), page: z.string().optional() }),
	z.object({ type: z.literal("block_action"), action_id: z.string().min(1).max(128), block_id: z.string().optional(), value: z.unknown().optional(), page: z.string().optional() }),
	z.object({ type: z.literal("form_submit"), action_id: z.string().min(1).max(128), block_id: z.string().optional(), values: z.record(z.string(), z.unknown()), page: z.string().optional() }),
]);
export type BlockInteraction = z.infer<typeof blockInteractionSchema>;

/** Action ids this page handles; the render functions and the dispatcher share them. */
export const ACTION = {
	refresh: "refresh",
	registerWebhook: "register_webhook",
	reconcile: "reconcile",
	resyncCatalog: "resync_catalog",
	replayEvent: "replay_event",
	resyncEntity: "resync_entity",
} as const;
export type ActionId = (typeof ACTION)[keyof typeof ACTION];
