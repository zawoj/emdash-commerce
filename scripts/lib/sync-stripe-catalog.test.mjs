import { describe, expect, it } from "vitest";

import { syncStripeCatalog } from "./sync-stripe-catalog.mjs";

const harness = (status, syncAnswers = []) => {
	const calls = [];
	const logs = [];
	let clock = 0;
	const answers = [...syncAnswers];
	return {
		calls,
		logs,
		run: (timeoutMs = 60_000) =>
			syncStripeCatalog({
				plugin: "stripe-commerce",
				timeoutMs,
				log: (line) => logs.push(line),
				sleep: async (ms) => void (clock += ms),
				now: () => clock,
				call: async (method, path) => {
					calls.push(path.replace("/plugins/stripe-commerce/", ""));
					if (path.endsWith("/admin/status")) return { data: status };
					if (path.endsWith("/catalog/resync")) return { data: { queued: 4 } };
					clock += 1000;
					return { data: answers.shift() ?? { processed: 0, due: 0, failed: 0 } };
				},
			}),
	};
};

describe("syncStripeCatalog", () => {
	it("does nothing without a Stripe key and says what to run later", async () => {
		const h = harness({ stripe: { isKeyPresent: false } });
		expect(await h.run()).toBe("no-key");
		expect(h.calls).toEqual(["admin/status"]);
		expect(h.logs[0]).toMatch(/no key configured.*Resync catalog/);
	});

	it("never syncs from the seed with a live key", async () => {
		const h = harness({ stripe: { isKeyPresent: true, mode: "live" } });
		expect(await h.run()).toBe("not-sandbox");
		expect(h.calls).toEqual(["admin/status"]);
	});

	it("queues the resync and syncs batches until nothing is due", async () => {
		const h = harness({ stripe: { isKeyPresent: true, mode: "test" } }, [
			{ processed: 2, due: 2, failed: 0 },
			{ processed: 2, due: 0, failed: 0 },
		]);
		expect(await h.run()).toBe("synced");
		expect(h.calls).toEqual(["admin/status", "admin/catalog/resync", "admin/catalog/sync", "admin/catalog/sync"]);
		expect(h.logs.at(-1)).toBe("stripe: catalog synced (4 entities)");
	});

	it("stops with a clear message when the timeout passes", async () => {
		const stuck = Array.from({ length: 100 }, () => ({ processed: 0, due: 3, failed: 0 }));
		const h = harness({ stripe: { isKeyPresent: true, mode: "test" } }, stuck);
		expect(await h.run(10_000)).toBe("timeout");
		expect(h.logs.at(-1)).toMatch(/timed out after 10s with 3 entities still due/);
	});

	it("reports links that failed instead of claiming success", async () => {
		const h = harness({ stripe: { isKeyPresent: true, mode: "test" } }, [{ processed: 3, due: 0, failed: 1 }]);
		expect(await h.run()).toBe("failed");
		expect(h.logs.at(-1)).toMatch(/1 failed/);
	});
});
