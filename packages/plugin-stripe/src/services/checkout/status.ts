import type { CheckoutStatusView } from "../../contracts/api.js";
import { CommerceError } from "../../core/errors.js";
import { RECORD_INDEX_KEY } from "../../ports/repositories.js";
import type { CommerceContainer } from "../../plugin/container.js";

/** "jane@example.com" -> "j***@example.com". Never more than the first character of the local part. */
export const maskEmail = (email: string): string => {
	const at = email.lastIndexOf("@");
	if (at < 1) return "***";
	return `${email.slice(0, 1)}***${email.slice(at)}`;
};

/**
 * What a success page may show for a Checkout Session id. The id sits in the success URL, so anyone with
 * the link can ask: the answer carries no PII beyond the masked email and never the client secret. Only
 * sessions this plugin created (those with a snapshot) are answered, so the route cannot be used to look
 * at other objects in the Stripe account. The state is read from the provider, never from a cache, and the
 * order number stays null until settlement (webhook) has created the order.
 */
export const readCheckoutStatus = async (container: CommerceContainer, sessionId: string): Promise<CheckoutStatusView> => {
	const snapshot = await container.snapshots.getBySession(sessionId);
	if (!snapshot) throw new CommerceError("notFound", "Checkout session not found");
	const provider = await container.provider();
	const session = await provider.checkout.retrieveSession(sessionId);
	if (!session) throw new CommerceError("notFound", "Checkout session not found");
	const orderId = await container.recordIndex.get(RECORD_INDEX_KEY.orderBySession(sessionId));
	const order = orderId ? await container.orders.get(orderId) : null;
	const email = session.email ?? order?.email ?? null;
	return {
		status: session.status,
		paymentStatus: session.paymentStatus,
		orderNumber: order?.orderNumber ?? null,
		orderStatus: order?.paymentStatus ?? null,
		maskedEmail: email ? maskEmail(email) : null,
	};
};
