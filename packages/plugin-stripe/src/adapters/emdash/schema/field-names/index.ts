/**
 * Field slugs of every commerce collection, in one place so the schema definition, the entry mappers and
 * the protected-field guard cannot drift apart. EmDash reserves `id`, `slug`, `status`, `created_at`,
 * `updated_at`, `published_at`, `version` and a few more as field slugs, hence `order_status` and
 * `placed_at` rather than `status` and `created_at` (see RESERVED_FIELD_SLUGS in emdash/schema/types.ts).
 */

export * from "./catalog.js";
export * from "./sales.js";
