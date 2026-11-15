import type { CatalogLink, InboxRecord } from "../../ports/repositories.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { errorMessage } from "../payments/async.js";
import { getAdminStatus, type AdminStatus } from "./status.js";

/** Everything the Commerce admin page shows: the status overview plus the two actionable lists. */
export interface AdminPageData {
	status: AdminStatus;
	failedEvents: Array<Omit<InboxRecord, "payload">>;
	failedLinks: CatalogLink[];
}

const LIST_LIMIT = 20;

const safely = async <T>(container: CommerceContainer, what: string, fallback: T, run: () => Promise<T>): Promise<T> => {
	try {
		return await run();
	} catch (error) {
		container.log.warn(`Admin page: ${what} failed`, { error: errorMessage(error) });
		return fallback;
	}
};

export const loadAdminPageData = async (container: CommerceContainer, input: { webhookUrl: string }): Promise<AdminPageData> => {
	const [status, failed, dead, failedLinks] = await Promise.all([
		getAdminStatus(container, input),
		safely(container, "failed events", { items: [] as InboxRecord[], cursor: null }, () => container.inbox.listByStatus("failed", LIST_LIMIT, null)),
		safely(container, "dead events", { items: [] as InboxRecord[], cursor: null }, () => container.inbox.listByStatus("dead", LIST_LIMIT, null)),
		safely(container, "failed catalog links", [] as CatalogLink[], () => container.catalogLinks.listFailed(LIST_LIMIT)),
	]);
	const failedEvents = [...dead.items, ...failed.items].slice(0, LIST_LIMIT).map(({ payload: _payload, ...summary }) => summary);
	return { status, failedEvents, failedLinks };
};

/** Resolves a catalog link's entity key (`product:`, `variant:`, `price:`) to the product it belongs to. */
export const productIdOfEntityKey = async (container: CommerceContainer, entityKey: string): Promise<string | null> => {
	const separator = entityKey.indexOf(":");
	if (separator < 0) return null;
	const entity = entityKey.slice(0, separator);
	const id = entityKey.slice(separator + 1);
	if (entity === "product") return (await container.catalog.getProduct(id))?.id ?? null;
	if (entity === "variant") return (await container.catalog.getVariant(id))?.productId ?? null;
	if (entity === "price") return (await container.catalog.getPrice(id))?.productId ?? null;
	return null;
};
