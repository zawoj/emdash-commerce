import { CART_EVENTS } from "../constants";

export interface CartChangedDetail {
	readonly count: number;
	readonly shouldOpenDrawer?: boolean;
	readonly isFromSummary?: boolean;
}

export const announceCartChange = (detail: CartChangedDetail): void => {
	document.dispatchEvent(new CustomEvent<CartChangedDetail>(CART_EVENTS.changed, { detail }));
};

export const openMiniCart = (): void => {
	document.dispatchEvent(new CustomEvent(CART_EVENTS.open));
};

export const pageLocale = (): string => document.documentElement.lang || "en";

export interface LineResponse {
	ok: boolean;
	count?: number;
	message?: string;
}
