import type { z } from "zod";

import type { CheckoutStatusView, CheckoutView, checkoutInput } from "../contracts/api.js";
import { CART_ISSUE, CART_STATUS, type Cart, type CartIssue, type PricedCart } from "../core/cart.js";
import { normaliseEmail, type Customer } from "../core/customer.js";
import { CommerceError } from "../core/errors.js";
import { PRICE_TYPE } from "../core/catalog.js";
import { toCurrencyCode } from "../core/money.js";
import type { CommerceContainer } from "../plugin/container.js";
import type { CheckoutSessionInput } from "../ports/payment-provider.js";
import { RECORD_INDEX_KEY, type CheckoutSnapshot } from "../ports/repositories.js";
import type { StorefrontDeps } from "./cart/deps.js";
import { cartExpiry, isCartLive, unlockCheckout } from "./cart/lifecycle.js";
import { mirrorCart } from "./cart/mirror.js";
import { loadPricedCart } from "./cart/pricing.js";
import { customizeCheckout, defaultCustomization } from "./checkout/customization.js";
import { findReusableSession } from "./checkout/session-reuse.js";
import { readCheckoutStatus } from "./checkout/status.js";
import { buildRedirectUrls } from "./checkout/urls.js";
import { createInventoryService } from "./inventory.js";

export type CheckoutInput = z.infer<typeof checkoutInput>;

export interface CheckoutService {
	/** Creates (or returns the already open) Checkout Session for the cart behind `cartId`. */
	checkout(cartId: string | null, input: CheckoutInput): Promise<CheckoutView>;
	status(sessionId: string): Promise<CheckoutStatusView>;
}

/**
 * A lost race (another checkout won the cart, or a line changed) re-reads and decides again; three rounds
 * are plenty because each loss means somebody else made progress.
 */
const MAX_ATTEMPTS = 3;

const checkoutIdempotencyKey = (checkoutId: string): string => `stripe-commerce:checkout:${checkoutId}`;

const cartNotReady = (issues: CartIssue[], message = "This cart cannot be checked out yet."): CommerceError =>
	new CommerceError("cartNotCheckoutReady", message, { issues });

/**
 * Trial of the recurring lines. Stripe takes one trial per subscription, so when lines disagree the longest
 * wins (the buyer is never charged earlier than any single line promised); payment mode has no trial.
 */
const trialDaysOf = (priced: PricedCart): number | null => {
	if (priced.mode !== "subscription") return null;
	const trials = priced.lines.filter((line) => line.priceType === PRICE_TYPE.recurring && line.trialDays && line.trialDays > 0).map((line) => line.trialDays as number);
	return trials.length > 0 ? Math.max(...trials) : null;
};

/** Stock shortfalls as cart issues, so the client can show them on the lines they belong to. */
const shortfallIssues = (priced: PricedCart, shortfalls: Array<{ sellable: { kind: string; id: string }; requested: number; available: number }>): CartIssue[] =>
	shortfalls.flatMap((shortfall) =>
		priced.lines
			.filter((line) => line.sellable.kind === shortfall.sellable.kind && line.sellable.id === shortfall.sellable.id)
			.map((line) => ({
				code: shortfall.available === 0 ? CART_ISSUE.outOfStock : CART_ISSUE.insufficientStock,
				priceId: line.priceId,
				message: shortfall.available === 0 ? `${line.title} is out of stock.` : `Only ${shortfall.available} of ${line.title} left.`,
				available: Math.max(0, shortfall.available),
			})),
	);

export interface CheckoutServiceSettings {
	/** How long a request waits for the session another request is creating (poll interval, number of polls). */
	pollMs: number;
	maxPolls: number;
}

const DEFAULT_SETTINGS: CheckoutServiceSettings = { pollMs: 200, maxPolls: 40 };

/** A claim older than this was left behind by a request that died; the next checkout takes the cart over. */
const STALE_CLAIM_MS = 90_000;

/** `CartCheckout.sessionId` while the claiming request has not created the session yet. */
const PENDING_SESSION_ID = "";
const isPendingClaim = (cart: Cart): boolean => cart.checkout?.sessionId === PENDING_SESSION_ID;
const isStaleClaim = (cart: Cart, now: Date): boolean => now.getTime() - Date.parse(cart.updatedAt) > STALE_CLAIM_MS;

export const createCheckoutService = (container: CommerceContainer, deps: StorefrontDeps, settingsOverride: Partial<CheckoutServiceSettings> = {}): CheckoutService => {
	const settings = { ...DEFAULT_SETTINGS, ...settingsOverride };
	const inventory = createInventoryService(container, deps);

	const findCustomer = async (email: string | null): Promise<Customer | null> => {
		if (!email) return null;
		const customerId = await container.recordIndex.get(RECORD_INDEX_KEY.customerByEmail(normaliseEmail(email)));
		return customerId ? container.customers.get(customerId) : null;
	};

	/** Undoes what a failed or lost checkout attempt took; best effort, never masks the original failure. */
	const compensate = async (reservationId: string, sessionId: string | null): Promise<void> => {
		try {
			await inventory.release(reservationId);
		} catch (error) {
			container.log.error("Reservation could not be released after a failed checkout", { reservationId, error: error instanceof Error ? error.message : "unknown" });
		}
		if (!sessionId) return;
		try {
			await (await container.provider()).checkout.expireSession(sessionId);
		} catch (error) {
			container.log.warn("Unused checkout session could not be expired", { sessionId, error: error instanceof Error ? error.message : "unknown" });
		}
	};

	const requireLiveCart = async (cartId: string | null): Promise<{ cart: Cart; revision: string }> => {
		const stored = cartId ? await container.carts.get(cartId) : null;
		if (!stored || !isCartLive(stored.value, container.clock.now().toISOString())) throw new CommerceError("notFound", "Cart not found");
		return { cart: stored.value, revision: stored.revision };
	};

	const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

	/**
	 * Another request holds the cart's pending claim and is creating the session: wait for it and hand back
	 * its session. Null means the claim ended without a usable session (it failed, the cart changed, the
	 * mode differs), so the caller re-reads and decides again.
	 */
	const waitForSession = async (cartId: string, uiMode: "hosted" | "embedded"): Promise<CheckoutView | null> => {
		for (let poll = 0; poll < settings.maxPolls; poll += 1) {
			const stored = await container.carts.get(cartId);
			if (!stored || !isCartLive(stored.value, container.clock.now().toISOString())) return null;
			const cart = stored.value;
			if (cart.status !== CART_STATUS.checkoutOpen) return null;
			if (!isPendingClaim(cart)) return findReusableSession(container, cart, uiMode);
			if (isStaleClaim(cart, container.clock.now())) return null;
			await sleep(settings.pollMs);
		}
		throw new CommerceError("conflict", "Checkout is already being prepared. Try again in a moment.");
	};

	/** Puts a claimed cart back to `active` after the attempt failed; a lost race means somebody else already moved it. */
	const reopenClaim = async (claimed: Cart, revision: string): Promise<void> => {
		try {
			await container.carts.put({ ...claimed, status: CART_STATUS.active, checkout: null, updatedAt: container.clock.now().toISOString() }, revision);
		} catch (error) {
			container.log.warn("Cart could not be reopened after a failed checkout", { cartId: claimed.id, error: error instanceof Error ? error.message : "unknown" });
		}
	};

	/** One round: returns the view, or null when the cart changed under us and the caller should re-read. */
	const attempt = async (cartId: string | null, input: CheckoutInput): Promise<CheckoutView | null> => {
		let { cart, revision } = await requireLiveCart(cartId);

		const reusable = await findReusableSession(container, cart, input.uiMode);
		if (reusable) return reusable;

		if (cart.status === CART_STATUS.checkoutOpen) {
			if (isPendingClaim(cart) && !isStaleClaim(cart, container.clock.now())) return waitForSession(cart.id, input.uiMode);
			// An open checkout that is not reusable (other lines or mode, expired, or an abandoned claim) is closed first.
			const reopened = await unlockCheckout(container, cart);
			const result = await container.carts.put({ ...reopened, updatedAt: container.clock.now().toISOString() }, revision);
			if (!result.applied) return null;
			cart = reopened;
			revision = result.revision;
		}

		const priced = await loadPricedCart(container, deps.extensionContext, cart);
		if (cart.lines.length === 0) throw cartNotReady([], "Your cart is empty.");
		if (!priced.isCheckoutReady) throw cartNotReady(priced.issues);
		const mode = priced.mode;
		const currency = priced.currency;
		if (!mode || !currency || !container.options.supportedCurrencies.includes(currency)) {
			throw cartNotReady([{ code: CART_ISSUE.priceInactive, priceId: null, message: "The cart currency is not supported." }]);
		}

		// The real sync happens here, not in the cart view: it may call the provider.
		const providerPrices = await deps.catalogSync.ensurePricesSynced(priced.lines.map((line) => line.priceId));
		const unsellable = priced.lines.filter((line) => !providerPrices.get(line.priceId));
		if (unsellable.length > 0) {
			throw cartNotReady(unsellable.map((line) => ({ code: CART_ISSUE.notSynced, priceId: line.priceId, message: "This item is not ready for checkout yet." })));
		}

		const email = input.email ? normaliseEmail(input.email) : cart.email;
		const customer = await findCustomer(email);
		const customization = await customizeCheckout(
			container.extensions.customizeCheckout?.bind(container.extensions),
			defaultCustomization(container.options.checkout, priced, trialDaysOf(priced)),
			{ cart: priced, customer },
			deps.extensionContext,
		);

		const now = container.clock.now();
		const checkoutId = container.ids.randomId(16);
		const reservationId = checkoutId;
		const expiresAt = new Date(now.getTime() + container.options.checkout.sessionMinutes * 60_000).toISOString();

		// The cart compare-and-set decides the one winner among concurrent requests: whoever flips the cart to a
		// pending `checkout_open` creates the reservation and the session; everyone else waits for that session.
		const claimedCart: Cart = {
			...cart,
			status: CART_STATUS.checkoutOpen,
			email,
			checkout: { sessionId: PENDING_SESSION_ID, reservationId, expiresAt },
			updatedAt: now.toISOString(),
			expiresAt: cartExpiry(container),
		};
		const claim = await container.carts.put(claimedCart, revision);
		if (!claim.applied) return null;

		let sessionId: string | null = null;
		try {
			const reserved = await inventory.reserve({ reservationId, cartId: cart.id, expiresAt, lines: priced.lines.map((line) => ({ sellable: line.sellable, quantity: line.quantity })) });
			if (!reserved.ok) {
				throw new CommerceError("insufficientStock", "Some items are no longer available in the requested quantity.", {
					shortfalls: reserved.shortfalls.map((shortfall) => ({ ...shortfall.sellable, requested: shortfall.requested, available: shortfall.available })),
					issues: shortfallIssues(priced, reserved.shortfalls),
				});
			}
			const snapshot: CheckoutSnapshot = {
				checkoutId,
				cartId: cart.id,
				sessionId: null,
				mode,
				currency,
				lines: priced.lines.map((line) => ({
					priceId: line.priceId,
					providerPriceId: providerPrices.get(line.priceId) as string,
					quantity: line.quantity,
					unitAmount: line.unitAmount.amount,
				})),
				expectedSubtotal: priced.subtotal?.amount ?? 0,
				reservationId,
				customerId: customer?.id ?? null,
				createdAt: now.toISOString(),
				uiMode: input.uiMode,
				expiresAt,
			};
			// The snapshot exists before the session does, so a webhook can never arrive for a session with no snapshot.
			await container.snapshots.put(snapshot);
			const provider = await container.provider();
			const sessionInput: CheckoutSessionInput = {
				checkoutId,
				cartId: cart.id,
				mode,
				uiMode: input.uiMode,
				currency: toCurrencyCode(currency),
				lines: snapshot.lines.map((line) => ({ providerPriceId: line.providerPriceId, quantity: line.quantity })),
				customerEmail: email,
				providerCustomerId: customer?.stripeCustomerId ?? null,
				...buildRedirectUrls(container.options.checkout, container.siteUrl, input.uiMode),
				expiresAt,
				locale: customization.locale,
				allowPromotionCodes: customization.allowPromotionCodes,
				billingAddressCollection: container.options.checkout.billingAddressCollection,
				shippingAddressCountries: customization.shippingAddressCountries,
				shippingRates: customization.shippingRates,
				collectPhone: customization.collectPhone,
				automaticTax: container.options.checkout.automaticTax,
				trialDays: mode === "subscription" ? customization.trialDays : null,
				extraMetadata: customization.metadata,
			};
			const session = await provider.checkout.createSession(sessionInput, checkoutIdempotencyKey(checkoutId));
			sessionId = session.sessionId;
			await container.snapshots.put({ ...snapshot, sessionId, sessionUrl: session.url, clientSecret: session.clientSecret });

			const opened: Cart = { ...claimedCart, checkout: { sessionId, reservationId, expiresAt } };
			const finalized = await container.carts.put(opened, claim.revision);
			if (!finalized.applied) {
				// A line changed while the session was being made: the session is stale, undo it and decide again.
				await compensate(reservationId, sessionId);
				return null;
			}
			await mirrorCart(container, { ...priced, cart: opened });
			return { sessionId, uiMode: input.uiMode, url: session.url, clientSecret: session.clientSecret, expiresAt };
		} catch (error) {
			await compensate(reservationId, sessionId);
			await reopenClaim(claimedCart, claim.revision);
			throw error;
		}
	};

	return {
		async checkout(cartId, input) {
			if (!container.options.checkout.uiModes.includes(input.uiMode)) {
				throw new CommerceError("invalidInput", `Checkout mode "${input.uiMode}" is not enabled.`, { uiModes: container.options.checkout.uiModes });
			}
			for (let round = 0; round < MAX_ATTEMPTS; round += 1) {
				const view = await attempt(cartId, input);
				if (view) return view;
			}
			throw new CommerceError("conflict", "The cart is being changed elsewhere. Try again.");
		},
		status: (sessionId) => readCheckoutStatus(container, sessionId),
	};
};
