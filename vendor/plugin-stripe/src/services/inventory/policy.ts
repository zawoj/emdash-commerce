import { sellableKey, type InventoryPolicy, type SellableRef } from "../../core/catalog.js";
import type { CommerceContainer } from "../../plugin/container.js";

/** Stock policy of each sellable (a variant's own, or its product's); a missing record has no entry. */
export const loadPolicies = async (container: CommerceContainer, refs: readonly SellableRef[]): Promise<Map<string, InventoryPolicy>> => {
	const unique = [...new Map(refs.map((ref) => [sellableKey(ref), ref])).values()];
	const found = await Promise.all(
		unique.map(async (ref) => {
			const record = ref.kind === "variant" ? await container.catalog.getVariant(ref.id) : await container.catalog.getProduct(ref.id);
			return [sellableKey(ref), record?.inventory ?? null] as const;
		}),
	);
	return new Map(found.filter((entry): entry is readonly [string, InventoryPolicy] => entry[1] !== null));
};

/** Only a tracked sellable that cannot go below zero is guarded; the rest never refuses a reservation. */
export const isGuardedPolicy = (policy: InventoryPolicy | undefined): boolean => Boolean(policy?.isTracked && !policy.allowsBackorder);
