import { readFileSync } from "node:fs";

/** A Stripe sandbox secret or restricted key. Anything else (a live key, a placeholder) is never used. */
const SANDBOX_KEY = /^(sk|rk)_test_[A-Za-z0-9]{8,}$/;
const KEY_NAME = "STRIPE_SECRET_KEY";

export const STRIPE_KEY_STATES = {
	ready: "ready",
	missing: "missing",
	disabled: "disabled",
	refused: "refused",
} as const;
export type StripeKeyState = (typeof STRIPE_KEY_STATES)[keyof typeof STRIPE_KEY_STATES];

export interface StripeKeyResolution {
	state: StripeKeyState;
	/** Only set when `state` is `ready`. Never log it. */
	key?: string;
}

export const isSandboxKey = (value: string): boolean => SANDBOX_KEY.test(value);

/** The value of `name` in the text of a dotenv file (no expansion, optional quotes). */
export const readDotenvValue = (text: string, name: string): string | undefined => {
	for (const line of text.split(/\r?\n/)) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (match?.[1] !== name) continue;
		return match[2]?.replace(/^(["'])(.*)\1$/, "$2");
	}
	return undefined;
};

export const readDotenvFile = (path: string): string => {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
};

interface ResolveInput {
	/** `E2E_STRIPE`: `off` forces the keyless server. */
	mode: string | undefined;
	env: Record<string, string | undefined>;
	/** Text of `apps/storefront/.env`, the fallback a contributor already has after `pnpm bootstrap`. */
	dotenvText: string;
}

/**
 * Which key the Stripe suite may use. The environment wins over the dotenv file. A key that is not a sandbox key is
 * `refused`: the run must stop rather than touch a live account.
 */
export const resolveStripeKey = ({ mode, env, dotenvText }: ResolveInput): StripeKeyResolution => {
	if (mode === "off") return { state: STRIPE_KEY_STATES.disabled };
	const key = (env[KEY_NAME] || readDotenvValue(dotenvText, KEY_NAME) || "").trim();
	if (!key) return { state: STRIPE_KEY_STATES.missing };
	if (!isSandboxKey(key)) return { state: STRIPE_KEY_STATES.refused };
	return { state: STRIPE_KEY_STATES.ready, key };
};
