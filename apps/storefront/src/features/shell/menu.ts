import type { ChromeLink, ChromeMenuItem } from "@emdash-commerce/design-system";
import type { ShellCopy } from "./copy";

interface EmdashMenuItem {
	label: string;
	url: string;
	target?: string | null;
}

const TRAILING_SLASH = /\/$/;

const normalizePath = (path: string): string =>
	path.replace(TRAILING_SLASH, "") || "/";

const hrefPath = (url: string, origin: string): string | null => {
	try {
		const target = new URL(url, origin);
		return normalizePath(target.pathname);
	} catch {
		return null;
	}
};

const isCurrentPath = (
	itemUrl: string,
	currentPath: string,
	origin: string,
): boolean => {
	const path = hrefPath(itemUrl, origin);
	if (!path) return false;
	if (path === currentPath) return true;
	return path !== "/" && currentPath.startsWith(`${path}/`);
};

export const fallbackMenu = (copy: ShellCopy): ChromeMenuItem[] => [
	{ label: copy.homeLabel, href: "/" },
	{ label: copy.shop, href: "/shop" },
	{ label: copy.blog, href: "/posts" },
];

export const emdashMenuToChrome = (
	items: readonly EmdashMenuItem[],
	currentPath: string,
	origin: string,
): ChromeMenuItem[] =>
	items.map((item) => ({
		label: item.label,
		href: item.url,
		isNewTab: item.target === "_blank",
		isCurrent: isCurrentPath(item.url, currentPath, origin),
	}));

export const footerNavigateColumn = (
	heading: string,
	links: readonly ChromeLink[],
) => ({ heading, links });

const shopPath = (origin: string): string => normalizePath(new URL("/shop", origin).pathname);

/** Ensures `/shop` is in the header nav when the CMS menu omits it (seeded blog menus). */
export const menuWithShopLink = (
	items: readonly ChromeMenuItem[],
	shopLabel: string,
	currentPath: string,
	origin: string,
): ChromeMenuItem[] => {
	const hasShop = items.some((item) => hrefPath(item.href, origin) === shopPath(origin));
	if (hasShop) return [...items];
	const shopItem: ChromeMenuItem = {
		label: shopLabel,
		href: "/shop",
		isCurrent: currentPath === "/shop" || currentPath.startsWith("/shop/"),
	};
	const homeIndex = items.findIndex((item) => hrefPath(item.href, origin) === "/");
	const insertAt = homeIndex >= 0 ? homeIndex + 1 : 0;
	return [...items.slice(0, insertAt), shopItem, ...items.slice(insertAt)];
};
