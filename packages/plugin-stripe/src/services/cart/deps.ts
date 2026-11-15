import type { ExtensionContext } from "../../contracts/extensions.js";
import type { CatalogSyncService, EventPublisher } from "../contracts.js";

/**
 * What the storefront use cases (cart, checkout, inventory) need from services owned elsewhere. They are
 * passed in rather than imported so a service test can hand over stubs; `checkout/wire.ts` builds the real
 * ones from a container.
 */
export interface StorefrontDeps {
	catalogSync: CatalogSyncService;
	publisher: EventPublisher;
	extensionContext: ExtensionContext;
}
