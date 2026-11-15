import { describe, expect, it } from "vitest";

import { menuWithShopLink } from "./menu";

describe("menuWithShopLink", () => {
	it("inserts Shop when the CMS menu has no /shop link", () => {
		const menu = menuWithShopLink(
			[
				{ label: "Home", href: "/" },
				{ label: "About", href: "/pages/about" },
				{ label: "Posts", href: "/posts" },
			],
			"Shop",
			"/posts",
			"http://localhost:4360",
		);
		expect(menu.map((item) => item.label)).toEqual(["Home", "Shop", "About", "Posts"]);
		expect(menu.find((item) => item.label === "Shop")?.href).toBe("/shop");
	});

	it("leaves the menu unchanged when Shop is already present", () => {
		const original = [
			{ label: "Home", href: "/" },
			{ label: "Shop", href: "/shop" },
		];
		expect(menuWithShopLink(original, "Shop", "/", "http://localhost:4360")).toEqual(original);
	});
});
