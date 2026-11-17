import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES = join(import.meta.dirname, "../../pages");

const pagesUnder = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? pagesUnder(path) : path.endsWith(".astro") ? [path] : [];
	});

/**
 * Pages with a dynamic segment look an entity up by slug: a miss there must be a real 404. A page may redirect a slug
 * it found (the plugin's `/shop/c/{slug}` goes to the filtered shop), but never before it has rewritten the miss.
 */
describe("catalog and content routes answer a missing slug", () => {
	const dynamicPages = pagesUnder(PAGES).filter((path) => /\[[a-z]+\]/.test(path));

	it("finds the dynamic pages", () => {
		expect(dynamicPages.length).toBeGreaterThan(3);
	});

	it.each(dynamicPages)("%s rewrites to the 404 page and redirects only after it", (path) => {
		const source = readFileSync(path, "utf8");
		const rewriteAt = source.indexOf('Astro.rewrite("/404")');
		expect(rewriteAt).toBeGreaterThan(-1);
		const redirectAt = source.indexOf("Astro.redirect(");
		if (redirectAt !== -1) expect(redirectAt).toBeGreaterThan(rewriteAt);
	});

	it("covers the URL patterns the plugin gives categories and brands", () => {
		const paths = dynamicPages.map((path) => path.slice(PAGES.length));
		expect(paths.some((path) => path.includes("/shop/c/"))).toBe(true);
		expect(paths.some((path) => path.includes("/shop/brand/"))).toBe(true);
	});
});
