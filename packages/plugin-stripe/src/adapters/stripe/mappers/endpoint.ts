import type Stripe from "stripe";

import type { WebhookEndpointInfo } from "../../../ports/payment-provider.js";

export const toEndpointInfo = (endpoint: Stripe.WebhookEndpoint): WebhookEndpointInfo => ({
	endpointId: endpoint.id,
	url: endpoint.url,
	enabledEvents: [...endpoint.enabled_events],
	status: endpoint.status,
});
