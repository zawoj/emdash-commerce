import { describe, expect, it, vi } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { buildCollectionDefinitions } from "./collections/index.js";
import { createRegistryPortFor } from "./registry-port.js";

const exists = Object.assign(new Error("Collection already exists"), { code: "COLLECTION_EXISTS" });
const applySeed = vi.hoisted(() => vi.fn());

vi.mock("emdash", async (importOriginal) => ({ ...(await importOriginal<typeof import("emdash")>()), applySeed }));

const options = commerceOptionsSchema.parse({});
const carts = buildCollectionDefinitions(options.collections, options.supportedCurrencies).find((definition) => definition.slug === "carts")!;
const plan = { relations: [], create: [carts], addFields: [] };
const port = createRegistryPortFor({} as never);

describe("registry schema port: COLLECTION_EXISTS", () => {
	it("is an error, not success: the attempt stopped part-way, so the reconcile must plan again", async () => {
		applySeed.mockRejectedValueOnce(exists);
		await expect(port.apply(plan)).rejects.toThrow(/already exists or is still being deleted/);
	});

	it("passes every other failure through unchanged", async () => {
		applySeed.mockRejectedValueOnce(new Error("database is locked"));
		await expect(port.apply(plan)).rejects.toThrow("database is locked");
	});

	it("applies the plan as one seed with onConflict update", async () => {
		applySeed.mockResolvedValueOnce(undefined);
		await port.apply(plan);
		const [, seed, applyOptions] = applySeed.mock.calls.at(-1)!;
		expect(applyOptions).toEqual({ onConflict: "update" });
		expect(seed.collections.map((collection: { slug: string }) => collection.slug)).toEqual(["carts"]);
	});
});
