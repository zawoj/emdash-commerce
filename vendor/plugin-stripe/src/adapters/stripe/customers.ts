import type Stripe from "stripe";

import { PROVIDER_METADATA, ProviderError, type CustomersProvider } from "../../ports/payment-provider.js";
import { ADAPTER_METADATA, PLUGIN_METADATA_VALUE } from "./constants.js";
import { callStripe, retrieveStripe, STRIPE_ERROR_CODE, toProviderError } from "./errors.js";
import { toProviderCustomer } from "./mappers/customer.js";

const PORTAL_NOT_CONFIGURED_MESSAGE =
	"The Stripe Customer Portal is not configured. Save the portal settings in the Stripe Dashboard (Settings > Billing > Customer portal) for this mode (test and live are separate), then retry.";

/** Stripe answers a missing portal configuration with an invalid_request error that names the configuration. */
const isPortalNotConfigured = (error: ProviderError): boolean =>
	!error.isRetryable && /configuration/i.test(error.message) && /portal/i.test(error.message);

export const createCustomersProvider = (getClient: () => Stripe): CustomersProvider => ({
	async createCustomer(input, idempotencyKey) {
		const customer = await callStripe("customer create", () =>
			getClient().customers.create(
				{
					email: input.email,
					...(input.name ? { name: input.name } : {}),
					...(input.phone ? { phone: input.phone } : {}),
					metadata: {
						[ADAPTER_METADATA.customerRecordId]: input.customerRecordId,
						[PROVIDER_METADATA.pluginId]: PLUGIN_METADATA_VALUE,
					},
				},
				{ idempotencyKey },
			),
		);
		return toProviderCustomer(customer);
	},

	async retrieveCustomer(providerCustomerId) {
		const customer = await retrieveStripe("customer retrieve", () => getClient().customers.retrieve(providerCustomerId));
		return customer ? toProviderCustomer(customer) : null;
	},

	async createPortalSession(input) {
		try {
			const session = await getClient().billingPortal.sessions.create({
				customer: input.providerCustomerId,
				return_url: input.returnUrl,
			});
			return { url: session.url };
		} catch (error) {
			const providerError = toProviderError(error, "billing portal session create");
			if (!isPortalNotConfigured(providerError)) throw providerError;
			throw new ProviderError(PORTAL_NOT_CONFIGURED_MESSAGE, {
				isRetryable: false,
				providerCode: STRIPE_ERROR_CODE.portalNotConfigured,
				cause: error,
			});
		}
	},
});
