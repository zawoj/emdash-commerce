import type { TabBarItem } from "@emdash-commerce/design-system";
import {
	tabBarActions,
	tabBarIcons,
} from "@emdash-commerce/design-system/components/chrome/tab-bar/variants.ts";
import { drawerIdOf, SEARCH_DIALOG_ID } from "@emdash-commerce/design-system/site-header-ids";
import { cartCountLabelOf } from "./cart-count";
import type { ShellCopy, ShellLocale } from "./copy";

export const MINI_CART_ID = "mini-cart";

const activeTabOf = (pathname: string): (typeof tabBarIcons)[keyof typeof tabBarIcons] | null => {
	if (pathname === "/") return tabBarIcons.home;
	if (pathname.startsWith("/shop")) return tabBarIcons.categories;
	if (pathname.startsWith("/search")) return tabBarIcons.search;
	if (pathname.startsWith("/cart") || pathname.startsWith("/checkout")) return tabBarIcons.cart;
	if (pathname.startsWith("/posts")) return tabBarIcons.account;
	return null;
};

export const tabBarItemsForSite = (copy: ShellCopy, pathname: string, locale: ShellLocale): TabBarItem[] => {
	const active = activeTabOf(pathname);
	const isCurrent = (icon: (typeof tabBarIcons)[keyof typeof tabBarIcons]): boolean =>
		active === icon;

	return [
		{
			icon: tabBarIcons.home,
			label: copy.tabHome,
			href: "/",
			action: tabBarActions.link,
			isCurrent: isCurrent(tabBarIcons.home),
		},
		{
			icon: tabBarIcons.categories,
			label: copy.tabCategories,
			href: "/shop",
			action: tabBarActions.drawer,
			controls: drawerIdOf(),
			isCurrent: isCurrent(tabBarIcons.categories),
		},
		{
			icon: tabBarIcons.search,
			label: copy.tabSearch,
			href: "/search",
			action: tabBarActions.search,
			controls: SEARCH_DIALOG_ID,
			isCurrent: isCurrent(tabBarIcons.search),
		},
		{
			icon: tabBarIcons.cart,
			label: copy.tabCart,
			href: "/cart",
			action: tabBarActions.miniCart,
			controls: MINI_CART_ID,
			isCurrent: isCurrent(tabBarIcons.cart),
			badge: { count: 0, ...cartCountLabelOf(copy, locale) },
		},
		{
			icon: tabBarIcons.account,
			label: copy.tabAccount,
			href: "/posts",
			action: tabBarActions.link,
			isCurrent: isCurrent(tabBarIcons.account),
		},
	];
};
