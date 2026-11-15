export const CART_UPDATED_EVENT = "cart:updated" as const;

export interface CartUpdatedDetail {
	count: number;
}

export interface CartLineItem {
	quantity?: number;
}

export const sumCartQuantities = (items: readonly CartLineItem[]): number =>
	items.reduce((total, item) => total + (item.quantity ?? 0), 0);

export const dispatchCartUpdated = (count: number): void => {
	document.dispatchEvent(
		new CustomEvent<CartUpdatedDetail>(CART_UPDATED_EVENT, {
			detail: { count },
		}),
	);
};
