import { availabilityView, catalogAvailabilityQuery, catalogLegacyProductView, catalogProductQuery, catalogProductsQuery, catalogProductsView, productDetailView, ROUTE } from "../../contracts/api.js";
import { createCatalogReadService } from "../../services/catalog-read.js";
import type { RouteModule } from "../route-builder.js";

/** Cached briefly: product pages are read far more often than they change. Availability must be fresh. */
const PRODUCT_CACHE_CONTROL = "public, max-age=30";
const AVAILABILITY_CACHE_CONTROL = "no-store";

/** Public catalog reads (`catalog/products`, `catalog/product`, `catalog/availability`, deprecated `catalog/product-legacy`); never call the payment provider. */
export const catalogRoutes: RouteModule = (builder) => ({
	[ROUTE.catalogProducts]: builder.publicRoute({
		methods: ["GET"],
		schema: catalogProductsQuery,
		cacheControl: PRODUCT_CACHE_CONTROL,
		handler: async ({ container, input }) => catalogProductsView.parse(await createCatalogReadService(container).products(input)),
	}),
	[ROUTE.catalogProduct]: builder.publicRoute({
		methods: ["GET"],
		schema: catalogProductQuery,
		cacheControl: PRODUCT_CACHE_CONTROL,
		handler: async ({ container, input }) => productDetailView.parse(await createCatalogReadService(container).product(input.slug)),
	}),
	/** @deprecated The 0.2 shape, for storefronts not yet moved to `catalog/product`. */
	[ROUTE.catalogProductLegacy]: builder.publicRoute({
		methods: ["GET"],
		schema: catalogProductQuery,
		cacheControl: PRODUCT_CACHE_CONTROL,
		handler: async ({ container, input }) => catalogLegacyProductView.parse(await createCatalogReadService(container).legacyProduct(input.slug)),
	}),
	[ROUTE.catalogAvailability]: builder.publicRoute({
		methods: ["GET"],
		schema: catalogAvailabilityQuery,
		cacheControl: AVAILABILITY_CACHE_CONTROL,
		handler: async ({ container, input }) => availabilityView.parse(await createCatalogReadService(container).availability(input.priceIds)),
	}),
});
