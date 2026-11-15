import type { ContentAccess } from "emdash";

import type { Variant } from "../../../core/catalog.js";
import type { Customer } from "../../../core/customer.js";
import type { Subscription } from "../../../core/subscription.js";
import type { CommerceOptions } from "../../../contracts/options.js";
import {
	RECORD_INDEX_KEY,
	type CartMirror,
	type Logger,
	type Page,
	type RecordIndex,
} from "../../../ports/repositories.js";
import { CART_FIELD } from "../schema/field-names.js";
import { compact, type ContentEntry } from "./values.js";

export { createCatalogRepository } from "./catalog-repository.js";

export type CollectionSlugs = CommerceOptions["collections"];

/** What the repositories need from `ctx.content`: read, plus write for the plugin-owned records. */
export type WritableContent = ContentAccess & {
	create: NonNullable<ContentAccess["create"]>;
	update: NonNullable<ContentAccess["update"]>;
};

export const requireWritableContent = (content: ContentAccess | undefined): WritableContent => {
	if (!content?.create || !content.update) {
		throw new Error("The commerce plugin needs the content:write capability (ctx.content is read-only or missing).");
	}
	return content as WritableContent;
};

const MAX_LIST_LIMIT = 100;
const MAX_RELATED = 500;

/** Lists every entry matching a filter, paging through `content.list` (limit <= 100) up to a safety cap. */
const listAll = async (
	content: ContentAccess,
	collection: string,
	where: NonNullable<Parameters<ContentAccess["list"]>[1]>["where"],
): Promise<ContentEntry[]> => {
	const items: ContentEntry[] = [];
	let cursor: string | undefined;
	do {
		const page = await content.list(collection, { where, limit: MAX_LIST_LIMIT, cursor });
		items.push(...page.items);
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && items.length < MAX_RELATED);
	return items;
};

const toPage = <T>(items: T[], cursor: string | undefined, hasMore: boolean): Page<T> => ({ items, cursor: hasMore ? (cursor ?? null) : null });

// --- Plugin-owned records --------------------------------------------------------------------------------

/**
 * Creates an entry and publishes it best-effort. Entries a plugin creates stay `draft` in EmDash unless
 * published, and a published status is what the admin shows for a record that is final; a failed publish
 * is logged and ignored (the data is complete either way, and the admin lists drafts too).
 */
export const createAndPublish = async (content: WritableContent, log: Logger, collection: string, data: Record<string, unknown>): Promise<ContentEntry> => {
	const created = await content.create(collection, data);
	try {
		const versioned = await content.getVersioned?.(collection, created.id);
		if (versioned && content.publish) await content.publish(collection, created.id, { _rev: versioned._rev });
	} catch (error) {
		log.warn("Could not publish a commerce record; it stays a draft", { collection, id: created.id, error: error instanceof Error ? error.message : "unknown" });
	}
	return created;
};

export type { Customer, Subscription, Variant };

// --- Cart mirror -----------------------------------------------------------------------------------------

/**
 * Best-effort admin view of a cart. The mirror entry's id is kept in the record index and created under a
 * claim, so two concurrent upserts cannot make two entries; a caller that loses the claim while the winner
 * is still creating simply skips (the next cart write mirrors it).
 */
export const createCartMirror = (content: WritableContent, slugs: CollectionSlugs, index: RecordIndex, log: Logger): CartMirror => {
	const toData = (cart: Parameters<CartMirror["upsert"]>[0], summary: Parameters<CartMirror["upsert"]>[1]) =>
		compact({
			[CART_FIELD.cartId]: cart.id,
			[CART_FIELD.cartStatus]: cart.status,
			[CART_FIELD.email]: cart.email,
			[CART_FIELD.lines]: cart.lines,
			[CART_FIELD.itemCount]: summary.itemCount,
			[CART_FIELD.subtotalAmount]: summary.subtotal,
			[CART_FIELD.currency]: summary.currency,
			[CART_FIELD.pricedLines]: summary.lines,
			[CART_FIELD.checkoutSessionId]: cart.checkout?.sessionId ?? null,
			[CART_FIELD.orderId]: cart.orderId,
			[CART_FIELD.country]: cart.context.country,
			[CART_FIELD.userAgent]: cart.context.userAgent?.slice(0, 300) ?? null,
			[CART_FIELD.cartCreatedAt]: cart.createdAt,
			[CART_FIELD.lastActivityAt]: cart.updatedAt,
			[CART_FIELD.expiresAt]: cart.expiresAt,
		});

	return {
		async upsert(cart, summary) {
			const key = RECORD_INDEX_KEY.cartMirrorByCart(cart.id);
			const data = toData(cart, summary);
			let entryId = await index.get(key);
			if (!entryId) {
				const claim = await index.claim(key);
				if (!claim.isWinner) {
					entryId = claim.recordId;
					if (!entryId) return;
				} else {
					try {
						const created = await createAndPublish(content, log, slugs.carts, data);
						await index.set(key, created.id);
					} catch (error) {
						await index.releaseClaim(key);
						throw error;
					}
					return;
				}
			}
			try {
				await content.update(slugs.carts, entryId, data);
			} catch (error) {
				// The entry was deleted in the admin: start a fresh mirror.
				if (await content.get(slugs.carts, entryId)) throw error;
				const created = await createAndPublish(content, log, slugs.carts, data);
				await index.set(key, created.id);
			}
		},
	};
};
