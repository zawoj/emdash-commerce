import type { ProviderWebhookEvent } from "../../ports/payment-provider.js";
import { createCatalogSyncService } from "../catalog-sync.js";
import { handleCustomerUpdated } from "../customers.js";
import { handleDisputeUpdated } from "../disputes.js";
import { handlePaymentUpdated } from "../payments.js";
import { handleRefundUpdated } from "../refunds.js";
import { handleCheckoutAsyncFailed, handleCheckoutExpired, handleCheckoutSettled } from "../settlement.js";
import { handleSubscriptionTrialWillEnd, handleSubscriptionUpdated } from "../subscriptions.js";
import { HANDLED, ignored, type Deps, type HandlerResult } from "./deps.js";
import { handleInvoice } from "./invoices.js";

/** Routes a normalised action to its handler. The only place that knows every `WebhookAction` kind. */
export const dispatchAction = async (deps: Deps, event: ProviderWebhookEvent): Promise<HandlerResult> => {
	const { action } = event;
	const meta = { eventId: event.eventId, created: event.created };
	switch (action.kind) {
		case "checkout_completed":
		case "checkout_async_succeeded":
			return handleCheckoutSettled(deps, action.sessionId);
		case "checkout_async_failed":
			return handleCheckoutAsyncFailed(deps, action.sessionId);
		case "checkout_expired":
			return handleCheckoutExpired(deps, action.sessionId);
		case "payment_updated":
			return handlePaymentUpdated(deps, action.payment);
		case "refund_updated":
			return handleRefundUpdated(deps, action.refund, meta);
		case "dispute_updated":
			return handleDisputeUpdated(deps, action.dispute);
		case "customer_updated":
			return handleCustomerUpdated(deps, action.customer, meta);
		case "subscription_updated":
			return handleSubscriptionUpdated(deps, action.subscription, meta);
		case "subscription_trial_will_end":
			return handleSubscriptionTrialWillEnd(deps, { subscriptionId: action.subscriptionId, trialEnd: action.trialEnd });
		case "invoice_paid":
			return handleInvoice(deps, "paid", action.invoice);
		case "invoice_payment_failed":
			return handleInvoice(deps, "failed", action.invoice);
		case "product_changed":
			await createCatalogSyncService(deps.container, deps.publisher).handleProviderProductChanged(action.product);
			return HANDLED;
		case "price_changed":
			await createCatalogSyncService(deps.container, deps.publisher).handleProviderPriceChanged(action.price);
			return HANDLED;
		case "unsupported":
			return ignored(`Unsupported event type ${event.type}`);
	}
};
