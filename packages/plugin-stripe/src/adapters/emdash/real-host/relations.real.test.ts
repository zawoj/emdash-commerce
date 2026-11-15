import { handleContentCreate, handleContentUpdate } from "emdash";
import { describe, expect, it } from "vitest";

import { relationsContract, RELATIONS_TEST_SCHEMA } from "../../../testing/contracts/relations.contract.js";
import { createEmDashRelations } from "../relations/emdash-relations.js";
import { reconcileSchema } from "../schema/reconcile.js";
import { createRegistryPortFor } from "../schema/registry-port.js";
import { createRealDatabase } from "./host.js";

relationsContract("EmDash handlers on SQLite", async () => {
	const db = await createRealDatabase();
	await reconcileSchema(createRegistryPortFor(db as never), RELATIONS_TEST_SCHEMA);
	return {
		port: createEmDashRelations(async () => db as never),
		entry: async (collection, name, options = {}) => {
			const created = await handleContentCreate(db as never, collection, { data: { name }, status: options.isPublished === false ? "draft" : "published" });
			if (!created.success) throw new Error(created.error.message);
			return created.data.item.id;
		},
		setPublished: async (collection, id, isPublished) => {
			const updated = await handleContentUpdate(db as never, collection, id, { status: isPublished ? "published" : "draft" });
			if (!updated.success) throw new Error(updated.error.message);
		},
	};
});

