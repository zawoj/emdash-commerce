import type { PluginRoute } from "emdash";

import { ROUTE } from "../../contracts/api.js";
import { CommerceError, isCommerceError } from "../../core/errors.js";
import { generateVariants, loadVariantGeneratorModel } from "../../services/catalog/variant-generator.js";
import { loadSpecificationModel, saveSpecification } from "../../services/catalog/specs.js";
import { createAdminContext, resyncCatalog } from "../../services/admin/index.js";
import { axisFieldId, renderVariantsPanel, VARIANTS_FORM } from "../editor/variants-panel.js";
import { renderSpecificationPanel, specFieldId, SPEC_FORM } from "../editor/specification-panel.js";
import { editorPanelInteractionSchema, type PanelResponse } from "../editor/blocks.js";
import type { RouteInvocation } from "../http.js";
import type { RouteModule } from "../route-builder.js";

type Permission = NonNullable<PluginRoute["permission"]>;

/** Editing a product is editing content: the panels and actions need what the product editor needs. */
const EDITOR_PERMISSION: Permission = "content:edit_any";
const MANAGE_PERMISSION: Permission = "plugins:manage";

const toastOf = (error: unknown): NonNullable<PanelResponse["toast"]> =>
	isCommerceError(error) ? { type: "error", message: error.message } : { type: "error", message: "The action failed. See the server log." };

/** The product a panel or action was opened on: the host-attested saved entry, which must be a product. */
const productIdOf = (invocation: Pick<RouteInvocation<unknown>, "ctx" | "container">): string => {
	const entry = invocation.ctx.ui?.entry;
	if (!entry || entry.collection !== invocation.container.options.collections.products) {
		throw new CommerceError("invalidInput", "This panel works on products only");
	}
	return entry.id;
};

const ticked = (values: Readonly<Record<string, unknown>>, attributeId: string): string[] => {
	const raw = values[axisFieldId(attributeId)];
	return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : [];
};

/** The Variants and Specification panels and the Sync action of the product editor (private routes; see plugin/editor). */
export const catalogEditorRoutes: RouteModule = (builder) => ({
	[ROUTE.editorVariants]: builder.privateRoute({
		methods: ["POST"],
		permission: EDITOR_PERMISSION,
		schema: editorPanelInteractionSchema,
		async handler(invocation): Promise<PanelResponse> {
			const { container, input } = invocation;
			const productId = productIdOf(invocation);
			const variantsCollection = container.options.collections.variants;
			let toast: PanelResponse["toast"];
			let didChange = false;
			if (input.type === "form_submit" && input.action_id === VARIANTS_FORM.submitAction) {
				try {
					const model = await loadVariantGeneratorModel(container, productId);
					const selection = Object.fromEntries(model.axes.map(({ attribute }) => [attribute.id, ticked(input.values, attribute.id)]));
					const result = await generateVariants(container, productId, selection);
					didChange = result.created > 0;
					toast = {
						type: result.created > 0 ? "success" : "info",
						message: `Created ${result.created} variant${result.created === 1 ? "" : "s"}${result.skipped > 0 ? `; ${result.skipped} already existed` : ""}.`,
					};
				} catch (error) {
					if (!isCommerceError(error)) container.log.error("Variant generation failed", { error: error instanceof Error ? error.message : String(error) });
					toast = toastOf(error);
				}
			}
			const response = renderVariantsPanel(await loadVariantGeneratorModel(container, productId), variantsCollection);
			// A refresh reloads the product form, so its Variants picker shows the new links instead of a stale selection.
			return { ...response, ...(toast ? { toast } : {}), ...(didChange ? { refresh: true as const } : {}) };
		},
	}),

	[ROUTE.editorSpecification]: builder.privateRoute({
		methods: ["POST"],
		permission: EDITOR_PERMISSION,
		schema: editorPanelInteractionSchema,
		async handler(invocation): Promise<PanelResponse> {
			const { container, input } = invocation;
			const productId = productIdOf(invocation);
			let toast: PanelResponse["toast"];
			if (input.type === "form_submit" && input.action_id === SPEC_FORM.submitAction) {
				try {
					const model = await loadSpecificationModel(container, productId);
					const submitted = Object.fromEntries(model.attributes.map((attribute) => [attribute.id, input.values[specFieldId(attribute.id)]]));
					await saveSpecification(container, productId, submitted);
					toast = { type: "success", message: "Specification saved." };
				} catch (error) {
					if (!isCommerceError(error)) container.log.error("Saving the specification failed", { error: error instanceof Error ? error.message : String(error) });
					toast = toastOf(error);
				}
			}
			const response = renderSpecificationPanel(await loadSpecificationModel(container, productId));
			return { ...response, ...(toast ? { toast } : {}) };
		},
	}),

	[ROUTE.editorCatalogResync]: builder.privateRoute({
		methods: ["POST"],
		permission: MANAGE_PERMISSION,
		async handler(invocation) {
			const productId = productIdOf(invocation);
			const { queued } = await resyncCatalog(createAdminContext(invocation.container), { productId });
			return { toast: { type: "success" as const, message: `${queued} catalog entit${queued === 1 ? "y" : "ies"} queued for sync.` } };
		},
	}),
});
