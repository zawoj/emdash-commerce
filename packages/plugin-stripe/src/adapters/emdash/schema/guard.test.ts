import { describe, expect, it } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { buildCollectionDefinitions } from "./collections.js";
import { ORDER_FIELD, PRICE_FIELD, PRODUCT_FIELD } from "./field-names.js";
import { createProtectedFieldGuard, isSameValue, SaveRejectedError, type BaselineLoader } from "./guard.js";
import { buildCollectionPolicies } from "./protected-fields.js";

const options = commerceOptionsSchema.parse({});
const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);
const policies = buildCollectionPolicies(definitions, options.collections);
const editor = { id: "user-1" };

const guardWith = (...baselines: Array<Record<string, unknown>>) => {
	const loader: BaselineLoader = async () => baselines;
	return createProtectedFieldGuard(policies, loader);
};
const orders = options.collections.orders;
const products = options.collections.products;

describe("protected field policies", () => {
	it("protect every Stripe field of variants and prices and leave editorial fields editable", () => {
		const policy = policies[products]!;
		expect(policy.isCreationLocked).toBe(false);
		expect(policy.protectedFields).toEqual([PRODUCT_FIELD.specs]);
		expect(policy.protectedFields).not.toContain(PRODUCT_FIELD.title);
		expect(policies[options.collections.variants]!.protectedFields).toEqual(
			expect.arrayContaining(["stripe_product_id", "stripe_sync_status", "stripe_sync_error"]),
		);
		expect(policies[options.collections.variants]!.protectedFields).toContain("options_key");
		expect(policies[options.collections.variants]!.protectedFields).not.toContain("stock");
		expect(policies[options.collections.prices]!.protectedFields).toContain(PRICE_FIELD.stripePriceId);
		expect(policies[options.collections.prices]!.protectedFields).toContain(PRICE_FIELD.isManaged);
		expect(policies[options.collections.prices]!.protectedFields).not.toContain(PRICE_FIELD.unitAmount);
	});

	it("protect everything on plugin-owned collections except an order's notes", () => {
		const policy = policies[orders]!;
		expect(policy.isCreationLocked).toBe(true);
		expect(policy.protectedFields).toEqual(expect.arrayContaining([ORDER_FIELD.orderStatus, ORDER_FIELD.totalAmount, ORDER_FIELD.lines, ORDER_FIELD.fulfillmentStatus, ORDER_FIELD.paymentStatus, ORDER_FIELD.stripePaymentIntentId, ORDER_FIELD.refundedAmount]));
		expect(policy.protectedFields).not.toContain(ORDER_FIELD.notes);
		for (const slug of [options.collections.payments, options.collections.subscriptions, options.collections.customers, options.collections.carts]) {
			expect(policies[slug]!.isCreationLocked).toBe(true);
			expect(policies[slug]!.protectedFields.length).toBe(definitions.find((definition) => definition.slug === slug)!.fields.length);
		}
	});

	it("honours custom collection slugs", () => {
		const custom = commerceOptionsSchema.parse({ collections: { orders: "shop_orders" } });
		const customPolicies = buildCollectionPolicies(buildCollectionDefinitions(custom.collections, custom.supportedCurrencies), custom.collections);
		expect(customPolicies.shop_orders?.protectedFields).not.toContain(ORDER_FIELD.notes);
		expect(customPolicies[orders]).toBeUndefined();
	});
});

describe("protected field guard", () => {
	it("ignores collections it does not own and writes without an actor (the plugin's own creates)", async () => {
		const guard = guardWith({});
		await expect(guard({ collection: "posts", isNew: false, id: "1", actor: editor, content: { anything: 1 } })).resolves.toBeUndefined();
		await expect(guard({ collection: orders, isNew: true, content: { [ORDER_FIELD.orderStatus]: "paid" } })).resolves.toBeUndefined();
	});

	it("rejects an editor creating a plugin-owned record", async () => {
		const guard = guardWith();
		await expect(guard({ collection: orders, isNew: true, actor: editor, content: { [ORDER_FIELD.email]: "a@b.c" } })).rejects.toThrow(SaveRejectedError);
		await expect(guard({ collection: orders, isNew: true, actor: editor, content: {} })).rejects.toThrow(/created by the commerce plugin/);
	});

	it("rejects an editor changing a protected field and names it", async () => {
		const guard = guardWith({ [ORDER_FIELD.orderStatus]: "pending", [ORDER_FIELD.totalAmount]: 5000 });
		const attempt = guard({ collection: orders, isNew: false, id: "o1", actor: editor, content: { [ORDER_FIELD.orderStatus]: "paid", [ORDER_FIELD.totalAmount]: 5000 } });
		await expect(attempt).rejects.toThrow(/"order_status".*cannot be edited/);
		await expect(attempt).rejects.not.toThrow(/total_amount/);
	});

	it("rejects forging money to zero, and a changed nested value", async () => {
		const guard = guardWith({ [ORDER_FIELD.totalAmount]: 5000, [ORDER_FIELD.lines]: [{ priceId: "p", quantity: 1 }] });
		await expect(guard({ collection: orders, isNew: false, id: "o", actor: editor, content: { [ORDER_FIELD.totalAmount]: 0 } })).rejects.toThrow(SaveRejectedError);
		await expect(guard({ collection: orders, isNew: false, id: "o", actor: editor, content: { [ORDER_FIELD.lines]: [{ priceId: "p", quantity: 2 }] } })).rejects.toThrow(SaveRejectedError);
	});

	it("accepts a form that re-submits protected fields unchanged, with editable fields changed", async () => {
		const stored = { [ORDER_FIELD.orderStatus]: "paid", [ORDER_FIELD.lines]: [{ a: 1, b: 2 }], [ORDER_FIELD.notes]: "" };
		const guard = guardWith(stored);
		await expect(
			guard({
				collection: orders,
				isNew: false,
				id: "o",
				actor: editor,
				content: { ...stored, [ORDER_FIELD.lines]: [{ b: 2, a: 1 }], [ORDER_FIELD.notes]: "packed" },
			}),
		).resolves.toBeUndefined();
	});

	it("treats a missing stored value and an empty submitted one as unchanged", async () => {
		const guard = guardWith({});
		await expect(
			guard({ collection: orders, isNew: false, id: "o", actor: editor, content: { [ORDER_FIELD.phone]: "", [ORDER_FIELD.isLivemode]: false, [ORDER_FIELD.reviewFlags]: [] } }),
		).resolves.toBeUndefined();
	});

	it("rejects an update of an entry that cannot be loaded unless the value is empty", async () => {
		const guard = guardWith();
		await expect(guard({ collection: orders, isNew: false, id: "gone", actor: editor, content: { [ORDER_FIELD.orderStatus]: "paid" } })).rejects.toThrow(SaveRejectedError);
		await expect(guard({ collection: orders, isNew: false, actor: editor, content: { [ORDER_FIELD.orderStatus]: "paid" } })).rejects.toThrow(SaveRejectedError);
	});

	it("accepts a value equal to the draft revision when the live column differs (plugin writes stage a draft)", async () => {
		const variants = options.collections.variants;
		const guard = guardWith({ stripe_product_id: null }, { stripe_product_id: "prod_123" });
		await expect(
			guard({ collection: variants, isNew: false, id: "v", actor: editor, content: { stripe_product_id: "prod_123", title: "M" } }),
		).resolves.toBeUndefined();
		await expect(guard({ collection: variants, isNew: false, id: "v", actor: editor, content: { stripe_product_id: "prod_999" } })).rejects.toThrow(
			SaveRejectedError,
		);
	});

	it("lets editors create catalog entries but not with Stripe fields filled in", async () => {
		const guard = guardWith();
		const variants = options.collections.variants;
		await expect(guard({ collection: variants, isNew: true, actor: editor, content: { title: "M", stripe_product_id: "" } })).resolves.toBeUndefined();
		await expect(guard({ collection: variants, isNew: true, actor: editor, content: { title: "M", stripe_product_id: "prod_forged" } })).rejects.toThrow(
			/stripe_product_id/,
		);
	});

	it("does not even load the stored entry when no protected field is submitted", async () => {
		let loads = 0;
		const guard = createProtectedFieldGuard(policies, async () => {
			loads += 1;
			return [];
		});
		await guard({ collection: products, isNew: false, id: "p", actor: editor, content: { [PRODUCT_FIELD.title]: "x" } });
		expect(loads).toBe(0);
	});
});

describe("isSameValue", () => {
	it("compares structurally and treats empty values alike", () => {
		expect(isSameValue({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
		expect(isSameValue(null, "")).toBe(true);
		expect(isSameValue(0, undefined)).toBe(true);
		expect(isSameValue("paid", "pending")).toBe(false);
		expect(isSameValue(5, "5")).toBe(false);
	});
});
