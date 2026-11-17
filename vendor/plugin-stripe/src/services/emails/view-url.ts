import type { CommerceContainer } from "../../plugin/container.js";
import { issueAccessToken } from "../access-tokens.js";
import { CommerceError } from "../../core/errors.js";

/** `emails.orderViewPath` with `{TOKEN}` replaced (a site path is resolved against the site URL). */
export const buildViewUrl = (container: CommerceContainer, token: string): string => {
	const path = container.options.emails.orderViewPath.replace("{TOKEN}", encodeURIComponent(token));
	return new URL(path, container.siteUrl).toString();
};

/** A signed link to one order; falls back to the site root (logged) when no token secret is configured yet. */
export const viewUrlForOrder = async (container: CommerceContainer, orderId: string): Promise<string> => {
	try {
		return buildViewUrl(container, await issueAccessToken(container, orderId));
	} catch (error) {
		if (error instanceof CommerceError && error.kind === "notConfigured") {
			container.log.warn("Order link falls back to the site root: no access token secret is configured");
			return new URL("/", container.siteUrl).toString();
		}
		throw error;
	}
};
