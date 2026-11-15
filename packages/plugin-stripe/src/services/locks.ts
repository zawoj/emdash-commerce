import type { CommerceContainer } from "../plugin/container.js";
import { sleep } from "./payments/async.js";

/**
 * Short-lived mutual exclusion on a record, for read-modify-write sequences on content rows. The content
 * API's `update` is last-writer-wins per column, so two handlers changing one order (a refund webhook and a
 * dispute webhook, say) could silently overwrite each other; every such sequence runs inside `withLock` and
 * re-reads the row inside it.
 *
 * Implementation: the `RecordIndex` claim on `lock:<name>`. A claim is one `compareAndSet(key, null, …)` on a
 * plugin-storage document, the same primitive that already makes order creation exactly-once, so it is
 * atomic on SQLite and Postgres alike (a KV compare-and-set would need an expiry the KV port lacks). The
 * lock never gets a record id, so the index treats it as an unfinished claim: a holder that crashed is
 * taken over after the index's stale window (5 minutes), and `releaseClaim` deletes it. Waiting is a short
 * poll; when the lock stays busy the caller throws `LockBusyError`, which the webhook inbox treats like any
 * failure (retry with backoff), never as lost work.
 *
 * Limits, on purpose: no owner token (a holder stalled beyond the stale window could release its
 * successor's lock) and no fairness. Both only matter for stalls of minutes, and every guarded sequence is
 * idempotent.
 */

export class LockBusyError extends Error {
	readonly lockName: string;

	constructor(lockName: string) {
		super(`Could not acquire lock ${lockName}`);
		this.name = "LockBusyError";
		this.lockName = lockName;
	}
}

export const LOCK_KEY = {
	order: (orderId: string): string => `lock:order:${orderId}`,
	payment: (paymentId: string): string => `lock:payment:${paymentId}`,
	customer: (customerId: string): string => `lock:customer:${customerId}`,
	subscription: (subscriptionId: string): string => `lock:subscription:${subscriptionId}`,
	/** The managed price entries of one product and its variants (product and variant saves converge them). */
	managedPrices: (productId: string): string => `lock:managed-prices:${productId}`,
} as const;

export interface LockOptions {
	/** Total time to wait for a busy lock. */
	waitMs?: number;
	pollMs?: number;
}

const DEFAULT_WAIT_MS = 8_000;
const DEFAULT_POLL_MS = 15;

export const withLock = async <T>(
	container: Pick<CommerceContainer, "recordIndex">,
	key: string,
	run: () => Promise<T>,
	options: LockOptions = {},
): Promise<T> => {
	const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
	const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
	const startedAt = Date.now();
	for (;;) {
		const claim = await container.recordIndex.claim(key);
		if (claim.isWinner) break;
		if (Date.now() - startedAt >= waitMs) throw new LockBusyError(key);
		await sleep(pollMs);
	}
	try {
		return await run();
	} finally {
		await container.recordIndex.releaseClaim(key).catch(() => undefined);
	}
};
