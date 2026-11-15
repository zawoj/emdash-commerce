import type { PluginRoute } from "emdash";

import type { RouteBuilder } from "../route-builder.js";
import { orderTimelineRoutes } from "../editor/order-timeline.js";
import { adminRoutes } from "./admin.js";
import { cartRoutes } from "./cart.js";
import { catalogEditorRoutes } from "./catalog-editor.js";
import { catalogRoutes } from "./catalog.js";
import { checkoutRoutes } from "./checkout.js";
import { ordersRoutes } from "./orders.js";
import { webhookRoutes } from "./webhook.js";

/** Assembles every route module; a duplicate route name between modules is a programming error. */
export const buildRoutes = (builder: RouteBuilder): Record<string, PluginRoute> => {
	const routes: Record<string, PluginRoute> = {};
	for (const module of [catalogRoutes, catalogEditorRoutes, cartRoutes, checkoutRoutes, ordersRoutes, webhookRoutes, adminRoutes, orderTimelineRoutes]) {
		for (const [name, route] of Object.entries(module(builder))) {
			if (name in routes) throw new Error(`Duplicate commerce route "${name}"`);
			routes[name] = route;
		}
	}
	return routes;
};
