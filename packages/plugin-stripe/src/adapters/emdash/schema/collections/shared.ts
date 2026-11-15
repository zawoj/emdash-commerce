import type { FieldType } from "emdash";

import type { AdminNavGroup } from "../../constants.js";

/**
 * The content collections the plugin owns, derived from `CommerceOptions.collections`. Definitions are
 * plain data: the reconciler (../reconcile.ts) creates what is missing and adds missing fields, never alters
 * or deletes anything an editor or an older release already made.
 *
 * Links between collections come in two kinds:
 * - Native relations (`RelationDefinition` + `relationField`): created by `applySeed`, edges live in
 *   `_emdash_content_references`, written and read only through `RelationsPort`. The admin shows an entry
 *   picker on both sides. Relation-bound fields are storage-less: `ctx.content` cannot write or read them and
 *   `fieldFilters` cannot filter on them.
 * - Scalar links (`link`): a `reference` field WITHOUT a `targetCollection`. EmDash keeps it column-backed: it
 *   holds the linked entry id as plain text, the admin shows an entry picker (`options.collection`), the plugin
 *   reads and writes it like any scalar, and it can be `indexed`, so `fieldFilters` work (seed/validate.ts:338-346,
 *   seed/apply.ts:1910-1917, schema/types.ts:100-107).
 */

export interface RepeaterSubFieldDefinition {
	slug: string;
	type: "string" | "text" | "url" | "number" | "integer" | "boolean" | "datetime" | "select" | "image";
	label: string;
	required?: boolean;
	options?: string[];
}

/** Which end of a relation a field lives on: the parent selects children, the child selects parents. */
export const RELATION_SIDE = { parent: "parent", child: "child" } as const;
export type RelationSide = (typeof RELATION_SIDE)[keyof typeof RELATION_SIDE];

export interface FieldDefinition {
	slug: string;
	label: string;
	type: FieldType;
	required?: boolean;
	unique?: boolean;
	indexed?: boolean;
	searchable?: boolean;
	/** Editors may not change it (the plugin writes it): the `content:beforeSave` guard rejects a changed value. */
	isProtected?: boolean;
	defaultValue?: unknown;
	validation?: {
		options?: string[];
		subFields?: RepeaterSubFieldDefinition[];
		minItems?: number;
		maxItems?: number;
		/** Relation-bound reference field only: the relation slug, which end this field is, and whether the picker is multi-select. */
		relation?: string;
		relationSide?: RelationSide;
		multiple?: boolean;
	};
	options?: { collection?: string; rows?: number };
}

/**
 * A native EmDash relation between two plugin collections. Slugs match `^[a-z][a-z0-9_]*$` (no hyphens). The
 * two collections are fixed once created; a self relation (parent = child collection) is allowed. Cardinality
 * is enforced by EmDash from the two limits (`null` = unlimited).
 */
export interface RelationDefinition {
	slug: string;
	/** Collection slugs (already resolved from `options.collections`). */
	parentCollection: string;
	childCollection: string;
	/** Names the parent's role, as seen from the child. */
	parentLabel: string;
	parentLabelSingular?: string;
	/** Names the child's role, as seen from the parent. */
	childLabel: string;
	childLabelSingular?: string;
	/** How many children one parent may link (`null` = unlimited). */
	maxChildrenPerParent: number | null;
	/** How many parents one child may link (`null` = unlimited). */
	maxParentsPerChild: number | null;
}

/** Where the collection sits in the admin sidebar: its folder and its position (`collectionNavigation`). */
export interface CollectionNavigation {
	group: AdminNavGroup;
	sortOrder: number;
}

/**
 * EmDash lists collections with a `sortOrder` before those without, ascending. Commerce positions start high so
 * a site that numbers its own collections from 1 keeps them above the shop folders.
 */
export const NAV_SORT_BASE = 1000;

/** Sidebar order inside each folder: the catalog an editor works on, then sales in the order they are handled. */
export const NAV_POSITION = {
	products: 0,
	productTypes: 1,
	attributes: 2,
	brands: 3,
	categories: 4,
	variants: 5,
	attributeValues: 6,
	prices: 7,
	orders: 10,
	customers: 11,
	subscriptions: 12,
	payments: 13,
	carts: 14,
	orderEvents: 15,
} as const;

export const collectionNavigation = (group: AdminNavGroup, position: keyof typeof NAV_POSITION): CollectionNavigation => ({
	group,
	sortOrder: NAV_SORT_BASE + NAV_POSITION[position],
});

export interface CollectionDefinition {
	slug: string;
	label: string;
	labelSingular: string;
	description: string;
	supports: Array<"drafts" | "revisions" | "seo" | "search">;
	routable: boolean;
	urlPattern?: string;
	icon: string;
	navigation: CollectionNavigation;
	/**
	 * Off the sidebar, dashboard and command palette (its list and editor routes and pickers still work). Applied
	 * when the collection is created and, for an existing one, only while it has no sidebar placement.
	 */
	hidden: boolean;
	/** Admin list columns (max 4) and whether the dashboard offers "new entry". */
	listColumns: string[];
	titleField?: string;
	/** Records only the plugin creates; editors may not create or change their financial fields. */
	isPluginOwned: boolean;
	fields: FieldDefinition[];
}

/** Everything the reconciler needs: collections plus the relations their fields bind to. */
export interface SchemaDefinitions {
	collections: CollectionDefinition[];
	relations: RelationDefinition[];
}

export const values = <T extends Record<string, string>>(vocabulary: T): string[] => Object.values(vocabulary);

export const text = (slug: string, label: string, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({ slug, label, type: "string", ...extra });
export const integer = (slug: string, label: string, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({ slug, label, type: "integer", ...extra });
export const bool = (slug: string, label: string, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({ slug, label, type: "boolean", ...extra });
export const json = (slug: string, label: string): FieldDefinition => ({ slug, label, type: "json" });
export const select = (slug: string, label: string, options: string[], extra: Partial<FieldDefinition> = {}): FieldDefinition => ({
	slug,
	label,
	type: "select",
	validation: { options },
	...extra,
});
/** A scalar link: the linked entry id as indexed text (see the file comment). */
export const link = (slug: string, label: string, collection: string, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({
	slug,
	label,
	type: "reference",
	indexed: true,
	options: { collection },
	...extra,
});

/**
 * A field bound to a native relation. Never `indexed` (it has no column) and `targetCollection` is derived by
 * EmDash from the relation. `multiple` only shapes the admin picker; the limit that is enforced is the relation's.
 */
export const relationField = (
	slug: string,
	label: string,
	relationSlug: string,
	side: RelationSide,
	extra: { multiple?: boolean; required?: boolean } = {},
): FieldDefinition => ({
	slug,
	label,
	type: "reference",
	...(extra.required ? { required: true } : {}),
	validation: { relation: relationSlug, relationSide: side, ...(extra.multiple ? { multiple: true } : {}) },
});

export const SYNC_STATUSES = ["pending", "synced", "failed"];

export const syncFields = (idSlug: string, idLabel: string, statusSlug: string, errorSlug: string): FieldDefinition[] => [
	text(idSlug, idLabel, { indexed: true }),
	select(statusSlug, "Stripe sync status", SYNC_STATUSES, { indexed: true }),
	text(errorSlug, "Stripe sync error"),
];
