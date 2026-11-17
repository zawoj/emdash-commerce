import type { PluginEditorAction, PluginEditorPanel } from "emdash";

import type { CommerceOptions } from "../../contracts/options.js";
import { ROUTE } from "../../contracts/api.js";

/** Panels on the product editor: the variant generator, then the specification form (collapsed until opened). */
export const catalogEditorPanels = (slugs: CommerceOptions["collections"]): PluginEditorPanel[] => [
	{ id: "variants", title: "Variants", route: ROUTE.editorVariants, collections: [slugs.products], order: 10 },
	{ id: "specification", title: "Specification", route: ROUTE.editorSpecification, collections: [slugs.products], order: 20 },
];

/** Actions on the product editor. */
export const catalogEditorActions = (slugs: CommerceOptions["collections"]): PluginEditorAction[] => [
	{
		id: "catalog-resync",
		label: "Sync to Stripe",
		route: ROUTE.editorCatalogResync,
		placement: "overflow",
		collections: [slugs.products],
		confirm: { title: "Sync to Stripe?", text: "Queues this product, its variants and its prices for a Stripe sync.", confirm: "Sync", deny: "Cancel" },
	},
];
