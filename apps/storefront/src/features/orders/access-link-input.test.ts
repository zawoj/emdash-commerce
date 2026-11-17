import { describe, expect, it } from "vitest";

import { readAccessLinkInput } from "./access-link-input";

const post = (init: RequestInit): Request => new Request("http://localhost/api/orders/access-link", { method: "POST", ...init });

describe("readAccessLinkInput", () => {
	it("reads a JSON body (what the lookup page's script posts)", async () => {
		const request = post({
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "a@example.com", orderNumber: "ORD-2026-00001" }),
		});
		expect(await readAccessLinkInput(request)).toEqual({ email: "a@example.com", orderNumber: "ORD-2026-00001" });
	});

	it("reads a urlencoded form (the lookup page without script)", async () => {
		const request = post({
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ email: "a@example.com", orderNumber: "ORD-2026-00001" }),
		});
		expect(await readAccessLinkInput(request)).toEqual({ email: "a@example.com", orderNumber: "ORD-2026-00001" });
	});

	it("rejects a JSON body that is not two strings", async () => {
		const request = post({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: 1, orderNumber: "x" }) });
		expect(await readAccessLinkInput(request)).toBeNull();
	});

	it("rejects a body that is not JSON or a form", async () => {
		expect(await readAccessLinkInput(post({ headers: { "Content-Type": "text/plain" }, body: "email=a" }))).toBeNull();
		expect(await readAccessLinkInput(post({ headers: { "Content-Type": "application/json" }, body: "{" }))).toBeNull();
	});
});
