import type { CatalogProductsQuery, ProductCardView } from "../../contracts/api.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { createCardBuilder } from "./cards.js";
import { listPublishedEntries, mapBatched, toCandidate, type Candidate } from "./load.js";

export const DEFAULT_LIMIT = 60;

const byNewest = (a: Candidate, b: Candidate): number => b.entry.createdAt.localeCompare(a.entry.createdAt) || a.product.id.localeCompare(b.product.id);
const byName = (a: Candidate, b: Candidate): number => a.product.title.localeCompare(b.product.title) || a.product.id.localeCompare(b.product.id);

const isPriceSort = (sort: CatalogProductsQuery["sort"]): boolean => sort === "price-asc" || sort === "price-desc";

/** Published, sellable products as cards. The filters run on the product links (no variant or price read for a product that is filtered out). */
export const listProductCards = async (container: CommerceContainer, query: CatalogProductsQuery): Promise<ProductCardView[]> => {
	const limit = query.limit ?? DEFAULT_LIMIT;
	const sort = query.sort ?? "newest";
	const entries = await listPublishedEntries(container);
	const candidates = (await mapBatched(entries, (entry) => toCandidate(container, entry))).filter(
		(candidate) =>
			(!query.category || candidate.links.categories.some((category) => category.slug === query.category)) &&
			(!query.brand || candidate.links.brand?.slug === query.brand),
	);
	const builder = createCardBuilder(container);

	if (isPriceSort(sort)) {
		// The price sort needs every card; the amount (the lowest variant price for a ranged product) decides.
		const cards = (await mapBatched(candidates, (candidate) => builder.build(candidate))).filter((card): card is ProductCardView => card !== null);
		const direction = sort === "price-asc" ? 1 : -1;
		return cards.sort((a, b) => direction * (a.price.amount - b.price.amount) || a.id.localeCompare(b.id)).slice(0, limit);
	}

	// Newest / name: order first, then build cards until `limit` sellable products are collected.
	const ordered = [...candidates].sort(sort === "name" ? byName : byNewest);
	const cards: ProductCardView[] = [];
	for (let start = 0; start < ordered.length && cards.length < limit; start += limit) {
		const built = await mapBatched(ordered.slice(start, start + limit), (candidate) => builder.build(candidate));
		cards.push(...built.filter((card): card is ProductCardView => card !== null));
	}
	return cards.slice(0, limit);
};
