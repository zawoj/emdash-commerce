import { commerceEventId, type AnyCommerceEvent } from "../../core/events.js";
import type { ProviderPriceSnapshot, ProviderProductSnapshot } from "../../ports/payment-provider.js";
import type { CatalogLink, CatalogLinkStore, Clock } from "../../ports/repositories.js";
import { parseEntityKey } from "./entity-keys.js";
import { mutateLink, syncVersionOf } from "./link-mutate.js";

/**
 * Drift is a difference between Stripe and what the plugin last wrote (`link.lastWritten`), never between
 * Stripe and the current content: an edit that is waiting for its sync is not drift, and a webhook echoing
 * our own write is not either.
 */

export const DRIFT_FIELD = { name: "name", active: "active", unitAmount: "unit_amount", currency: "currency" } as const;

/** Is `snapshot` the object this link owns right now (not an archived earlier price of the same entity)? */
const isCurrentProviderObject = (link: CatalogLink, providerId: string): boolean => link.providerId !== null && link.providerId === providerId;

/** `null` when the snapshot cannot be compared (no write yet, or an archived earlier object of the entity). */
export const driftFieldsForProduct = (link: CatalogLink | null, snapshot: ProviderProductSnapshot): string[] | null => {
	if (!link || !link.lastWritten || !isCurrentProviderObject(link, snapshot.providerId)) return null;
	const written = link.lastWritten;
	const fields: string[] = [];
	if (written.name !== undefined && snapshot.name !== written.name) fields.push(DRIFT_FIELD.name);
	if (written.isActive !== undefined && snapshot.isActive !== written.isActive) fields.push(DRIFT_FIELD.active);
	return fields;
};

export const driftFieldsForPrice = (link: CatalogLink | null, snapshot: ProviderPriceSnapshot): string[] | null => {
	if (!link || !link.lastWritten || !isCurrentProviderObject(link, snapshot.providerId)) return null;
	const written = link.lastWritten;
	const fields: string[] = [];
	if (written.isActive !== undefined && snapshot.isActive !== written.isActive) fields.push(DRIFT_FIELD.active);
	if (written.unitAmount !== undefined && snapshot.unitAmount !== written.unitAmount) fields.push(DRIFT_FIELD.unitAmount);
	if (written.currency !== undefined && snapshot.currency !== written.currency) fields.push(DRIFT_FIELD.currency);
	return fields;
};

/** The event id carries the sync version: drift that reappears after a rewrite is a new event, not a dedupe hit. */
export const driftEvent = (
	entity: "product" | "price",
	id: string,
	stripeId: string,
	fields: string[],
	syncVersion: number,
	occurredAt: string,
): AnyCommerceEvent => ({
	id: commerceEventId("catalog.drift_detected", `${entity}:${id}:v${syncVersion}:${fields.join(",")}`),
	type: "catalog.drift_detected",
	occurredAt,
	data: { entity, id, stripeId, fields },
});

/**
 * Stores the drifted fields on the link and publishes `catalog.drift_detected` once per distinct set. A
 * snapshot back in line with the last write clears the recorded drift without an event.
 */
export const recordDrift = async (
	store: CatalogLinkStore,
	clock: Clock,
	link: CatalogLink,
	fields: string[],
	publish: (events: readonly AnyCommerceEvent[]) => Promise<void>,
): Promise<void> => {
	const sorted = [...fields].sort();
	const isSameSet = sorted.length === link.driftFields.length && sorted.every((field, index) => field === link.driftFields[index]);
	if (isSameSet) return;
	await mutateLink(store, link.entityKey, (current) => ({ ...current, driftFields: sorted }));
	if (sorted.length === 0) return;
	const parsed = parseEntityKey(link.entityKey);
	if (!parsed) return;
	const entity = parsed.entity === "price" ? "price" : "product";
	await publish([driftEvent(entity, parsed.id, link.providerId ?? "", sorted, syncVersionOf(link), clock.now().toISOString())]);
};
