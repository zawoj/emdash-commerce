import { describe, expect, it } from "vitest";

import { SETTINGS_KEY } from "../../contracts/options.js";
import { createSeededIdGenerator } from "../../testing/clock.js";
import { createFakeKv } from "../../testing/fakes/storage.js";
import { ENV_KEY, ensureAccessTokenSecret, resolveSecrets, settingsSchema } from "./settings.js";

const warnings: unknown[] = [];
const log = { warn: (_message: string, data?: unknown) => void warnings.push(data) };

describe("resolveSecrets", () => {
	it("prefers a value saved in the admin over the environment", async () => {
		const settings = createFakeKv();
		await settings.set(SETTINGS_KEY.stripeSecretKey, "  sk_from_admin ");
		const secrets = await resolveSecrets(settings, { [ENV_KEY.stripeSecretKey]: "sk_from_env", [ENV_KEY.stripeWebhookSecret]: "whsec_env" });
		expect(secrets).toEqual({ stripeSecretKey: "sk_from_admin", stripeWebhookSecret: "whsec_env", accessTokenSecret: null });
	});

	it("falls back to the environment, and treats blank values as missing", async () => {
		const settings = createFakeKv();
		await settings.set(SETTINGS_KEY.stripeSecretKey, "   ");
		const secrets = await resolveSecrets(settings, { [ENV_KEY.stripeSecretKey]: "sk_env", [ENV_KEY.accessTokenSecret]: "" });
		expect(secrets.stripeSecretKey).toBe("sk_env");
		expect(secrets.accessTokenSecret).toBeNull();
		expect((await resolveSecrets(createFakeKv(), {})).stripeSecretKey).toBeNull();
	});
});

describe("settingsSchema", () => {
	it("declares the three secrets as encrypted secret fields", () => {
		for (const key of Object.values(SETTINGS_KEY)) expect(settingsSchema[key]?.type).toBe("secret");
	});
});

describe("ensureAccessTokenSecret", () => {
	it("generates a 32-byte base64url secret once and keeps it", async () => {
		const settings = createFakeKv();
		const ids = createSeededIdGenerator(3);
		const first = await ensureAccessTokenSecret(settings, ids, log, {});
		expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(await ensureAccessTokenSecret(settings, ids, log, {})).toBe(first);
		expect(await settings.get(SETTINGS_KEY.accessTokenSecret)).toBe(first);
	});

	it("never overwrites an existing secret, even when activations race", async () => {
		const settings = createFakeKv();
		const results = await Promise.all(Array.from({ length: 5 }, (_, index) => ensureAccessTokenSecret(settings, createSeededIdGenerator(index + 10), log, {})));
		expect(new Set(results).size).toBe(1);
		expect(await settings.get(SETTINGS_KEY.accessTokenSecret)).toBe(results[0]);
	});

	it("uses the environment value instead of generating one", async () => {
		const settings = createFakeKv();
		const secret = await ensureAccessTokenSecret(settings, createSeededIdGenerator(), log, { [ENV_KEY.accessTokenSecret]: "from-env" });
		expect(secret).toBe("from-env");
		expect(await settings.get(SETTINGS_KEY.accessTokenSecret)).toBeNull();
	});

	it("logs and returns null when settings cannot be written (no encryption key)", async () => {
		const settings = createFakeKv();
		settings.compareAndSet = async () => {
			throw new Error("EMDASH_ENCRYPTION_KEY is not set");
		};
		warnings.length = 0;
		expect(await ensureAccessTokenSecret(settings, createSeededIdGenerator(), log, {})).toBeNull();
		expect(JSON.stringify(warnings)).toContain("EMDASH_ENCRYPTION_KEY");
	});
});
