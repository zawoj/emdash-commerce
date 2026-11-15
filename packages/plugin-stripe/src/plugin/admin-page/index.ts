
import { SETTINGS_KEY } from "../../contracts/options.js";
import { isCommerceError } from "../../core/errors.js";
import { ProviderError } from "../../ports/payment-provider.js";
import { createAdminContext, reconcileNow, registerWebhook, replayWebhookEvent, resyncCatalog } from "../../services/admin/index.js";
import { loadAdminPageData, productIdOfEntityKey } from "../../services/admin/page-data.js";
import type { RouteInvocation } from "../http.js";
import { renderAdminPage } from "./render.js";
import { ACTION, blockInteractionSchema, type BlockInteraction } from "./schema.js";
import type { BlockResponse } from "./types.js";

export { blockInteractionSchema };

type Toast = NonNullable<BlockResponse["toast"]>;

const errorToast = (error: unknown): Toast => {
	if (isCommerceError(error)) return { type: "error", message: error.message };
	if (error instanceof ProviderError || (error instanceof Error && error.name === "ProviderError")) {
		return { type: "error", message: "The payment provider could not complete the request. Try again shortly." };
	}
	return { type: "error", message: "The action failed. See the server log." };
};

const stringValue = (value: unknown): string | null => (typeof value === "string" && value.length > 0 && value.length <= 255 ? value : null);

/** Runs one block action and returns the toast to show; throws for a failed action (the caller turns it into an error toast). */
const runAction = async (invocation: RouteInvocation<BlockInteraction>, interaction: Extract<BlockInteraction, { type: "block_action" }>, webhookUrl: string): Promise<Toast | null> => {
	const { container, ctx } = invocation;
	const admin = createAdminContext(container);
	switch (interaction.action_id) {
		case ACTION.refresh:
			return null;
		case ACTION.registerWebhook: {
			const result = await registerWebhook(container, { webhookUrl, saveSecret: (secret) => ctx.settings.set(SETTINGS_KEY.stripeWebhookSecret, secret) });
			return { type: result.action === "created" ? "success" : "info", message: result.message };
		}
		case ACTION.reconcile: {
			const result = await reconcileNow(container, {});
			const more = result.isTruncated ? " More events remain; run it again." : "";
			return { type: "success", message: `Reconciled: ${result.recorded} new event(s), ${result.processed} processed, ${result.failed} failed.${more}` };
		}
		case ACTION.resyncCatalog: {
			const { queued } = await resyncCatalog(admin, {});
			return { type: "success", message: `${queued} catalog entit${queued === 1 ? "y" : "ies"} queued for sync.` };
		}
		case ACTION.replayEvent: {
			const eventId = stringValue(interaction.value);
			if (!eventId) return { type: "error", message: "Missing event id." };
			const result = await replayWebhookEvent(container, { eventId });
			return { type: result.outcome === "processed" || result.outcome === "ignored" ? "success" : "error", message: `Replay finished: ${result.outcome}${result.error ? ` (${result.error})` : ""}.` };
		}
		case ACTION.resyncEntity: {
			const entityKey = stringValue(interaction.value);
			const productId = entityKey ? await productIdOfEntityKey(container, entityKey) : null;
			if (!productId) return { type: "error", message: "That catalog entity no longer exists." };
			const { queued } = await resyncCatalog(admin, { productId });
			return { type: "success", message: `${queued} catalog entit${queued === 1 ? "y" : "ies"} of the product queued for sync.` };
		}
		default:
			return { type: "error", message: "Unknown action." };
	}
};

/**
 * The `admin` route: EmDash posts the page load and every interaction here and renders the blocks that come
 * back. Every response is a full, freshly rendered page, so a failed action still shows current state next to
 * its error toast. The route is `plugins:manage`, so the actions need no further permission check.
 */
export const handleAdminPage = async (invocation: RouteInvocation<BlockInteraction>, webhookUrl: string): Promise<BlockResponse> => {
	const { container, input } = invocation;
	let toast: Toast | null = null;
	if (input.type === "block_action") {
		try {
			toast = await runAction(invocation, input, webhookUrl);
		} catch (error) {
			if (!isCommerceError(error)) container.log.error("Admin page action failed", { action: input.action_id, error: error instanceof Error ? error.message : String(error) });
			toast = errorToast(error);
		}
	} else if (input.type === "form_submit") {
		toast = { type: "error", message: "Unknown action." };
	}
	const data = await loadAdminPageData(container, { webhookUrl });
	return { blocks: renderAdminPage(data), ...(toast ? { toast } : {}) };
};

