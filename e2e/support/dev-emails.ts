import { expect, type APIRequestContext } from "@playwright/test";

/**
 * EmDash keeps the emails a dev server "sends" in memory and lists them at `/_emdash/api/dev/emails`; that endpoint
 * needs the dev login (`/_emdash/api/auth/dev-bypass`), and the request context keeps its cookie.
 */
export interface DevEmail {
	to: string;
	subject: string;
	text: string;
	html: string;
}

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const toDevEmail = (raw: unknown): DevEmail => {
	const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
	const message = typeof record.message === "object" && record.message !== null ? (record.message as Record<string, unknown>) : record;
	return { to: asString(message.to), subject: asString(message.subject), text: asString(message.text), html: asString(message.html) };
};

export const signInToDevServer = async (request: APIRequestContext): Promise<void> => {
	const response = await request.get("/_emdash/api/auth/dev-bypass");
	expect(response.ok(), "the dev login must work on the e2e server").toBe(true);
};

/** Newest first, as the server lists them. The list is `{ data: { items: [{ message: { to, subject, text, html } }] } }`. */
export const listDevEmails = async (request: APIRequestContext): Promise<DevEmail[]> => {
	const response = await request.get("/_emdash/api/dev/emails");
	expect(response.ok()).toBe(true);
	const body: unknown = await response.json();
	const data = typeof body === "object" && body !== null && "data" in body ? (body as { data: unknown }).data : undefined;
	const items = typeof data === "object" && data !== null && "items" in data ? (data as { items: unknown }).items : undefined;
	return Array.isArray(items) ? items.map(toDevEmail) : [];
};

const ORDER_LINK = /https?:\/\/[^\s"'<>]+\/orders\/view\?token=[A-Za-z0-9._~-]+/;

/** The `/orders/view?token=...` link in an email body, as a path the test server serves. */
export const orderLinkOf = (email: DevEmail): string | undefined => {
	const match = ORDER_LINK.exec(email.text) ?? ORDER_LINK.exec(email.html);
	if (!match) return undefined;
	const url = new URL(match[0]);
	return `${url.pathname}${url.search}`;
};

/** Polls the dev mailbox until an email to `to` that matches `predicate` shows up. */
export const waitForEmail = async (request: APIRequestContext, to: string, predicate: (email: DevEmail) => boolean = () => true): Promise<DevEmail> => {
	let found: DevEmail | undefined;
	await expect
		.poll(
			async () => {
				found = (await listDevEmails(request)).find((email) => email.to.toLowerCase() === to.toLowerCase() && predicate(email));
				return found !== undefined;
			},
			{ message: `no matching email to ${to} in the dev mailbox`, timeout: 30_000 },
		)
		.toBe(true);
	if (!found) throw new Error(`no email to ${to}`);
	return found;
};
