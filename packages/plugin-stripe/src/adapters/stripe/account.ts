import type Stripe from "stripe";

import type { ProviderAccountInfo } from "../../ports/payment-provider.js";
import { STRIPE_API_VERSION, KEY_PREFIX } from "./constants.js";
import { isPermissionError, toProviderError } from "./errors.js";

const keyKindOf = (secretKey: string): ProviderAccountInfo["keyKind"] => {
	if (secretKey.startsWith(KEY_PREFIX.restrictedLive) || secretKey.startsWith(KEY_PREFIX.restrictedTest)) return "restricted";
	if (secretKey.startsWith(KEY_PREFIX.secretLive) || secretKey.startsWith(KEY_PREFIX.secretTest)) return "secret";
	return "unknown";
};

const isLiveKey = (secretKey: string): boolean =>
	secretKey.startsWith(KEY_PREFIX.secretLive) || secretKey.startsWith(KEY_PREFIX.restrictedLive);

/**
 * The key prefix decides livemode and kind without a network call. The account lookup adds the id and the
 * display name; a restricted key without that permission still yields a usable answer.
 */
export const describeStripeAccount = async (getClient: () => Stripe, secretKey: string): Promise<ProviderAccountInfo> => {
	const base = {
		isLivemode: isLiveKey(secretKey),
		apiVersion: STRIPE_API_VERSION as string,
		keyKind: keyKindOf(secretKey),
	};
	try {
		const account = await getClient().accounts.retrieveCurrent();
		return {
			...base,
			accountId: account.id,
			displayName: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null,
		};
	} catch (error) {
		if (isPermissionError(error)) return { ...base, accountId: "unknown", displayName: null };
		throw toProviderError(error, "account retrieve");
	}
};
