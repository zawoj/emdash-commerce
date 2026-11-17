/**
 * Pure helpers of `scripts/bootstrap.mjs`: what a good `.env` looks like and how to change one value in it without
 * touching the rest. No I/O here, so every rule is unit-tested (`bootstrap-env.test.mjs`).
 */

const PLACEHOLDERS = new Set([
	"replace-with-emdash-secrets-generate",
	// What `.env.example` shipped before EmDash 1.5 changed the key format; a copy made then is still a placeholder.
	"replace-with-openssl-rand-hex-32",
	"sk_test_replace_me",
	"whsec_replace_me",
	"",
]);

/** EmDash 1.5 only accepts `emdash_enc_v1_` plus 43 base64url characters (32 random bytes); a bare hex key is rejected at startup. */
const ENCRYPTION_KEY_PATTERN = /^emdash_enc_v1_[A-Za-z0-9_-]{43}$/;

/** A key in the format EmDash accepts. EmDash also takes a comma-separated list (key rotation): every entry must be valid. */
export const isEncryptionKey = (value) => {
	const entries = String(value ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
	return entries.length > 0 && entries.every((entry) => ENCRYPTION_KEY_PATTERN.test(entry));
};

/** A new encryption key from 32 random bytes (what `emdash secrets generate` prints). */
export const encryptionKeyFrom = (bytes) => `emdash_enc_v1_${Buffer.from(bytes).toString("base64url")}`;

/** True for an empty value or one of the placeholders `.env.example` ships. */
export const isPlaceholder = (value) => value === undefined || PLACEHOLDERS.has(String(value).trim());

/** `KEY=value` lines of an env file as an object (comments and blank lines ignored, quotes stripped). */
export const parseEnv = (text) => {
	const out = {};
	for (const line of text.split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (!match) continue;
		out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
	}
	return out;
};

/** Set `KEY=value`: replaces the first uncommented line of that key, else appends one. Everything else is kept byte for byte. */
export const upsertEnv = (text, key, value) => {
	const lines = text.split("\n");
	const index = lines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
	if (index === -1) {
		const needsBreak = text.length > 0 && !text.endsWith("\n");
		return `${text}${needsBreak ? "\n" : ""}${key}=${value}\n`;
	}
	lines[index] = `${key}=${value}`;
	return lines.join("\n");
};

/**
 * What kind of Stripe secret a string is. `live` is refused everywhere: local work uses a sandbox only.
 * @returns {"test" | "restricted-test" | "live" | "invalid"}
 */
export const classifyStripeKey = (value) => {
	const key = String(value ?? "").trim();
	if (/^sk_test_[A-Za-z0-9]{8,}$/.test(key)) return "test";
	if (/^rk_test_[A-Za-z0-9]{8,}$/.test(key)) return "restricted-test";
	if (/^(sk|rk)_live_/.test(key)) return "live";
	return "invalid";
};

export const isWebhookSecret = (value) => /^whsec_[A-Za-z0-9]{8,}$/.test(String(value ?? "").trim());

/** "v24.22.1" or "24.22.1" to `[24, 22, 1]`. */
const partsOf = (version) =>
	String(version)
		.trim()
		.replace(/^v/, "")
		.split(".")
		.map((part) => Number.parseInt(part, 10) || 0);

/** True when `actual` is at least `required` (both `x.y.z`, a leading `v` allowed). */
export const isNodeVersionAtLeast = (actual, required) => {
	const a = partsOf(actual);
	const r = partsOf(required);
	for (let i = 0; i < 3; i += 1) {
		const diff = (a[i] ?? 0) - (r[i] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	return true;
};

/**
 * The state of an env file as a list of checks, without ever returning a value (the report may be pasted into a chat).
 * @returns {{ id: string, isOk: boolean, isRequired: boolean, message: string }[]}
 */
export const checkEnv = (env) => {
	const stripeKind = isPlaceholder(env.STRIPE_SECRET_KEY) ? "missing" : classifyStripeKey(env.STRIPE_SECRET_KEY);
	return [
		{
			id: "encryption-key",
			isRequired: true,
			isOk: !isPlaceholder(env.EMDASH_ENCRYPTION_KEY) && isEncryptionKey(env.EMDASH_ENCRYPTION_KEY),
			message: "EMDASH_ENCRYPTION_KEY is an EmDash key (emdash_enc_v1_ + 43 characters; `npx emdash secrets generate` makes one)",
		},
		{
			id: "stripe-key",
			isRequired: false,
			isOk: stripeKind === "test" || stripeKind === "restricted-test",
			message:
				stripeKind === "live"
					? "STRIPE_SECRET_KEY is a LIVE key: replace it with a sandbox key (sk_test_ / rk_test_)"
					: "STRIPE_SECRET_KEY is a sandbox key (sk_test_ / rk_test_); without it checkout answers NOT_CONFIGURED",
		},
		{
			id: "webhook-secret",
			isRequired: false,
			isOk: isWebhookSecret(env.STRIPE_WEBHOOK_SECRET),
			message: "STRIPE_WEBHOOK_SECRET is the whsec_ value `stripe listen` prints; without it paid orders never appear",
		},
	];
};
