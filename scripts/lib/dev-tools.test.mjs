import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ensureDevTools } from "./dev-tools.mjs";

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "storefront", "seed");
const read = (name) => JSON.parse(readFileSync(join(SEED_DIR, name), "utf8"));

describe("the seed files", () => {
	it("keeps the dev-only feedback collection out of the production seed", () => {
		expect(read("seed.json").collections.map((c) => c.slug)).not.toContain("feedback");
	});

	it("describes it in the dev-tools fragment, with the fields the Notes tool reads and writes", () => {
		const feedback = read("dev-tools.json").collections.find((c) => c.slug === "feedback");
		expect(feedback.fields.map((f) => f.slug)).toEqual(
			expect.arrayContaining(["title", "comment", "state", "resolution", "page_path", "page_url", "selector", "element"]),
		);
	});
});

describe("ensureDevTools", () => {
	const fragmentPath = join(SEED_DIR, "dev-tools.json");
	const recorder = (isExisting) => {
		const calls = [];
		const call = async (method, path, { body } = {}) => {
			calls.push([method, path, body]);
			if (method === "GET" && !isExisting) throw new Error(`GET ${path} -> 404 {"error":{"code":"NOT_FOUND"}}`);
			return {};
		};
		return { calls, call };
	};

	it("creates a missing collection and then each of its fields", async () => {
		const { calls, call } = recorder(false);
		expect(await ensureDevTools({ call, fragmentPath })).toEqual(["feedback"]);
		expect(`${calls[1][0]} ${calls[1][1]}`).toBe("POST /schema/collections");
		expect(calls[1][2]).not.toHaveProperty("fields");
		const fieldPosts = calls.filter(([, path]) => path === "/schema/collections/feedback/fields");
		expect(fieldPosts.map(([, , body]) => body.slug)).toContain("element");
	});

	it("does nothing when the collection exists", async () => {
		const { calls, call } = recorder(true);
		expect(await ensureDevTools({ call, fragmentPath })).toEqual([]);
		expect(calls).toHaveLength(1);
	});

	it("does not swallow other errors", async () => {
		const call = async () => {
			throw new Error("GET /x -> 500 boom");
		};
		await expect(ensureDevTools({ call, fragmentPath })).rejects.toThrow(/500/);
	});
});
