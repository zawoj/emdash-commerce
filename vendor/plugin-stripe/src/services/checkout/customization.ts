import type { CheckoutCustomization, CommerceExtensions, ExtensionContext } from "../../contracts/extensions.js";
import type { CommerceOptions } from "../../contracts/options.js";
import type { PricedCart } from "../../core/cart.js";
import type { Customer } from "../../core/customer.js";
import { toCurrencyCode } from "../../core/money.js";

const MAX_METADATA_ENTRIES = 20;
const MAX_METADATA_KEY = 30;
const MAX_METADATA_VALUE = 500;
const MAX_TRIAL_DAYS = 730;

/** Options-level checkout knobs, narrowed to the cart's currency (a rate in another currency cannot apply). */
export const defaultCustomization = (checkout: CommerceOptions["checkout"], cart: PricedCart, trialDays: number | null): CheckoutCustomization => ({
	allowPromotionCodes: checkout.allowPromotionCodes,
	shippingRates: checkout.shippingRates
		.filter((rate) => rate.currency === cart.currency)
		.map((rate) => ({ ...rate, currency: toCurrencyCode(rate.currency) })),
	shippingAddressCountries: [...checkout.shippingAddressCountries],
	collectPhone: checkout.collectPhone,
	locale: checkout.locale,
	trialDays,
	metadata: {},
});

const invalid = (field: string): Error => new Error(`customizeCheckout returned an invalid ${field}`);

const isCountry = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z]{2}$/.test(value);

/**
 * Copies exactly the `CheckoutCustomization` fields out of whatever the extension returned (anything else
 * it added is dropped, so it cannot change amounts, lines, URLs or customer) and bounds them. Throws a
 * plain error on a malformed value, which the route boundary logs and answers as a generic 500.
 */
export const sanitizeCustomization = (raw: CheckoutCustomization, cart: PricedCart): CheckoutCustomization => {
	if (typeof raw !== "object" || raw === null) throw invalid("result");
	if (typeof raw.allowPromotionCodes !== "boolean") throw invalid("allowPromotionCodes");
	if (typeof raw.collectPhone !== "boolean") throw invalid("collectPhone");
	if (raw.locale !== null && typeof raw.locale !== "string") throw invalid("locale");
	if (raw.trialDays !== null && !(Number.isInteger(raw.trialDays) && raw.trialDays >= 0 && raw.trialDays <= MAX_TRIAL_DAYS)) throw invalid("trialDays");
	if (!Array.isArray(raw.shippingAddressCountries) || !raw.shippingAddressCountries.every(isCountry)) throw invalid("shippingAddressCountries");
	if (!Array.isArray(raw.shippingRates)) throw invalid("shippingRates");
	const shippingRates = raw.shippingRates.map((rate) => {
		const isValid =
			typeof rate?.displayName === "string" &&
			rate.displayName.length > 0 &&
			Number.isSafeInteger(rate.amount) &&
			rate.amount >= 0 &&
			rate.currency === cart.currency;
		if (!isValid) throw invalid("shippingRates");
		return { displayName: rate.displayName, amount: rate.amount, currency: rate.currency, deliveryEstimateDays: rate.deliveryEstimateDays ?? null };
	});
	const entries = Object.entries(raw.metadata ?? {});
	const isMetadataValid =
		entries.length <= MAX_METADATA_ENTRIES &&
		entries.every(([key, value]) => key.length > 0 && key.length <= MAX_METADATA_KEY && typeof value === "string" && value.length <= MAX_METADATA_VALUE);
	if (!isMetadataValid) throw invalid("metadata");
	return {
		allowPromotionCodes: raw.allowPromotionCodes,
		shippingRates,
		shippingAddressCountries: raw.shippingAddressCountries.map((country) => country.toUpperCase()),
		collectPhone: raw.collectPhone,
		locale: raw.locale,
		trialDays: raw.trialDays,
		metadata: Object.fromEntries(entries),
	};
};

export const customizeCheckout = async (
	extension: CommerceExtensions["customizeCheckout"],
	defaults: CheckoutCustomization,
	input: { cart: PricedCart; customer: Customer | null },
	ctx: ExtensionContext,
): Promise<CheckoutCustomization> => {
	if (!extension) return defaults;
	return sanitizeCustomization(await extension(structuredClone(defaults), input, ctx), input.cart);
};
