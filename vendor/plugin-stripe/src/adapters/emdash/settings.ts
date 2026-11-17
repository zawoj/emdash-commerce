import type { SettingField, SettingsAccess } from "emdash";

import { SETTINGS_KEY } from "../../contracts/options.js";
import type { IdGenerator } from "../../core/ids.js";

/**
 * Secrets come from the plugin's encrypted settings (admin -> plugin settings; needs
 * `EMDASH_ENCRYPTION_KEY`), with environment variables as the fallback for sites that keep them in `.env`.
 * A value saved in the admin wins over the environment, so a key can be rotated without a deploy.
 */

export const ENV_KEY = {
	stripeSecretKey: "STRIPE_SECRET_KEY",
	stripeWebhookSecret: "STRIPE_WEBHOOK_SECRET",
	accessTokenSecret: "COMMERCE_ACCESS_TOKEN_SECRET",
	/** `1` or `true`: a shop waiting for `emdash site import` does not create the commerce relations (docs/production.md). */
	deferRelations: "COMMERCE_DEFER_RELATIONS",
} as const;

export const settingsSchema: Record<string, SettingField> = {
	[SETTINGS_KEY.stripeSecretKey]: {
		type: "secret",
		label: "Stripe secret or restricted key",
		description: "A restricted key (rk_…) with the permissions this plugin needs is recommended. Falls back to STRIPE_SECRET_KEY.",
	},
	[SETTINGS_KEY.stripeWebhookSecret]: {
		type: "secret",
		label: "Stripe webhook signing secret",
		description: "The whsec_… secret of the webhook endpoint (create one from the plugin status page). Falls back to STRIPE_WEBHOOK_SECRET.",
	},
	[SETTINGS_KEY.accessTokenSecret]: {
		type: "secret",
		label: "Order access token secret",
		description: "Signs the links that let guests view an order. Generated automatically; changing it invalidates links already sent.",
	},
};

export type Environment = Readonly<Record<string, string | undefined>>;

/** `process.env` where it exists (Node, Workers with nodejs_compat); empty otherwise. */
export const readEnvironment = (): Environment => (typeof process !== "undefined" && process.env ? process.env : {});

/** True when `COMMERCE_DEFER_RELATIONS` is `1` or `true`. */
export const isDeferringRelations = (env: Environment = readEnvironment()): boolean =>
	["1", "true"].includes((env[ENV_KEY.deferRelations] ?? "").trim().toLowerCase());

const nonEmpty = (value: unknown): string | null => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null);

export interface CommerceSecrets {
	stripeSecretKey: string | null;
	stripeWebhookSecret: string | null;
	accessTokenSecret: string | null;
}

const readSecret = async (settings: SettingsAccess, key: string, envKey: string, env: Environment): Promise<string | null> =>
	nonEmpty(await settings.get<string>(key)) ?? nonEmpty(env[envKey]);

export const resolveSecrets = async (settings: SettingsAccess, env: Environment = readEnvironment()): Promise<CommerceSecrets> => ({
	stripeSecretKey: await readSecret(settings, SETTINGS_KEY.stripeSecretKey, ENV_KEY.stripeSecretKey, env),
	stripeWebhookSecret: await readSecret(settings, SETTINGS_KEY.stripeWebhookSecret, ENV_KEY.stripeWebhookSecret, env),
	accessTokenSecret: await readSecret(settings, SETTINGS_KEY.accessTokenSecret, ENV_KEY.accessTokenSecret, env),
});

export const ACCESS_TOKEN_SECRET_BYTES = 32;

/**
 * Generates the access-token HMAC secret on first activation. The write is a compare-and-set, so two
 * processes activating at once agree on one value. When settings cannot be written (no encryption key
 * configured) it logs and returns null: order access links stay disabled until a secret is available.
 */
export const ensureAccessTokenSecret = async (
	settings: SettingsAccess,
	ids: Pick<IdGenerator, "randomId">,
	log: { warn(message: string, data?: unknown): void },
	env: Environment = readEnvironment(),
): Promise<string | null> => {
	const fromEnv = nonEmpty(env[ENV_KEY.accessTokenSecret]);
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const current = await settings.getVersioned<string>(SETTINGS_KEY.accessTokenSecret);
		const existing = nonEmpty(current?.value);
		if (existing) return existing;
		if (fromEnv) return fromEnv;
		try {
			const written = await settings.compareAndSet(SETTINGS_KEY.accessTokenSecret, current?.revision ?? null, ids.randomId(ACCESS_TOKEN_SECRET_BYTES));
			if (written.applied) continue; // read it back (the stored value is the source of truth)
		} catch (error) {
			log.warn("Could not store the order access token secret; guest order links stay disabled until one is set", {
				error: error instanceof Error ? error.message : "unknown",
			});
			return null;
		}
	}
	return null;
};
