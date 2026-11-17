import { checkoutInput, checkoutStatusQuery, checkoutStatusView, checkoutView, ROUTE } from "../../contracts/api.js";
import { createStorefrontServices } from "../../services/checkout/wire.js";
import type { RouteModule } from "../route-builder.js";

const CHECKOUT_WINDOW_MS = 60_000;

/**
 * `checkout` (POST) creates or returns the cart's open Checkout Session; `checkout/status` (GET) is what a
 * success page may show. Status is not rate limited: it only answers for session ids this plugin created.
 */
export const checkoutRoutes: RouteModule = (builder) => ({
	[ROUTE.checkout]: builder.publicRoute({
		methods: ["POST"],
		schema: checkoutInput,
		rateLimit: { name: "checkout", limit: (options) => options.rateLimits.checkoutPerMinute, windowMs: CHECKOUT_WINDOW_MS },
		handler: async ({ container, input, cartId }) => checkoutView.parse(await createStorefrontServices(container).checkout.checkout(cartId, input)),
	}),
	[ROUTE.checkoutStatus]: builder.publicRoute({
		methods: ["GET"],
		schema: checkoutStatusQuery,
		handler: async ({ container, input }) => checkoutStatusView.parse(await createStorefrontServices(container).checkout.status(input.session_id)),
	}),
});
