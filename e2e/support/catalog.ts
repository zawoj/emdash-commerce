/** What `scripts/lib/merch-catalog.mjs` seeds. The suite asserts against these on purpose: a changed seed should fail loudly. */
export const CATALOG = {
	productCount: 20,
	brandSlug: "edge-desk",
	brandName: "Edge Desk",
	brandProductCount: 5,
	categorySlug: "apparel",
	categoryLabel: "Apparel",
	/** Variant product: sizes XS-XL x colours; XL/Amber costs more than the base price. */
	variantProduct: { slug: "workers-tee", title: "Workers Tee", basePrice: "$28.00", baseSku: "WORKERS-TEE-XS-ORG", xlAmberPrice: "$30.00", xlAmberSku: "WORKERS-TEE-XL-AMB" },
	/** Variant product where XL/Orange does not exist. */
	bundleProduct: { slug: "workers-fit-bundle", missingSize: "XL", missingColour: "Orange", otherColour: "Black" },
	/** A product with one price and plenty of stock. */
	simpleProduct: { slug: "sticker-pack", title: "Sticker Pack (12)", price: "$9.00" },
	soldOutProduct: { slug: "birthday-pin" },
	post: { count: 7 },
} as const;

/** The shapes the plugin gives a collection's URLs, and what the storefront does with them. */
export const ORDER_NUMBER_SHAPE = /^ORD-\d{4}-\d{5}$/;
