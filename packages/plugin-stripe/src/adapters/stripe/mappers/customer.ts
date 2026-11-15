import type Stripe from "stripe";

import type { ProviderCustomer } from "../../../ports/payment-provider.js";
import { addressOf } from "./common.js";

export const toProviderCustomer = (customer: Stripe.Customer | Stripe.DeletedCustomer): ProviderCustomer => {
	if ("deleted" in customer && customer.deleted) {
		return {
			providerCustomerId: customer.id,
			email: null,
			name: null,
			phone: null,
			billingAddress: null,
			shippingAddress: null,
			isDeleted: true,
		};
	}
	const live = customer as Stripe.Customer;
	return {
		providerCustomerId: live.id,
		email: live.email ?? null,
		name: live.name ?? null,
		phone: live.phone ?? null,
		billingAddress: addressOf(live.address),
		shippingAddress: addressOf(live.shipping?.address),
		isDeleted: false,
	};
};
