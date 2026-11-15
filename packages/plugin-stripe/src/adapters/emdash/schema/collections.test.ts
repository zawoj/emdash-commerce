import { describe, expect, it } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { RELATIONS_TEST_SCHEMA } from "../../../testing/contracts/relations.contract.js";
import { buildCollectionDefinitions, buildSchemaDefinitions, relationField, type CollectionDefinition, type SchemaDefinitions } from "./collections/index.js";
import * as FIELD from "./field-names.js";

const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln", "eur"] });
const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);
const bySlug = new Map(definitions.map((definition) => [definition.slug, definition]));

/** Mirrors emdash/src/schema/types.ts (INDEXABLE_FIELD_TYPES, RESERVED_FIELD_SLUGS) and slug.ts. */
const INDEXABLE = new Set(["string", "url", "number", "integer", "boolean", "datetime", "select", "reference", "slug"]);
const RESERVED = new Set(["id", "slug", "status", "author_id", "primary_byline_id", "created_at", "updated_at", "published_at", "scheduled_at", "deleted_at", "version", "live_revision_id", "draft_revision_id", "terms", "bylines", "byline"]);
const SLUG = /^[a-z][a-z0-9_]*$/;

describe("collection definitions", () => {
	it("defines the catalog collections first, then the sales ones, from the configured slugs", () => {
		const slugsOf = definitions.map((definition) => definition.slug);
		expect(slugsOf.slice(0, 8)).toEqual(["products", "product_types", "attributes", "brands", "product_categories", "product_variants", "attribute_values", "prices"]);
		expect(slugsOf).toEqual(expect.arrayContaining(["orders", "payments", "subscriptions", "customers", "carts"]));
		const custom = buildCollectionDefinitions(commerceOptionsSchema.parse({ collections: { prices: "my_prices" } }).collections, ["pln"]);
		expect(custom.map((definition) => definition.slug)).toContain("my_prices");
		const reference = custom.find((definition) => definition.slug === "products")!;
		expect(reference.slug).toBe("products");
		const variants = custom.find((definition) => definition.slug === "product_variants")!;
		expect(variants.fields.find((field) => field.slug === "product")?.validation).toMatchObject({ relation: "catalog_product_variants", relationSide: "child" });
	});

	it("only uses slugs and field types EmDash accepts", () => {
		for (const definition of definitions) {
			expect(definition.slug).toMatch(SLUG);
			const seen = new Set<string>();
			for (const field of definition.fields) {
				expect(field.slug, `${definition.slug}.${field.slug}`).toMatch(SLUG);
				expect(RESERVED.has(field.slug), `${definition.slug}.${field.slug} is reserved`).toBe(false);
				expect(seen.has(field.slug), `${definition.slug}.${field.slug} duplicated`).toBe(false);
				seen.add(field.slug);
				if (field.indexed) expect(INDEXABLE.has(field.type), `${definition.slug}.${field.slug} cannot be indexed`).toBe(true);
			}
		}
	});

	it("keeps every cross-collection link either a native relation (no column, never indexed) or a column-backed scalar link", () => {
		const references = definitions.flatMap((definition) => definition.fields.filter((field) => field.type === "reference"));
		expect(references.length).toBeGreaterThan(5);
		for (const field of references) {
			expect((field.validation as { targetCollection?: string } | undefined)?.targetCollection).toBeUndefined();
			if (field.validation?.relation) {
				expect(field.indexed, field.slug).toBeUndefined();
				continue;
			}
			expect(field.indexed, field.slug).toBe(true);
			expect(bySlug.has(field.options!.collection!)).toBe(true);
		}
	});

	it("links no catalog collection by a scalar id: products, variants, prices and the vocabulary use relations only", () => {
		for (const slug of ["products", "product_types", "attributes", "attribute_values", "brands", "product_categories", "product_variants", "prices"]) {
			const scalar = bySlug.get(slug)!.fields.filter((field) => field.type === "reference" && !field.validation?.relation);
			expect(scalar.map((field) => field.slug), slug).toEqual([]);
		}
	});

	it("declares options for every select and sub-fields for every repeater", () => {
		for (const field of definitions.flatMap((definition) => definition.fields)) {
			if (field.type === "select") expect(field.validation?.options?.length, field.slug).toBeGreaterThan(0);
			if (field.type === "repeater") expect(field.validation?.subFields?.length, field.slug).toBeGreaterThan(0);
		}
		const currency = bySlug.get("prices")!.fields.find((field) => field.slug === "currency")!;
		expect(currency.validation?.options).toEqual(["pln", "eur"]);
	});

	it("never marks a repeater sub-field required (EmDash validates draft autosaves, so a new empty item would break them)", () => {
		const repeaters = buildSchemaDefinitions(options).collections.flatMap((definition) =>
			definition.fields.filter((field) => field.type === "repeater").map((field) => ({ definition, field })),
		);
		expect(repeaters.length).toBeGreaterThan(0);
		for (const { definition, field } of repeaters) {
			for (const subField of field.validation?.subFields ?? []) {
				expect(subField.required, `${definition.slug}.${field.slug}.${subField.slug}`).not.toBe(true);
			}
		}
	});

	it("references only fields that exist in list columns and title fields (max 4 columns)", () => {
		for (const definition of definitions) {
			const slugs = new Set(definition.fields.map((field) => field.slug));
			expect(definition.listColumns.length).toBeLessThanOrEqual(4);
			for (const column of definition.listColumns) expect(slugs.has(column), `${definition.slug} column ${column}`).toBe(true);
			if (definition.titleField) expect(slugs.has(definition.titleField)).toBe(true);
		}
	});

	it("makes only products, brands and categories routable, and only plugin-owned records creation-locked", () => {
		expect(definitions.filter((definition) => definition.routable).map((definition) => definition.slug)).toEqual(["products", "brands", "product_categories"]);
		expect(bySlug.get("products")!.urlPattern).toBe("/shop/{slug}");
		expect(bySlug.get("brands")!.urlPattern).toBe("/shop/brand/{slug}");
		expect(bySlug.get("product_categories")!.urlPattern).toBe("/shop/c/{slug}");
		expect(definitions.filter((definition) => definition.isPluginOwned).map((definition) => definition.slug)).toEqual(["orders", "payments", "subscriptions", "customers", "carts", "order_events"]);
		expect(bySlug.get("products")!.supports).toEqual(expect.arrayContaining(["drafts", "revisions", "seo"]));
		for (const slug of ["orders", "payments", "subscriptions", "customers", "carts", "order_events"]) {
			expect(bySlug.get(slug)!.supports).not.toContain("revisions");
		}
	});

	it("covers every field name the mappers use (no constant without a field, no drift)", () => {
		const defined = (definition: CollectionDefinition): Set<string> => new Set(definition.fields.map((field) => field.slug));
		const cases: Array<[string, Record<string, string>]> = [
			["products", FIELD.PRODUCT_FIELD],
			["product_variants", FIELD.VARIANT_FIELD],
			["prices", FIELD.PRICE_FIELD],
			["attributes", FIELD.ATTRIBUTE_FIELD],
			["attribute_values", FIELD.ATTRIBUTE_VALUE_FIELD],
			["product_types", FIELD.PRODUCT_TYPE_FIELD],
			["brands", FIELD.BRAND_FIELD],
			["product_categories", FIELD.CATEGORY_FIELD],
			["orders", FIELD.ORDER_FIELD],
			["payments", FIELD.PAYMENT_FIELD],
			["subscriptions", FIELD.SUBSCRIPTION_FIELD],
			["customers", FIELD.CUSTOMER_FIELD],
			["carts", FIELD.CART_FIELD],
			["order_events", FIELD.ORDER_EVENT_FIELD],
		];
		for (const [slug, names] of cases) {
			const slugs = defined(bySlug.get(slug)!);
			expect([...slugs].sort()).toEqual(Object.values(names).sort());
		}
	});

	it("marks the lookup keys unique and indexed", () => {
		const unique = (slug: string) => bySlug.get(slug)!.fields.filter((field) => field.unique).map((field) => field.slug);
		expect(unique("orders")).toEqual(expect.arrayContaining(["order_number", "stripe_checkout_session_id"]));
		expect(unique("customers")).toEqual(["email"]);
		expect(unique("prices")).toEqual(["lookup_key"]);
		expect(unique("product_variants")).toEqual(["sku"]);
		expect(unique("products")).toEqual(["sku"]);
		for (const definition of definitions) for (const field of definition.fields) if (field.unique) expect(field.indexed, `${definition.slug}.${field.slug}`).toBe(true);
	});
});

/** Every relation-bound field names an existing relation, sits on the matching end of it, and is storage-less. */
const relationProblems = (schema: SchemaDefinitions): string[] => {
	const problems: string[] = [];
	const slugs = new Set(schema.collections.map((definition) => definition.slug));
	for (const relation of schema.relations) {
		if (!SLUG.test(relation.slug)) problems.push(`relation slug ${relation.slug}`);
		for (const end of [relation.parentCollection, relation.childCollection]) if (!slugs.has(end)) problems.push(`${relation.slug}: unknown collection ${end}`);
	}
	for (const definition of schema.collections) {
		for (const field of definition.fields) {
			const name = field.validation?.relation;
			if (!name) continue;
			const relation = schema.relations.find((candidate) => candidate.slug === name);
			if (!relation) {
				problems.push(`${definition.slug}.${field.slug}: unknown relation ${name}`);
				continue;
			}
			const end = field.validation?.relationSide === "child" ? relation.childCollection : relation.parentCollection;
			if (end !== definition.slug) problems.push(`${definition.slug}.${field.slug}: not on the ${field.validation?.relationSide} end of ${name}`);
			if (field.type !== "reference") problems.push(`${definition.slug}.${field.slug}: relation field must be a reference`);
			if (field.indexed || field.unique) problems.push(`${definition.slug}.${field.slug}: relation field has no column to index`);
		}
	}
	return problems;
};

describe("schema definitions with relations", () => {
	it("builds the collections and the relations from the options, every relation consistent with its fields", () => {
		const schema = buildSchemaDefinitions(options);
		expect(schema.collections.map((definition) => definition.slug)).toEqual(definitions.map((definition) => definition.slug));
		expect(schema.relations.map((relation) => relation.slug)).toEqual(expect.arrayContaining(Object.values(FIELD.CATALOG_RELATION)));
		expect(relationProblems(schema)).toEqual([]);
	});

	it("hides exactly the helper collections of the catalog (variants, prices, attribute values); the rest stays in the sidebar", () => {
		const hidden = definitions.filter((definition) => definition.hidden).map((definition) => definition.slug);
		for (const slug of ["product_variants", "prices", "attribute_values"]) expect(hidden).toContain(slug);
		for (const slug of ["products", "product_types", "attributes", "brands", "product_categories", "orders", "customers", "subscriptions"]) expect(hidden).not.toContain(slug);
	});

	it("bounds every relation the plugin reads in full to one 50-link page, and the axes to three", () => {
		const schema = buildSchemaDefinitions(options);
		const limit = (slug: string) => schema.relations.find((relation) => relation.slug === slug)!.maxChildrenPerParent;
		for (const slug of [FIELD.CATALOG_RELATION.productVariants, FIELD.CATALOG_RELATION.productPrices, FIELD.CATALOG_RELATION.variantPrices, FIELD.CATALOG_RELATION.attributeValues, FIELD.CATALOG_RELATION.typeAllowedValues, FIELD.CATALOG_RELATION.typeSpecAttributes, FIELD.CATALOG_RELATION.typeRequiredSpecs]) {
			expect(limit(slug), slug).toBe(50);
		}
		expect(limit(FIELD.CATALOG_RELATION.typeVariantAxes)).toBe(3);
		expect(limit(FIELD.CATALOG_RELATION.variantOptionValues)).toBe(3);
		const oneParent = (slug: string) => schema.relations.find((relation) => relation.slug === slug)!.maxParentsPerChild;
		for (const slug of [FIELD.CATALOG_RELATION.productVariants, FIELD.CATALOG_RELATION.productPrices, FIELD.CATALOG_RELATION.variantPrices, FIELD.CATALOG_RELATION.productType, FIELD.CATALOG_RELATION.productBrand, FIELD.CATALOG_RELATION.categoryTree]) {
			expect(oneParent(slug), slug).toBe(1);
		}
	});

	it("protects the derived and plugin-written catalog fields from editors", () => {
		const protectedOf = (slug: string) => bySlug.get(slug)!.fields.filter((field) => field.isProtected).map((field) => field.slug);
		expect(protectedOf("products")).toEqual(["specs"]);
		expect(protectedOf("product_variants")).toEqual(["options_key"]);
		expect(protectedOf("prices")).toEqual(["is_managed"]);
	});

	it("builds a relation field that is a bound, unindexed reference naming its relation and side", () => {
		expect(relationField("books", "Books", "author_books", "parent", { multiple: true })).toEqual({
			slug: "books",
			label: "Books",
			type: "reference",
			validation: { relation: "author_books", relationSide: "parent", multiple: true },
		});
		expect(relationField("book", "Book", "book_reviews", "child", { required: true })).toMatchObject({ required: true, validation: { relation: "book_reviews", relationSide: "child" } });
	});

	it("accepts a consistent test schema and reports a field on the wrong end, an unknown relation and a bad slug", () => {
		expect(relationProblems(RELATIONS_TEST_SCHEMA)).toEqual([]);
		const broken: SchemaDefinitions = {
			relations: [{ ...RELATIONS_TEST_SCHEMA.relations[0]!, slug: "author-books" }],
			collections: [
				{ ...RELATIONS_TEST_SCHEMA.collections[0]!, fields: [relationField("books", "Books", "author_books", "child"), relationField("x", "X", "nope", "parent")] },
				{ ...RELATIONS_TEST_SCHEMA.collections[1]!, fields: [] },
			],
		};
		expect(relationProblems(broken)).toEqual([
			"relation slug author-books",
			"authors.books: unknown relation author_books",
			"authors.x: unknown relation nope",
		]);
	});
});
