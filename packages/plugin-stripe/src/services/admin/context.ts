import type { CommerceContainer } from "../../plugin/container.js";
import { createEventPublisher } from "../outbox.js";
import type { EventPublisher } from "../contracts.js";

/** The authenticated caller of an admin route, as EmDash attests it (`ctx.user`). */
export interface AdminCaller {
	id: string;
	email: string;
}

/** Recorded on refunds: who asked. Both parts are kept so an audit survives an email change. */
export const callerLabel = (caller: AdminCaller | null | undefined): string | null => (caller ? `${caller.email} (${caller.id})` : null);

/** What every admin use case needs: the container and a publisher bound to it. */
export interface AdminContext {
	container: CommerceContainer;
	publisher: EventPublisher;
}

export const createAdminContext = (container: CommerceContainer): AdminContext => {
	return { container, publisher: createEventPublisher(container) };
};
