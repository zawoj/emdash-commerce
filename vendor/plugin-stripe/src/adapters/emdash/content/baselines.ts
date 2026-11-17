import type { ContentAccess } from "emdash";

import type { BaselineLoader } from "../schema/guard.js";

/**
 * Stored states of an entry an unchanged field may equal: the live columns, plus the latest draft
 * revision on collections that keep revisions (`content:revisions:read` makes `getRevision` available).
 */
export const createBaselineLoader =
	(content: ContentAccess | undefined): BaselineLoader =>
	async (collection, id) => {
		if (!content) return [];
		const item = await content.get(collection, id);
		if (!item) return [];
		const baselines: Array<Record<string, unknown>> = [item.data];
		if (item.draftRevisionId && content.getRevision) {
			const draft = await content.getRevision(collection, id, item.draftRevisionId).catch(() => null);
			if (draft) baselines.push(draft.data);
		}
		return baselines;
	};
