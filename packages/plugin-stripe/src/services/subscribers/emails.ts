import type { EventSubscriber } from "../../contracts/extensions.js";
import type { CommerceEvent, CommerceEventType } from "../../core/events.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE } from "../../core/order-timeline.js";
import { renderEmail } from "../emails/render.js";
import { viewUrlForOrder } from "../emails/view-url.js";
import { tryRecordOrderEvent } from "../order-events.js";

/** Stable subscriber id: delivery state is tracked under it, so it must never be renamed. */
export const EMAIL_SUBSCRIBER_ID = "builtin-emails" as const;

const EMAIL_EVENTS = ["order.paid", "order.payment_failed", "order.refunded"] as const satisfies readonly CommerceEventType[];
type EmailEvent = (typeof EMAIL_EVENTS)[number];

const EMAIL_LABEL: Record<EmailEvent, string> = {
	"order.paid": "order confirmation",
	"order.payment_failed": "payment failed",
	"order.refunded": "refund issued",
};

/**
 * Transactional emails for buyers: confirmation (with a signed order link), failed payment and refund.
 *
 * - `emails.isEnabled=false` turns the subscriber into a no-op (the access-link email is separate and always on:
 *   it answers a buyer's own request).
 * - No email provider configured: logged, and the delivery counts as done. That is a site configuration state,
 *   not a transient failure; retrying eight times would only park every event as `dead` and bury real
 *   failures in the admin counters. Once a provider exists, new events send.
 * - A missing order is logged and skipped: the event only exists after the order did, so there is nothing a
 *   retry could fix.
 */
export const createEmailSubscriber = (container: CommerceContainer): EventSubscriber<EmailEvent> => ({
	id: EMAIL_SUBSCRIBER_ID,
	events: EMAIL_EVENTS,
	async handle(event: CommerceEvent<EmailEvent>) {
		if (!container.options.emails.isEnabled) return;
		const order = await container.orders.get(event.data.orderId);
		if (!order) {
			container.log.warn("Email skipped: the order does not exist", { eventId: event.id, orderId: event.data.orderId });
			return;
		}
		const storeName = container.options.storeName;
		const message = await (async () => {
			switch (event.type) {
				case "order.paid":
					return renderEmail(container, "orderConfirmation", { order, viewUrl: await viewUrlForOrder(container, order.id), storeName });
				case "order.payment_failed":
					return renderEmail(container, "paymentFailed", { order, storeName });
				case "order.refunded":
					return renderEmail(container, "refundIssued", { order, amount: (event as CommerceEvent<"order.refunded">).data.amount, storeName });
			}
		})();
		const isSent = await container.mailer.send({ to: order.email, subject: message.subject, text: message.text, html: message.html });
		if (!isSent) {
			container.log.warn("Email not sent: no email provider accepted it", { eventId: event.id, type: event.type });
			return;
		}
		// Keyed by the domain event id, so a redelivery after a crash records the send once.
		await tryRecordOrderEvent(container, {
			orderId: order.id,
			type: ORDER_TIMELINE_TYPE.emailSent,
			message: `Email sent: ${EMAIL_LABEL[event.type]}`,
			actorKind: ORDER_ACTOR_KIND.system,
			data: { template: event.type, subject: message.subject },
			source: event.id,
		});
	},
});
