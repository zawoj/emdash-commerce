import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { HOTSPOTS } from "../art/hotspots.mjs";
import {
	ACCESSORIES,
	APPAREL,
	BRANDS,
	BUNDLES,
	CATEGORIES,
	COLOURS,
	HOME,
	MEMBERSHIP,
	PRODUCT_TYPES,
	SIZES,
	photoFilesOf,
} from "./merch-catalog.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ART = join(ROOT, "apps", "storefront", "public", "merch");
const HOME_CONFIG = readFileSync(join(ROOT, "apps", "storefront", "src", "features", "home", "config.ts"), "utf8");

const ALL = [...APPAREL, ...ACCESSORIES, ...BUNDLES, MEMBERSHIP];
const slugs = new Set(ALL.map((product) => product.slug));
const categorySlugs = new Set(CATEGORIES.map(([slug]) => slug));
const quoted = (pattern) => [...HOME_CONFIG.matchAll(pattern)].map((match) => match[1]);

describe("catalog data", () => {
	it("has unique slugs and SKUs", () => {
		expect(slugs.size).toBe(ALL.length);
		const skus = [...ACCESSORIES, ...BUNDLES, MEMBERSHIP].map((product) => product.sku);
		expect(new Set(skus).size).toBe(skus.length);
	});

	it("references only brands, categories and vocabulary that exist", () => {
		const brands = new Set(BRANDS.map((brand) => brand.slug));
		const sizes = new Set(SIZES.map(([label]) => label));
		const colours = new Set(COLOURS.map(([label]) => label));
		for (const product of ALL) {
			expect(brands.has(product.brand), `${product.slug} brand`).toBe(true);
			for (const category of product.cats) expect(categorySlugs.has(category), `${product.slug} category ${category}`).toBe(true);
		}
		for (const product of APPAREL) {
			for (const size of product.sizes) expect(sizes.has(size), `${product.slug} size ${size}`).toBe(true);
			for (const colour of product.colours) expect(colours.has(colour), `${product.slug} colour ${colour}`).toBe(true);
			for (const key of product.skip ?? []) {
				const [size, colour] = key.split("/");
				expect(product.sizes.includes(size) && product.colours.includes(colour), `${product.slug} skip ${key}`).toBe(true);
			}
		}
	});

	it("gives every colour but the first its own image, and no other colour one", () => {
		for (const product of APPAREL) {
			const [, ...others] = product.colours;
			expect(Object.keys(product.colourImages).sort(), product.slug).toEqual([...others].sort());
		}
	});

	it("resolves every product type used to attributes the seed creates", () => {
		const attributes = new Set(["size", "colour", "material", "weight", "waterproof", "includes"]);
		for (const type of Object.values(PRODUCT_TYPES)) {
			for (const key of [...type.axes, ...type.specs, ...type.required]) expect(attributes.has(key), key).toBe(true);
			for (const key of type.required) expect(type.specs.includes(key), `required ${key} is a spec`).toBe(true);
		}
	});

	it("shows the sold-out and low-stock states", () => {
		expect(ACCESSORIES.some((product) => product.stock === 0)).toBe(true);
		expect(ACCESSORIES.some((product) => product.stock > 0 && product.stock <= 10)).toBe(true);
	});
});

describe("bundles", () => {
	const priceOf = (slug) => ALL.find((product) => product.slug === slug).price;
	const titleToPrice = new Map(ALL.map((product) => [product.title, product.price]));
	const dollars = (cents) => String(cents / 100);

	it("cost less than their parts, and the copy says by how much", () => {
		for (const bundle of BUNDLES) {
			const parts = bundle.includes.split(", ").map((title) => {
				expect(titleToPrice.has(title), `${bundle.slug} includes unknown "${title}"`).toBe(true);
				return titleToPrice.get(title);
			});
			const total = parts.reduce((sum, price) => sum + price, 0);
			expect(bundle.price, bundle.slug).toBeLessThan(total);
			expect(bundle.copy.join(" "), bundle.slug).toContain(`$${dollars(bundle.price)} instead of $${dollars(total)}`);
		}
	});

	it("keeps the Workers Fit Bundle below the tee, cap and socks bought apart", () => {
		const total = priceOf("workers-tee") + priceOf("ray-id-cap") + priceOf("dns-socks");
		const fit = APPAREL.find((product) => product.slug === "workers-fit-bundle");
		expect(fit.price).toBeLessThan(total);
		expect(fit.copy.join(" ")).toContain(`$${dollars(total)} of merch for $${dollars(fit.price)}`);
	});
});

describe("home page wiring", () => {
	it("points rails, tabs, the index and the hero at categories and products that exist", () => {
		for (const slug of quoted(/\bcategory: "([a-z-]+)"/g)) expect(categorySlugs.has(slug), `category ${slug}`).toBe(true);
		for (const slug of quoted(/\bslug: "([a-z-]+)"/g)) expect(categorySlugs.has(slug), `index slug ${slug}`).toBe(true);
		const tabs = HOME_CONFIG.match(/tabCategorySlugs: \[([^\]]+)\]/)[1];
		for (const [, slug] of tabs.matchAll(/"([a-z-]+)"/g)) expect(categorySlugs.has(slug), `tab ${slug}`).toBe(true);
		for (const slug of quoted(/\bproductSlug: "([a-z-]+)"/g)) expect(slugs.has(slug), `product ${slug}`).toBe(true);
	});

	it("opens a product from every shop-the-look point and has a hotspot for every point and callout", () => {
		for (const [key, slug] of Object.entries(HOME.look.products)) {
			expect(slugs.has(slug), `look product ${slug}`).toBe(true);
			expect(HOTSPOTS.lookDesk[key], `lookDesk.${key}`).toBeDefined();
		}
		for (const key of Object.keys(HOME.spotlight.callouts)) {
			expect(HOTSPOTS.spotlightJacket[key], `spotlightJacket.${key}`).toBeDefined();
		}
	});

	it("sells the bundle the look photo is about", () => {
		const parts = BUNDLES.find((bundle) => bundle.slug === "desk-setup-bundle").includes;
		for (const slug of Object.values(HOME.look.products)) {
			const product = ALL.find((item) => item.slug === slug);
			if (slug !== "ddos-mug") expect(parts, slug).toContain(product.title);
		}
	});
});

describe("art on disk", () => {
	it("has every photo the catalog and the home config name", () => {
		const names = [...photoFilesOf(), ...quoted(/merch\("([a-z0-9-]+)"\)/g).map((name) => `${name}.png`)];
		const missing = names.filter((file) => !existsSync(join(ART, file)));
		expect(missing, "run `pnpm art`").toEqual([]);
	});
});
