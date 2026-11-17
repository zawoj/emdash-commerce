import { describe, expect, it } from "vitest";

import { findEscapingPaths, isCheckedFile, isCopied } from "./paths.mjs";

describe("isCopied", () => {
	it("copies the app: sources, public assets, seed, config and the generated types", () => {
		for (const path of ["src/pages/index.astro", "public/merch/cable-kit.png", "seed/seed.json", "wrangler.jsonc", "astro.config.mjs", ".emdash/types.ts", ".gitignore", ".dev.vars.example"]) {
			expect(isCopied(path), path).toBe(true);
		}
	});

	it("never copies build output, local state or secrets", () => {
		for (const path of ["node_modules/x/index.js", "dist/client/a.js", ".astro/types.d.ts", ".wrangler/state/v3/d1.sqlite", "data.db", "data.db-wal", "uploads/a.png", ".env", ".env.local", ".dev.vars", ".dev.vars.production"]) {
			expect(isCopied(path), path).toBe(false);
		}
	});

	it("skips tests, the Vitest config and the monorepo-only agent and Nx files", () => {
		for (const path of ["src/lib/money.test.ts", "src/dev-tools/a.test.tsx", "vitest.config.ts", "project.json", "AGENTS.md", "README.md", "package.json", ".agents/skills/x/SKILL.md", ".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json", ".env.example", "seed/dev-tools.json"]) {
			expect(isCopied(path), path).toBe(false);
		}
	});

	it("matches a folder name anywhere in the path, not as a substring of another name", () => {
		expect(isCopied("src/lib/dist/x.ts")).toBe(false);
		expect(isCopied("src/lib/distance.ts")).toBe(true);
	});
});

describe("findEscapingPaths", () => {
	it("flags a relative path that leaves the copy's root", () => {
		expect(findEscapingPaths("vitest.config.ts", "include: ['../../scripts/**/*.test.mjs']")).toEqual(["../../scripts/**/*.test.mjs"]);
		expect(findEscapingPaths("astro.config.mjs", 'import x from "../shared/x.mjs"')).toEqual(["../shared/x.mjs"]);
	});

	it("resolves against the file's own folder: ../ inside src stays inside, ../../ from src/pages does too", () => {
		expect(findEscapingPaths("src/pages/index.astro", 'import a from "../../lib/a"; import b from "../layouts/b.astro"')).toEqual([]);
		expect(findEscapingPaths("src/pages/index.astro", 'import a from "../../../lib/a"')).toEqual(["../../../lib/a"]);
	});

	it("reads url() in CSS and template literals, and ignores bare specifiers and absolute urls", () => {
		expect(findEscapingPaths("a.css", "background: url(../x.png)")).toEqual(["../x.png"]);
		expect(findEscapingPaths("a.css", "background: url(./x.png); @import 'https://x/../y.css'; import 'pkg/../z'")).toEqual([]);
		expect(findEscapingPaths("a.ts", "const p = `../up/${name}`")).toEqual(["../up/${name}"]);
	});

	it("reports each specifier once", () => {
		expect(findEscapingPaths("a.ts", '"../x" + "../x"')).toEqual(["../x"]);
	});
});

describe("isCheckedFile", () => {
	it("checks code and config, not binaries or a package.json", () => {
		expect(isCheckedFile("src/a.astro")).toBe(true);
		expect(isCheckedFile("wrangler.jsonc")).toBe(true);
		expect(isCheckedFile("public/merch/a.png")).toBe(false);
		expect(isCheckedFile("vendor/design-system/package.json")).toBe(false);
	});
});
