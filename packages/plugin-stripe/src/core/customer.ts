/**
 * EmDash has no customer accounts. A customer is identified by a normalised email and linked to one
 * Stripe Customer; a buyer proves ownership of an order through a signed access token (access-token.ts).
 */

export interface Address {
	line1: string | null;
	line2: string | null;
	city: string | null;
	postalCode: string | null;
	state: string | null;
	/** ISO 3166-1 alpha-2 */
	country: string | null;
}

export interface Customer {
	id: string;
	/** Lowercased and trimmed; the identity key (unique). */
	email: string;
	name: string | null;
	phone: string | null;
	billingAddress: Address | null;
	shippingAddress: Address | null;
	stripeCustomerId: string | null;
	orderCount: number;
	/** Lifetime paid amount per currency, in minor units. */
	totalSpent: Record<string, number>;
	firstOrderAt: string | null;
	lastOrderAt: string | null;
}

export const normaliseEmail = (email: string): string => email.trim().toLowerCase();
