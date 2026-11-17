import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { generateTemplate, MARKER_FILE, scanForEscapingPaths } from "./generate.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scratch = mkdtempSync(join(tmpdir(), "emdash-template-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

describe("generateTemplate (npm mode, no packing)", () => {
	const out = join(scratch, "npm");
	const result = generateTemplate({ repoRoot, outDir: out, mode: "npm", sourceSha: "abc1234" });

	it("writes a manifest that needs neither the workspace nor a sibling folder", () => {
		const manifest = readJson(join(out, "package.json"));
		const specs = Object.values({ ...manifest.dependencies, ...manifest.devDependencies });
		expect(specs.some((spec) => spec.startsWith("workspace:") || spec.startsWith("catalog:") || spec.startsWith("file:"))).toBe(false);
		expect(manifest.scripts.build).toBe("DEPLOY_TARGET=cloudflare astro build");
		expect(result.vendored).toEqual([]);
		expect(existsSync(join(out, "vendor"))).toBe(false);
	});

	it("copies the app and leaves out secrets, tests and monorepo-only files", () => {
		expect(existsSync(join(out, "src/pages/index.astro"))).toBe(true);
		expect(existsSync(join(out, "wrangler.jsonc"))).toBe(true);
		expect(existsSync(join(out, "public/merch"))).toBe(true);
		expect(existsSync(join(out, "AGENTS.md"))).toBe(false);
		expect(existsSync(join(out, "vitest.config.ts"))).toBe(false);
		expect(readdirSync(out).filter((name) => name.startsWith(".env"))).toEqual([]);
		expect(scanForEscapingPaths(out)).toEqual([]);
	});

	it("writes the README with the Deploy button for the template branch and the source commit", () => {
		const readme = readFileSync(join(out, "README.md"), "utf8");
		expect(readme).toContain("https://deploy.workers.cloudflare.com/?url=https://github.com/zawoj/emdash-commerce/tree/cloudflare-template");
		expect(readme).toContain("Unofficial community demo");
		expect(readme).toContain("abc1234");
		expect(readFileSync(join(out, ".dev.vars.example"), "utf8")).toContain("EMDASH_ENCRYPTION_KEY");
	});

	it("replaces a folder it generated, but refuses a non-empty folder it did not", () => {
		expect(existsSync(join(out, MARKER_FILE))).toBe(true);
		writeFileSync(join(out, "stale.txt"), "x");
		generateTemplate({ repoRoot, outDir: out, mode: "npm" });
		expect(existsSync(join(out, "stale.txt"))).toBe(false);

		const foreign = join(scratch, "foreign");
		mkdirSync(foreign);
		writeFileSync(join(foreign, "mine.txt"), "x");
		expect(() => generateTemplate({ repoRoot, outDir: foreign, mode: "npm" })).toThrow(/not empty/);
		expect(() => generateTemplate({ repoRoot, outDir: repoRoot, mode: "npm" })).toThrow(/contains the repository/);
	});
});

describe("generateTemplate (vendor mode)", () => {
	it("vendors the three packages as pnpm pack ships them, with their allow-list applied", () => {
		const out = join(scratch, "vendor");
		const result = generateTemplate({ repoRoot, outDir: out });
		expect(result.vendored.toSorted()).toEqual(["design-system", "plugin-image-hotspots", "plugin-stripe"]);
		const manifest = readJson(join(out, "package.json"));
		expect(manifest.dependencies["@emdash-commerce/plugin-stripe"]).toBe("file:./vendor/plugin-stripe");
		// the `files` allow-list excludes tests and the real-host harness; src and the README ship
		expect(existsSync(join(out, "vendor/plugin-stripe/src/index.ts"))).toBe(true);
		expect(existsSync(join(out, "vendor/plugin-stripe/package.json"))).toBe(true);
		expect(readdirSync(join(out, "vendor/plugin-stripe/src/adapters/emdash")).some((name) => name === "real-host")).toBe(false);
		expect(scanForEscapingPaths(join(out, "vendor/design-system"))).toEqual([]);
	}, 120_000);
});
