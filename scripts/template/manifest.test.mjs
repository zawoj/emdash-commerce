import { describe, expect, it } from "vitest";

import { buildTemplateManifest, findUnresolvedSpecs, resolveSpec } from "./manifest.mjs";

const versions = {
	"@emdash-commerce/design-system": "0.1.0",
	"@emdash-commerce/plugin-stripe": "0.3.0",
	"@emdash-commerce/plugin-image-hotspots": "0.2.0",
};

describe("resolveSpec", () => {
	it("points a workspace package at its vendored folder in vendor mode", () => {
		expect(resolveSpec("@emdash-commerce/plugin-stripe", "workspace:*", { mode: "vendor", versions })).toBe("file:./vendor/plugin-stripe");
	});

	it("turns the workspace range into a registry range of the package's own version in npm mode", () => {
		const context = { mode: "npm", versions };
		expect(resolveSpec("@emdash-commerce/plugin-stripe", "workspace:*", context)).toBe("^0.3.0");
		expect(resolveSpec("@emdash-commerce/plugin-stripe", "workspace:^", context)).toBe("^0.3.0");
		expect(resolveSpec("@emdash-commerce/plugin-stripe", "workspace:~", context)).toBe("~0.3.0");
		expect(resolveSpec("@emdash-commerce/plugin-stripe", "workspace:^0.3.0", context)).toBe("^0.3.0");
	});

	it("refuses a workspace package it does not know and an npm spec without a known version", () => {
		expect(() => resolveSpec("@emdash-commerce/other", "workspace:*", { mode: "vendor", versions })).toThrow(/does not know/);
		expect(() => resolveSpec("@emdash-commerce/plugin-stripe", "workspace:*", { mode: "npm", versions: {} })).toThrow(/no version/);
	});

	it("resolves catalog specs from the default and the named catalogs and fails on a missing entry", () => {
		const catalogs = { default: { zod: "^4.1.12" }, react19: { react: "19.2.3" } };
		expect(resolveSpec("zod", "catalog:", { mode: "vendor", versions, catalogs })).toBe("^4.1.12");
		expect(resolveSpec("react", "catalog:react19", { mode: "vendor", versions, catalogs })).toBe("19.2.3");
		expect(() => resolveSpec("stripe", "catalog:", { mode: "vendor", versions, catalogs })).toThrow(/no entry/);
	});

	it("leaves registry, file and tag specs alone", () => {
		for (const spec of ["^1.2.3", "7.3.2", "latest", "file:./x", "npm:other@1"]) {
			expect(resolveSpec("any", spec, { mode: "vendor", versions })).toBe(spec);
		}
	});
});

describe("findUnresolvedSpecs", () => {
	it("lists workspace and catalog specs in every dependency section", () => {
		expect(
			findUnresolvedSpecs({
				dependencies: { a: "workspace:*", b: "^1.0.0" },
				devDependencies: { c: "catalog:" },
				peerDependencies: { d: "workspace:^" },
			}),
		).toEqual(["dependencies.a: workspace:*", "devDependencies.c: catalog:", "peerDependencies.d: workspace:^"]);
	});
});

const storefront = {
	name: "@emdash-commerce/storefront",
	version: "0.0.1",
	private: true,
	type: "module",
	emdash: { seed: "seed/seed.json" },
	scripts: { dev: "node dev", build: "astro build", "build:cloudflare": "DEPLOY_TARGET=cloudflare astro build", test: "vitest run" },
	dependencies: {
		astro: "7.3.2",
		"@emdash-commerce/design-system": "workspace:*",
		"@emdash-commerce/plugin-stripe": "workspace:*",
		"@emdash-commerce/plugin-image-hotspots": "workspace:*",
	},
	devDependencies: { vitest: "4.1.5", "happy-dom": "20.9.0", wrangler: "^4.163.0" },
	cloudflare: { label: "EmDash Commerce" },
};

describe("buildTemplateManifest", () => {
	const build = (mode) =>
		buildTemplateManifest(storefront, { mode, versions, packageManager: "pnpm@10.33.0", nodeEngine: ">=24.22.1", overrides: { "@types/react": "19.2.8" } });

	it("makes the Cloudflare build the default build and deploy what Cloudflare's button runs", () => {
		const { scripts } = build("vendor");
		expect(scripts.build).toBe("DEPLOY_TARGET=cloudflare astro build");
		expect(scripts.deploy).toBe("wrangler deploy");
		expect(scripts.test).toBeUndefined();
	});

	it("vendors the packages with file: specs and leaves no workspace spec", () => {
		const manifest = build("vendor");
		expect(manifest.dependencies["@emdash-commerce/design-system"]).toBe("file:./vendor/design-system");
		expect(findUnresolvedSpecs(manifest)).toEqual([]);
	});

	it("depends on the published versions in npm mode", () => {
		const manifest = build("npm");
		expect(manifest.dependencies["@emdash-commerce/plugin-stripe"]).toBe("^0.3.0");
		expect(manifest.dependencies["@emdash-commerce/plugin-image-hotspots"]).toBe("^0.2.0");
	});

	it("drops the test tooling, keeps the deploy metadata and carries the pnpm settings the install needs", () => {
		const manifest = build("vendor");
		expect(Object.keys(manifest.devDependencies)).toEqual(["wrangler"]);
		expect(manifest.cloudflare).toEqual(storefront.cloudflare);
		expect(manifest.packageManager).toBe("pnpm@10.33.0");
		expect(manifest.pnpm.onlyBuiltDependencies).toEqual(expect.arrayContaining(["esbuild", "workerd", "sharp"]));
		expect(manifest.pnpm.overrides).toEqual({ "@types/react": "19.2.8" });
		expect(manifest.name).not.toBe(storefront.name);
	});

	it("throws when a dependency keeps a workspace spec it cannot resolve", () => {
		expect(() =>
			buildTemplateManifest(
				{ ...storefront, dependencies: { sibling: "workspace:*" } },
				{ mode: "vendor", versions, packageManager: "pnpm@10.33.0" },
			),
		).toThrow(/does not know/);
	});
});
