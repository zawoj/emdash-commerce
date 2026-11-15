import type Stripe from "stripe";

import type { Address } from "../../../core/customer.js";
import { toCurrencyCode, type CurrencyCode } from "../../../core/money.js";
import { ProviderError } from "../../../ports/payment-provider.js";
import { STRIPE_ERROR_CODE } from "../errors.js";

/** `expand`-able fields are an id string, a full object, or null. */
export const idOf = (value: string | { id: string } | null | undefined): string | null => {
	if (!value) return null;
	return typeof value === "string" ? value : value.id;
};

/** The object when it was expanded, otherwise null (an id string tells us nothing else). */
export const expandedOf = <T extends object>(value: string | T | null | undefined): T | null =>
	value && typeof value === "object" ? value : null;

export const metadataOf = (metadata: Stripe.Metadata | null | undefined): Record<string, string> => {
	const result: Record<string, string> = {};
	if (!metadata) return result;
	for (const [key, value] of Object.entries(metadata)) {
		if (typeof value === "string") result[key] = value;
	}
	return result;
};

export const currencyOf = (code: string | null | undefined, what: string): CurrencyCode => {
	if (!code) throw new ProviderError(`Stripe ${what} has no currency`, { isRetryable: false, providerCode: STRIPE_ERROR_CODE.invalidResponse });
	return toCurrencyCode(code);
};

export const addressOf = (address: Stripe.Address | null | undefined): Address | null => {
	if (!address) return null;
	return {
		line1: address.line1 ?? null,
		line2: address.line2 ?? null,
		city: address.city ?? null,
		postalCode: address.postal_code ?? null,
		state: address.state ?? null,
		country: address.country ?? null,
	};
};
