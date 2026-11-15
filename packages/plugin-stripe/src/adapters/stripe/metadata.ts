import { ProviderError } from "../../ports/payment-provider.js";
import { EXTENSION_METADATA_PREFIX, STRIPE_METADATA_LIMITS } from "./constants.js";

export const INVALID_INPUT_CODE = "invalid_input" as const;

export const invalidInput = (message: string): ProviderError =>
	new ProviderError(message, { isRetryable: false, providerCode: INVALID_INPUT_CODE });

/** Adds the `ext_` prefix once: a key a caller already prefixed is kept as is. */
const extensionKey = (key: string): string =>
	key.startsWith(EXTENSION_METADATA_PREFIX) ? key : `${EXTENSION_METADATA_PREFIX}${key}`;

/**
 * Merges extension metadata under `ext_` and then the plugin's own entries on top, so a plugin key can never
 * be overwritten. Enforces Stripe's limits (50 keys, 40-char keys, 500-char values) before the request is
 * sent: Stripe's own error would arrive only after the stock reservation was made.
 */
export const buildMetadata = (
	pluginEntries: Record<string, string>,
	extraEntries: Record<string, string> = {},
	options: { prefixExtras: boolean } = { prefixExtras: true },
): Record<string, string> => {
	const merged: Record<string, string> = {};
	for (const [key, value] of Object.entries(extraEntries)) {
		merged[options.prefixExtras ? extensionKey(key) : key] = value;
	}
	Object.assign(merged, pluginEntries);
	assertMetadataLimits(merged);
	return merged;
};

export const assertMetadataLimits = (metadata: Record<string, string>): void => {
	const entries = Object.entries(metadata);
	const { maxKeys, maxKeyLength, maxValueLength } = STRIPE_METADATA_LIMITS;
	if (entries.length > maxKeys) throw invalidInput(`Stripe metadata allows at most ${maxKeys} keys, got ${entries.length}`);
	for (const [key, value] of entries) {
		if (key.length === 0 || key.length > maxKeyLength) {
			throw invalidInput(`Stripe metadata keys must be 1-${maxKeyLength} characters, got ${key.length}`);
		}
		if (value.length > maxValueLength) {
			throw invalidInput(`Stripe metadata value for "${key}" exceeds ${maxValueLength} characters`);
		}
	}
};
