import { beforeEach, describe, expect, it } from "vitest";

import { ATTRIBUTE_FIELD, BRAND_FIELD, CATEGORY_FIELD, PRICE_FIELD, PRODUCT_FIELD, VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { catalogProductsView, productCardView, productDetailView } from "../../contracts/api.js";
import { isCommerceError } from "../../core/errors.js";
import { syncManagedPrices } from "../catalog/managed-prices.js";
import { createModelWorld, type ModelWorld } from "../catalog/model-test-support.js";
import { createCatalogReadService, type CatalogReadService } from "../catalog-read.js";
import { availabilityOf, LOW_STOCK_MAX, mergeAvailability, STOCK_STATE } from "./stock.js";
import { excerptOf, imagesOf } from "./media.js";

const policy = { isTracked: true, allowsBackorder: false };

describe("availability", () => {
	it("untracked stock is in stock; tracked stock is low from 1 to 5, in stock above, sold out at 0, backorder at 0 when allowed", () => {
		expect(availabilityOf({ isTracked: false, allowsBackorder: false }, null)).toEqual({ state: "in_stock", lowCount: null });
		expect(availabilityOf(policy, 0)).toEqual({ state: "sold_out", lowCount: null });
		expect(availabilityOf(policy, 1)).toEqual({ state: "low", lowCount: 1 });
		expect(availabilityOf(policy, LOW_STOCK_MAX)).toEqual({ state: "low", lowCount: 5 });
		expect(availabilityOf(policy, LOW_STOCK_MAX + 1)).toEqual({ state: "in_stock", lowCount: null });
		expect(availabilityOf({ isTracked: true, allowsBackorder: true }, 0)).toEqual({ state: "backorder", lowCount: null });
		expect(availabilityOf({ isTracked: true, allowsBackorder: true }, 3)).toEqual({ state: "low", lowCount: 3 });
	});

	it("merges variants: in stock beats low beats backorder beats sold out; low counts add up and read as in stock above the threshold", () => {
		const sold = { state: STOCK_STATE.soldOut, lowCount: null };
		const back = { state: STOCK_STATE.backorder, lowCount: null };
		const low = (count: number) => ({ state: STOCK_STATE.low, lowCount: count });
		const inStock = { state: STOCK_STATE.inStock, lowCount: null };
		expect(mergeAvailability([sold, low(2), inStock])).toEqual(inStock);
		expect(mergeAvailability([sold, low(2), low(1), back])).toEqual(low(3));
		expect(mergeAvailability([low(4), low(4)])).toEqual(inStock);
		expect(mergeAvailability([sold, back])).toEqual(back);
		expect(mergeAvailability([sold, sold])).toEqual(sold);
		expect(mergeAvailability([])).toEqual(sold);
	});
});

describe("media helpers", () => {
	it("resolves a media object or bare URL to {url, alt}, falling back to the given alt", () => {
		expect(imagesOf({ src: "/_emdash/api/media/file/a.jpg", alt: "A mug" }, "Mug")).toEqual([{ url: "/_emdash/api/media/file/a.jpg", alt: "A mug" }]);
		expect(imagesOf({ src: "/a.jpg" }, "Mug")).toEqual([{ url: "/a.jpg", alt: "Mug" }]);
		expect(imagesOf("https://x/y.png", "Mug")).toEqual([{ url: "https://x/y.png", alt: "Mug" }]);
		expect(imagesOf({ id: "m1" }, "Mug")).toEqual([{ url: "/_emdash/api/media/file/m1", alt: "Mug" }]);
		expect(imagesOf({ provider: "pexels", id: "9" }, "Mug")).toEqual([]);
		expect(imagesOf({ provider: "local", id: "m1", meta: { storageKey: "01ABC.jpg" }, width: 800, height: 600, alt: "Cup" }, "Mug")).toEqual([
			{ url: "/_emdash/api/media/file/01ABC.jpg", alt: "Cup", width: 800, height: 600 },
		]);
		expect(imagesOf(null, "Mug")).toEqual([]);
	});
	it("takes the first non-empty paragraph as the excerpt, cut at a word", () => {
		const block = (text: string) => ({ _type: "block", children: [{ _type: "span", text }] });
		expect(excerptOf([block("  "), block("Hello  world")])).toBe("Hello world");
		expect(excerptOf([block(`${"word ".repeat(60)}end`)])!.length).toBeLessThanOrEqual(161);
		expect(excerptOf([])).toBeNull();
	});
});

const failure = async (promise: Promise<unknown>) => {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected a failure");
};

interface Shop {
	w: ModelWorld;
	read: CatalogReadService;
	size: { id: string; valueIds: string[] };
	colour: { id: string; valueIds: string[] };
	typeId: string;
	categories: { shirts: string; mugs: string };
	brands: { acme: string; zeta: string };
}

const block = (text: string) => ({ _type: "block", children: [{ _type: "span", text }] });

const shop = async (): Promise<Shop> => {
	const w = createModelWorld();
	const size = await w.attribute({ name: "Size", values: [{ label: "S", code: "s" }, { label: "M", code: "m" }, { label: "L", code: "l" }] });
	const colour = await w.attribute({ name: "Colour", storefrontLabel: "Kolor", presentation: "swatch", values: [{ label: "Black", code: "blk", swatch: "#000000" }, { label: "White", code: "wht", swatch: "#ffffff" }] });
	const typeId = await w.productType({ name: "Shirt", axes: [size.id, colour.id] });
	const seed = (collection: string, data: Record<string, unknown>, slug: string) => w.ctx.content.seedEntry(collection, data, { status: "published", slug });
	return {
		w,
		read: createCatalogReadService(w.container),
		size,
		colour,
		typeId,
		categories: { shirts: seed(w.slugs.categories, { [CATEGORY_FIELD.name]: "Shirts" }, "shirts"), mugs: seed(w.slugs.categories, { [CATEGORY_FIELD.name]: "Mugs" }, "mugs") },
		brands: { acme: seed(w.slugs.brands, { [BRAND_FIELD.name]: "Acme" }, "acme"), zeta: seed(w.slugs.brands, { [BRAND_FIELD.name]: "Zeta" }, "zeta") },
	};
};

const link = async (s: Shop, productId: string, links: { category?: string[]; brand?: string }) => {
	if (links.category) await s.w.ctx.fakeRelations.setChildren(s.w.slugs.products, productId, PRODUCT_FIELD.categories, links.category);
	if (links.brand) await s.w.ctx.fakeRelations.setParent(s.w.slugs.products, productId, PRODUCT_FIELD.brand, links.brand);
};

const stock = async (s: Shop, variantId: string, units: number, track = true) => {
	await s.w.ctx.content.update(s.w.slugs.variants, variantId, { [VARIANT_FIELD.trackInventory]: track });
	await s.w.container.inventory.adjust({ kind: "variant", id: variantId }, units, "seed");
};

/** A published simple product with a managed price. */
const mug = async (s: Shop, over: { title?: string; slug?: string; price?: number; sku?: string } = {}) => {
	const id = await s.w.product({ title: over.title ?? "Mug", slug: over.slug ?? "mug", price: over.price ?? 1200, sku: over.sku ?? "MUG-1" });
	await syncManagedPrices(s.w.container, { entity: "product", id });
	return id;
};

/** A published tee with S/M/L x Black variants (price 5000; M overrides to 6000; L inactive). */
const tee = async (s: Shop, over: { slug?: string; title?: string; price?: number } = {}) => {
	const id = await s.w.product({ title: over.title ?? "Tee", slug: over.slug ?? "tee", typeId: s.typeId, hasVariants: true, price: over.price ?? 5000, sku: "TEE" });
	const [vs, vm, vl] = s.size.valueIds;
	const black = s.colour.valueIds[0]!;
	const small = await s.w.variant({ productId: id, title: "Tee S", valueIds: [vs!, black], sku: "TEE-S" });
	const medium = await s.w.variant({ productId: id, title: "Tee M", valueIds: [vm!, black], sku: "TEE-M", price: 6000 });
	const large = await s.w.variant({ productId: id, title: "Tee L", valueIds: [vl!, black], sku: "TEE-L", isActive: false });
	await syncManagedPrices(s.w.container, { entity: "product", id });
	return { id, small, medium, large };
};

describe("catalog/products", () => {
	let s: Shop;
	beforeEach(async () => {
		s = await shop();
	});

	it("lists published, sellable products only, in the card shape", async () => {
		const mugId = await mug(s);
		await s.w.ctx.content.update(s.w.slugs.products, mugId, { [PRODUCT_FIELD.image]: { src: "/m.jpg", alt: "A mug" }, [PRODUCT_FIELD.description]: [block("Fine ceramic.")] });
		await link(s, mugId, { category: [s.categories.mugs], brand: s.brands.acme });
		// Not listed: a draft, a published product with no price, a variants product with no active variant.
		const draft = s.w.ctx.content.seedEntry(s.w.slugs.products, { [PRODUCT_FIELD.title]: "Draft", [PRODUCT_FIELD.price]: 100 }, { status: "draft", slug: "draft" });
		await syncManagedPrices(s.w.container, { entity: "product", id: draft });
		await s.w.product({ title: "Free?", slug: "no-price" });
		const empty = await s.w.product({ title: "Empty", slug: "empty", hasVariants: true, price: 100, typeId: s.typeId });
		await s.w.variant({ productId: empty, isActive: false });
		await syncManagedPrices(s.w.container, { entity: "product", id: empty });

		const { items } = await s.read.products({});
		expect(catalogProductsView.parse({ items })).toEqual({ items });
		expect(items.map((item) => item.slug)).toEqual(["mug"]);
		const [card] = items;
		const managed = s.w.ctx.content.entries(s.w.slugs.prices).find((entry) => entry.data[PRICE_FIELD.isManaged])!;
		expect(card).toMatchObject({
			id: mugId,
			title: "Mug",
			excerpt: "Fine ceramic.",
			images: [{ url: "/m.jpg", alt: "A mug" }],
			brand: { name: "Acme", slug: "acme" },
			categories: [{ name: "Mugs", slug: "mugs" }],
			price: { amount: 1200, currency: "pln", isRange: false, priceId: managed.id },
			availability: { state: "in_stock", lowCount: null },
			sizes: [],
			hasVariants: false,
		});
		expect(typeof card!.createdAt).toBe("string");
	});

	it("prices a variants product from its active variants: lowest amount, a range when they differ, no price id; inactive variants do not count", async () => {
		const t = await tee(s);
		await s.w.ctx.content.update(s.w.slugs.variants, t.large, { [VARIANT_FIELD.price]: 100 });
		await syncManagedPrices(s.w.container, { entity: "product", id: t.id });
		const [card] = (await s.read.products({})).items;
		expect(productCardView.parse(card)).toEqual(card);
		expect(card).toMatchObject({ hasVariants: true, price: { amount: 5000, currency: "pln", isRange: true, priceId: null } });
		await s.w.ctx.content.update(s.w.slugs.variants, t.medium, { [VARIANT_FIELD.price]: null });
		expect((await s.read.products({})).items[0]!.price).toMatchObject({ amount: 5000, isRange: false });
	});

	it("lists the values of the size axis (code or name matching size/rozmiar) used by active variants, with availability", async () => {
		const t = await tee(s);
		await stock(s, t.small, 0);
		await stock(s, t.medium, 4);
		const [card] = (await s.read.products({})).items;
		expect(card!.sizes).toEqual([{ label: "S", isAvailable: false }, { label: "M", isAvailable: true }]);
		expect(card!.availability).toEqual({ state: "low", lowCount: 4 });
	});

	it("matches a size axis by its code too (rozmiar), and shows no sizes without one", async () => {
		const w2 = createModelWorld();
		const rozmiar = await w2.attribute({ name: "Dimension", values: [{ label: "42" }] });
		await w2.ctx.content.update(w2.slugs.attributes, rozmiar.id, { [ATTRIBUTE_FIELD.code]: "rozmiar" });
		const colour = await w2.attribute({ name: "Fabric", values: [{ label: "Cotton" }] });
		const sizeType = await w2.productType({ name: "Shoe", axes: [rozmiar.id] });
		const colourType = await w2.productType({ name: "Cloth", axes: [colour.id] });
		const make = async (slug: string, typeId: string, valueId: string) => {
			const id = await w2.product({ slug, typeId, hasVariants: true, price: 100 });
			await w2.variant({ productId: id, valueIds: [valueId] });
			await syncManagedPrices(w2.container, { entity: "product", id });
		};
		await make("shoe", sizeType, rozmiar.valueIds[0]!);
		await make("cloth", colourType, colour.valueIds[0]!);
		const items = (await createCatalogReadService(w2.container).products({})).items;
		expect(items.find((item) => item.slug === "shoe")!.sizes).toEqual([{ label: "42", isAvailable: true }]);
		expect(items.find((item) => item.slug === "cloth")!.sizes).toEqual([]);
	});

	it("shows the product image first and the variants' images after it (cover + hover), without duplicates", async () => {
		const t = await tee(s);
		await s.w.ctx.content.update(s.w.slugs.products, t.id, { [PRODUCT_FIELD.image]: { src: "/cover.jpg" } });
		await s.w.ctx.content.update(s.w.slugs.variants, t.small, { [VARIANT_FIELD.image]: { src: "/hover.jpg", alt: "Back" } });
		await s.w.ctx.content.update(s.w.slugs.variants, t.medium, { [VARIANT_FIELD.image]: { src: "/hover.jpg" } });
		const [card] = (await s.read.products({})).items;
		expect(card!.images).toEqual([{ url: "/cover.jpg", alt: "Tee" }, { url: "/hover.jpg", alt: "Back" }]);
	});

	it("lists a media-library image (no src) with its public URL and size, and the product gallery after it, without duplicates", async () => {
		const mugId = await mug(s);
		const picked = (key: string, alt: string) => ({ provider: "local", id: `id-${key}`, filename: `${key}.jpg`, mimeType: "image/jpeg", width: 800, height: 600, alt, meta: { storageKey: `${key}.jpg` } });
		await s.w.ctx.content.update(s.w.slugs.products, mugId, {
			[PRODUCT_FIELD.image]: picked("front", "Front"),
			[PRODUCT_FIELD.gallery]: [{ image: picked("side", "Side") }, { alt: "empty row" }, { image: picked("front", "Front again") }, { image: picked("back", "Back"), alt: "Back view" }],
		});
		const [card] = (await s.read.products({})).items;
		expect(card!.images).toEqual([
			{ url: "/_emdash/api/media/file/front.jpg", alt: "Front", width: 800, height: 600 },
			{ url: "/_emdash/api/media/file/side.jpg", alt: "Side", width: 800, height: 600 },
			{ url: "/_emdash/api/media/file/back.jpg", alt: "Back view", width: 800, height: 600 },
		]);
		expect(productCardView.parse(card)).toEqual(card);
		expect((await s.read.product("mug")).images).toEqual(card!.images);
	});

	it("puts product image, product gallery, then each variant's image and gallery in the card; the detail variant gets its own image + gallery", async () => {
		const t = await tee(s);
		await s.w.ctx.content.update(s.w.slugs.products, t.id, { [PRODUCT_FIELD.image]: { src: "/cover.jpg" }, [PRODUCT_FIELD.gallery]: [{ image: { src: "/p1.jpg" } }] });
		await s.w.ctx.content.update(s.w.slugs.variants, t.small, { [VARIANT_FIELD.image]: { src: "/s.jpg" }, [VARIANT_FIELD.gallery]: [{ image: { src: "/s2.jpg" }, alt: "S two" }, { image: { src: "/cover.jpg" } }] });
		await s.w.ctx.content.update(s.w.slugs.variants, t.medium, { [VARIANT_FIELD.gallery]: [{ image: { src: "/m2.jpg" } }] });
		const [card] = (await s.read.products({})).items;
		expect(card!.images.map((image) => image.url)).toEqual(["/cover.jpg", "/p1.jpg", "/s.jpg", "/s2.jpg", "/m2.jpg"]);
		const detail = await s.read.product("tee");
		expect(detail.images).toEqual(card!.images);
		expect(detail.variants.find((variant) => variant.id === t.small)!.imageUrls).toEqual(["/s.jpg", "/s2.jpg", "/cover.jpg"]);
		expect(detail.variants.find((variant) => variant.id === t.medium)!.imageUrls).toEqual(["/m2.jpg"]);
	});

	it("filters by category and brand slug and sorts by newest, name and price; limit applies after sorting", async () => {
		const a = await mug(s, { title: "Bravo", slug: "bravo", price: 300 });
		const b = await mug(s, { title: "Alpha", slug: "alpha", price: 900, sku: "A" });
		const c = await mug(s, { title: "Charlie", slug: "charlie", price: 600, sku: "C" });
		await link(s, a, { category: [s.categories.mugs], brand: s.brands.acme });
		await link(s, b, { category: [s.categories.shirts], brand: s.brands.acme });
		await link(s, c, { category: [s.categories.mugs], brand: s.brands.zeta });
		const slugsOf = async (query: Parameters<CatalogReadService["products"]>[0]) => (await s.read.products(query)).items.map((item) => item.slug);
		expect(await slugsOf({ category: "mugs", sort: "name" })).toEqual(["bravo", "charlie"]);
		expect(await slugsOf({ brand: "acme", sort: "name" })).toEqual(["alpha", "bravo"]);
		expect(await slugsOf({ category: "mugs", brand: "zeta" })).toEqual(["charlie"]);
		expect(await slugsOf({ sort: "price-asc" })).toEqual(["bravo", "charlie", "alpha"]);
		expect(await slugsOf({ sort: "price-desc" })).toEqual(["alpha", "charlie", "bravo"]);
		expect(await slugsOf({ sort: "price-asc", limit: 2 })).toEqual(["bravo", "charlie"]);
		expect(await slugsOf({ sort: "name", limit: 1 })).toEqual(["alpha"]);
		expect(await slugsOf({ category: "nope" })).toEqual([]);
	});

	it("sorts newest first", async () => {
		await mug(s, { title: "Old", slug: "old" });
		await new Promise((resolve) => setTimeout(resolve, 5));
		await mug(s, { title: "New", slug: "new", sku: "N" });
		expect((await s.read.products({ sort: "newest" })).items.map((item) => item.slug)).toEqual(["new", "old"]);
	});
});

describe("catalog/product", () => {
	let s: Shop;
	beforeEach(async () => {
		s = await shop();
	});

	it("returns the axes with presentation, swatches and only the values active variants use, and the variants with options, price ids and availability", async () => {
		const t = await tee(s);
		await stock(s, t.small, 2);
		await stock(s, t.medium, 50);
		const detail = await s.read.product("tee");
		expect(productDetailView.parse(detail)).toEqual(detail);
		expect(detail.axes).toEqual([
			{ attributeId: s.size.id, code: "size", label: "Size", presentation: "buttons", isImageAxis: false, values: [{ id: s.size.valueIds[0], code: "s", label: "S", swatch: null }, { id: s.size.valueIds[1], code: "m", label: "M", swatch: null }] },
			{ attributeId: s.colour.id, code: "colour", label: "Kolor", presentation: "swatch", isImageAxis: true, values: [{ id: s.colour.valueIds[0], code: "blk", label: "Black", swatch: "#000000" }] },
		]);
		const managedOfVariant = async (variantId: string) => {
			const ids = (await s.w.container.relations.children(s.w.slugs.variants, variantId, VARIANT_FIELD.prices, { includeDrafts: true })).items;
			return ids[0]!.id;
		};
		expect(detail.variants).toEqual([
			{ id: t.small, sku: "TEE-S", title: "Tee S", options: { size: "s", colour: "blk" }, optionsKey: [s.size.valueIds[0], s.colour.valueIds[0]].sort().join("|"), isActive: true, price: { amount: 5000, currency: "pln", priceId: await managedOfVariant(t.small) }, availability: { state: "low", lowCount: 2 }, imageUrls: [] },
			{ id: t.medium, sku: "TEE-M", title: "Tee M", options: { size: "m", colour: "blk" }, optionsKey: [s.size.valueIds[1], s.colour.valueIds[0]].sort().join("|"), isActive: true, price: { amount: 6000, currency: "pln", priceId: await managedOfVariant(t.medium) }, availability: { state: "in_stock", lowCount: null }, imageUrls: [] },
		]);
		expect(detail.price).toMatchObject({ amount: 5000, isRange: true, priceId: null });
		expect(detail.availability).toEqual({ state: "in_stock", lowCount: null });
		expect(detail.hasVariants).toBe(true);
	});

	it("returns a simple product with its description, SKU and the default price id", async () => {
		const id = await mug(s);
		await s.w.ctx.content.update(s.w.slugs.products, id, { [PRODUCT_FIELD.description]: [block("Fine ceramic.")] });
		const detail = await s.read.product("mug");
		expect(detail).toMatchObject({ id, sku: "MUG-1", description: [block("Fine ceramic.")], axes: [], variants: [], price: { amount: 1200, isRange: false }, hasVariants: false });
		expect(detail.price.priceId).toEqual(expect.any(String));
	});

	it("lists active non-managed prices (e.g. a subscription) as extra prices; managed and inactive ones are left out", async () => {
		const id = await mug(s);
		const plan = s.w.ctx.content.seedEntry(s.w.slugs.prices, { [PRICE_FIELD.type]: "recurring", [PRICE_FIELD.unitAmount]: 900, [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.interval]: "month", [PRICE_FIELD.intervalCount]: 1, [PRICE_FIELD.trialDays]: 7, [PRICE_FIELD.nickname]: "Monthly", [PRICE_FIELD.isActive]: true }, { status: "published" });
		const old = s.w.ctx.content.seedEntry(s.w.slugs.prices, { [PRICE_FIELD.type]: "one_time", [PRICE_FIELD.unitAmount]: 1, [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.isActive]: false }, { status: "published" });
		await s.w.ctx.fakeRelations.setParent(s.w.slugs.prices, plan, PRICE_FIELD.product, id);
		await s.w.ctx.fakeRelations.setParent(s.w.slugs.prices, old, PRICE_FIELD.product, id);
		const detail = await s.read.product("mug");
		expect(detail.extraPrices).toEqual([{ priceId: plan, amount: 900, currency: "pln", type: "recurring", interval: "month", intervalCount: 1, trialDays: 7, nickname: "Monthly" }]);
	});

	it("resolves specs to labels in the product type's order", async () => {
		const material = await s.w.attribute({ name: "Material", storefrontLabel: "Fabric", values: ["Cotton", "Wool"] });
		const weight = await s.w.attribute({ name: "Weight", inputType: "number" });
		await s.w.ctx.content.update(s.w.slugs.attributes, weight.id, { [ATTRIBUTE_FIELD.unit]: "g" });
		const note = await s.w.attribute({ name: "Care", inputType: "text" });
		const typeId = await s.w.productType({ name: "Cloth", specs: [weight.id, material.id, note.id] });
		const id = await s.w.product({ slug: "scarf", title: "Scarf", typeId, price: 100, sku: "SC", specs: { [material.id]: material.valueIds[1], [weight.id]: 120, [note.id]: " Wash cold ", ghost: "x" } });
		await syncManagedPrices(s.w.container, { entity: "product", id });
		expect((await s.read.product("scarf")).specs).toEqual([{ label: "Weight", value: "120 g" }, { label: "Fabric", value: "Wool" }, { label: "Care", value: "Wash cold" }]);
	});

	it("answers 404 for an unknown slug, a draft and a published product that cannot be sold", async () => {
		// The draft even has a live managed price: only its status keeps it off the storefront.
		const draft = s.w.ctx.content.seedEntry(s.w.slugs.products, { [PRODUCT_FIELD.title]: "Draft", [PRODUCT_FIELD.price]: 100 }, { status: "draft", slug: "draft" });
		await syncManagedPrices(s.w.container, { entity: "product", id: draft });
		await s.w.product({ slug: "no-price", title: "No price" });
		for (const slug of ["ghost", "draft", "no-price"]) {
			const error = await failure(s.read.product(slug));
			expect(isCommerceError(error) && error.kind).toBe("notFound");
		}
	});

	describe("related products", () => {
		it("takes up to four from the same category or type, never itself or a sold-out product, category matches first", async () => {
			const main = await mug(s, { title: "Main", slug: "main" });
			await link(s, main, { category: [s.categories.mugs] });
			await s.w.ctx.fakeRelations.setParent(s.w.slugs.products, main, PRODUCT_FIELD.productType, s.typeId);
			const make = async (slug: string, links: { category?: string[]; type?: boolean; sold?: boolean }) => {
				const id = await s.w.product({ title: slug, slug, price: 100, sku: slug.toUpperCase(), ...(links.type ? { typeId: s.typeId } : {}) });
				await link(s, id, { category: links.category });
				if (links.sold) {
					await s.w.ctx.content.update(s.w.slugs.products, id, { [PRODUCT_FIELD.trackInventory]: true });
					await s.w.container.inventory.adjust({ kind: "product", id }, 0, "seed");
				}
				await syncManagedPrices(s.w.container, { entity: "product", id });
				return id;
			};
			await make("cat-1", { category: [s.categories.mugs] });
			await make("cat-sold", { category: [s.categories.mugs], sold: true });
			await make("unrelated", { category: [s.categories.shirts] });
			for (const n of [2, 3, 4, 5]) await make(`cat-${n}`, { category: [s.categories.mugs] });
			// The newest of all, but only a type match: the category matches still come first.
			await new Promise((resolve) => setTimeout(resolve, 5));
			await make("type-1", { type: true });
			const related = (await s.read.product("main")).related;
			expect(related).toHaveLength(4);
			const slugs = related.map((card) => card.slug);
			expect(slugs).not.toContain("main");
			expect(slugs).not.toContain("cat-sold");
			expect(slugs).not.toContain("unrelated");
			expect(slugs).not.toContain("type-1");
			expect(slugs.every((slug) => slug.startsWith("cat-"))).toBe(true);
			// With few category matches the type match fills in.
			const small = await shop();
			const m2 = await mug(small, { slug: "only" });
			await link(small, m2, { category: [small.categories.mugs] });
			const t2 = await small.w.product({ slug: "typed", title: "Typed", price: 5, sku: "T", typeId: small.typeId });
			await small.w.ctx.fakeRelations.setParent(small.w.slugs.products, m2, PRODUCT_FIELD.productType, small.typeId);
			await syncManagedPrices(small.w.container, { entity: "product", id: t2 });
			expect((await small.read.product("only")).related.map((card) => card.slug)).toEqual(["typed"]);
		});
	});
});
