import { sellableKey, type SellableRef } from "../../core/catalog.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { loadPolicies } from "./policy.js";

/** Units a buyer could still take per `sellableKey`; null when the sellable does not track stock. Never negative. */
export const readAvailability = async (container: CommerceContainer, refs: readonly SellableRef[]): Promise<Map<string, number | null>> => {
	const [levels, policies] = await Promise.all([container.inventory.getMany(refs), loadPolicies(container, refs)]);
	return new Map(
		refs.map((ref) => {
			const key = sellableKey(ref);
			if (!policies.get(key)?.isTracked) return [key, null] as const;
			return [key, Math.max(0, levels.get(key)?.available ?? 0)] as const;
		}),
	);
};
