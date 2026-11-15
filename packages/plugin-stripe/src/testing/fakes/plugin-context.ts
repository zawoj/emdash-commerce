import type { PluginContext, RouteContext } from "emdash";

import { PLUGIN_ID, PLUGIN_VERSION } from "../../adapters/emdash/constants.js";
import { buildRelationDefinitions, type CollectionDefinition, type RelationDefinition } from "../../adapters/emdash/schema/collections/index.js";
import { commerceOptionsSchema } from "../../contracts/options.js";
import { createInMemoryRelations, type InMemoryRelations } from "../in-memory/relations.js";
import { storageDeclaration } from "../../adapters/emdash/storage/declaration.js";
import { createFakeContent, type FakeContent } from "./content.js";
import { createFakeKv, createFakeStorage, type FakeStorageCollection } from "./storage.js";

export interface FakePluginContext extends PluginContext {
	content: FakeContent;
	fakeStorage: Record<string, FakeStorageCollection>;
	/** Links between the fake content's entries; pass it to the container as `deps.relations`. */
	fakeRelations: InMemoryRelations;
	logs: Array<{ level: string; message: string; data: unknown }>;
	sentEmails: Array<{ to: string; subject: string }>;
}

/**
 * A `PluginContext` for tests: fake content (validated against the plugin's collection definitions), storage
 * collections with exactly the declared indexes, KV and settings with compare-and-set, and a captured log.
 */
export const createFakePluginContext = (
	definitions: readonly CollectionDefinition[],
	over: { settings?: Record<string, string>; relations?: readonly RelationDefinition[] } = {},
): FakePluginContext => {
	const logs: FakePluginContext["logs"] = [];
	const log = (level: string) => (message: string, data?: unknown) => void logs.push({ level, message, data });
	const fakeStorage = Object.fromEntries(
		Object.entries(storageDeclaration).map(([name, config]) => [name, createFakeStorage({ indexes: [...config.indexes] })]),
	);
	const settings = createFakeKv();
	for (const [key, value] of Object.entries(over.settings ?? {})) void settings.set(key, value);
	const sentEmails: FakePluginContext["sentEmails"] = [];
	const content = createFakeContent(definitions);
	const relations = over.relations ?? buildRelationDefinitions(commerceOptionsSchema.parse({}).collections);
	const fakeRelations = createInMemoryRelations(
		{ collections: [...definitions], relations: [...relations] },
		{ lookup: (collection, id) => content.entryInfo(collection, id), createEntry: (collection, input) => content.createRaw(collection, input.data, { status: input.status, slug: input.slug }) },
	);
	return {
		plugin: { id: PLUGIN_ID, version: PLUGIN_VERSION },
		storage: fakeStorage,
		fakeStorage,
		kv: createFakeKv(),
		settings,
		content,
		fakeRelations,
		log: { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") },
		logs,
		sentEmails,
		site: { name: "Test site", url: "https://shop.example", locale: "en" },
		url: (path: string) => `https://shop.example${path}`,
		email: {
			async send(message: { to: string; subject: string }) {
				sentEmails.push({ to: message.to, subject: message.subject });
			},
		},
	} as unknown as FakePluginContext;
};

export const createFakeRouteContext = (
	base: PluginContext,
	over: { method?: string; url?: string; headers?: Record<string, string>; input?: unknown; ip?: string | null } = {},
): RouteContext => {
	const request = new Request(over.url ?? "https://shop.example/_emdash/api/plugins/stripe-commerce/x", {
		method: over.method ?? "GET",
		headers: over.headers,
	});
	return {
		...base,
		input: over.input,
		request,
		requestMeta: { ip: over.ip === undefined ? "203.0.113.9" : over.ip, userAgent: "vitest", referer: null, geo: null },
	} as RouteContext;
};

export type { FakeContent };
