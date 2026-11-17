import type { EventSubscriber } from "../../contracts/extensions.js";
import type { CommerceEventType } from "../../core/events.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { createEmailSubscriber } from "./emails.js";

/**
 * Built-in subscribers. They go through the same registry as a site's `extensions.subscribers`, so the outbox
 * gives them the same delivery state, retries and dead-lettering, keyed by their stable ids. They are built per
 * container because they need its ports (orders, mailer, options).
 */
export const builtInSubscribers = (container: CommerceContainer): EventSubscriber<CommerceEventType>[] => [
	createEmailSubscriber(container) as unknown as EventSubscriber<CommerceEventType>,
];
