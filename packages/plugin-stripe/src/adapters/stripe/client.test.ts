import { afterEach, describe, expect, it } from "vitest";

import { getStripeClient, resetStripeClients } from "./client.js";
import { STRIPE_API_VERSION } from "./constants.js";
import { SECRET_KEY } from "./test-support.js";

interface ClientInternals {
	_api: { version: string; timeout: number; maxNetworkRetries: number };
	_appInfo: { name: string; version: string };
}

afterEach(resetStripeClients);

describe("getStripeClient", () => {
	it("pins the API version, timeout, retries and app info", () => {
		const client = getStripeClient({ secretKey: SECRET_KEY, appVersion: "1.2.3" }) as unknown as ClientInternals;
		expect(client._api).toMatchObject({ version: STRIPE_API_VERSION, timeout: 20_000, maxNetworkRetries: 2 });
		expect(client._appInfo).toMatchObject({ name: "emdash-stripe-commerce", version: "1.2.3" });
	});

	it("keeps one instance per key and app version", () => {
		const a = getStripeClient({ secretKey: SECRET_KEY, appVersion: "1" });
		expect(getStripeClient({ secretKey: SECRET_KEY, appVersion: "1" })).toBe(a);
		expect(getStripeClient({ secretKey: `${SECRET_KEY}x`, appVersion: "1" })).not.toBe(a);
		expect(getStripeClient({ secretKey: SECRET_KEY, appVersion: "2" })).not.toBe(a);
	});

	it("refuses an empty key with a permanent error that names no key", () => {
		expect(() => getStripeClient({ secretKey: "  ", appVersion: "1" })).toThrow(expect.objectContaining({ name: "ProviderError", isRetryable: false, providerCode: "not_configured" }));
	});
});
