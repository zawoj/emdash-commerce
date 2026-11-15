import type { CatalogProductView } from "../contracts/api.js";
import { defaultCatalogPrice, formatDefaultPriceLabel } from "../blocks/catalog-format.js";

export interface ProductBlockNode {
	product_slug?: string;
}

export interface ProductBlockViewModel {
	slug: string;
	title: string;
	priceLabel: string;
	priceId: string;
	isAvailable: boolean;
	imageSrc: string | null;
	imageAlt: string;
	unavailableReason: string | null;
}

export const productBlockViewModel = (
	node: ProductBlockNode,
	cmsProduct:
		| {
				id: string;
				slug: string;
				status: string;
				data: Record<string, unknown>;
		  }
		| null,
	catalog: CatalogProductView | null,
): ProductBlockViewModel => {
	const slug = typeof node.product_slug === "string" ? node.product_slug.trim() : "";
	const image = cmsProduct?.data.image as { src?: string; alt?: string } | undefined;

	if (!catalog || cmsProduct?.status !== "published") {
		return {
			slug,
			title: slug || "Product",
			priceLabel: "",
			priceId: "",
			isAvailable: false,
			imageSrc: typeof image?.src === "string" ? image.src : null,
			imageAlt: typeof image?.alt === "string" ? image.alt : "",
			unavailableReason: slug ? null : "Unknown product",
		};
	}

	const price = defaultCatalogPrice(catalog);
	const purchasable = catalog.isAvailable && price?.isPurchasable === true;

	return {
		slug: catalog.slug,
		title: catalog.title,
		priceLabel: price ? formatDefaultPriceLabel(catalog) : "",
		priceId: price?.id ?? "",
		isAvailable: purchasable,
		imageSrc: typeof image?.src === "string" ? image.src : null,
		imageAlt: typeof image?.alt === "string" ? image.alt : "",
		unavailableReason: purchasable ? null : "Unavailable",
	};
};
