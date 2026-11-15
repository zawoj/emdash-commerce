import { realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { ROUTE } from "../../contracts/api.js";
import { loadAdminPageData } from "../../services/admin/page-data.js";
import { createOpsHarness, type OpsHarness } from "../ops-test-support.js";
import { renderAdminPage } from "./render.js";
import { ACTION } from "./schema.js";

/** The host's own validator (`@emdash-cms/blocks/server`), found next to the installed `emdash` package. */
type Validator = (response: unknown, policy: Record<string, unknown>) => { valid: boolean; errors: Array<{ path: string; message: string }> };
let validate: Validator;

beforeAll(async () => {
	const emdash = realpathSync(fileURLToPath(new URL("../../../node_modules/emdash", import.meta.url)));
	const server = join(dirname(emdash), "@emdash-cms/blocks/dist/server.js");
	validate = ((await import(pathToFileURL(server).href)) as { validateBlockResponse: Validator }).validateBlockResponse;
});

const POLICY = { pluginPagePaths: ["/"] };
const expectValid = (response: unknown): void => {
	const result = validate(response, POLICY);
	expect(result.errors).toEqual([]);
	expect(result.valid).toBe(true);
};

const page = (h: OpsHarness, input: unknown) => h.call(ROUTE.admin, { input }) as Promise<{ blocks: Array<Record<string, any>>; toast?: { message: string; type: string } }>;
const loadPage = { type: "page_load", page: "/" };
const action = (action_id: string, value?: unknown) => ({ type: "block_action", action_id, ...(value === undefined ? {} : { value }) });
const tables = (blocks: Array<Record<string, any>>) => blocks.filter((block) => block.type === "table");

describe("the Commerce admin page", () => {
	it("the host validator is live: it rejects an unknown block and a table without page_action_id", () => {
		expect(validate({ blocks: [{ type: "nope" }] }, POLICY).valid).toBe(false);
		expect(validate({ blocks: [{ type: "table", columns: [], rows: [] }] }, POLICY).valid).toBe(false);
	});

	it("declares the page and the private, plugins:manage admin route", () => {
		const h = createOpsHarness();
		expect(h.plugin.admin.pages).toEqual([expect.objectContaining({ path: "/", label: "Commerce" })]);
		expect(h.routes[ROUTE.admin]).toMatchObject({ methods: ["POST"], permission: "plugins:manage" });
		expect(h.routes[ROUTE.admin]!.public).toBeFalsy();
	});

	it("renders valid Block Kit for an empty site (no key, no data)", async () => {
		const h = createOpsHarness({ settings: {} });
		const response = await page(h, loadPage);
		expectValid(response);
		const text = JSON.stringify(response.blocks);
		expect(text).toContain("No Stripe key is configured");
		for (const empty of ["No orders yet.", "No failed or dead events.", "Every catalog entity is in sync."]) expect(text).toContain(empty);
	});

	it("renders valid Block Kit for a populated site: orders, failed events with Replay, failed links with Resync, low stock", async () => {
		const h = createOpsHarness();
		await h.seedPaidOrder();
		const container = h.container();
		const { productId, priceId } = h.seedProduct({ tracked: true });
		await container.inventory.adjust({ kind: "product", id: productId }, 1, "seed");
		const event = { eventId: "evt_page", type: "refund.updated", created: 5, isLivemode: false, action: { kind: "unsupported" as const }, raw: {} };
		await container.inbox.record(event, JSON.stringify(event), "webhook");
		await container.inbox.markFailed("evt_page", "kaput", "2099-01-01T00:00:00.000Z");
		await container.catalogLinks.put({ entityKey: `price:${priceId}`, providerId: null, providerPriceByFingerprint: {}, fingerprint: null, syncStatus: "failed", lastError: "No such product", attempts: 2, nextAttemptAt: null, syncedAt: null, driftFields: [] }, null);

		const response = await page(h, loadPage);
		expectValid(response);
		const [orders, events, links, stock] = tables(response.blocks);
		expect(orders!.rows).toHaveLength(1);
		expect(orders!.rows[0]).toMatchObject({ orderStatus: "open", payment: "paid", total: "57.00 PLN" });
		expect(events!.rows[0]).toMatchObject({ type: "refund.updated", status: "failed", error: "kaput" });
		expect(events!.rows[0].replay).toMatchObject({ type: "button", action_id: ACTION.replayEvent, value: "evt_page" });
		expect(links!.rows[0].resync).toMatchObject({ type: "button", action_id: ACTION.resyncEntity, value: `price:${priceId}` });
		expect(stock!.rows[0]).toMatchObject({ available: 1 });
		expect(response.blocks.find((block) => block.type === "stats")!.items).toHaveLength(6);
	});

	it("shows a LIVE banner for a live key and warns about an unregistered webhook", async () => {
		const h = createOpsHarness({ settings: { stripeSecretKey: "sk_live_abcdefgh1234" } });
		const response = await page(h, loadPage);
		expectValid(response);
		const banners = response.blocks.filter((block) => block.type === "banner");
		expect(banners.map((banner) => banner.title)).toEqual(expect.arrayContaining(["LIVE mode", "Webhook"]));
		expect(JSON.stringify(response.blocks)).not.toContain("abcdefgh1234");
	});

	it("every button on the page uses an action id the dispatcher knows, and dangerous ones confirm", async () => {
		const h = createOpsHarness();
		const response = await page(h, loadPage);
		const buttons = response.blocks.find((block) => block.type === "actions")!.elements as Array<{ action_id: string; label: string; confirm?: unknown }>;
		expect(buttons.map((button) => button.action_id)).toEqual([ACTION.registerWebhook, ACTION.reconcile, ACTION.resyncCatalog, ACTION.sweepCheckouts, ACTION.refresh]);
		expect(buttons.find((button) => button.action_id === ACTION.reconcile)!.confirm).toBeDefined();
		expect(buttons.find((button) => button.action_id === ACTION.sweepCheckouts)!.confirm).toBeDefined();
	});

	describe("actions", () => {
		it("register webhook creates the endpoint and stores the secret", async () => {
			const h = createOpsHarness({ settings: { stripeSecretKey: "sk_test_x_1234" } });
			const response = await page(h, action(ACTION.registerWebhook));
			expectValid(response);
			expect(response.toast).toMatchObject({ type: "success" });
			expect(h.provider.callsOf("createEndpoint")).toHaveLength(1);
			expect(await h.base.settings.get("stripeWebhookSecret")).toBe("whsec_fake");
			expect(JSON.stringify(response)).not.toContain("whsec_fake");
		});

		it("reconcile now runs reconciliation and reports the counts", async () => {
			const h = createOpsHarness();
			h.provider.recordEvent({ eventId: "evt_m", type: "customer.updated", created: Math.floor(Date.now() / 1000), isLivemode: false, action: { kind: "unsupported" }, raw: {} });
			const response = await page(h, action(ACTION.reconcile));
			expectValid(response);
			expect(response.toast).toMatchObject({ type: "success", message: expect.stringContaining("1 new event") });
			expect(h.provider.callsOf("listEventsSince")).toHaveLength(1);
		});

		it("resync catalog queues the catalog", async () => {
			const h = createOpsHarness();
			h.seedProduct();
			const response = await page(h, action(ACTION.resyncCatalog));
			expectValid(response);
			expect(response.toast).toMatchObject({ type: "success", message: expect.stringMatching(/queued for sync/) });
		});

		it("clean up abandoned checkouts reports what it removed", async () => {
			const h = createOpsHarness();
			const response = await page(h, action(ACTION.sweepCheckouts));
			expectValid(response);
			expect(response.toast).toMatchObject({ type: "success", message: expect.stringContaining("Cleaned up 0 abandoned checkout(s)") });
		});

		it("replay re-runs the stored event and refreshes the page", async () => {
			const h = createOpsHarness();
			const container = h.container();
			const event = { eventId: "evt_rp", type: "refund.updated", created: 5, isLivemode: false, action: { kind: "unsupported" as const }, raw: {} };
			await container.inbox.record(event, JSON.stringify(event), "webhook");
			await container.inbox.markFailed("evt_rp", "boom", "2099-01-01T00:00:00.000Z");
			const response = await page(h, action(ACTION.replayEvent, "evt_rp"));
			expectValid(response);
			expect(response.toast).toMatchObject({ type: "success", message: expect.stringContaining("ignored") });
			expect(tables(response.blocks)[1]!.rows).toHaveLength(0);
		});

		it("resync of a failed link queues its product; a vanished entity is an error toast, not a crash", async () => {
			const h = createOpsHarness();
			const { priceId } = h.seedProduct();
			expect((await page(h, action(ACTION.resyncEntity, `price:${priceId}`))).toast).toMatchObject({ type: "success" });
			const gone = await page(h, action(ACTION.resyncEntity, "price:gone"));
			expectValid(gone);
			expect(gone.toast).toMatchObject({ type: "error" });
		});

		it("an action that fails shows an error toast next to a fresh page, without leaking details", async () => {
			const h = createOpsHarness();
			const response = await page(h, action(ACTION.replayEvent, "does-not-exist"));
			expectValid(response);
			expect(response.toast).toMatchObject({ type: "error", message: "No such webhook event" });
			h.provider.failNext("listEventsSince", new Error("sk_test_inner detail"));
			const failed = await page(h, action(ACTION.reconcile));
			expect(failed.toast).toMatchObject({ type: "error" });
			expect(JSON.stringify(failed)).not.toContain("sk_test_inner");
		});

		it("unknown actions and form submits are rejected with a toast; refresh just re-renders", async () => {
			const h = createOpsHarness();
			expect((await page(h, action("nope"))).toast).toMatchObject({ type: "error", message: "Unknown action." });
			expect((await page(h, { type: "form_submit", action_id: "x", values: {} })).toast).toMatchObject({ type: "error" });
			const refreshed = await page(h, action(ACTION.refresh));
			expect(refreshed.toast).toBeUndefined();
			expectValid(refreshed);
		});

		it("rejects a malformed interaction at the boundary", async () => {
			const h = createOpsHarness();
			await expect(page(h, { type: "unknown" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
		});
	});

	it("renderAdminPage is pure: the same data renders the same blocks", async () => {
		const h = createOpsHarness();
		const data = await loadAdminPageData(h.container(), { webhookUrl: "https://shop.example/w" });
		expect(renderAdminPage(data)).toEqual(renderAdminPage(data));
	});
});
