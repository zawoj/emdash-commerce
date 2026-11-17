import { defineConfig, devices } from "@playwright/test";

import { BASE_URL } from "./e2e/support/config";

const isCi = Boolean(process.env.CI);
/** Optional: a Chrome/Chromium binary to use instead of the one `pnpm test:e2e:install` downloads. */
const executablePath = process.env.E2E_CHROME_PATH || undefined;

/**
 * End-to-end suite: see docs/testing.md. One storefront dev server on its own port with a throwaway database; the
 * global setup starts it (and `stripe listen` when a sandbox key is present), seeds it and tears everything down.
 * No `webServer` block: the seed needs a restart of the server in the middle of the setup, which a webServer cannot do.
 */
export default defineConfig({
	testDir: "./e2e/tests",
	globalSetup: "./e2e/global-setup.ts",
	// One server, one database: tests share state, so they run one after another.
	fullyParallel: false,
	workers: 1,
	forbidOnly: isCi,
	// No retries: a test that needs one is a flaky test and is fixed, not retried.
	retries: 0,
	timeout: 45_000,
	expect: { timeout: 10_000 },
	reporter: isCi ? [["list"], ["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: BASE_URL,
		locale: "en-US",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		launchOptions: executablePath ? { executablePath } : {},
	},
	projects: [
		{
			// Needs no secrets: the server runs without a Stripe key when `E2E_STRIPE=off`.
			name: "smoke",
			testIgnore: /purchase.*\.spec\.ts$/,
			use: { ...devices["Desktop Chrome"] },
		},
		{
			// Needs a Stripe sandbox key and the Stripe CLI; skips itself with a message otherwise.
			name: "purchase",
			testMatch: /purchase.*\.spec\.ts$/,
			timeout: 180_000,
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
