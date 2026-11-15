import { describe, expect, it } from "vitest";

import { ROUTE } from "../contracts/api.js";
import { createStripeCommercePlugin } from "./index.js";
import { MCP_TOOLS } from "./mcp.js";

const plugin = createStripeCommercePlugin({});
const tools = plugin.mcp!.tools;

/** Core permission table keys this plugin uses (`@emdash-cms/auth` rbac.ts). */
const PERMISSIONS = ["content:edit_any", "plugins:manage"];

describe("MCP tools", () => {
	it("the plugin builds (definePlugin validates every tool: private, POST, JSON, permission declared)", () => {
		expect(Object.keys(tools).length).toBe(Object.keys(MCP_TOOLS).length);
	});

	it("every tool points at an existing private POST route with a known permission, and has an agent-readable description", () => {
		for (const [name, tool] of Object.entries(tools)) {
			expect(name, name).toMatch(/^[a-zA-Z0-9_-]+$/);
			const route = plugin.routes[tool.route];
			expect(route, `${name} -> ${tool.route}`).toBeDefined();
			expect(route!.public, name).toBeFalsy();
			expect(route!.methods ?? ["POST"], name).toContain("POST");
			expect(route!.permission, name).toBeDefined();
			expect(PERMISSIONS, name).toContain(route!.permission);
			expect(tool.description.length, name).toBeGreaterThan(60);
			expect(typeof tool.input.safeParse, name).toBe("function");
		}
	});

	it("exposes every admin operation (the Block Kit page route is not an agent tool)", () => {
		const exposed = new Set(Object.values(tools).map((tool) => tool.route));
		const adminOperations = Object.values(ROUTE).filter((route) => route.startsWith("admin/"));
		for (const route of adminOperations) expect(exposed.has(route), route).toBe(true);
		expect(exposed.has(ROUTE.admin)).toBe(false);
	});

	it("marks exactly the hard-to-undo operations destructive", () => {
		const destructive = Object.entries(tools)
			.filter(([, tool]) => tool.destructive === true)
			.map(([name]) => name)
			.sort();
		expect(destructive).toEqual(["commerce_inventory_adjust", "commerce_orders_refund", "commerce_reconcile", "commerce_subscriptions_cancel", "commerce_webhooks_replay"]);
	});

	it("money tools say so and explain idempotency", () => {
		expect(tools.commerce_orders_refund!.description).toMatch(/MONEY/);
		expect(tools.commerce_orders_refund!.description).toMatch(/requestId/);
		expect(tools.commerce_subscriptions_cancel!.description).toMatch(/MONEY/);
		expect(tools.commerce_inventory_adjust!.description).toMatch(/NOT idempotent/);
	});

	it("describes the three order axes and the lifecycle tools for an agent", () => {
		for (const word of ["orderStatus", "paymentStatus", "fulfillmentStatus"]) expect(tools.commerce_orders_list!.description).toContain(word);
		expect(tools.commerce_orders_fulfillment!.description).toContain("partially_returned");
		expect(tools.commerce_orders_action!.description).toMatch(/refund it first/);
		expect(tools.commerce_orders_note!.description).toMatch(/NOT idempotent/);
		expect(tools.commerce_orders_action!.input.safeParse({ orderId: "o1", action: "complete" }).success).toBe(true);
		expect(tools.commerce_orders_action!.input.safeParse({ orderId: "o1", action: "delete" }).success).toBe(false);
		expect(tools.commerce_orders_fulfillment!.input.safeParse({ orderId: "o1", fulfillmentStatus: "partially_fulfilled" }).success).toBe(true);
		expect(tools.commerce_orders_events!.input.safeParse({ orderId: "o1" }).success).toBe(true);
	});

	it("the refund tool's input is the route contract (requestId required)", () => {
		const input = tools.commerce_orders_refund!.input;
		expect(input.safeParse({ orderId: "o1" }).success).toBe(false);
		expect(input.safeParse({ orderId: "o1", requestId: "req-00000001" }).success).toBe(true);
	});
});
