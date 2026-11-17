import { customerPortalInput, ordersAccessLinkInput, ordersViewQuery, ROUTE } from "../../contracts/api.js";
import { ACCESS_LINK_WINDOW_MS, openPortal, requestAccessLink, viewOrder } from "../../services/orders/guest.js";
import type { RouteModule } from "../route-builder.js";

/**
 * Guest order access. There are no customer accounts: the buyer proves ownership with an HMAC-signed,
 * expiring token that arrives by email. Order view and portal use different token scopes, so a link that
 * only shows an order cannot open the billing portal.
 */
export const ordersRoutes: RouteModule = (builder) => ({
	[ROUTE.ordersAccessLink]: builder.publicRoute({
		methods: ["POST"],
		schema: ordersAccessLinkInput,
		rateLimit: { name: "orders-access-link", limit: (options) => options.rateLimits.orderLookupPerHour, windowMs: ACCESS_LINK_WINDOW_MS },
		handler: ({ container, input }) => requestAccessLink(container, input),
	}),
	[ROUTE.ordersView]: builder.publicRoute({
		methods: ["GET"],
		// The answer is per buyer and the token sits in the URL: never cache it.
		cacheControl: "no-store",
		schema: ordersViewQuery,
		handler: ({ container, input }) => viewOrder(container, input),
	}),
	[ROUTE.customerPortal]: builder.publicRoute({
		methods: ["POST"],
		schema: customerPortalInput,
		rateLimit: { name: "customer-portal", limit: (options) => options.rateLimits.orderLookupPerHour, windowMs: ACCESS_LINK_WINDOW_MS },
		handler: ({ container, input }) => openPortal(container, input),
	}),
});
