import type { CommerceOptions } from "../../../../contracts/options.js";
import { buildCatalogCollections, buildCatalogRelations } from "./catalog.js";
import { buildSalesCollections, buildSalesRelations } from "./sales.js";
import type { CollectionDefinition, RelationDefinition, SchemaDefinitions } from "./shared.js";

export * from "./shared.js";

export type SchemaOptions = Pick<CommerceOptions, "collections" | "supportedCurrencies">;

/** The collections only (catalog first, then sales); relations come from `buildSchemaDefinitions`. */
export const buildCollectionDefinitions = (
	slugs: CommerceOptions["collections"],
	supportedCurrencies: readonly string[],
): CollectionDefinition[] => [...buildCatalogCollections(slugs, supportedCurrencies), ...buildSalesCollections(slugs)];

export const buildRelationDefinitions = (slugs: CommerceOptions["collections"]): RelationDefinition[] => [
	...buildCatalogRelations(slugs),
	...buildSalesRelations(slugs),
];

/** Everything the schema reconciler creates, derived from the configured collection slugs. */
export const buildSchemaDefinitions = (options: SchemaOptions): SchemaDefinitions => ({
	collections: buildCollectionDefinitions(options.collections, options.supportedCurrencies),
	relations: buildRelationDefinitions(options.collections),
});
