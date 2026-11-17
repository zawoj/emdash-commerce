import type Stripe from "stripe";

import { ProviderError, type CheckoutProvider } from "../../ports/payment-provider.js";
import { buildCheckoutSessionParams } from "./checkout-params.js";
import { callStripe, retrieveStripe, STRIPE_ERROR_CODE } from "./errors.js";
import { SESSION_RETRIEVE_EXPAND, toCheckoutSessionResult, toProviderCheckoutSession } from "./mappers/session.js";

const incompleteSession = (what: string): ProviderError =>
	new ProviderError(`Stripe returned a Checkout Session without ${what}`, {
		isRetryable: false,
		providerCode: STRIPE_ERROR_CODE.invalidResponse,
	});

export const createCheckoutProvider = (
	getClient: () => Stripe,
	config: { integrationIdentifier: string; onSkipped?: (skipped: string[]) => void },
): CheckoutProvider => ({
	async createSession(input, idempotencyKey) {
		const { params, skipped } = buildCheckoutSessionParams(input, config);
		// A configured option Stripe does not allow in this mode is dropped, never sent; say so instead of hiding it.
		if (skipped.length > 0) config.onSkipped?.(skipped);
		const session = await callStripe("checkout session create", () =>
			getClient().checkout.sessions.create(params, { idempotencyKey }),
		);
		const result = toCheckoutSessionResult(session);
		if (input.uiMode === "hosted" && !result.url) throw incompleteSession("a url");
		if (input.uiMode === "embedded" && !result.clientSecret) throw incompleteSession("a client secret");
		return result;
	},

	async retrieveSession(sessionId) {
		const session = await retrieveStripe("checkout session retrieve", () =>
			getClient().checkout.sessions.retrieve(sessionId, { expand: [...SESSION_RETRIEVE_EXPAND] }),
		);
		return session ? toProviderCheckoutSession(session) : null;
	},

	/** Expiring a session that is already complete or expired (or gone) is the desired end state, not a failure. */
	async expireSession(sessionId) {
		try {
			await callStripe("checkout session expire", () => getClient().checkout.sessions.expire(sessionId));
		} catch (error) {
			const current = await retrieveStripe("checkout session retrieve", () => getClient().checkout.sessions.retrieve(sessionId));
			if (current === null || current.status !== "open") return;
			throw error;
		}
	},
});
