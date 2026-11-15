import type { z } from "zod";

import type { customerPortalInput, orderView, ordersAccessLinkInput, ordersViewQuery } from "../../contracts/api.js";
import { CommerceError } from "../../core/errors.js";
import { normaliseEmail } from "../../core/customer.js";
import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE } from "../../core/order-timeline.js";
import type { Order } from "../../core/order.js";
import { RECORD_INDEX_KEY } from "../../ports/repositories.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { ACCESS_SCOPE, issueAccessToken, requireAccessToken } from "../access-tokens.js";
import { renderEmail } from "../emails/render.js";
import { buildViewUrl } from "../emails/view-url.js";
import { tryRecordOrderEvent } from "../order-events.js";
import { errorMessage } from "../payments/async.js";

/** Use cases behind the public, token-guarded order routes (plugin/routes/orders.ts). */

export const ACCESS_LINK_WINDOW_MS = 60 * 60 * 1000;

const sha256Hex = async (value: string): Promise<string> => {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const findOrderByNumber = async (container: CommerceContainer, orderNumber: string): Promise<Order | null> => {
	const trimmed = orderNumber.trim();
	// The default generator is upper case; a buyer may type it any way.
	for (const candidate of new Set([trimmed, trimmed.toUpperCase()])) {
		const orderId = await container.recordIndex.get(RECORD_INDEX_KEY.orderByNumber(candidate));
		const order = orderId ? await container.orders.get(orderId) : null;
		if (order) return order;
	}
	return null;
};

/**
 * Emails a signed order link when the order number and the email belong together, and answers the same either
 * way (`{ isAccepted: true }`), so the route cannot be used to find out which orders or emails exist. The
 * per-IP limit is enforced by the route boundary; the per-email limit is enforced here, keyed by a hash of the
 * normalised email (no address in storage keys). Both limits apply before any lookup, so hitting them says
 * nothing about the order either.
 *
 * Known limit: the matching path does more work (signing, sending), so its response time can differ by the
 * mail round trip. The rate limits bound how fast that could be sampled; hiding it fully needs a deferred
 * task that outlives the response.
 */
export const requestAccessLink = async (container: CommerceContainer, input: z.infer<typeof ordersAccessLinkInput>): Promise<{ isAccepted: true }> => {
	const email = normaliseEmail(input.email);
	const limit = container.options.rateLimits.orderLookupPerHour;
	const key = `orders-access-link-email:${(await sha256Hex(email)).slice(0, 32)}`;
	if (!(await container.rateLimiter.hit(key, limit, ACCESS_LINK_WINDOW_MS))) {
		throw new CommerceError("rateLimited", "Too many requests. Try again shortly.");
	}

	try {
		const order = await findOrderByNumber(container, input.orderNumber);
		if (order && normaliseEmail(order.email) === email) {
			const viewUrl = buildViewUrl(container, await issueAccessToken(container, order.id));
			const message = renderEmail(container, "orderAccessLink", { orderNumber: order.orderNumber, viewUrl, storeName: container.options.storeName });
			const isSent = await container.mailer.send({ to: order.email, subject: message.subject, text: message.text, html: message.html });
			if (!isSent) container.log.warn("Order access link not sent: no email provider accepted it");
			else {
				await tryRecordOrderEvent(container, {
					orderId: order.id,
					type: ORDER_TIMELINE_TYPE.emailSent,
					message: "Email sent: order access link (requested by the buyer)",
					actorKind: ORDER_ACTOR_KIND.customer,
					data: { template: "orderAccessLink" },
					source: `access-link:${container.ids.randomId(6)}`,
				});
			}
		}
	} catch (error) {
		// A failure here (no token secret, mail trouble) must not change the answer: it would reveal that the order exists.
		container.log.error("Order access link failed", { error: errorMessage(error) });
	}
	return { isAccepted: true };
};

const loadOrderForToken = async (container: CommerceContainer, token: string, scope: (typeof ACCESS_SCOPE)[keyof typeof ACCESS_SCOPE]): Promise<Order> => {
	const claims = await requireAccessToken(container, token, scope);
	const order = await container.orders.get(claims.orderId);
	// A token for a deleted order is as invalid as a forged one.
	if (!order) throw new CommerceError("unauthorized", "This link is invalid or has expired.");
	return order;
};

export const viewOrder = async (container: CommerceContainer, input: z.infer<typeof ordersViewQuery>): Promise<z.infer<typeof orderView>> => {
	const order = await loadOrderForToken(container, input.token, ACCESS_SCOPE.orderView);
	return {
		orderNumber: order.orderNumber,
		status: order.paymentStatus,
		orderStatus: order.orderStatus,
		paymentStatus: order.paymentStatus,
		fulfillmentStatus: order.fulfillmentStatus,
		placedAt: order.placedAt,
		email: order.email,
		customerName: order.customerName,
		lines: order.lines.map((line) => ({
			title: line.title,
			variantTitle: line.variantTitle,
			quantity: line.quantity,
			unitAmount: line.unitAmount,
			amountTotal: line.amountTotal,
		})),
		totals: { ...order.totals },
		hasSubscription: Boolean(order.subscriptionId),
		canOpenPortal: Boolean(order.stripe.customerId),
	};
};

/** The Stripe Customer Portal for the order's customer; needs the `portal` scope (an order-view link is not enough). */
export const openPortal = async (container: CommerceContainer, input: z.infer<typeof customerPortalInput>): Promise<{ url: string }> => {
	const order = await loadOrderForToken(container, input.token, ACCESS_SCOPE.portal);
	const providerCustomerId = order.stripe.customerId;
	if (!providerCustomerId) throw new CommerceError("conflict", "This order has no customer account to manage.");
	const provider = await container.provider();
	const returnUrl = new URL(container.options.orders.portalReturnPath, container.siteUrl).toString();
	return provider.customers.createPortalSession({ providerCustomerId, returnUrl });
};
