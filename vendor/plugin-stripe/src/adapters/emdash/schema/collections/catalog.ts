import { ATTRIBUTE_INPUT_TYPE, ATTRIBUTE_PRESENTATION } from "../../../../core/product-type.js";
import { BILLING_INTERVAL, PRICE_TYPE, TAX_BEHAVIOR } from "../../../../core/catalog.js";
import type { CommerceOptions } from "../../../../contracts/options.js";
import { ADMIN_NAV_GROUP } from "../../constants.js";
import {
	ATTRIBUTE_FIELD,
	ATTRIBUTE_VALUE_FIELD,
	BRAND_FIELD,
	CATALOG_LIMITS,
	CATALOG_RELATION,
	CATEGORY_FIELD,
	GALLERY_ITEM_FIELD,
	PRICE_FIELD,
	PRODUCT_FIELD,
	PRODUCT_TYPE_FIELD,
	VARIANT_FIELD,
} from "../field-names/index.js";
import {
	RELATION_SIDE,
	bool,
	collectionNavigation,
	integer,
	json,
	relationField,
	select,
	syncFields,
	text,
	values,
	type CollectionDefinition,
	type FieldDefinition,
	type RelationDefinition,
	type RepeaterSubFieldDefinition,
} from "./shared.js";

type Slugs = CommerceOptions["collections"];

const { parent, child } = RELATION_SIDE;

/**
 * The catalog collections. Visible in the Catalog folder: products, product types, attributes, brands and
 * categories. Hidden (reached from their parent's editor): variants, prices and attribute values.
 *
 * Every link between two of them is a native relation (see `buildCatalogRelations`), so the admin shows entry
 * pickers instead of raw ids. Relation fields have no column: `ctx.content` cannot read or write them, which is why
 * the plugin goes through `RelationsPort`.
 */
export const buildCatalogCollections = (slugs: Slugs, supportedCurrencies: readonly string[]): CollectionDefinition[] => [
	productsCollection(slugs),
	productTypesCollection(slugs),
	attributesCollection(slugs),
	brandsCollection(slugs),
	categoriesCollection(slugs),
	variantsCollection(slugs),
	attributeValuesCollection(slugs),
	pricesCollection(slugs, supportedCurrencies),
];

const imageField = (slug: string, label: string): FieldDefinition => ({ slug, label, type: "image" });

/** Optional on purpose: a required repeater sub-field fails the draft autosave the moment an editor adds a row. */
const GALLERY_SUB_FIELDS: RepeaterSubFieldDefinition[] = [
	{ slug: GALLERY_ITEM_FIELD.image, type: "image", label: "Image" },
	{ slug: GALLERY_ITEM_FIELD.alt, type: "string", label: "Alt text" },
];

const galleryField = (slug: string, label: string): FieldDefinition => ({ slug, label, type: "repeater", validation: { subFields: GALLERY_SUB_FIELDS } });

const productsCollection = (slugs: Slugs): CollectionDefinition => ({
	slug: slugs.products,
	label: "Products",
	labelSingular: "Product",
	description: "Sellable products. Published products are mirrored to Stripe.",
	supports: ["drafts", "revisions", "seo", "search"],
	routable: true,
	urlPattern: "/shop/{slug}",
	icon: "shopping-bag",
	navigation: collectionNavigation(ADMIN_NAV_GROUP.catalog, "products"),
	listColumns: [PRODUCT_FIELD.title, PRODUCT_FIELD.price, PRODUCT_FIELD.hasVariants, PRODUCT_FIELD.sku],
	isPluginOwned: false,
	hidden: false,
	fields: [
		text(PRODUCT_FIELD.title, "Title", { required: true, searchable: true }),
		{ slug: PRODUCT_FIELD.description, label: "Description", type: "portableText" },
		imageField(PRODUCT_FIELD.image, "Image"),
		galleryField(PRODUCT_FIELD.gallery, "Gallery (more pictures; for a product without variants, or shared by all variants)"),
		relationField(PRODUCT_FIELD.productType, "Product type", CATALOG_RELATION.productType, child),
		relationField(PRODUCT_FIELD.brand, "Brand", CATALOG_RELATION.productBrand, child),
		relationField(PRODUCT_FIELD.categories, "Categories", CATALOG_RELATION.productCategories, child, { multiple: true }),
		integer(PRODUCT_FIELD.price, "Price (minor units, e.g. grosze; the base price of the product and its variants)"),
		text(PRODUCT_FIELD.sku, "SKU (a product without variants)", { indexed: true, unique: true }),
		bool(PRODUCT_FIELD.hasVariants, "Has variants"),
		relationField(PRODUCT_FIELD.variants, "Variants", CATALOG_RELATION.productVariants, parent, { multiple: true }),
		relationField(PRODUCT_FIELD.prices, "Prices", CATALOG_RELATION.productPrices, parent, { multiple: true }),
		bool(PRODUCT_FIELD.trackInventory, "Track inventory"),
		bool(PRODUCT_FIELD.allowBackorder, "Allow backorder"),
		text(PRODUCT_FIELD.taxCode, "Stripe tax code (txcd_…)"),
		{ ...json(PRODUCT_FIELD.specs, "Specification (edit it in the Specification panel)"), isProtected: true },
	],
});

const productTypesCollection = (slugs: Slugs): CollectionDefinition => ({
	slug: slugs.productTypes,
	label: "Product types",
	labelSingular: "Product type",
	description: "Which attributes make up a variant (up to three axes) and which ones a product specifies.",
	supports: [],
	routable: false,
	icon: "stack",
	navigation: collectionNavigation(ADMIN_NAV_GROUP.catalog, "productTypes"),
	listColumns: [PRODUCT_TYPE_FIELD.name, PRODUCT_TYPE_FIELD.code],
	titleField: PRODUCT_TYPE_FIELD.name,
	isPluginOwned: false,
	hidden: false,
	fields: [
		text(PRODUCT_TYPE_FIELD.name, "Name", { required: true, searchable: true }),
		text(PRODUCT_TYPE_FIELD.code, "Code", { indexed: true }),
		relationField(PRODUCT_TYPE_FIELD.variantAxes, "Variant axes (select attributes, up to 3)", CATALOG_RELATION.typeVariantAxes, parent, { multiple: true }),
		relationField(PRODUCT_TYPE_FIELD.allowedValues, "Allowed values (empty for an axis = all of its values)", CATALOG_RELATION.typeAllowedValues, parent, { multiple: true }),
		relationField(PRODUCT_TYPE_FIELD.specAttributes, "Specification attributes", CATALOG_RELATION.typeSpecAttributes, parent, { multiple: true }),
		relationField(PRODUCT_TYPE_FIELD.requiredSpecs, "Required specifications (a subset of the above)", CATALOG_RELATION.typeRequiredSpecs, parent, { multiple: true }),
	],
});

const attributesCollection = (slugs: Slugs): CollectionDefinition => ({
	slug: slugs.attributes,
	label: "Attributes",
	labelSingular: "Attribute",
	description: "Properties products are described by (Colour, Size, Material) and their values.",
	supports: [],
	routable: false,
	icon: "tag",
	navigation: collectionNavigation(ADMIN_NAV_GROUP.catalog, "attributes"),
	listColumns: [ATTRIBUTE_FIELD.name, ATTRIBUTE_FIELD.inputType, ATTRIBUTE_FIELD.presentation, ATTRIBUTE_FIELD.isFilterable],
	titleField: ATTRIBUTE_FIELD.name,
	isPluginOwned: false,
	hidden: false,
	fields: [
		text(ATTRIBUTE_FIELD.name, "Name", { required: true, searchable: true }),
		text(ATTRIBUTE_FIELD.storefrontLabel, "Storefront label (defaults to the name)"),
		text(ATTRIBUTE_FIELD.code, "Code", { indexed: true }),
		select(ATTRIBUTE_FIELD.inputType, "Input type", values(ATTRIBUTE_INPUT_TYPE), { defaultValue: ATTRIBUTE_INPUT_TYPE.select }),
		select(ATTRIBUTE_FIELD.presentation, "Presentation (select attributes)", values(ATTRIBUTE_PRESENTATION), { defaultValue: ATTRIBUTE_PRESENTATION.buttons }),
		text(ATTRIBUTE_FIELD.unit, "Unit (e.g. cm, kg)"),
		bool(ATTRIBUTE_FIELD.isFilterable, "Filterable on the storefront"),
		relationField(ATTRIBUTE_FIELD.values, "Values", CATALOG_RELATION.attributeValues, parent, { multiple: true }),
	],
});

const attributeValuesCollection = (slugs: Slugs): CollectionDefinition => ({
	slug: slugs.attributeValues,
	label: "Attribute values",
	labelSingular: "Attribute value",
	description: "The choices of an attribute (Black, M). Edited from the attribute.",
	supports: [],
	routable: false,
	icon: "list",
	navigation: collectionNavigation(ADMIN_NAV_GROUP.catalog, "attributeValues"),
	listColumns: [ATTRIBUTE_VALUE_FIELD.label, ATTRIBUTE_VALUE_FIELD.code, ATTRIBUTE_VALUE_FIELD.swatch, ATTRIBUTE_VALUE_FIELD.attribute],
	titleField: ATTRIBUTE_VALUE_FIELD.label,
	isPluginOwned: false,
	hidden: true,
	fields: [
		text(ATTRIBUTE_VALUE_FIELD.label, "Label", { required: true, searchable: true }),
		text(ATTRIBUTE_VALUE_FIELD.code, "Code (used in derived SKUs)"),
		text(ATTRIBUTE_VALUE_FIELD.swatch, "Swatch colour (#rgb or #rrggbb)"),
		relationField(ATTRIBUTE_VALUE_FIELD.attribute, "Attribute", CATALOG_RELATION.attributeValues, child),
	],
});

const brandsCollection = (slugs: Slugs): CollectionDefinition => ({
	slug: slugs.brands,
	label: "Brands",
	labelSingular: "Brand",
	description: "Brands products belong to; each has its own page.",
	supports: ["seo", "search"],
	routable: true,
	urlPattern: "/shop/brand/{slug}",
	icon: "bookmark",
	navigation: collectionNavigation(ADMIN_NAV_GROUP.catalog, "brands"),
	listColumns: [BRAND_FIELD.name, BRAND_FIELD.website],
	titleField: BRAND_FIELD.name,
	isPluginOwned: false,
	hidden: false,
	fields: [
		text(BRAND_FIELD.name, "Name", { required: true, searchable: true }),
		imageField(BRAND_FIELD.logo, "Logo"),
		{ slug: BRAND_FIELD.website, label: "Website", type: "url" },
		{ slug: BRAND_FIELD.intro, label: "Intro", type: "text" },
		{ slug: BRAND_FIELD.description, label: "Description", type: "portableText" },
	],
});

const categoriesCollection = (slugs: Slugs): CollectionDefinition => ({
	slug: slugs.categories,
	label: "Categories",
	labelSingular: "Category",
	description: "Product categories; a category can have subcategories.",
	supports: ["seo", "search"],
	routable: true,
	urlPattern: "/shop/c/{slug}",
	icon: "folder",
	navigation: collectionNavigation(ADMIN_NAV_GROUP.catalog, "categories"),
	listColumns: [CATEGORY_FIELD.name, CATEGORY_FIELD.parent],
	titleField: CATEGORY_FIELD.name,
	isPluginOwned: false,
	hidden: false,
	fields: [
		text(CATEGORY_FIELD.name, "Name", { required: true, searchable: true }),
		imageField(CATEGORY_FIELD.image, "Image"),
		{ slug: CATEGORY_FIELD.intro, label: "Intro", type: "text" },
		{ slug: CATEGORY_FIELD.description, label: "Description", type: "portableText" },
		relationField(CATEGORY_FIELD.parent, "Parent category", CATALOG_RELATION.categoryTree, child),
		relationField(CATEGORY_FIELD.subcategories, "Subcategories", CATALOG_RELATION.categoryTree, parent, { multiple: true }),
	],
});

const variantsCollection = (slugs: Slugs): CollectionDefinition => ({
	slug: slugs.variants,
	label: "Variants",
	labelSingular: "Variant",
	description: "Sellable combinations of a product's axes (one value per axis). Edited from the product.",
	supports: [],
	routable: false,
	icon: "stack",
	navigation: collectionNavigation(ADMIN_NAV_GROUP.catalog, "variants"),
	listColumns: [VARIANT_FIELD.product, VARIANT_FIELD.sku, VARIANT_FIELD.stock, VARIANT_FIELD.isActive],
	titleField: VARIANT_FIELD.title,
	isPluginOwned: false,
	hidden: true,
	fields: [
		// Not required: an empty title is derived ("Product — M / Black") once the links are saved.
		text(VARIANT_FIELD.title, "Title (derived when empty)", { searchable: true }),
		relationField(VARIANT_FIELD.product, "Product", CATALOG_RELATION.productVariants, child, { required: true }),
		relationField(VARIANT_FIELD.optionValues, "Option values (one per axis of the product type)", CATALOG_RELATION.variantOptionValues, parent, { multiple: true }),
		{ ...text(VARIANT_FIELD.optionsKey, "Options key (derived)", { indexed: true }), isProtected: true },
		integer(VARIANT_FIELD.price, "Price override (minor units; empty = the product price)"),
		imageField(VARIANT_FIELD.image, "Image"),
		galleryField(VARIANT_FIELD.gallery, "Gallery (more pictures of this variant, e.g. one colour)"),
		text(VARIANT_FIELD.sku, "SKU (derived when empty)", { indexed: true, unique: true }),
		bool(VARIANT_FIELD.isActive, "Active", { defaultValue: true }),
		bool(VARIANT_FIELD.trackInventory, "Track inventory"),
		bool(VARIANT_FIELD.allowBackorder, "Allow backorder"),
		integer(VARIANT_FIELD.stock, "Stock (units on hand)"),
		relationField(VARIANT_FIELD.prices, "Prices", CATALOG_RELATION.variantPrices, parent, { multiple: true }),
		...syncFields(VARIANT_FIELD.stripeProductId, "Stripe product id", VARIANT_FIELD.stripeSyncStatus, VARIANT_FIELD.stripeSyncError),
	],
});

const pricesCollection = (slugs: Slugs, supportedCurrencies: readonly string[]): CollectionDefinition => ({
	slug: slugs.prices,
	label: "Prices",
	labelSingular: "Price",
	description: "One-time or recurring prices of a product or one of its variants. Edited from the product or variant.",
	supports: [],
	routable: false,
	icon: "currency-circle-dollar",
	navigation: collectionNavigation(ADMIN_NAV_GROUP.catalog, "prices"),
	listColumns: [PRICE_FIELD.nickname, PRICE_FIELD.unitAmount, PRICE_FIELD.currency, PRICE_FIELD.isActive],
	titleField: PRICE_FIELD.nickname,
	isPluginOwned: false,
	hidden: true,
	fields: [
		text(PRICE_FIELD.nickname, "Nickname", { searchable: true }),
		relationField(PRICE_FIELD.product, "Product (set this or the variant, not both)", CATALOG_RELATION.productPrices, child),
		relationField(PRICE_FIELD.variant, "Variant (set this or the product, not both)", CATALOG_RELATION.variantPrices, child),
		select(PRICE_FIELD.type, "Type", values(PRICE_TYPE), { required: true, indexed: true }),
		integer(PRICE_FIELD.unitAmount, "Amount (minor units, e.g. grosze)", { required: true }),
		select(PRICE_FIELD.currency, "Currency", [...supportedCurrencies], { required: true }),
		select(PRICE_FIELD.interval, "Billing interval", values(BILLING_INTERVAL)),
		integer(PRICE_FIELD.intervalCount, "Interval count", { defaultValue: 1 }),
		integer(PRICE_FIELD.trialDays, "Trial days"),
		select(PRICE_FIELD.taxBehavior, "Tax behavior", values(TAX_BEHAVIOR), { defaultValue: TAX_BEHAVIOR.unspecified }),
		text(PRICE_FIELD.lookupKey, "Lookup key", { indexed: true, unique: true }),
		bool(PRICE_FIELD.isActive, "Active", { defaultValue: true }),
		bool(PRICE_FIELD.isDefault, "Default price"),
		{ ...bool(PRICE_FIELD.isManaged, "Managed by the plugin (mirrors the product / variant price)"), isProtected: true },
		...syncFields(PRICE_FIELD.stripePriceId, "Stripe price id", PRICE_FIELD.stripeSyncStatus, PRICE_FIELD.stripeSyncError),
	],
});

const relation = (
	slug: string,
	parentCollection: string,
	childCollection: string,
	labels: { parent: string; child: string },
	limits: { maxChildren: number | null; maxParents: number | null },
): RelationDefinition => ({
	slug,
	parentCollection,
	childCollection,
	parentLabel: labels.parent,
	childLabel: labels.child,
	maxChildrenPerParent: limits.maxChildren,
	maxParentsPerChild: limits.maxParents,
});

/**
 * Relations of the catalog. Bounded ones carry the limit EmDash enforces (and the plugin reads one page of 50, so
 * the limits keep every bounded read complete): variants and prices per sellable, values per attribute, axes
 * (3), specification attributes per type.
 */
export const buildCatalogRelations = (slugs: Slugs): RelationDefinition[] => [
	relation(CATALOG_RELATION.productVariants, slugs.products, slugs.variants, { parent: "Product", child: "Variants" }, { maxChildren: CATALOG_LIMITS.maxVariantsPerProduct, maxParents: 1 }),
	relation(CATALOG_RELATION.productPrices, slugs.products, slugs.prices, { parent: "Product", child: "Prices" }, { maxChildren: CATALOG_LIMITS.maxPricesPerSellable, maxParents: 1 }),
	relation(CATALOG_RELATION.variantPrices, slugs.variants, slugs.prices, { parent: "Variant", child: "Prices" }, { maxChildren: CATALOG_LIMITS.maxPricesPerSellable, maxParents: 1 }),
	relation(CATALOG_RELATION.variantOptionValues, slugs.variants, slugs.attributeValues, { parent: "Variants", child: "Option values" }, { maxChildren: CATALOG_LIMITS.maxAxesPerType, maxParents: null }),
	relation(CATALOG_RELATION.attributeValues, slugs.attributes, slugs.attributeValues, { parent: "Attribute", child: "Values" }, { maxChildren: CATALOG_LIMITS.maxValuesPerAttribute, maxParents: 1 }),
	relation(CATALOG_RELATION.typeVariantAxes, slugs.productTypes, slugs.attributes, { parent: "Product types", child: "Variant axes" }, { maxChildren: CATALOG_LIMITS.maxAxesPerType, maxParents: null }),
	relation(CATALOG_RELATION.typeAllowedValues, slugs.productTypes, slugs.attributeValues, { parent: "Product types", child: "Allowed values" }, { maxChildren: CATALOG_LIMITS.maxValuesPerAttribute, maxParents: null }),
	relation(CATALOG_RELATION.typeSpecAttributes, slugs.productTypes, slugs.attributes, { parent: "Product types", child: "Specification attributes" }, { maxChildren: CATALOG_LIMITS.maxSpecAttributesPerType, maxParents: null }),
	relation(CATALOG_RELATION.typeRequiredSpecs, slugs.productTypes, slugs.attributes, { parent: "Product types", child: "Required specifications" }, { maxChildren: CATALOG_LIMITS.maxSpecAttributesPerType, maxParents: null }),
	relation(CATALOG_RELATION.productType, slugs.productTypes, slugs.products, { parent: "Product type", child: "Products" }, { maxChildren: null, maxParents: 1 }),
	relation(CATALOG_RELATION.productBrand, slugs.brands, slugs.products, { parent: "Brand", child: "Products" }, { maxChildren: null, maxParents: 1 }),
	relation(CATALOG_RELATION.productCategories, slugs.categories, slugs.products, { parent: "Categories", child: "Products" }, { maxChildren: null, maxParents: CATALOG_LIMITS.maxCategoriesPerProduct }),
	relation(CATALOG_RELATION.categoryTree, slugs.categories, slugs.categories, { parent: "Parent category", child: "Subcategories" }, { maxChildren: null, maxParents: 1 }),
];
