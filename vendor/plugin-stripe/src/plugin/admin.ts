import type { PluginAdminConfig } from "emdash";

import { ADMIN_NAV_GROUP } from "../adapters/emdash/constants.js";
import type { CommerceOptions } from "../contracts/options.js";
import { settingsSchema } from "../adapters/emdash/settings.js";
import { buildEditorActions, buildEditorPanels } from "./editor/index.js";

/** Portable Text block that inserts a purchasable product card (rendered by the storefront component). */
export const portableTextBlocks: NonNullable<PluginAdminConfig["portableTextBlocks"]> = [
	{
		type: "product",
		label: "Product",
		icon: "link",
		description: "Insert a purchasable product card",
		fields: [
			{
				type: "text_input",
				action_id: "product_slug",
				label: "Product slug",
				placeholder: "e.g. test-mug",
			},
		],
	},
];

/**
 * The "Commerce" page: its content comes from the `admin` route (Block Kit, plugin/admin-page). The page path
 * `/` mounts at `/_emdash/admin/plugins/stripe-commerce/`. Its group puts it at the end of the sales folder.
 */
export const adminPages: NonNullable<PluginAdminConfig["pages"]> = [
	{ path: "/", label: "Commerce", icon: "shopping-cart", group: ADMIN_NAV_GROUP.sales },
];

/**
 * The admin config: settings, the product block, the Commerce page and the editor panels and actions (scoped to the
 * configured collection slugs, so they are built from the options).
 */
export const buildAdminConfig = (slugs: CommerceOptions["collections"]): PluginAdminConfig => ({
	settingsSchema,
	portableTextBlocks,
	pages: adminPages,
	editorPanels: buildEditorPanels(slugs),
	editorActions: buildEditorActions(slugs),
});
