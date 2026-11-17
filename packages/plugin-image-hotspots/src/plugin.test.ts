import { describe, expect, it, vi } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import { ADMIN_ENTRY, createPlugin } from "./plugin.js";
import { WIDGET_REF } from "./value/constants.js";

vi.mock("@emdash-cms/admin", () => ({ MediaPickerModal: () => null, fetchContentList: async () => ({ items: [] }) }));

describe("plugin", () => {
	it("is a react admin plugin that declares one json widget and asks for no capability", () => {
		const plugin = createPlugin();
		expect(plugin.id).toBe("image-hotspots");
		expect(plugin.capabilities).toEqual([]);
		expect(plugin.admin.entry).toBe(ADMIN_ENTRY);
		expect(plugin.admin.fieldWidgets).toEqual([{ name: "hotspots", label: "Image with points", fieldTypes: ["json"] }]);
		expect(WIDGET_REF).toBe("image-hotspots:hotspots");
	});

	it("reports the version of the published package", () => {
		expect(createPlugin().version).toBe(packageJson.version);
	});

	it("the admin entry exports the widget under the declared name", async () => {
		const admin = await import("./admin/index.js");
		expect(typeof admin.fields.hotspots).toBe("function");
	});
});
