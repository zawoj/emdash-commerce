import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The plugin runs in-process on Cloudflare Workers (workerd) as well as on Node (the storefront's `DEPLOY_TARGET`
 * switch). Workers has no Node built-ins unless `nodejs_compat` supplies them, so shipped code must stay on Web APIs:
 * `fetch` (the Stripe SDK uses its fetch HTTP client), Web Crypto (webhook signature, access-token HMAC) and `btoa`.
 * Verified on workerd 2026-11-17 (a sandbox purchase, the signed webhook and catalog sync). This guard keeps it so.
 */

const SRC = dirname(fileURLToPath(import.meta.url));

const isShippedSource = (path: string): boolean =>
	path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.includes("/testing/") && !path.includes("/real-host/");

const sourceFiles = (directory: string): string[] =>
	readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? sourceFiles(path) : isShippedSource(path) ? [path] : [];
	});

/** Code without comments, so a doc sentence that mentions `Buffer` does not trip the guard. */
const codeOf = (path: string): string =>
	readFileSync(path, "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/^\s*\/\/.*$/gm, "");

const FORBIDDEN = [
	{ name: "a node: import", pattern: /from\s+["']node:|require\(\s*["']node:|import\(\s*["']node:/ },
	{ name: "a bare Node built-in import", pattern: /from\s+["'](?:crypto|fs|path|http|https|os|stream|buffer|child_process)["']/ },
	{ name: "Buffer", pattern: /\bBuffer\b/ },
	{ name: "require()", pattern: /\brequire\(/ },
	{ name: "process.* other than the guarded env read", pattern: /\bprocess\.(?!env\b)/ },
] as const;

describe("workerd compatibility of the plugin source", () => {
	const files = sourceFiles(SRC).map((path) => ({ path, label: relative(SRC, path), code: codeOf(path) }));

	it("scans the shipped source (not an empty list)", () => {
		expect(files.length).toBeGreaterThan(100);
	});

	it.each(FORBIDDEN)("uses no $name", ({ pattern }) => {
		const offenders = files.filter((file) => pattern.test(file.code)).map((file) => file.label);
		expect(offenders).toEqual([]);
	});

	it("reads process.env in one place only: the settings fallback, guarded for runtimes without it", () => {
		const readers = files.filter((file) => /\bprocess\.env\b/.test(file.code)).map((file) => file.label);
		expect(readers).toEqual(["adapters/emdash/settings.ts"]);
		const settings = files.find((file) => file.label === "adapters/emdash/settings.ts");
		expect(settings?.code).toContain('typeof process !== "undefined"');
	});

	it("gives the Stripe SDK the fetch HTTP client and a Web Crypto provider", () => {
		const client = files.find((file) => file.label === "adapters/stripe/client.ts");
		expect(client?.code).toContain("Stripe.createFetchHttpClient()");
		expect(client?.code).toContain("Stripe.createSubtleCryptoProvider()");
	});
});
