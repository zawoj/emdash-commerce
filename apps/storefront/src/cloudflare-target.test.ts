import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The Cloudflare target (`DEPLOY_TARGET=cloudflare`) is configured in three files that must agree: astro.config.mjs
 * names the bindings, wrangler.jsonc declares them, package.json describes them for the deploy dashboard. These
 * checks catch one drifting from the others; the real run on workerd is in docs/cloudflare.md.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");

interface WranglerConfig {
	main: string;
	compatibility_date: string;
	compatibility_flags: string[];
	d1_databases: { binding: string }[];
	r2_buckets: { binding: string }[];
	durable_objects: { bindings: { name: string; class_name: string }[] };
	exports: Record<string, { type: string; storage: string }>;
	triggers: { crons: string[] };
	secrets: { required: string[] };
}

/** wrangler.jsonc allows comments and trailing commas. */
const parseJsonc = (text: string): WranglerConfig =>
	JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")) as WranglerConfig;

const wrangler = parseJsonc(read("wrangler.jsonc"));
const pkg = JSON.parse(read("package.json")) as {
	scripts: Record<string, string>;
	cloudflare: { bindings: Record<string, { description: string }>; products: string[]; label: string };
};
const astroConfig = read("astro.config.mjs");

describe("wrangler.jsonc", () => {
	it("binds D1 as DB and R2 as MEDIA, the names astro.config.mjs passes to d1() and r2()", () => {
		expect(wrangler.d1_databases.map((db) => db.binding)).toEqual(["DB"]);
		expect(wrangler.r2_buckets.map((bucket) => bucket.binding)).toEqual(["MEDIA"]);
		expect(astroConfig).toContain('d1({ binding: "DB"');
		expect(astroConfig).toContain('r2({ binding: "MEDIA"');
	});

	it("keeps nodejs_compat (it fills process.env, where the plugin reads its secret fallback) and a date that populates it", () => {
		expect(wrangler.compatibility_flags).toContain("nodejs_compat");
		expect(wrangler.compatibility_date >= "2025-04-01").toBe(true);
	});

	it("exports the Durable Object class its binding names, from the Worker entry", () => {
		expect(wrangler.durable_objects.bindings).toEqual([{ name: "EMDASH_ROOMS", class_name: "EmDashRoom" }]);
		expect(wrangler.exports.EmDashRoom).toEqual({ type: "durable-object", storage: "sqlite" });
		expect(wrangler.main).toBe("./src/worker.ts");
		expect(read("src/worker.ts")).toMatch(/export \{[^}]*EmDashRoom[^}]*\}/);
	});

	it("runs a cron trigger and wires the scheduled handler (the plugin's webhook retries and catalog sync ride on it)", () => {
		expect(wrangler.triggers.crons.length).toBeGreaterThan(0);
		expect(read("src/worker.ts")).toContain("scheduled: createScheduledHandler()");
	});

	it("requires only secrets the deploy dashboard describes", () => {
		const described = Object.keys(pkg.cloudflare.bindings);
		expect(wrangler.secrets.required).toEqual(["EMDASH_ENCRYPTION_KEY", "STRIPE_SECRET_KEY"]);
		for (const name of wrangler.secrets.required) expect(described).toContain(name);
	});
});

describe("target switch", () => {
	it("leaves the Node target as the default and loads each runtime lazily", () => {
		expect(astroConfig).toContain('process.env.DEPLOY_TARGET === "cloudflare"');
		expect(astroConfig).toContain('import("@astrojs/node")');
		expect(astroConfig).toContain('import("@astrojs/cloudflare")');
		expect(astroConfig).not.toMatch(/^import .*@astrojs\/(node|cloudflare)/m);
	});

	it("keeps both plugin ids and the widget ref that are stored in content", () => {
		expect(astroConfig).toContain('id: "stripe-commerce"');
		expect(astroConfig).toContain('id: "image-hotspots"');
		expect(astroConfig).toContain('name: "hotspots"');
	});

	it("has a script for every step of the Cloudflare flow", () => {
		for (const script of ["dev:cloudflare", "build:cloudflare", "deploy:cloudflare", "types:cloudflare"]) {
			expect(pkg.scripts[script]).toBeTruthy();
		}
		expect(pkg.scripts["build:cloudflare"]).toContain("DEPLOY_TARGET=cloudflare");
		expect(pkg.scripts["deploy:cloudflare"]).toContain("wrangler deploy");
	});

	it("lists at most three products, as the Cloudflare template metadata allows", () => {
		expect(pkg.cloudflare.products.length).toBeLessThanOrEqual(3);
		expect(pkg.cloudflare.label).toBeTruthy();
	});
});
