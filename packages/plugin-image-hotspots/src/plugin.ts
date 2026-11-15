import { definePlugin } from "emdash";

import { PLUGIN_ID, PLUGIN_VERSION, WIDGET_NAME } from "./value/constants.js";

/** Module specifier the admin imports for the React widget (see `adminEntry` in the descriptor). */
export const ADMIN_ENTRY = "@emdash-commerce/plugin-image-hotspots/admin";

/**
 * The plugin definition. It has no hooks, routes or storage and asks for no capability: the widget only
 * edits a json value and reads media and products through the admin's own API session.
 *
 * `admin.entry` makes this a "react" admin plugin. EmDash then disables Block Kit editor panels and actions
 * for it (`getPluginEditorExtension` returns null), which is why this plugin is separate from the commerce one.
 */
export const createImageHotspotsPlugin = () =>
	definePlugin({
		id: PLUGIN_ID,
		displayName: "Image hotspots",
		description: "Place points on an image: a field widget for shop-the-look and callouts",
		version: PLUGIN_VERSION,
		capabilities: [],
		admin: {
			entry: ADMIN_ENTRY,
			fieldWidgets: [{ name: WIDGET_NAME, label: "Image with points", fieldTypes: ["json"] }],
		},
	});

/** The `createPlugin(options)` entrypoint EmDash calls for a descriptor. */
export const createPlugin = () => createImageHotspotsPlugin();
