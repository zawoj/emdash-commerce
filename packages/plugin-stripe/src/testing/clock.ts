import type { IdGenerator } from "../core/ids.js";
import { toBase64Url } from "../core/ids.js";
import type { Clock } from "../ports/repositories.js";

export interface FixedClock extends Clock {
	set(time: Date | string): void;
	advance(ms: number): void;
}

/** A clock that only moves when the test says so. */
export const createFixedClock = (start: Date | string = "2026-01-15T12:00:00.000Z"): FixedClock => {
	let current = new Date(start).getTime();
	return {
		now: () => new Date(current),
		set: (time) => {
			current = new Date(time).getTime();
		},
		advance: (ms) => {
			current += ms;
		},
	};
};

/** mulberry32: tiny deterministic PRNG, good enough for reproducible test ids (never for secrets). */
const mulberry32 = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

export const createSeededIdGenerator = (seed = 1): IdGenerator => {
	const next = mulberry32(seed);
	const randomBytes = (length: number): Uint8Array => {
		const bytes = new Uint8Array(length);
		for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(next() * 256);
		return bytes;
	};
	return { randomBytes, randomId: (bytes = 16) => toBase64Url(randomBytes(bytes)) };
};

export const createNullLogger = () => ({
	debug: (): void => undefined,
	info: (): void => undefined,
	warn: (): void => undefined,
	error: (): void => undefined,
});
