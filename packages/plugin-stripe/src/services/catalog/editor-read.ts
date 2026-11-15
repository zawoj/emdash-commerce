import { PRODUCT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { parseSpecs, toProduct } from "../../adapters/emdash/content/catalog-mapper.js";
import { asRecord, asString } from "../../adapters/emdash/content/values.js";
import type { Product } from "../../core/catalog.js";
import { CommerceError } from "../../core/errors.js";
import type { ProductSpecs } from "../../core/product-type.js";
import { requireContent, type CommerceContainer } from "../../plugin/container.js";
import { RELATIONS_PAGE_SIZE } from "../../adapters/emdash/relations/port.js";

/**
 * The editor's view of a product: what the next publish would put live. A collection that keeps revisions holds
 * unpublished edits (title, SKU, specs and the staged relation selections) in its draft revision, and the live
 * columns hold the published data; the generator, the Specification panel and the publish guard act on the draft
 * because that is what the editor is looking at. (`content.get` alone would show a stale product.)
 */
export const readEditorData = async (container: CommerceContainer, collection: string, id: string): Promise<{ data: Record<string, unknown>; slug: string | null; status: string } | null> => {
	const content = requireContent(container);
	const item = await content.get(collection, id);
	if (!item) return null;
	let data: Record<string, unknown> = { ...item.data };
	if (item.draftRevisionId && content.getRevision) {
		const draft = await content.getRevision(collection, id, item.draftRevisionId).catch(() => null);
		if (draft) {
			const fields = Object.fromEntries(Object.entries(draft.data).filter(([key]) => !key.startsWith("_")));
			data = { ...data, ...fields };
		}
	}
	return { data, slug: item.slug ?? null, status: item.status };
};

/** The product as an editor sees it: draft data and the staged type, brand and category selections. */
export const readEditorProduct = async (container: CommerceContainer, productId: string): Promise<Product | null> => {
	const slugs = container.options.collections;
	const editor = await readEditorData(container, slugs.products, productId);
	if (!editor) return null;
	const fields = await container.relations.fields(slugs.products, productId, [PRODUCT_FIELD.productType, PRODUCT_FIELD.brand, PRODUCT_FIELD.categories], {
		includeDrafts: true,
		limit: RELATIONS_PAGE_SIZE,
	});
	return toProduct(
		{ id: productId, slug: editor.slug, status: editor.status, data: editor.data, createdAt: "", updatedAt: "" },
		{
			typeId: fields[PRODUCT_FIELD.productType]!.items[0]?.id ?? null,
			brandId: fields[PRODUCT_FIELD.brand]!.items[0]?.id ?? null,
			categoryIds: fields[PRODUCT_FIELD.categories]!.items.map((entry) => entry.id),
		},
	);
};

export const requireEditorProduct = async (container: CommerceContainer, productId: string): Promise<Product> => {
	const product = await readEditorProduct(container, productId);
	if (!product) throw new CommerceError("notFound", "Product not found");
	return product;
};

/** The saved specification snapshot of a draft or live product row. */
export const specsOfData = (data: Record<string, unknown>): ProductSpecs => parseSpecs(data[PRODUCT_FIELD.specs]);

export const titleOfData = (data: Record<string, unknown>): string => asString(data[PRODUCT_FIELD.title]) ?? "";
export const isRecordData = (value: unknown): value is Record<string, unknown> => asRecord(value) !== null;
