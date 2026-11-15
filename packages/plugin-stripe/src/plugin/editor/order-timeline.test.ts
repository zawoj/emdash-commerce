import { realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { ROUTE } from "../../contracts/api.js";
import { commerceOptionsSchema } from "../../contracts/options.js";
import { recordOrderEvent } from "../../services/order-events.js";
import { createOpsHarness, failure, type OpsHarness } from "../ops-test-support.js";
import { buildEditorPanels } from "./index.js";
import { orderEditorPanels } from "./order-timeline.js";
import { PANEL_ACTION } from "./order-timeline-render.js";

/** The host's own validator (`@emdash-cms/blocks/server`), found next to the installed `emdash` package. */
type Validator = (response: unknown, policy: Record<string, unknown>) => { valid: boolean; errors: Array<{ path: string; message: string }> };
let validate: Validator;

beforeAll(async () => {
	const emdash = realpathSync(fileURLToPath(new URL("../../../node_modules/emdash", import.meta.url)));
	const server = join(dirname(emdash), "@emdash-cms/blocks/dist/server.js");
	validate = ((await import(pathToFileURL(server).href)) as { validateBlockResponse: Validator }).validateBlockResponse;
});

type Response = { blocks: Array<Record<string, any>>; toast?: { message: string; type: string } };

const ADMIN = { id: "usr_admin", email: "admin@example.com", role: 50 };
const EDITOR = { id: "usr_editor", email: "editor@example.com", role: 40 };

const panel = async (h: OpsHarness, orderId: string, input: unknown, user = ADMIN): Promise<Response> => {
	const ctx = { ...h.context({ input, user }), ui: { surface: "content-editor-panel", extensionId: "order-timeline", entry: { collection: "orders", id: orderId, locale: null, version: 1 } } };
	const response = (await h.routes[ROUTE.editorOrderTimeline]!.handler(ctx as never)) as Response;
	const verdict = validate(response, {});
	expect(verdict.errors).toEqual([]);
	return response;
};
const load = { type: "panel_load" };
const click = (action_id: string, value?: unknown) => ({ type: "block_action", action_id, ...(value === undefined ? {} : { value }) });
const submit = (action_id: string, values: Record<string, unknown>) => ({ type: "form_submit", action_id, values });
const blocksOf = (response: Response, type: string) => response.blocks.filter((block) => block.type === type);
const buttons = (response: Response): string[] => blocksOf(response, "actions").flatMap((block) => block.elements.map((element: { action_id: string }) => element.action_id));
const rows = (response: Response): Array<Record<string, string>> => blocksOf(response, "table")[0]!.rows;

describe("the order Timeline panel declaration", () => {
	const slugs = commerceOptionsSchema.parse({}).collections;
	const h = createOpsHarness();

	it("is declared for the orders collection only, on a private content:edit_any POST route", () => {
		expect(orderEditorPanels(slugs)).toEqual([{ id: "order-timeline", title: "Timeline", route: ROUTE.editorOrderTimeline, collections: ["orders"], order: 10 }]);
		expect(orderEditorPanels(commerceOptionsSchema.parse({ collections: { orders: "shop_orders" } }).collections)[0]).toMatchObject({ collections: ["shop_orders"] });
		expect(h.routes[ROUTE.editorOrderTimeline]).toMatchObject({ methods: ["POST"], permission: "content:edit_any" });
		expect(h.routes[ROUTE.editorOrderTimeline]!.public).toBeFalsy();
	});

	it("joins the composed panels and the plugin's admin config", () => {
		expect(buildEditorPanels(slugs).map((entry) => entry.id)).toContain("order-timeline");
		expect(h.plugin.admin.editorPanels?.map((entry: { id: string }) => entry.id)).toContain("order-timeline");
	});
});

describe("the order Timeline panel", () => {
	it("renders valid Block Kit for an administrator: status, allowed actions, forms and the event table", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		const response = await panel(h, orderId, load);
		expect(blocksOf(response, "fields")[0]!.fields).toEqual([
			{ label: "Order status", value: "open" },
			{ label: "Payment", value: "paid" },
			{ label: "Fulfillment", value: "unfulfilled" },
		]);
		// An unfulfilled order cannot be completed or reopened; it can be cancelled only without money, so no buttons.
		expect(buttons(response)).toEqual([]);
		expect(blocksOf(response, "form").map((form) => form.submit.action_id)).toEqual([PANEL_ACTION.setFulfillment, PANEL_ACTION.addNote]);
		expect(blocksOf(response, "form")[0]!.fields[0]).toMatchObject({ type: "select", initial_value: "unfulfilled" });
		expect(rows(response).map((row) => row.type)).toEqual(expect.arrayContaining(["placed", "payment_status_changed"]));
		expect(rows(response)[0]).toMatchObject({ actor: expect.any(String), message: expect.any(String) });
	});

	it("fulfils, then completes through the buttons that become available, with a toast for each step", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		const fulfilled = await panel(h, orderId, submit(PANEL_ACTION.setFulfillment, { fulfillment: "fulfilled" }));
		expect(fulfilled.toast).toEqual({ type: "success", message: "Fulfillment is fulfilled." });
		expect(buttons(fulfilled)).toEqual([PANEL_ACTION.complete]);
		const completed = await panel(h, orderId, click(PANEL_ACTION.complete));
		expect(completed.toast).toEqual({ type: "success", message: "Order is now completed." });
		expect(buttons(completed)).toEqual([PANEL_ACTION.archive, PANEL_ACTION.reopen]);
		expect(rows(completed).map((row) => row.type)).toEqual(expect.arrayContaining(["order_status_changed", "fulfillment_status_changed"]));
		expect((await h.container().orders.get(orderId))!.orderStatus).toBe("completed");
	});

	it("asks for confirmation before cancelling and refuses a guarded action with the reason", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		await h.container().orders.update(orderId, { paymentStatus: "pending" });
		const response = await panel(h, orderId, load);
		const cancel = blocksOf(response, "actions")[0]!.elements.find((element: { action_id: string }) => element.action_id === PANEL_ACTION.cancel);
		expect(cancel).toMatchObject({ style: "danger", confirm: { confirm: "Cancel order" } });
		await h.container().orders.update(orderId, { paymentStatus: "paid" });
		const refused = await panel(h, orderId, click(PANEL_ACTION.cancel));
		expect(refused.toast).toMatchObject({ type: "error", message: expect.stringContaining("refund it first") });
		expect((await h.container().orders.get(orderId))!.orderStatus).toBe("open");
	});

	it("adds a note and rejects an empty one and an unknown fulfillment", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		const added = await panel(h, orderId, submit(PANEL_ACTION.addNote, { note: "  Wrap it  " }));
		expect(added.toast).toEqual({ type: "success", message: "Note added." });
		expect(rows(added).find((row) => row.type === "note")).toMatchObject({ message: "Wrap it", actor: "admin@example.com (usr_admin)" });
		expect((await panel(h, orderId, submit(PANEL_ACTION.addNote, { note: "   " }))).toast).toMatchObject({ type: "error", message: "Write the note first." });
		expect((await panel(h, orderId, submit(PANEL_ACTION.setFulfillment, { fulfillment: "shipped" }))).toast).toMatchObject({ type: "error" });
		expect((await panel(h, orderId, click("nonsense"))).toast).toMatchObject({ type: "error", message: "Unknown action." });
	});

	it("shows an editor the timeline read-only and refuses every change they attempt", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		const view = await panel(h, orderId, load, EDITOR);
		expect(blocksOf(view, "form")).toEqual([]);
		expect(buttons(view)).toEqual([]);
		expect(JSON.stringify(view.blocks)).toContain("Only an administrator");
		for (const attempt of [click(PANEL_ACTION.cancel), submit(PANEL_ACTION.setFulfillment, { fulfillment: "fulfilled" }), submit(PANEL_ACTION.addNote, { note: "x" })]) {
			expect((await panel(h, orderId, attempt, EDITOR)).toast).toEqual({ type: "error", message: "Only an administrator can change an order." });
		}
		const order = (await h.container().orders.get(orderId))!;
		expect(order).toMatchObject({ orderStatus: "open", fulfillmentStatus: "unfulfilled" });
		expect(rows(view).some((row) => row.type === "note")).toBe(false);
	});

	it("pages through a long timeline with the table's load-more cursor", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		for (let index = 0; index < 30; index += 1) await recordOrderEvent(h.container(), { orderId, type: "note", message: `n${index}`, source: `s${index}` });
		const first = await panel(h, orderId, load);
		expect(rows(first)).toHaveLength(25);
		const cursor = blocksOf(first, "table")[0]!.next_cursor as string;
		expect(typeof cursor).toBe("string");
		const second = await panel(h, orderId, click(PANEL_ACTION.page, { cursor }));
		expect(rows(second).length).toBeGreaterThan(0);
		expect(second.toast).toBeUndefined();
		const seen = new Set([...rows(first), ...rows(second)].map((row) => `${row.when}|${row.message}`));
		expect(seen.size).toBe(rows(first).length + rows(second).length);
	});

	it("answers a missing order with a banner and a request without a saved entry with an error", async () => {
		const h = createOpsHarness();
		const missing = await panel(h, "no-such-order", load);
		expect(missing.blocks[0]).toMatchObject({ type: "banner", variant: "error", title: "Order not found" });
		const withoutEntry = await failure(h.call(ROUTE.editorOrderTimeline, { input: load }));
		expect(withoutEntry).toMatchObject({ code: "INVALID_INPUT", status: 400 });
	});
});
