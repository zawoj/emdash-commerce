import type { CommerceContainer } from "../../plugin/container.js";
import { createCartService, type CartService } from "../cart.js";
import { createCatalogReadService, type CatalogReadService } from "../catalog-read.js";
import { createCatalogSyncService } from "../catalog-sync.js";
import { createCheckoutService, type CheckoutService } from "../checkout.js";
import { createExtensionContext } from "../extension-context.js";
import { createInventoryService, type InventoryService } from "../inventory.js";
import { createEventPublisher } from "../outbox.js";
import type { StorefrontDeps } from "../cart/deps.js";

export interface StorefrontServices {
	cart: CartService;
	checkout: CheckoutService;
	inventory: InventoryService;
	catalogRead: CatalogReadService;
}

/** Real dependencies from the services other owners build; tests construct the services with stubs instead. */
export const createStorefrontDeps = (container: CommerceContainer): StorefrontDeps => {
	const publisher = createEventPublisher(container);
	return { publisher, catalogSync: createCatalogSyncService(container, publisher), extensionContext: createExtensionContext(container) };
};

/** The storefront services for one request. */
export const createStorefrontServices = (container: CommerceContainer, deps: StorefrontDeps = createStorefrontDeps(container)): StorefrontServices => ({
	cart: createCartService(container, deps),
	checkout: createCheckoutService(container, deps),
	inventory: createInventoryService(container, deps),
	catalogRead: createCatalogReadService(container),
});
