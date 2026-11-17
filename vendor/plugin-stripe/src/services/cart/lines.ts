import type { CartLine } from "../../core/cart.js";
import { CommerceError } from "../../core/errors.js";

export interface LineLimits {
	maxLines: number;
	maxQuantityPerLine: number;
}

export type LineChange = { priceId: string; quantity: number; mode: "add" | "set" } | { priceId: string; mode: "remove" };

/**
 * Applies one line change to a line list. Pure: limits are checked here, so a rejected change never
 * reaches storage. A quantity of 0 with `set` (or a remove) deletes the line; `add` of 0 changes nothing.
 */
export const applyLineChange = (lines: readonly CartLine[], change: LineChange, limits: LineLimits, nowIso: string): CartLine[] => {
	const existing = lines.find((line) => line.priceId === change.priceId);
	const others = lines.filter((line) => line.priceId !== change.priceId);
	if (change.mode === "remove") return others;
	const quantity = change.mode === "add" ? (existing?.quantity ?? 0) + change.quantity : change.quantity;
	if (quantity === 0) return others;
	if (quantity > limits.maxQuantityPerLine) {
		throw new CommerceError("invalidInput", `At most ${limits.maxQuantityPerLine} per item.`, { maxQuantityPerLine: limits.maxQuantityPerLine });
	}
	if (!existing && lines.length >= limits.maxLines) {
		throw new CommerceError("invalidInput", `A cart holds at most ${limits.maxLines} different items.`, { maxLines: limits.maxLines });
	}
	const next: CartLine = { priceId: change.priceId, quantity, addedAt: existing?.addedAt ?? nowIso };
	// Keep the original position of an existing line so the storefront list does not reshuffle.
	return existing ? lines.map((line) => (line.priceId === change.priceId ? next : line)) : [...lines, next];
};

export const sameLines = (a: readonly CartLine[], b: readonly CartLine[]): boolean =>
	a.length === b.length && a.every((line, index) => line.priceId === b[index]?.priceId && line.quantity === b[index]?.quantity);
