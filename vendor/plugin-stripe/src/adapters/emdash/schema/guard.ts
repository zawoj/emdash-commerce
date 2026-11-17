import type { CollectionPolicy } from "./protected-fields.js";

/**
 * `content:beforeSave` guard: rejects an editor's change to a protected field and an editor's creation of
 * a plugin-owned record.
 *
 * Who is an editor: EmDash passes `event.actor` for every authenticated save (admin UI, REST, MCP) and
 * leaves it out for internal writes (`ctx.content.create` from a plugin; `update` and `delete` fire no
 * hook at all). So "has an actor" means "not the plugin" (emdash-runtime.ts handleContentCreate/Update,
 * plugins/hooks.ts runContentBeforeSave).
 *
 * "Changed" is judged against the stored entry: an editor's form re-submits unchanged read-only fields, so
 * only a different value is a violation. A collection that keeps revisions stages plugin writes into a draft
 * revision while the columns hold the published data, so the guard accepts a value equal to ANY baseline
 * the loader returns (live columns and the draft revision).
 */

export interface GuardSaveEvent {
	collection: string;
	isNew: boolean;
	id?: string;
	actor?: { id: string };
	content: Record<string, unknown>;
}

/** Stored states an unchanged field may equal: live data, plus the draft revision when there is one. */
export type BaselineLoader = (collection: string, id: string) => Promise<Array<Record<string, unknown>>>;

/** EmDash shows this message to the editor; it recognises the error by its name. */
export class SaveRejectedError extends Error {
	override readonly name = "ContentSaveRejectedError";
}

const isEmptyish = (value: unknown): boolean =>
	value === undefined ||
	value === null ||
	value === "" ||
	value === false ||
	value === 0 ||
	(Array.isArray(value) && value.length === 0);

const canonical = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (typeof value === "object" && value !== null) {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => a.localeCompare(b));
		return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
	}
	return JSON.stringify(value);
};

export const isSameValue = (stored: unknown, submitted: unknown): boolean => {
	if (isEmptyish(stored) && isEmptyish(submitted)) return true;
	return canonical(stored) === canonical(submitted);
};

export const createProtectedFieldGuard = (policies: Readonly<Record<string, CollectionPolicy>>, loadBaselines: BaselineLoader) =>
	async (event: GuardSaveEvent): Promise<void> => {
		const policy = policies[event.collection];
		if (!policy || !event.actor) return;

		if (event.isNew) {
			if (policy.isCreationLocked) {
				throw new SaveRejectedError(`${policy.label} are created by the commerce plugin and cannot be added by hand.`);
			}
			const forged = policy.protectedFields.filter((field) => !isEmptyish(event.content[field]));
			if (forged.length > 0) throw new SaveRejectedError(rejection(policy, forged));
			return;
		}

		const lock = policy.managedLock;
		const guardsManaged = lock !== undefined && lock.lockedFields.some((field) => Object.hasOwn(event.content, field));
		const submitted = policy.protectedFields.filter((field) => Object.hasOwn(event.content, field));
		if (submitted.length === 0 && !guardsManaged) return;
		const loaded = event.id ? await loadBaselines(event.collection, event.id) : [];
		const baselines = loaded.length > 0 ? loaded : [{}];
		const isChanged = (field: string): boolean => !baselines.some((baseline) => isSameValue(baseline[field], event.content[field]));
		const changed = submitted.filter(isChanged);
		if (changed.length > 0) throw new SaveRejectedError(rejection(policy, changed));
		// A managed entry (by its stored flag) refuses any change to its terms, whatever the form re-submits.
		if (lock && baselines.some((baseline) => asFlag(baseline[lock.flagField]))) {
			const lockedChanges = lock.lockedFields.filter((field) => Object.hasOwn(event.content, field) && isChanged(field));
			if (lockedChanges.length > 0) throw new SaveRejectedError(`${lock.message} (${lockedChanges.map((field) => `"${field}"`).join(", ")})`);
		}
	};

const asFlag = (value: unknown): boolean => value === true || value === 1 || value === "1" || value === "true";

const rejection = (policy: CollectionPolicy, fields: readonly string[]): string =>
	`${fields.length === 1 ? "Field" : "Fields"} ${fields.map((field) => `"${field}"`).join(", ")} of ${policy.label.toLowerCase()} ${fields.length === 1 ? "is" : "are"} managed by the commerce plugin and cannot be edited.`;
