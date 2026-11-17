import { describe, expect, it } from "vitest";

import { ROUTE } from "../contracts/api.js";
import { CART_STATUS } from "../core/cart.js";
import { buildMaintenanceSteps, CRON_BUDGET_MS, CRON_HOOK_TIMEOUT_MS, CRON_SCHEDULE, CRON_TASK, ensureCronScheduled, getCronInfo, runSteps, STEP_STATUS, type MaintenanceStep } from "./cron.js";
import { createOpsHarness } from "./ops-test-support.js";

const log = () => {
	const lines: Array<{ level: string; message: string }> = [];
	return { lines, info: (message: string) => void lines.push({ level: "info", message }), warn: (message: string) => void lines.push({ level: "warn", message }), error: (message: string) => void lines.push({ level: "error", message }) };
};

const step = (name: string, run: () => Promise<unknown>, isProviderBound = false): MaintenanceStep => ({ name, isProviderBound, run });

describe("runSteps", () => {
	it("isolates steps: one that throws does not stop the others, and is reported failed", async () => {
		const ran: string[] = [];
		const sink = log();
		const reports = await runSteps(
			[
				step("a", async () => void ran.push("a")),
				step("boom", async () => {
					throw new Error("kaput");
				}),
				step("c", async () => void ran.push("c")),
			],
			{ budgetMs: 1000, hasProvider: true, log: sink },
		);
		expect(ran).toEqual(["a", "c"]);
		expect(reports.map((report) => [report.name, report.status])).toEqual([["a", "ok"], ["boom", "failed"], ["c", "ok"]]);
		expect(reports[1]!.reason).toBe("kaput");
		expect(sink.lines.filter((line) => line.level === "error")).toHaveLength(1);
	});

	it("a step that never settles is cut off at the end of the budget and the remaining steps are skipped", async () => {
		const ran: string[] = [];
		const reports = await runSteps(
			[step("hang", () => new Promise<void>(() => undefined)), step("late", async () => void ran.push("late"))],
			{ budgetMs: 30, hasProvider: true, log: log() },
		);
		expect(reports[0]).toMatchObject({ name: "hang", status: STEP_STATUS.failed });
		expect(reports[0]!.reason).toMatch(/timed out/);
		expect(reports[1]).toMatchObject({ name: "late", status: STEP_STATUS.skipped, reason: "time budget spent" });
		expect(ran).toEqual([]);
	});

	it("skips the rest after a timeout even when the clock still shows budget left", async () => {
		// A clock that never advances: the timer fires but `now()` still reports the whole budget as remaining.
		const ran: string[] = [];
		const reports = await runSteps(
			[step("hang", () => new Promise<void>(() => undefined)), step("late", async () => void ran.push("late"))],
			{ budgetMs: 20, hasProvider: true, log: log(), now: () => 0 },
		);
		expect(reports[0]).toMatchObject({ name: "hang", status: STEP_STATUS.failed });
		expect(reports[1]).toMatchObject({ name: "late", status: STEP_STATUS.skipped, reason: "time budget spent" });
		expect(ran).toEqual([]);
	});

	it("skips steps that start after the budget is spent (injected clock)", async () => {
		let now = 0;
		const ran: string[] = [];
		const reports = await runSteps(
			[
				step("slow", async () => {
					now += 100;
					ran.push("slow");
				}),
				step("next", async () => void ran.push("next")),
			],
			{ budgetMs: 100, hasProvider: true, now: () => now, log: log() },
		);
		expect(ran).toEqual(["slow"]);
		expect(reports[1]!.status).toBe(STEP_STATUS.skipped);
	});

	it("skips provider-bound steps (not fails them) when Stripe is not configured", async () => {
		const ran: string[] = [];
		const reports = await runSteps([step("needs-stripe", async () => void ran.push("x"), true), step("local", async () => void ran.push("local"))], { budgetMs: 1000, hasProvider: false, log: log() });
		expect(ran).toEqual(["local"]);
		expect(reports[0]).toMatchObject({ status: "skipped", reason: "Stripe is not configured" });
	});

	it("keeps the budget below the hook timeout", () => {
		expect(CRON_BUDGET_MS).toBeLessThan(CRON_HOOK_TIMEOUT_MS);
	});
});

describe("maintenance steps", () => {
	it("cover the documented work, in order, with provider-bound ones marked", async () => {
		const h = createOpsHarness();
		const steps = buildMaintenanceSteps(h.container(), h.base);
		expect(steps.map((candidate) => candidate.name)).toEqual(["inbox-retries", "outbox-deliveries", "catalog-sync", "reservation-expiry", "cart-sweep", "checkout-sweep", "reconcile", "purge"]);
		expect(steps.filter((candidate) => candidate.isProviderBound).map((candidate) => candidate.name)).toEqual(["inbox-retries", "catalog-sync", "reconcile"]);
	});
});

describe("the cron hook", () => {
	const hook = (h: ReturnType<typeof createOpsHarness>) => h.plugin.hooks.cron!;

	it("is registered with a timeout longer than the default and longer than the budget", () => {
		const h = createOpsHarness();
		expect(hook(h).timeout).toBe(CRON_HOOK_TIMEOUT_MS);
		expect(hook(h).timeout).toBeGreaterThan(5000);
	});

	it("ignores tasks that are not the maintenance task", async () => {
		const h = createOpsHarness();
		await hook(h).handler({ name: "other", scheduledAt: "x" }, h.base);
		expect(h.provider.calls).toHaveLength(0);
	});

	it("runs every step against real storage: retries a failed event, sweeps carts, purges, reconciles", async () => {
		const h = createOpsHarness();
		const container = h.container();
		// a failed inbox event that is due now
		const event = { eventId: "evt_cron", type: "product.updated", created: 5, isLivemode: false, action: { kind: "unsupported" as const }, raw: {} };
		await container.inbox.record(event, JSON.stringify(event), "webhook");
		await container.inbox.markFailed("evt_cron", "boom", "2000-01-01T00:00:00.000Z");
		// an abandoned-looking cart
		await container.carts.put(
			{ id: "c".repeat(32), status: CART_STATUS.active, lines: [{ priceId: "p", quantity: 1, addedAt: "2020-01-01T00:00:00.000Z" }], email: "a@example.com", checkout: null, orderId: null, context: { userAgent: null, country: null }, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" },
			null,
		);
		await hook(h).handler({ name: CRON_TASK, scheduledAt: new Date().toISOString() }, h.base);
		expect((await container.inbox.get("evt_cron"))!.status).toBe("ignored");
		expect((await container.carts.get("c".repeat(32)))!.value.status).toBe(CART_STATUS.abandoned);
		expect(h.provider.callsOf("listEventsSince")).toHaveLength(1);
	});

	it("one failing step does not stop the run (reconcile fails, the cart sweep and purge still happen)", async () => {
		const h = createOpsHarness();
		const container = h.container();
		h.provider.failNext("listEventsSince");
		await container.carts.put(
			{ id: "d".repeat(32), status: CART_STATUS.active, lines: [{ priceId: "p", quantity: 1, addedAt: "2020-01-01T00:00:00.000Z" }], email: "a@example.com", checkout: null, orderId: null, context: { userAgent: null, country: null }, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" },
			null,
		);
		await expect(hook(h).handler({ name: CRON_TASK, scheduledAt: "x" }, h.base)).resolves.toBeUndefined();
		expect((await container.carts.get("d".repeat(32)))!.value.status).toBe(CART_STATUS.abandoned);
		expect(h.base.logs.some((line) => line.level === "error" && line.message === "Maintenance step failed")).toBe(true);
	});

	it("without a Stripe key it still does the local work and never calls the provider", async () => {
		const h = createOpsHarness({ settings: {} });
		await expect(hook(h).handler({ name: CRON_TASK, scheduledAt: "x" }, h.base)).resolves.toBeUndefined();
		expect(h.provider.calls).toHaveLength(0);
	});

	it("throttles reconciliation across consecutive runs", async () => {
		const h = createOpsHarness();
		await hook(h).handler({ name: CRON_TASK, scheduledAt: "x" }, h.base);
		await hook(h).handler({ name: CRON_TASK, scheduledAt: "x" }, h.base);
		expect(h.provider.callsOf("listEventsSince")).toHaveLength(1);
	});
});

describe("scheduling", () => {
	it("schedules a recurring five-minute task on activation and install, once, and re-schedules a changed expression", async () => {
		const h = createOpsHarness();
		await h.plugin.hooks["plugin:activate"]!.handler({}, h.base);
		expect(h.cronTasks).toEqual([{ name: CRON_TASK, schedule: CRON_SCHEDULE }]);
		await h.plugin.hooks["plugin:install"]!.handler({}, h.base);
		expect(h.cronTasks).toHaveLength(1);
		h.cronTasks[0]!.schedule = "0 0 * * *";
		expect(await ensureCronScheduled(h.base)).toBe(true);
		expect(h.cronTasks[0]!.schedule).toBe(CRON_SCHEDULE);
		expect(await getCronInfo(h.base)).toMatchObject({ isScheduled: true, schedule: CRON_SCHEDULE });
	});

	it("the schedule is a valid cron expression with five fields and a valid task name", () => {
		expect(CRON_SCHEDULE.split(" ")).toHaveLength(5);
		expect(CRON_TASK).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
	});

	it("a failing scheduler is logged and does not break activation", async () => {
		const h = createOpsHarness();
		(h.base as { cron: unknown }).cron = {
			list: async () => [],
			schedule: async () => {
				throw new Error("db down");
			},
			cancel: async () => undefined,
		};
		await expect(h.plugin.hooks["plugin:activate"]!.handler({}, h.base)).resolves.toBeUndefined();
		expect(h.base.logs.some((line) => line.message === "The maintenance task could not be scheduled")).toBe(true);
	});

	it("tolerates a context without cron", async () => {
		const h = createOpsHarness();
		delete (h.base as { cron?: unknown }).cron;
		expect(await ensureCronScheduled(h.base)).toBe(false);
		expect(await getCronInfo(h.base)).toMatchObject({ isScheduled: false });
		expect(ROUTE.adminStatus).toBeTruthy();
	});
});
