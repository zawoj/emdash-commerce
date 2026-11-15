import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES = join(import.meta.dirname, "../../pages");

const pagesUnder = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? pagesUnder(path) : path.endsWith(".astro") ? [path] : [];
	});

/** Pages with a dynamic segment look an entity up by slug: a miss there must be a real 404, never a redirect. */
describe("catalog and content routes answer a missing slug", () => {
	const dynamicPages = pagesUnder(PAGES).filter((path) => /\[[a-z]+\]/.test(path));

	it("finds the dynamic pages", () => {
		expect(dynamicPages.length).toBeGreaterThan(3);
	});

	it.each(dynamicPages)("%s rewrites to the 404 page instead of redirecting", (path) => {
		const source = readFileSync(path, "utf8");
		expect(source).not.toMatch(/Astro\.redirect\(/);
		expect(source).toContain('Astro.rewrite("/404")');
	});
});
