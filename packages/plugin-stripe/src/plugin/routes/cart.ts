import type { RouteContext } from "emdash";

import { cartLineInput, cartLineRemoveInput, cartView, ROUTE } from "../../contracts/api.js";
import type { CartRequestContext } from "../../core/cart.js";
import { createStorefrontServices } from "../../services/checkout/wire.js";
import { parseInput } from "../http.js";
import type { RouteModule } from "../route-builder.js";

const MAX_USER_AGENT = 300;
const CART_WRITE_WINDOW_MS = 60_000;

/** User agent and country only; the IP is never stored with a cart. */
export const requestContextOf = (ctx: Pick<RouteContext, "requestMeta">): CartRequestContext => ({
	userAgent: ctx.requestMeta.userAgent?.slice(0, MAX_USER_AGENT) ?? null,
	country: ctx.requestMeta.geo?.country ?? null,
});

/**
 * `cart` (GET) and `cart/lines` (POST add/set, DELETE remove). EmDash hands a DELETE its input in the query
 * string (`?priceId=`), POST in the JSON body, so the line route parses by method.
 */
export const cartRoutes: RouteModule = (builder) => ({
	[ROUTE.cart]: builder.publicRoute({
		methods: ["GET"],
		handler: async ({ ctx, container, cartId }) => cartView.parse(await createStorefrontServices(container).cart.get(cartId, requestContextOf(ctx))),
	}),
	[ROUTE.cartLines]: builder.publicRoute({
		methods: ["POST", "DELETE"],
		rateLimit: { name: "cart-write", limit: (options) => options.rateLimits.cartWritesPerMinute, windowMs: CART_WRITE_WINDOW_MS },
		handler: async ({ ctx, container, cartId }) => {
			const { cart } = createStorefrontServices(container);
			const context = requestContextOf(ctx);
			if (ctx.request.method === "DELETE") {
				const { priceId } = parseInput(cartLineRemoveInput, ctx.input);
				return cartView.parse(await cart.removeLine(cartId, priceId, context));
			}
			return cartView.parse(await cart.setLine(cartId, parseInput(cartLineInput, ctx.input), context));
		},
	}),
});
