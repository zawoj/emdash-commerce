import type { PluralLabelForms } from "@emdash-commerce/design-system/plural-label";

import type { ShellCopy, ShellLocale } from "./copy";

export interface CartCountLabel {
	labelTemplate: string;
	labelForms: PluralLabelForms;
	locale: ShellLocale;
}

/** The spoken cart count ("1 item in the cart", "5 items in the cart") in every plural form of the shell language. */
export const cartCountLabelOf = (copy: ShellCopy, locale: ShellLocale): CartCountLabel => ({
	labelTemplate: copy.cartCountTemplate,
	labelForms: { one: copy.cartCountOne, few: copy.cartCountFew, many: copy.cartCountMany },
	locale,
});
