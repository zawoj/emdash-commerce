/** Field slugs of the catalog collections (products, variants, prices and the product-model vocabulary). See `./index.ts` for the shared rules. */

export const PRODUCT_FIELD = {
	title: "title",
	description: "description",
	image: "image",
	/** Repeater of `{ image, alt }` rows: more pictures of the product (`GALLERY_ITEM_FIELD`). */
	gallery: "gallery",
	hasVariants: "has_variants",
	trackInventory: "track_inventory",
	allowBackorder: "allow_backorder",
	taxCode: "tax_code",
	/** Integer minor units in the store's default currency; the base price of the product and of its variants. */
	price: "price",
	/** Stock keeping unit of a product without variants. */
	sku: "sku",
	/** JSON snapshot `{ [attributeId]: value }` written by the Specification panel (protected). */
	specs: "specs",
	/** Relation fields (no column; read and written through `RelationsPort`). */
	productType: "product_type",
	brand: "brand",
	categories: "categories",
	variants: "variants",
	prices: "prices",
} as const;

/** Sub-fields of a `gallery` row (product and variant). Never required: EmDash validates every draft autosave. */
export const GALLERY_ITEM_FIELD = {
	image: "image",
	alt: "alt",
} as const;

export const VARIANT_FIELD = {
	title: "title",
	/** Child end of `product_variants`: the one product the variant belongs to. */
	product: "product",
	/** Parent end of `variant_option_values`: one value per product-type axis. */
	optionValues: "option_values",
	/** Sorted value ids joined with `|`, unique per product (protected, derived). */
	optionsKey: "options_key",
	/** Optional override of the product price, integer minor units; empty = the product price. */
	price: "price",
	image: "image",
	/** Repeater of `{ image, alt }` rows: more pictures of the variant (a colour gallery). */
	gallery: "gallery",
	sku: "sku",
	isActive: "is_active",
	trackInventory: "track_inventory",
	allowBackorder: "allow_backorder",
	stock: "stock",
	prices: "prices",
	stripeProductId: "stripe_product_id",
	stripeSyncStatus: "stripe_sync_status",
	stripeSyncError: "stripe_sync_error",
} as const;

export const PRICE_FIELD = {
	nickname: "nickname",
	/** Child end of `product_prices` (set when the price belongs to the product itself). */
	product: "product",
	/** Child end of `variant_prices` (set when the price belongs to one variant). Exactly one of the two is set. */
	variant: "variant",
	type: "type",
	unitAmount: "unit_amount",
	currency: "currency",
	interval: "interval",
	intervalCount: "interval_count",
	trialDays: "trial_days",
	taxBehavior: "tax_behavior",
	lookupKey: "lookup_key",
	isActive: "is_active",
	isDefault: "is_default",
	/** True for the entry the plugin keeps in sync with the product / variant `price` field (protected). */
	isManaged: "is_managed",
	stripePriceId: "stripe_price_id",
	stripeSyncStatus: "stripe_sync_status",
	stripeSyncError: "stripe_sync_error",
} as const;

export const ATTRIBUTE_FIELD = {
	name: "name",
	storefrontLabel: "storefront_label",
	code: "code",
	inputType: "input_type",
	presentation: "presentation",
	unit: "unit",
	isFilterable: "is_filterable",
	/** Parent end of `attribute_values`, ordered. */
	values: "values",
} as const;

export const ATTRIBUTE_VALUE_FIELD = {
	label: "label",
	code: "code",
	/** `#rgb` or `#rrggbb`, shown as a swatch on the storefront. */
	swatch: "swatch",
	/** Child end of `attribute_values`. */
	attribute: "attribute",
} as const;

export const PRODUCT_TYPE_FIELD = {
	name: "name",
	code: "code",
	variantAxes: "variant_axes",
	allowedValues: "allowed_values",
	specAttributes: "spec_attributes",
	requiredSpecs: "required_specs",
} as const;

export const BRAND_FIELD = {
	name: "name",
	logo: "logo",
	website: "website",
	intro: "intro",
	description: "description",
} as const;

export const CATEGORY_FIELD = {
	name: "name",
	image: "image",
	intro: "intro",
	description: "description",
	/** Parent end of `category_tree` (the subcategories) and its child end (the parent category). */
	subcategories: "subcategories",
	parent: "parent",
} as const;

/** Native relations of the catalog (slugs match `^[a-z][a-z0-9_]*$`). */
export const CATALOG_RELATION = {
	productVariants: "catalog_product_variants",
	productPrices: "catalog_product_prices",
	variantPrices: "catalog_variant_prices",
	variantOptionValues: "catalog_variant_option_values",
	attributeValues: "catalog_attribute_values",
	typeVariantAxes: "catalog_type_variant_axes",
	typeAllowedValues: "catalog_type_allowed_values",
	typeSpecAttributes: "catalog_type_spec_attributes",
	typeRequiredSpecs: "catalog_type_required_specs",
	productType: "catalog_product_type",
	productBrand: "catalog_product_brand",
	productCategories: "catalog_product_categories",
	categoryTree: "catalog_category_tree",
} as const;

/** A relation read returns at most one page (`RELATIONS_PAGE_SIZE`); bounded relations are capped to it. */
export const CATALOG_LIMITS = {
	maxVariantsPerProduct: 50,
	maxPricesPerSellable: 50,
	maxValuesPerAttribute: 50,
	maxAxesPerType: 3,
	maxSpecAttributesPerType: 50,
	maxCategoriesPerProduct: 50,
} as const;
