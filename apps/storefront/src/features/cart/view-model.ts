import type { CartLineContent, OrderSummaryProps } from "@emdash-commerce/design-system";
import { noticeTones } from "@emdash-commerce/design-system/components/atoms/inline-notice/variants.ts";
import type { CartView } from "@emdash-commerce/plugin-stripe/contracts";

import type { Locale } from "../../lib/i18n";
import { formatMoney } from "../../lib/money";
import type { CartCopy } from "./copy";
import { lineContents } from "./summary";
import type { ImageAttrs } from "@emdash-commerce/design-system";

const CART_SUBTOTAL_TEST_ID = "cart-subtotal";

export interface CartPageModel {
	isEmpty: boolean;
	lines: CartLineContent[];
	summary: Pick<OrderSummaryProps, "heading" | "headingLevel" | "linesLabel" | "lines" | "rows" | "total">;
	isCheckoutReady: boolean;
	alertText: string | null;
}

const globalIssueText = (cart: CartView): string | null => {
	const wide = cart.issues.filter((issue) => issue.priceId === null).map((issue) => issue.message);
	return wide.length > 0 ? wide.join(" ") : null;
};

/** Applies per-line cart issues onto already-shaped line props (dims unavailable lines, keeps quantity stepper locked). */
export const applyCartIssues = (lines: CartLineContent[], cart: CartView, copy: CartCopy): CartLineContent[] =>
	lines.map((line) => {
		const issue = cart.issues.find((item) => item.priceId === line.id);
		if (!issue) return line;
		return {
			...line,
			isUnavailable: true,
			unavailableText: issue.message,
			notice: { tone: noticeTones.warning, text: issue.message, toneLabel: copy.warningLabel },
		};
	});

/** Shapes the plugin cart into design-system props for the full cart page (and its HTML fragment). */
export const cartPageOf = (
	cart: CartView,
	locale: Locale,
	copy: CartCopy,
	slugByProductId: ReadonlyMap<string, string>,
	imageByPriceId: ReadonlyMap<string, ImageAttrs>,
): CartPageModel => {
	const isEmpty = cart.lines.length === 0;
	const baseLines = lineContents(cart, locale, slugByProductId, imageByPriceId);
	const lines = applyCartIssues(baseLines, cart, copy);
	const subtotalLabel = cart.subtotal ? formatMoney(cart.subtotal.amount, locale, cart.subtotal.currency) : "—";
	const summaryLines = lines.map((line) => ({
		name: line.name.label,
		variantText: line.variantText,
		quantityLabel: String(line.quantity.value),
		price: line.linePrice.label,
		image: line.image,
	}));
	return {
		isEmpty,
		lines,
		summary: {
			heading: copy.summaryHeading,
			headingLevel: 2,
			linesLabel: copy.linesLabel,
			lines: summaryLines,
			rows: [{ label: copy.subtotal, value: subtotalLabel, testId: CART_SUBTOTAL_TEST_ID }],
			total: { label: copy.total, value: subtotalLabel },
		},
		isCheckoutReady: cart.isCheckoutReady,
		alertText: globalIssueText(cart),
	};
};