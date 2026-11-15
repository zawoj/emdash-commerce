import { REVIEW_FLAG, type ReviewFlag } from "../../core/order.js";
import type { ProviderCheckoutSession } from "../../ports/payment-provider.js";
import type { CheckoutSnapshot } from "../../ports/repositories.js";

const quantitiesByPrice = (lines: ReadonlyArray<{ providerPriceId: string; quantity: number }>): Map<string, number> => {
	const totals = new Map<string, number>();
	for (const line of lines) totals.set(line.providerPriceId, (totals.get(line.providerPriceId) ?? 0) + line.quantity);
	return totals;
};

const isSameQuantities = (a: Map<string, number>, b: Map<string, number>): boolean => {
	if (a.size !== b.size) return false;
	for (const [priceId, quantity] of a) if (b.get(priceId) !== quantity) return false;
	return true;
};

/**
 * Compares what Stripe says was paid for with what the server put in the checkout. A difference never
 * drops the order (the customer paid); it flags it for a human. Everything here reads the freshly retrieved
 * session and the server-side snapshot, never the event payload or client-supplied data.
 */
export const reviewFlagsForSession = (input: {
	session: ProviderCheckoutSession;
	snapshot: CheckoutSnapshot | null;
	expectedLivemode: boolean | null;
}): ReviewFlag[] => {
	const { session, snapshot, expectedLivemode } = input;
	const flags: ReviewFlag[] = [];
	if (expectedLivemode !== null && session.isLivemode !== expectedLivemode) flags.push(REVIEW_FLAG.livemodeMismatch);
	if (!snapshot) {
		flags.push(REVIEW_FLAG.missingSnapshot);
		return flags;
	}
	if (snapshot.currency.toLowerCase() !== session.currency) flags.push(REVIEW_FLAG.currencyMismatch);
	if (!isSameQuantities(quantitiesByPrice(snapshot.lines), quantitiesByPrice(session.lines))) flags.push(REVIEW_FLAG.lineItemsMismatch);
	if (session.amountSubtotal !== snapshot.expectedSubtotal) flags.push(REVIEW_FLAG.amountMismatch);
	return flags;
};
