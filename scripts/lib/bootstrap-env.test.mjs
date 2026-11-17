import { describe, expect, it } from "vitest";

import {
	checkEnv,
	classifyStripeKey,
	encryptionKeyFrom,
	isEncryptionKey,
	isNodeVersionAtLeast,
	isPlaceholder,
	isWebhookSecret,
	parseEnv,
	upsertEnv,
} from "./bootstrap-env.mjs";

const EXAMPLE = [
	"# comment",
	"EMDASH_ENCRYPTION_KEY=replace-with-emdash-secrets-generate",
	"",
	"STRIPE_SECRET_KEY=sk_test_replace_me",
	"STRIPE_WEBHOOK_SECRET=whsec_replace_me",
	"# COMMERCE_ACCESS_TOKEN_SECRET=",
].join("\n");

describe("parseEnv", () => {
	it("reads values, ignores comments and strips quotes", () => {
		expect(parseEnv(`# x\nA=1\nB="two"\n  C = 'three'  \n#D=4\n`)).toEqual({ A: "1", B: "two", C: "three" });
	});
});

describe("upsertEnv", () => {
	it("replaces one line and keeps everything else, comments included", () => {
		const next = upsertEnv(EXAMPLE, "STRIPE_SECRET_KEY", "sk_test_abcdefgh1234");
		expect(next).toBe(EXAMPLE.replace("sk_test_replace_me", "sk_test_abcdefgh1234"));
	});

	it("does not treat a commented key as the key", () => {
		const next = upsertEnv(EXAMPLE, "COMMERCE_ACCESS_TOKEN_SECRET", "abc");
		expect(next).toContain("# COMMERCE_ACCESS_TOKEN_SECRET=\n");
		expect(next.endsWith("COMMERCE_ACCESS_TOKEN_SECRET=abc\n")).toBe(true);
	});

	it("appends on its own line when the file has no trailing newline", () => {
		expect(upsertEnv("A=1", "B", "2")).toBe("A=1\nB=2\n");
		expect(upsertEnv("", "B", "2")).toBe("B=2\n");
	});
});

describe("classifyStripeKey", () => {
	it("accepts sandbox keys only", () => {
		expect(classifyStripeKey("sk_test_51Habcdefghij")).toBe("test");
		expect(classifyStripeKey("rk_test_51Habcdefghij")).toBe("restricted-test");
		expect(classifyStripeKey("sk_live_51Habcdefghij")).toBe("live");
		expect(classifyStripeKey("rk_live_51Habcdefghij")).toBe("live");
		expect(classifyStripeKey("sk_test_replace_me")).toBe("invalid");
		expect(classifyStripeKey("whsec_abcdefghij")).toBe("invalid");
		expect(classifyStripeKey(undefined)).toBe("invalid");
	});
});

describe("placeholders and webhook secrets", () => {
	it("knows the placeholders of .env.example", () => {
		expect(isPlaceholder("replace-with-emdash-secrets-generate")).toBe(true);
		expect(isPlaceholder("replace-with-openssl-rand-hex-32")).toBe(true);
		expect(isPlaceholder("whsec_replace_me")).toBe(true);
		expect(isPlaceholder(undefined)).toBe(true);
		expect(isPlaceholder("whsec_realvalue123")).toBe(false);
	});

	it("recognises a webhook secret", () => {
		expect(isWebhookSecret("whsec_1a2b3c4d5e6f")).toBe(true);
		expect(isWebhookSecret("whsec_replace_me")).toBe(false);
		expect(isWebhookSecret("sk_test_abcdefgh")).toBe(false);
	});
});

describe("isNodeVersionAtLeast", () => {
	it("compares x.y.z numerically", () => {
		expect(isNodeVersionAtLeast("v24.22.1", "24.22.1")).toBe(true);
		expect(isNodeVersionAtLeast("v24.22.0", "24.22.1")).toBe(false);
		expect(isNodeVersionAtLeast("v24.100.0", "24.22.1")).toBe(true);
		expect(isNodeVersionAtLeast("v22.22.0", "24.22.1")).toBe(false);
		expect(isNodeVersionAtLeast("v25.0.0", "24.22.1")).toBe(true);
	});
});

describe("checkEnv", () => {
	const byId = (checks) => Object.fromEntries(checks.map((check) => [check.id, check.isOk]));
	const key = `emdash_enc_v1_${"a".repeat(43)}`;

	it("flags the untouched example as not ready", () => {
		expect(byId(checkEnv(parseEnv(EXAMPLE)))).toEqual({ "encryption-key": false, "stripe-key": false, "webhook-secret": false });
	});

	it("passes with a generated key, a sandbox key and a webhook secret", () => {
		const env = { EMDASH_ENCRYPTION_KEY: key, STRIPE_SECRET_KEY: "sk_test_51Habcdefghij", STRIPE_WEBHOOK_SECRET: "whsec_1a2b3c4d5e6f" };
		expect(byId(checkEnv(env))).toEqual({ "encryption-key": true, "stripe-key": true, "webhook-secret": true });
	});

	it("calls a live key out and never echoes any value", () => {
		const env = { EMDASH_ENCRYPTION_KEY: key, STRIPE_SECRET_KEY: "sk_live_51Habcdefghij" };
		const checks = checkEnv(env);
		expect(checks.find((check) => check.id === "stripe-key")).toMatchObject({ isOk: false });
		expect(checks.find((check) => check.id === "stripe-key").message).toContain("LIVE");
		expect(JSON.stringify(checks)).not.toContain("51Habcdefghij");
		expect(JSON.stringify(checks)).not.toContain(key);
	});
});

describe("encryption key", () => {
	const valid = `emdash_enc_v1_${"A1_-".repeat(10)}abc`;

	it("accepts what EmDash 1.5 accepts and rejects the hex key the old bootstrap generated", () => {
		expect(valid).toHaveLength(57);
		expect(isEncryptionKey(valid)).toBe(true);
		expect(isEncryptionKey("a".repeat(64))).toBe(false);
		expect(isEncryptionKey(`emdash_enc_v1_${"a".repeat(42)}`)).toBe(false);
		expect(isEncryptionKey(`emdash_enc_v1_${"a".repeat(44)}`)).toBe(false);
		expect(isEncryptionKey("")).toBe(false);
	});

	it("accepts a rotation list only when every entry is valid", () => {
		expect(isEncryptionKey(`${valid}, ${valid.slice(0, -3)}xyz`)).toBe(true);
		expect(isEncryptionKey(`${valid},not-a-key`)).toBe(false);
	});

	it("generates a key from 32 bytes that passes its own check", () => {
		const key = encryptionKeyFrom(Buffer.alloc(32, 255));
		expect(key).toBe(`emdash_enc_v1_${"_".repeat(42)}8`);
		expect(isEncryptionKey(key)).toBe(true);
		expect(isEncryptionKey(encryptionKeyFrom(Buffer.from(Array.from({ length: 32 }, (_, i) => i * 7))))).toBe(true);
	});

	it("flags a hex key in a .env as not ready", () => {
		const env = { EMDASH_ENCRYPTION_KEY: "a".repeat(64), STRIPE_SECRET_KEY: "sk_test_51Habcdefghij", STRIPE_WEBHOOK_SECRET: "whsec_1a2b3c4d5e6f" };
		expect(checkEnv(env).find((check) => check.id === "encryption-key")).toMatchObject({ isOk: false, isRequired: true });
	});
});
