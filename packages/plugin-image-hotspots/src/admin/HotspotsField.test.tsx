// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HotspotsValue } from "../value/schema.js";

const listProducts = vi.fn();
vi.mock("@emdash-cms/admin", () => ({
	fetchContentList: (...args: unknown[]) => listProducts(...args),
	MediaPickerModal: ({ open, onSelect }: { open: boolean; onSelect: (item: unknown) => void }) =>
		open ? (
			<button
				type="button"
				data-testid="pick"
				onClick={() =>
					onSelect({
						id: "m9",
						filename: "new.jpg",
						mimeType: "image/jpeg",
						url: "/x",
						storageKey: "new.jpg",
						size: 1,
						width: 800,
						height: 400,
						alt: "New",
						createdAt: "",
					})
				}
			>
				pick
			</button>
		) : null,
}));

const { HotspotsField } = await import("./HotspotsField.js");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IMAGE = { id: "m1", provider: "local", alt: "Runners", width: 1600, height: 800, meta: { storageKey: "run.jpg" } };
const START: HotspotsValue = {
	image: IMAGE,
	points: [
		{ id: "point-1", x: 40, y: 40 },
		{ id: "point-2", x: 60, y: 60 },
	],
};

let host: HTMLDivElement;
let root: Root;
let latest: HotspotsValue | null;
let props: { value: unknown; options: Record<string, unknown> };

const render = (element: ReactElement) => act(async () => root.render(element));

const mount = async (value: unknown, options: Record<string, unknown> = { mode: "callouts", maxPoints: 3 }) => {
	latest = null;
	props = { value, options };
	const draw = () =>
		render(
			<HotspotsField
				id="field-x"
				label="Points"
				value={props.value}
				options={props.options}
				onChange={(next) => {
					latest = next;
					props.value = next;
					void draw();
				}}
			/>,
		);
	await draw();
};

const query = <T extends Element>(selector: string): T => {
	const found = host.querySelector<T>(selector);
	if (!found) throw new Error(`missing ${selector}`);
	return found;
};
const markers = () => [...host.querySelectorAll<HTMLButtonElement>(".ihp-marker")];
const button = (name: string): HTMLButtonElement => {
	const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent)?.includes(name));
	if (!found) throw new Error(`no button ${name}`);
	return found;
};

const mockStageBox = () => {
	query<HTMLElement>(".ihp-stage").getBoundingClientRect = () =>
		({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
};

const key = (target: Element, name: string, init: KeyboardEventInit = {}) =>
	act(async () => {
		target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));
	});

beforeEach(() => {
	listProducts.mockReset();
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
});

afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
});

describe("HotspotsField", () => {
	it("shows an empty state without an image and lets you choose one", async () => {
		await mount(null);
		expect(host.textContent).toContain("No image yet");
		expect(host.querySelector(".ihp-stage")).toBeNull();
		await act(async () => button("Choose image").click());
		await act(async () => query<HTMLButtonElement>("[data-testid=pick]").click());
		expect(latest?.image).toMatchObject({ id: "m9", provider: "local", width: 800, meta: { storageKey: "new.jpg" } });
	});

	it("renders the image with numbered markers positioned in percent", async () => {
		await mount(START);
		expect(query<HTMLImageElement>(".ihp-stage__img").getAttribute("src")).toBe("/_emdash/api/media/file/run.jpg");
		expect(query<HTMLElement>(".ihp-stage").style.getPropertyValue("--ihp-ratio")).toBe("2");
		expect(markers().map((marker) => [marker.textContent, marker.style.left, marker.style.top])).toEqual([
			["1", "40%", "40%"],
			["2", "60%", "60%"],
		]);
		expect(host.textContent).toContain("2 of 3 points");
	});

	it("shows a hint when there is an image but no points", async () => {
		await mount({ image: IMAGE, points: [] });
		expect(host.textContent).toContain("Click the image to add the first one");
	});

	it("adds a point where the image is clicked", async () => {
		await mount({ image: IMAGE, points: [] });
		mockStageBox();
		await act(async () => {
			query(".ihp-stage").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 100, clientY: 150 }));
		});
		expect(latest?.points).toEqual([{ id: "point-1", x: 25, y: 75 }]);
		expect(document.activeElement).toBe(markers()[0]);
	});

	it("does not add past maxPoints", async () => {
		await mount({ image: IMAGE, points: [...START.points, { id: "point-3", x: 1, y: 1 }] });
		mockStageBox();
		expect((button("Add point") as HTMLButtonElement).disabled).toBe(true);
		await act(async () => {
			query(".ihp-stage").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
		});
		expect(latest).toBeNull();
		expect(host.textContent).toContain("Maximum number of points reached");
	});

	it("adds a point from the keyboard with the Add point button", async () => {
		await mount({ image: IMAGE, points: [] });
		await act(async () => button("Add point").click());
		expect(latest?.points).toEqual([{ id: "point-1", x: 50, y: 50 }]);
	});

	it("moves a focused point with the arrow keys, 5% with Shift", async () => {
		await mount(START);
		const first = markers()[0]!;
		first.focus();
		await key(first, "ArrowRight");
		expect(latest?.points[0]).toMatchObject({ x: 41, y: 40 });
		await key(markers()[0]!, "ArrowDown", { shiftKey: true });
		expect(latest?.points[0]).toMatchObject({ x: 41, y: 45 });
		expect(host.querySelector("[role=status]")?.textContent).toBe("Point 1 at 41% across, 45% down");
	});

	it("deletes a focused point with the Delete key and moves focus to a neighbour", async () => {
		await mount(START);
		await key(markers()[0]!, "Delete");
		expect(latest?.points.map((point) => point.id)).toEqual(["point-2"]);
		expect(document.activeElement).toBe(markers()[0]);
	});

	it("drags a point with the pointer", async () => {
		await mount(START);
		mockStageBox();
		const marker = markers()[0]!;
		marker.setPointerCapture = () => undefined;
		const fire = (type: string, clientX: number, clientY: number) =>
			act(async () => {
				marker.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY, button: 0 }));
			});
		await fire("pointerdown", 160, 80);
		await fire("pointermove", 200, 100);
		expect(latest?.points[0]).toMatchObject({ x: 50, y: 50 });
		await fire("pointermove", 9999, -50);
		expect(latest?.points[0]).toMatchObject({ x: 100, y: 0 });
		await fire("pointerup", 9999, -50);
		await fire("pointermove", 100, 100);
		expect(latest?.points[0]).toMatchObject({ x: 100, y: 0 });
	});

	it("edits coordinates in the list", async () => {
		await mount(START);
		const input = query<HTMLInputElement>("#field-x-point-1-x");
		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
			setter.call(input, "72.5");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(latest?.points[0]).toMatchObject({ x: 72.5, y: 40 });
	});

	it("reorders and deletes from the list", async () => {
		await mount(START);
		await act(async () => button("Move down: Point 1").click());
		expect(latest?.points.map((point) => point.id)).toEqual(["point-2", "point-1"]);
		await act(async () => button("Delete point: Point 1").click());
		expect(latest?.points.map((point) => point.id)).toEqual(["point-1"]);
	});

	it("edits title, text and side in callouts mode", async () => {
		await mount(START);
		const setValue = async (selector: string, proto: object, value: string, event: string) => {
			const element = query<HTMLInputElement>(selector);
			await act(async () => {
				Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
				element.dispatchEvent(new Event(event, { bubbles: true }));
			});
		};
		await setValue("#field-x-point-1-title", HTMLInputElement.prototype, "Wind blocking ", "input");
		expect(latest?.points[0]?.title).toBe("Wind blocking ");
		await setValue("#field-x-point-1-text", HTMLTextAreaElement.prototype, "Light membrane", "input");
		expect(latest?.points[0]?.text).toBe("Light membrane");
		await setValue("#field-x-point-1-side", HTMLSelectElement.prototype, "end", "change");
		expect(latest?.points[0]?.side).toBe("end");
		expect(query<HTMLElement>(".ihp-marker").getAttribute("aria-label")).toContain("Wind blocking");
	});

	it("removes the image but keeps the points", async () => {
		await mount(START);
		await act(async () => button("Remove image").click());
		expect(latest?.image).toBeNull();
		expect(latest?.points).toHaveLength(2);
	});

	it("tolerates a garbage stored value", async () => {
		await mount("{nope");
		expect(host.textContent).toContain("No image yet");
	});
});

describe("HotspotsField in products mode", () => {
	const products = [
		{ slug: "run-cap", status: "published", data: { title: "Run Cap" } },
		{ slug: "pace-shorts", status: "draft", data: { title: "Pace Shorts" } },
	];

	it("lists products, filters them and stores the chosen slug", async () => {
		listProducts.mockResolvedValue({ items: products, total: 2 });
		await mount({ image: IMAGE, points: [{ id: "point-1", x: 1, y: 1 }] }, { mode: "products", maxPoints: 6 });
		expect(listProducts).toHaveBeenCalledWith("products", expect.objectContaining({ limit: 100 }));
		expect(host.querySelector("#field-x-point-1-title")).toBeNull();

		await act(async () => button("Choose product").click());
		expect(host.textContent).toContain("Run Cap");
		expect(host.textContent).toContain("draft");
		const search = query<HTMLInputElement>("input[type=search]");
		await act(async () => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "pace");
			search.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(host.querySelector(".ihp-product__list")?.textContent).not.toContain("Run Cap");
		await act(async () => button("Pace Shorts").click());
		expect(latest?.points[0]?.productSlug).toBe("pace-shorts");
		expect(host.querySelector(".ihp-product__name")?.textContent).toBe("Pace Shorts");
	});

	it("flags a stored slug that is not in the catalogue and can clear it", async () => {
		listProducts.mockResolvedValue({ items: products, total: 2 });
		await mount({ image: IMAGE, points: [{ id: "point-1", x: 1, y: 1, productSlug: "gone" }] }, { mode: "products", maxPoints: 6 });
		expect(host.textContent).toContain("Not in the product list");
		await act(async () => button("Clear").click());
		expect(latest?.points[0]).toEqual({ id: "point-1", x: 1, y: 1 });
	});

	it("shows an error with a retry when products cannot load", async () => {
		listProducts.mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ items: products, total: 2 });
		await mount({ image: IMAGE, points: [{ id: "point-1", x: 1, y: 1 }] }, { mode: "products", maxPoints: 6 });
		await act(async () => button("Choose product").click());
		expect(host.querySelector("[role=alert]")?.textContent).toContain("could not be loaded");
		await act(async () => button("Retry").click());
		expect(host.textContent).toContain("Run Cap");
	});
});
