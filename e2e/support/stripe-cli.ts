import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { PORT, RUN_DIR, WEBHOOK_PATH } from "./config";
import { spawnManaged, waitForLog, type ManagedProcess } from "./processes";

const LISTEN_READY_TIMEOUT_MS = 60_000;

/** The CLI reads the key from `STRIPE_API_KEY`, so it never appears in a process listing or a log. */
const cliEnv = (secretKey: string): NodeJS.ProcessEnv => ({ ...process.env, STRIPE_API_KEY: secretKey });

export const isStripeCliInstalled = (): boolean => {
	const result = spawnSync("stripe", ["--version"], { encoding: "utf8" });
	return result.status === 0;
};

/**
 * The signing secret `stripe listen` will use for this key's account. It differs per CLI login, which is why the suite
 * asks the CLI instead of holding a value. `undefined` when the CLI cannot reach the account (bad key, offline).
 */
export const readWebhookSecret = (secretKey: string): string | undefined => {
	const result = spawnSync("stripe", ["listen", "--print-secret"], { encoding: "utf8", env: cliEnv(secretKey), timeout: 30_000 });
	const secret = result.stdout.trim().split(/\s+/).at(-1);
	return result.status === 0 && secret?.startsWith("whsec_") ? secret : undefined;
};

/** `stripe listen --forward-to` the suite's webhook route, until stopped. */
export const startListener = async (secretKey: string): Promise<ManagedProcess> => {
	const listener = spawnManaged({
		name: "stripe listen",
		command: "stripe",
		// Newer CLI versions refuse to start without an event selection (--events, --all-snapshot, --all-thin).
		args: ["listen", "--all-snapshot", "--forward-to", `localhost:${PORT}${WEBHOOK_PATH}`],
		env: cliEnv(secretKey),
		cwd: RUN_DIR,
		logFile: join(RUN_DIR, "stripe-listen.log"),
	});
	try {
		await waitForLog(listener, /Ready!/, LISTEN_READY_TIMEOUT_MS);
	} catch (error) {
		await listener.stop();
		throw error;
	}
	return listener;
};
