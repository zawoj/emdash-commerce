const BASE_MS = 30_000;
const MAX_MS = 30 * 60_000;

/** Exponential backoff from attempt count (1-based after a failure). */
export const catalogNextAttemptAt = (attempts: number, now: Date): string => {
	const delay = Math.min(MAX_MS, BASE_MS * 2 ** Math.max(0, attempts - 1));
	return new Date(now.getTime() + delay).toISOString();
};
