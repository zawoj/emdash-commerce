/**
 * Randomness port. Everything that needs unguessable or unique values (cart ids, reservation ids,
 * order numbers, token secrets) takes an `IdGenerator`, so tests inject a seeded one and production
 * uses Web Crypto only (`globalThis.crypto`), which also runs on Workers.
 */
export interface IdGenerator {
	/** `bytes` random bytes (default 16) encoded as base64url without padding. */
	randomId(bytes?: number): string;
	/** Cryptographically random bytes; used where an alphabet must be sampled uniformly. */
	randomBytes(length: number): Uint8Array;
}

const DEFAULT_ID_BYTES = 16;

/** Largest request `crypto.getRandomValues` accepts in one call. */
const MAX_RANDOM_CHUNK = 65_536;

export const toBase64Url = (bytes: Uint8Array): string => {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

export const fromBase64Url = (value: string): Uint8Array => {
	const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
};

const assertLength = (length: number): void => {
	if (!Number.isInteger(length) || length < 0) throw new RangeError(`Invalid byte length: ${length}`);
};

export const createWebCryptoIdGenerator = (): IdGenerator => {
	const randomBytes = (length: number): Uint8Array => {
		assertLength(length);
		const bytes = new Uint8Array(length);
		for (let offset = 0; offset < length; offset += MAX_RANDOM_CHUNK) {
			globalThis.crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + MAX_RANDOM_CHUNK, length)));
		}
		return bytes;
	};
	return {
		randomBytes,
		randomId: (bytes = DEFAULT_ID_BYTES) => toBase64Url(randomBytes(bytes)),
	};
};

/** Default process-wide generator. */
export const webCryptoIdGenerator: IdGenerator = createWebCryptoIdGenerator();
