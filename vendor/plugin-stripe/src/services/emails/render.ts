import type { EmailMessage, EmailRenderers } from "../../contracts/extensions.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { errorMessage } from "../payments/async.js";
import { defaultEmailRenderers } from "./defaults.js";

type RendererName = keyof EmailRenderers;
type RendererInput<K extends RendererName> = Parameters<NonNullable<EmailRenderers[K]>>[0];

const isMessage = (value: unknown): value is EmailMessage => {
	if (typeof value !== "object" || value === null) return false;
	const message = value as Partial<EmailMessage>;
	return typeof message.subject === "string" && message.subject.length > 0 && typeof message.text === "string" && (message.html === null || typeof message.html === "string");
};

/**
 * The site's renderer when it gave one, otherwise the built-in template. A site renderer that throws or returns
 * something that is not an email falls back to the built-in one and is logged: a broken template must not
 * stop a buyer's confirmation.
 */
export const renderEmail = <K extends RendererName>(container: CommerceContainer, name: K, input: RendererInput<K>): EmailMessage => {
	const fallback = defaultEmailRenderers[name] as (input: RendererInput<K>) => EmailMessage;
	const override = container.extensions.emails?.[name] as ((input: RendererInput<K>) => EmailMessage) | undefined;
	if (!override) return fallback(input);
	try {
		const message = override(input);
		if (isMessage(message)) return message;
		container.log.error("Email renderer returned an invalid message; using the built-in template", { renderer: name });
	} catch (error) {
		container.log.error("Email renderer failed; using the built-in template", { renderer: name, error: errorMessage(error) });
	}
	return fallback(input);
};
