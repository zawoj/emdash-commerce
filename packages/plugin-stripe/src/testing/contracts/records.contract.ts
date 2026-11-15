import { describe, expect, it } from "vitest";

import type { RecordIndex } from "../../ports/repositories.js";
import type { FixedClock } from "../clock.js";

export interface RecordIndexHarness {
	index: RecordIndex;
	clock: FixedClock;
}

const STALE_MS = 5 * 60 * 1000;

export const recordIndexContract = (name: string, create: () => RecordIndexHarness): void => {
	describe(`RecordIndex contract: ${name}`, () => {
		it("gives exactly one winner among concurrent claimants and the loser sees the record id", async () => {
			const { index } = create();
			const results = await Promise.all(Array.from({ length: 10 }, () => index.claim("order:session:cs_1")));
			expect(results.filter((result) => result.isWinner)).toHaveLength(1);
			await index.set("order:session:cs_1", "order-1");
			expect(await index.claim("order:session:cs_1")).toEqual({ isWinner: false, recordId: "order-1" });
			expect(await index.get("order:session:cs_1")).toBe("order-1");
		});

		it("a loser sees no record id while the winner is still working", async () => {
			const { index } = create();
			expect(await index.claim("k")).toEqual({ isWinner: true });
			expect(await index.claim("k")).toEqual({ isWinner: false, recordId: null });
			expect(await index.get("k")).toBeNull();
		});

		it("releases an unfinished claim but never a completed one", async () => {
			const { index } = create();
			await index.claim("k");
			await index.releaseClaim("k");
			expect(await index.claim("k")).toEqual({ isWinner: true });
			await index.set("k", "r1");
			await index.releaseClaim("k");
			expect(await index.get("k")).toBe("r1");
		});

		it("lets a claim without a record id be taken over only after five minutes", async () => {
			const { index, clock } = create();
			await index.claim("k");
			clock.advance(STALE_MS);
			expect(await index.claim("k")).toEqual({ isWinner: false, recordId: null });
			clock.advance(1);
			expect(await index.claim("k")).toEqual({ isWinner: true });
			expect(await index.claim("k")).toEqual({ isWinner: false, recordId: null });
		});

		it("lets only one of several concurrent takeovers win", async () => {
			const { index, clock } = create();
			await index.claim("k");
			clock.advance(STALE_MS + 1);
			const results = await Promise.all(Array.from({ length: 6 }, () => index.claim("k")));
			expect(results.filter((result) => result.isWinner)).toHaveLength(1);
		});

		it("never takes over a claim that has a record id, however old", async () => {
			const { index, clock } = create();
			await index.claim("k");
			await index.set("k", "r1");
			clock.advance(STALE_MS * 100);
			expect(await index.claim("k")).toEqual({ isWinner: false, recordId: "r1" });
		});
	});
};
