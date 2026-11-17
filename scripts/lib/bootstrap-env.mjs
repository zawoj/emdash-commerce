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
	"smtp.example.com",
	"replace-with-smtp-username",
	"replace-with-smtp-password",
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

/** How EmDash's built-in SMTP provider sees the `EMAIL_SMTP_*` variables of an env. */
export const SMTP_STATES = { none: "none", ready: "ready", invalid: "invalid" };

const looksLikeEmail = (value) => /^[^\s<>,;"\\@]+@[^\s<>,;"\\]+$/.test(String(value ?? "").trim());

/**
 * Whether `EMAIL_SMTP_*` configure EmDash's built-in SMTP provider, with the same rules EmDash applies at startup
 * (`loadSmtpConfigFromEnv` in emdash 1.5): host set, port 1 to 65535 and not 25, secure `starttls` or `tls`, user and
 * password set, and a sender (`EMAIL_SMTP_FROM_EMAIL`, `EMAIL_SMTP_FROM`, or a user that is itself an address). The
 * `problem` is a fixed sentence, never a value. Settings saved in the admin (Settings → Email) are not in an env file.
 * @returns {{ state: "none" | "ready" | "invalid", problem?: string }}
 */
export const smtpEnvStatus = (env) => {
	const has = (name) => !isPlaceholder(env[name]);
	if (!has("EMAIL_SMTP_HOST")) return { state: SMTP_STATES.none };
	const invalid = (problem) => ({ state: SMTP_STATES.invalid, problem });
	const portRaw = has("EMAIL_SMTP_PORT") ? String(env.EMAIL_SMTP_PORT).trim() : "587";
	const port = Number(portRaw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) return invalid("EMAIL_SMTP_PORT must be a port number from 1 to 65535");
	if (port === 25) return invalid("EMAIL_SMTP_PORT=25 is not supported by EmDash: use 587 (STARTTLS) or 465 (implicit TLS)");
	const secure = has("EMAIL_SMTP_SECURE") ? String(env.EMAIL_SMTP_SECURE).trim() : port === 465 ? "tls" : "starttls";
	if (secure !== "starttls" && secure !== "tls") return invalid('EMAIL_SMTP_SECURE must be "starttls" or "tls"');
	if (!has("EMAIL_SMTP_USER") || !has("EMAIL_SMTP_PASS")) return invalid("EMAIL_SMTP_USER and EMAIL_SMTP_PASS are both required when EMAIL_SMTP_HOST is set");
	const hasSender = has("EMAIL_SMTP_FROM_EMAIL") || has("EMAIL_SMTP_FROM") || looksLikeEmail(env.EMAIL_SMTP_USER);
	if (!hasSender) return invalid("EMAIL_SMTP_USER is not an email address, so set EMAIL_SMTP_FROM_EMAIL (the sender)");
	return { state: SMTP_STATES.ready };
};

const emailCheck = (env) => {
	const { state, problem } = smtpEnvStatus(env);
	const base = { id: "email-provider", isRequired: false };
	if (state === SMTP_STATES.ready) {
		return { ...base, isOk: true, message: "Email: SMTP is configured (EMAIL_SMTP_*), so order and sign-in emails are delivered" };
	}
	if (state === SMTP_STATES.invalid) {
		return { ...base, isOk: false, message: `Email: EmDash ignores the EMAIL_SMTP_* settings: ${problem}` };
	}
	return {
		...base,
		isOk: false,
		message: "Email: no EMAIL_SMTP_* settings, so mails only reach the dev console (fine locally; a deployed site needs a provider, docs/email.md)",
	};
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
		emailCheck(env),
	];
};
