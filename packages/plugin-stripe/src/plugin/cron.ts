import type { PluginContext, PluginDefinition } from "emdash";

import type { CommerceExtensions } from "../contracts/extensions.js";
import type { CommerceOptions } from "../contracts/options.js";
import { sweepCheckouts } from "../services/checkout-sweep.js";
import { createEventPublisher } from "../services/outbox.js";
import {
	deliverDueOutbox,
	purgeStale,
	reconcileIfDue,
	releaseExpiredReservations,
	retryDueInbox,
	sweepCarts,
	syncDueCatalog,
} from "../services/maintenance.js";
import { errorMessage, withTimeout } from "../services/payments/async.js";
import type { Logger } from "../ports/repositories.js";
import { createContainer, type CommerceContainer, type ContainerDeps } from "./container.js";

/**
 * Cron orchestration. EmDash allows one `cron` hook per plugin; every task of this plugin lands in it, so the
 * hook is a single recurring task that runs a list of bounded, isolated maintenance steps.
 *
 * EmDash facts this relies on (emdash/src/plugins):
 * - `ctx.cron.schedule(name, { schedule })` takes a croner expression (5 or 6 fields, `@hourly` style
 *   aliases) or an ISO datetime, resolved in UTC, and upserts by name (cron.ts `CronAccessImpl.schedule`);
 *   a task name must match `^[a-zA-Z][a-zA-Z0-9_-]*$`. There is no minimum interval in the API: the Node
 *   scheduler wakes at least every 60 s (`scheduler/node.ts`), Cloudflare drives it from a per-minute trigger.
 * - delivery is at-least-once, and a task that is still `running` is not claimed again, so runs of one
 *   task never overlap on one site;
 * - a hook runs under `timeout` (default 5 s, `HookConfig.timeout`); on timeout the run is reported failed and
 *   the task is retried at its next tick. A running step cannot be cancelled, hence the budget below.
 */

export const CRON_TASK = "commerce-maintenance" as const;
/** Every five minutes: webhook retries back off from 30 s, and nothing here needs finer than that. */
export const CRON_SCHEDULE = "*/5 * * * *" as const;
/** What EmDash lets the hook run for. */
export const CRON_HOOK_TIMEOUT_MS = 45_000;
/** Steps start only while this much of the run is left unspent; leaves headroom under the hook timeout. */
export const CRON_BUDGET_MS = 30_000;

export const STEP_STATUS = { ok: "ok", failed: "failed", skipped: "skipped" } as const;
export type StepStatus = (typeof STEP_STATUS)[keyof typeof STEP_STATUS];

export interface MaintenanceStep {
	name: string;
	/** Needs a configured Stripe key; skipped (not failed) on a site that has none yet. */
	isProviderBound: boolean;
	run(): Promise<unknown>;
}

export interface StepReport {
	name: string;
	status: StepStatus;
	durationMs: number;
	/** Why a step was skipped or failed; never a secret. */
	reason?: string;
	result?: unknown;
}

export interface RunOptions {
	budgetMs: number;
	/** Monotonic enough milliseconds; injectable for tests. */
	now?: () => number;
	hasProvider: boolean;
	log: Pick<Logger, "info" | "warn" | "error">;
}

/**
 * Runs the steps in order. Each step is isolated: a throw (or a timeout at the end of the budget) is logged and
 * recorded, and the next step still runs. A step that would start after the budget is spent is skipped, not run.
 */
export const runSteps = async (steps: readonly MaintenanceStep[], options: RunOptions): Promise<StepReport[]> => {
	const now = options.now ?? Date.now;
	const startedAt = now();
	const reports: StepReport[] = [];
	for (const step of steps) {
		if (step.isProviderBound && !options.hasProvider) {
			reports.push({ name: step.name, status: STEP_STATUS.skipped, durationMs: 0, reason: "Stripe is not configured" });
			continue;
		}
		const remaining = options.budgetMs - (now() - startedAt);
		if (remaining <= 0) {
			reports.push({ name: step.name, status: STEP_STATUS.skipped, durationMs: 0, reason: "time budget spent" });
			continue;
		}
		const stepStart = now();
		try {
			const result = await withTimeout(step.run, remaining, `Maintenance step ${step.name}`);
			reports.push({ name: step.name, status: STEP_STATUS.ok, durationMs: now() - stepStart, result });
		} catch (error) {
			options.log.error("Maintenance step failed", { step: step.name, error: errorMessage(error) });
			reports.push({ name: step.name, status: STEP_STATUS.failed, durationMs: now() - stepStart, reason: errorMessage(error) });
		}
	}
	const failed = reports.filter((report) => report.status === STEP_STATUS.failed).length;
	options.log.info("Maintenance run finished", {
		failed,
		skipped: reports.filter((report) => report.status === STEP_STATUS.skipped).length,
		durationMs: now() - startedAt,
	});
	return reports;
};

/** The step list for one run. Order matters: inbox first (it can emit events), outbox after, housekeeping last. */
export const buildMaintenanceSteps = (container: CommerceContainer, ctx: Pick<PluginContext, "kv">): MaintenanceStep[] => {
	const publisher = createEventPublisher(container);
	return [
		{ name: "inbox-retries", isProviderBound: true, run: () => retryDueInbox(container) },
		{ name: "outbox-deliveries", isProviderBound: false, run: () => deliverDueOutbox(publisher) },
		{ name: "catalog-sync", isProviderBound: true, run: () => syncDueCatalog(container, publisher) },
		{ name: "reservation-expiry", isProviderBound: false, run: () => releaseExpiredReservations(container, publisher) },
		{ name: "cart-sweep", isProviderBound: false, run: () => sweepCarts(container, publisher) },
		{ name: "checkout-sweep", isProviderBound: false, run: () => sweepCheckouts(container) },
		{ name: "reconcile", isProviderBound: true, run: () => reconcileIfDue(container, ctx.kv) },
		{ name: "purge", isProviderBound: false, run: () => purgeStale(container) },
	];
};

export interface CronTuning {
	budgetMs?: number;
	now?: () => number;
}

type CronHook = NonNullable<PluginDefinition["hooks"]>["cron"];

export const buildCronHook = (options: CommerceOptions, extensions: CommerceExtensions, deps: ContainerDeps = {}, tuning: CronTuning = {}): CronHook => ({
	timeout: CRON_HOOK_TIMEOUT_MS,
	async handler(event: { name: string }, ctx: PluginContext) {
		if (event.name !== CRON_TASK) return;
		const container = createContainer(ctx, options, extensions, deps);
		try {
			await container.ensureReady();
		} catch (error) {
			// Without the schema nothing below can work; fail the run so EmDash reports it and retries next tick.
			ctx.log.error("Maintenance could not prepare the schema", { error: errorMessage(error) });
			throw error;
		}
		const hasProvider = Boolean((await container.secrets()).stripeSecretKey);
		await runSteps(buildMaintenanceSteps(container, ctx), {
			budgetMs: tuning.budgetMs ?? CRON_BUDGET_MS,
			...(tuning.now ? { now: tuning.now } : {}),
			hasProvider,
			log: container.log,
		});
	},
});

export interface CronInfo {
	isScheduled: boolean;
	schedule: string | null;
	nextRunAt: string | null;
	lastRunAt: string | null;
}

/** Schedules (or re-schedules, when the expression changed) the maintenance task. False when cron is unavailable. */
export const ensureCronScheduled = async (ctx: Pick<PluginContext, "cron" | "log">): Promise<boolean> => {
	if (!ctx.cron) return false;
	try {
		const existing = (await ctx.cron.list()).find((task) => task.name === CRON_TASK);
		if (existing?.schedule === CRON_SCHEDULE) return true;
		await ctx.cron.schedule(CRON_TASK, { schedule: CRON_SCHEDULE });
		return true;
	} catch (error) {
		ctx.log.warn("The maintenance task could not be scheduled", { error: errorMessage(error) });
		return false;
	}
};

export const getCronInfo = async (ctx: Pick<PluginContext, "cron">): Promise<CronInfo> => {
	const none: CronInfo = { isScheduled: false, schedule: null, nextRunAt: null, lastRunAt: null };
	if (!ctx.cron) return none;
	try {
		const task = (await ctx.cron.list()).find((candidate) => candidate.name === CRON_TASK);
		return task ? { isScheduled: true, schedule: task.schedule, nextRunAt: task.nextRunAt, lastRunAt: task.lastRunAt } : none;
	} catch {
		return none;
	}
};
