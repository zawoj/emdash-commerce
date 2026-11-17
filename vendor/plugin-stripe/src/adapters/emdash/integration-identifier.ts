import type { KVAccess } from "emdash";

import type { IdGenerator } from "../../core/ids.js";
import { INTEGRATION_IDENTIFIER_PREFIX, KV_KEY } from "./constants.js";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const SUFFIX_LENGTH = 8;

const randomSuffix = (ids: Pick<IdGenerator, "randomBytes">): string =>
	Array.from(ids.randomBytes(SUFFIX_LENGTH), (byte) => LETTERS[byte % LETTERS.length]).join("");

/**
 * The Checkout `integration_identifier` label: `emdash-stripe-<8 random letters>`, created once per site
 * and kept in plugin KV (kept from the prototype so existing sessions stay attributed to one integration).
 * Created with a compare-and-set so concurrent first requests agree on one value.
 */
export const resolveIntegrationIdentifier = async (kv: KVAccess, ids: Pick<IdGenerator, "randomBytes">): Promise<string> => {
	const existing = await kv.get<string>(KV_KEY.integrationSuffix);
	if (existing) return `${INTEGRATION_IDENTIFIER_PREFIX}-${existing}`;
	const suffix = randomSuffix(ids);
	if ((await kv.compareAndSet(KV_KEY.integrationSuffix, null, suffix)).applied) return `${INTEGRATION_IDENTIFIER_PREFIX}-${suffix}`;
	return `${INTEGRATION_IDENTIFIER_PREFIX}-${(await kv.get<string>(KV_KEY.integrationSuffix)) ?? suffix}`;
};
