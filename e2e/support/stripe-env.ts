import { STRIPE_READY_ENV, STRIPE_SKIP_REASON_ENV } from "./config";

/** Read at call time: the global setup sets these in the main process before the workers start. */
export const isStripeReady = (): boolean => process.env[STRIPE_READY_ENV] === "1";
export const stripeSkipReason = (): string => process.env[STRIPE_SKIP_REASON_ENV] || "no Stripe sandbox in this run";
