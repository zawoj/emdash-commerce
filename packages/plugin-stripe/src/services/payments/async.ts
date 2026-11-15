/** Small async helpers shared by the money-path services. */

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rejects when `promise` does not settle within `ms`. The underlying work is not cancelled (JavaScript
 * cannot), so a handler that times out may still finish: delivery is at-least-once and handlers idempotent.
 */
export const withTimeout = async <T>(run: () => Promise<T>, ms: number, label: string): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
	});
	try {
		return await Promise.race([Promise.resolve().then(run), timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
};

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

/** 30 s, 2 min, 8 min, 32 min, 2 h 8 min, then capped at 6 h. `attempts` is the number of attempts made so far. */
export const retryDelayMs = (attempts: number): number =>
	Math.min(BACKOFF_BASE_MS * 4 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);

export const nextAttemptIso = (now: Date, attempts: number): string => new Date(now.getTime() + retryDelayMs(attempts)).toISOString();
