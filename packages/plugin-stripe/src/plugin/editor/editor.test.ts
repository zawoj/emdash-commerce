import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { beforeAll, describe, expect, it } from "vitest";

import { PRODUCT_FIELD, VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { ROUTE } from "../../contracts/api.js";
import { createModelWorld, type ModelWorld } from "../../services/catalog/model-test-support.js";
import { generateVariants, loadVariantGeneratorModel } from "../../services/catalog/variant-generator.js";
import { loadSpecificationModel } from "../../services/catalog/specs.js";
import { createFakeRouteContext } from "../../testing/index.js";
import { createStripeCommercePlugin } from "../index.js";
import { buildEditorActions, buildEditorPanels } from "./index.js";
import { axisFieldId, renderVariantsPanel, VARIANTS_FORM } from "./variants-panel.js";
import { renderSpecificationPanel, specFieldId, SPEC_FORM } from "./specification-panel.js";

/** The host's own validator (`@emdash-cms/blocks/server`), found next to the installed `emdash` package. */
type Validator = (response: unknown, policy: Record<string, unknown>) => { valid: boolean; errors: Array<{ path: string; message: string }> };
let validate: Validator;
let validateInteraction: (interaction: unknown) => { valid: boolean };
let validateAction: (response: unknown, policy: Record<string, unknown>) => { valid: boolean; errors: unknown[] };

beforeAll(async () => {
	const emdash = realpathSync(fileURLToPath(new URL("../../../node_modules/emdash", import.meta.url)));
	const server = (await import(pathToFileURL(join(dirname(emdash), "@emdash-cms/blocks/dist/server.js")).href)) as {
		validateBlockResponse: Validator;
		validateContentEditorPanelInteraction: typeof validateInteraction;
		validateContentEditorActionResponse: typeof validateAction;
	};
	validate = server.validateBlockResponse;
	validateInteraction = server.validateContentEditorPanelInteraction;
	validateAction = server.validateContentEditorActionResponse;
});

const POLICY = {};
const expectValid = (response: unknown): void => {
	const result = validate(response, POLICY);
	expect(result.errors).toEqual([]);
	expect(result.valid).toBe(true);
};

interface World {
	w: ModelWorld;
	plugin: ReturnType<typeof createStripeCommercePlugin>;
	call(route: string, input: unknown, entry?: { collection: string; id: string }): Promise<Record<string, any>>;
	productId: string;
	size: { id: string; valueIds: string[] };
	colour: { id: string; valueIds: string[] };
	material: { id: string; valueIds: string[] };
}

const world = async (): Promise<World> => {
	const w = createModelWorld();
	const plugin = createStripeCommercePlugin({ supportedCurrencies: ["pln"] }, {}, w.deps);
	const size = await w.attribute({ name: "Size", values: [{ label: "S", code: "S" }, { label: "M", code: "M" }] });
	const colour = await w.attribute({ name: "Colour", values: [{ label: "Black", code: "BLK", swatch: "#000" }, { label: "White", code: "WHT" }] });
	const material = await w.attribute({ name: "Material", inputType: "text" });
	const typeId = await w.productType({ name: "Shirt", axes: [size.id, colour.id], specs: [material.id], required: [material.id] });
	const productId = await w.product({ title: "Tee", sku: "TEE", typeId, hasVariants: true });
	const routes = plugin.routes as Record<string, PluginRoute>;
	return {
		w,
		plugin,
		productId,
		size,
		colour,
		material,
		call: async (route, input, entry = { collection: w.slugs.products, id: productId }) => {
			const base = createFakeRouteContext(w.ctx, { method: "POST", input });
			const ctx = { ...base, user: { id: "usr", email: "e@x.y", role: 40, name: null, createdAt: "" }, ui: { surface: "content-editor-panel", locale: "en", direction: "ltr", extensionId: "x", entry: { ...entry, locale: null, version: 1 } } } as unknown as RouteContext;
			return (await routes[route]!.handler(ctx as never)) as Record<string, any>;
		},
	};
};

describe("editor panel and action declarations", () => {
	it("declares the Variants and Specification panels and the Sync action on products only", () => {
		const plugin = createStripeCommercePlugin({});
		const catalogPanels = plugin.admin.editorPanels!.filter((panel) => panel.collections?.includes("products"));
		expect(catalogPanels).toEqual([
			{ id: "variants", title: "Variants", route: "editor/variants", collections: ["products"], order: 10 },
			{ id: "specification", title: "Specification", route: "editor/specification", collections: ["products"], order: 20 },
		]);
		expect(plugin.admin.editorActions!.filter((action) => action.collections?.includes("products"))).toEqual([expect.objectContaining({ id: "catalog-resync", route: "editor/catalog-resync", placement: "overflow", collections: ["products"], confirm: expect.any(Object) })]);
	});

	it("scopes them to the configured products slug and has every route private (definePlugin checks that)", () => {
		const plugin = createStripeCommercePlugin({ collections: { products: "shop_products" } });
		const catalogPanels = plugin.admin.editorPanels!.filter((panel) => ["variants", "specification"].includes(panel.id));
		expect(catalogPanels).toHaveLength(2);
		for (const panel of catalogPanels) expect(panel.collections).toEqual(["shop_products"]);
		expect(plugin.routes[ROUTE.editorVariants]!.public).toBeFalsy();
		expect(plugin.routes[ROUTE.editorSpecification]!.public).toBeFalsy();
		expect(plugin.routes[ROUTE.editorCatalogResync]!.public).toBeFalsy();
	});

	it("composes from arrays a later phase can append to", () => {
		const slugs = createModelWorld().slugs;
		expect(buildEditorPanels(slugs).map((panel) => panel.id)).toEqual(expect.arrayContaining(["variants", "specification"]));
		expect(buildEditorActions(slugs).map((action) => action.id)).toContain("catalog-resync");
	});
});

describe("Variants panel", () => {
	it("renders valid Block Kit: a checkbox per axis with every value ticked, a Generate form and the variant table", async () => {
		const t = await world();
		const response = await t.call(ROUTE.editorVariants, { type: "panel_load" });
		expectValid(response);
		const form = response.blocks.find((block: any) => block.type === "form");
		expect(form.block_id).toBe(VARIANTS_FORM.blockId);
		expect(form.submit.action_id).toBe(VARIANTS_FORM.submitAction);
		expect(form.fields.map((field: any) => [field.type, field.action_id, field.label, field.options.map((option: any) => option.label), field.initial_value.length])).toEqual([
			["checkbox", axisFieldId(t.size.id), "Size", ["S", "M"], 2],
			["checkbox", axisFieldId(t.colour.id), "Colour", ["Black", "White"], 2],
		]);
		const table = response.blocks.find((block: any) => block.type === "table");
		expect(table.rows).toEqual([]);
		expect(table.empty_text).toBe("No variants yet.");
		expect(validateInteraction({ type: "panel_load" }).valid).toBe(true);
	});

	it("generates the ticked combinations on form_submit, answers with a toast, the refreshed table and a refresh of the editor", async () => {
		const t = await world();
		const response = await t.call(ROUTE.editorVariants, {
			type: "form_submit",
			action_id: VARIANTS_FORM.submitAction,
			block_id: VARIANTS_FORM.blockId,
			values: { [axisFieldId(t.size.id)]: [t.size.valueIds[0]], [axisFieldId(t.colour.id)]: t.colour.valueIds },
		});
		expectValid(response);
		expect(response.toast).toEqual({ type: "success", message: "Created 2 variants." });
		expect(response.refresh).toBe(true);
		const table = response.blocks.find((block: any) => block.type === "table");
		expect(table.rows.map((row: any) => [row.title.label, row.sku, row.price, row.active])).toEqual([
			["Tee — S / Black", "TEE-S-BLK", "product price", "active"],
			["Tee — S / White", "TEE-S-WHT", "product price", "active"],
		]);
		expect(table.rows[0].title.target).toEqual({ kind: "content", collection: t.w.slugs.variants, id: expect.any(String) });
		const again = await t.call(ROUTE.editorVariants, { type: "form_submit", action_id: VARIANTS_FORM.submitAction, values: { [axisFieldId(t.size.id)]: [t.size.valueIds[0]], [axisFieldId(t.colour.id)]: t.colour.valueIds } });
		expect(again.toast).toEqual({ type: "info", message: "Created 0 variants; 2 already existed." });
		expect(again.refresh).toBeUndefined();
	});

	it("answers a refused generation with an error toast and the current panel, not an error response", async () => {
		const t = await world();
		const response = await t.call(ROUTE.editorVariants, { type: "form_submit", action_id: VARIANTS_FORM.submitAction, values: { [axisFieldId(t.size.id)]: [t.size.valueIds[0]] } });
		expectValid(response);
		expect(response.toast).toMatchObject({ type: "error", message: expect.stringContaining("Tick at least one value for Colour") });
		expect(response.blocks.some((block: any) => block.type === "form")).toBe(true);
	});

	it("says why it cannot generate when the product has no type, instead of showing a form", async () => {
		const t = await world();
		const untyped = await t.w.product({ title: "Plain", sku: "P" });
		const response = await t.call(ROUTE.editorVariants, { type: "panel_load" }, { collection: t.w.slugs.products, id: untyped });
		expectValid(response);
		expect(response.blocks.find((block: any) => block.type === "banner")).toMatchObject({ variant: "alert", description: expect.stringContaining("Choose a product type") });
		expect(response.blocks.some((block: any) => block.type === "form")).toBe(false);
	});

	it("shows a price override and stock in the table", async () => {
		const t = await world();
		await generateVariants(t.w.container, t.productId, { [t.size.id]: [t.size.valueIds[0]!], [t.colour.id]: [t.colour.valueIds[0]!] });
		const [variant] = await t.w.container.catalog.listVariants(t.productId);
		await t.w.ctx.content.update(t.w.slugs.variants, variant!.id, { [VARIANT_FIELD.price]: 5900 });
		await t.w.container.inventory.adjust({ kind: "variant", id: variant!.id }, 7, "seed");
		const response = renderVariantsPanel(await loadVariantGeneratorModel(t.w.container, t.productId), t.w.slugs.variants);
		expectValid(response);
		expect((response.blocks.find((block) => block.type === "table") as any).rows[0]).toMatchObject({ price: "59.00", stock: 7 });
	});

	it("refuses to run on anything but a product, and without a host-attested entry", async () => {
		const t = await world();
		const brand = await t.w.brand("Acme");
		const wrong = await t.call(ROUTE.editorVariants, { type: "panel_load" }, { collection: t.w.slugs.brands, id: brand }).catch((error: unknown) => error);
		expect(wrong).toBeInstanceOf(PluginRouteError);
		expect(wrong).toMatchObject({ code: "INVALID_INPUT", message: "This panel works on products only" });
		const routes = t.plugin.routes as Record<string, PluginRoute>;
		const ctx = createFakeRouteContext(t.w.ctx, { method: "POST", input: { type: "panel_load" } });
		await expect(routes[ROUTE.editorVariants]!.handler(ctx as never)).rejects.toBeInstanceOf(PluginRouteError);
	});

	it("requires the editor permission", () => {
		const t = createStripeCommercePlugin({});
		expect(t.routes[ROUTE.editorVariants]!.permission).toBe("content:edit_any");
		expect(t.routes[ROUTE.editorSpecification]!.permission).toBe("content:edit_any");
		expect(t.routes[ROUTE.editorCatalogResync]!.permission).toBe("plugins:manage");
	});
});

describe("Specification panel", () => {
	it("renders one control per specification attribute shaped by its input type, required ones starred, with saved values", async () => {
		const t = await world();
		const fit = await t.w.attribute({ name: "Fit", values: ["slim", "wide"] });
		const uses = await t.w.attribute({ name: "Uses", inputType: "multi_select", values: ["a", "b"] });
		const weight = await t.w.attribute({ name: "Weight", inputType: "number" });
		const waterproof = await t.w.attribute({ name: "Waterproof", inputType: "boolean" });
		const typeId = await t.w.productType({ name: "Full", specs: [t.material.id, fit.id, uses.id, weight.id, waterproof.id], required: [t.material.id] });
		const product = await t.w.product({ title: "Full", sku: "F", typeId, specs: { [t.material.id]: "wool", [fit.id]: fit.valueIds[1], [uses.id]: [uses.valueIds[0]], [weight.id]: 2.5, [waterproof.id]: true } });
		const response = await t.call(ROUTE.editorSpecification, { type: "panel_load" }, { collection: t.w.slugs.products, id: product });
		expectValid(response);
		const form = response.blocks.find((block: any) => block.type === "form");
		expect(form.block_id).toBe(SPEC_FORM.blockId);
		expect(form.fields.map((field: any) => [field.type, field.action_id, field.label, field.initial_value])).toEqual([
			["text_input", specFieldId(t.material.id), "Material *", "wool"],
			["select", specFieldId(fit.id), "Fit", fit.valueIds[1]],
			["checkbox", specFieldId(uses.id), "Uses", [uses.valueIds[0]]],
			["number_input", specFieldId(weight.id), "Weight", 2.5],
			["toggle", specFieldId(waterproof.id), "Waterproof", true],
		]);
		expect(form.fields[1].options.map((option: any) => option.label)).toEqual(["—", "slim", "wide"]);
	});

	it("saves the submitted values, answers with a toast and the saved form, and drops stale rows", async () => {
		const t = await world();
		const submit = (values: Record<string, unknown>) => t.call(ROUTE.editorSpecification, { type: "form_submit", action_id: SPEC_FORM.submitAction, block_id: SPEC_FORM.blockId, values });
		const response = await submit({ [specFieldId(t.material.id)]: "  cotton  ", [specFieldId("gone")]: "x" });
		expectValid(response);
		expect(response.toast).toEqual({ type: "success", message: "Specification saved." });
		expect((await loadSpecificationModel(t.w.container, t.productId)).specs).toEqual({ [t.material.id]: "cotton" });
		expect(response.blocks.find((block: any) => block.type === "form").fields[0].initial_value).toBe("cotton");
		const cleared = await submit({ [specFieldId(t.material.id)]: "" });
		expect(cleared.toast.type).toBe("success");
		expect((await loadSpecificationModel(t.w.container, t.productId)).specs).toEqual({});
	});

	it("reports an invalid value as an error toast and saves nothing", async () => {
		const t = await world();
		const fit = await t.w.attribute({ name: "Fit", values: ["slim"] });
		const typeId = await t.w.productType({ name: "Fitted", specs: [fit.id] });
		const product = await t.w.product({ title: "F", sku: "F", typeId });
		const response = await t.call(ROUTE.editorSpecification, { type: "form_submit", action_id: SPEC_FORM.submitAction, values: { [specFieldId(fit.id)]: "bogus" } }, { collection: t.w.slugs.products, id: product });
		expectValid(response);
		expect(response.toast).toMatchObject({ type: "error", message: expect.stringContaining("is not a value of") });
		expect((await loadSpecificationModel(t.w.container, product)).specs).toEqual({});
	});

	it("says there is no product type, and that a type with no specification attributes has nothing to fill", async () => {
		const t = await world();
		const untyped = await t.w.product({ title: "Plain", sku: "P" });
		const none = await t.call(ROUTE.editorSpecification, { type: "panel_load" }, { collection: t.w.slugs.products, id: untyped });
		expectValid(none);
		expect(none.blocks[0]).toMatchObject({ type: "banner", title: "No product type" });
		const bare = await t.w.productType({ name: "Bare" });
		const bareProduct = await t.w.product({ title: "B", sku: "B", typeId: bare });
		const empty = renderSpecificationPanel(await loadSpecificationModel(t.w.container, bareProduct));
		expectValid(empty);
		expect(empty.blocks).toEqual([{ type: "context", text: 'Product type "Bare" has no specification attributes yet.' }]);
	});

	it("leaves out a select attribute that has no values yet and says so", async () => {
		const t = await world();
		const hollow = await t.w.attribute({ name: "Hollow", values: [] });
		const typeId = await t.w.productType({ name: "H", specs: [hollow.id, t.material.id] });
		const product = await t.w.product({ title: "H", sku: "H", typeId });
		const response = renderSpecificationPanel(await loadSpecificationModel(t.w.container, product));
		expectValid(response);
		expect(response.blocks.find((block) => block.type === "banner")).toMatchObject({ description: "No values yet for: Hollow." });
		expect((response.blocks.find((block) => block.type === "form") as any).fields).toHaveLength(1);
	});
});

describe("Sync to Stripe action", () => {
	it("queues the product and what hangs on it, and answers with a toast the host accepts", async () => {
		const t = await world();
		await generateVariants(t.w.container, t.productId, { [t.size.id]: t.size.valueIds, [t.colour.id]: [t.colour.valueIds[0]!] });
		const response = await t.call(ROUTE.editorCatalogResync, { type: "editor_action" });
		expect(response.toast).toMatchObject({ type: "success", message: expect.stringMatching(/^\d+ catalog entit(y|ies) queued for sync\.$/) });
		expect(validateAction(response, POLICY).valid).toBe(true);
		expect(response.toast.message).toMatch(/^3 /);
	});
});

describe("saved-entry fields stay in the product row", () => {
	it("keeps the plugin's own writes out of the editor's draft data fields it does not own", async () => {
		const t = await world();
		await t.call(ROUTE.editorSpecification, { type: "form_submit", action_id: SPEC_FORM.submitAction, values: { [specFieldId(t.material.id)]: "silk" } });
		const row = t.w.ctx.content.entries(t.w.slugs.products).find((entry) => entry.id === t.productId)!;
		expect(Object.keys(row.data).sort()).toEqual([PRODUCT_FIELD.hasVariants, PRODUCT_FIELD.sku, PRODUCT_FIELD.specs, PRODUCT_FIELD.title].sort());
	});
});
