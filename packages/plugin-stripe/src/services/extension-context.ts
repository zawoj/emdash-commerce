import type { ExtensionContext } from "../contracts/extensions.js";
import type { CommerceContainer } from "../plugin/container.js";

/**
 * The read-only view handed to site extensions (subscribers, `stripeWebhooks`, cart and checkout hooks).
 * Deliberately no payment provider and no writers: an extension reacts to domain events and reads
 * records; anything that changes money goes through the plugin's own use cases.
 */
export const createExtensionContext = (container: CommerceContainer): ExtensionContext => ({
	log: container.log,
	storeName: container.options.storeName,
	siteUrl: container.siteUrl,
	getOrder: (orderId) => container.orders.get(orderId),
	getCustomer: (customerId) => container.customers.get(customerId),
	getSubscription: (subscriptionId) => container.subscriptions.get(subscriptionId),
});
