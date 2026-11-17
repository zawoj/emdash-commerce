export interface AccessLinkInput {
	email: string;
	orderNumber: string;
}

const hasJsonBody = (request: Request): boolean => request.headers.get("content-type")?.includes("application/json") === true;

const isAccessLinkInput = (value: unknown): value is AccessLinkInput =>
	typeof value === "object" &&
	value !== null &&
	"email" in value &&
	"orderNumber" in value &&
	typeof value.email === "string" &&
	typeof value.orderNumber === "string";

/**
 * The email and order number of a guest order-link request: JSON (the lookup page's script) or a urlencoded or
 * multipart form (the page without script). A body can be read once, so the reader is chosen by content type; trying
 * `formData()` first consumed a JSON body and every scripted lookup answered 400. `null` when the body is unusable.
 */
export const readAccessLinkInput = async (request: Request): Promise<AccessLinkInput | null> => {
	if (hasJsonBody(request)) {
		const json: unknown = await request.json().catch(() => null);
		return isAccessLinkInput(json) ? json : null;
	}
	const form = await request.formData().catch(() => null);
	if (!form) return null;
	return { email: String(form.get("email") ?? ""), orderNumber: String(form.get("orderNumber") ?? "") };
};
