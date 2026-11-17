/**
 * The one door to native EmDash relations (edges in `_emdash_content_references`). Relation-bound fields have no
 * column: `ctx.content` cannot write or read them, so every link between two plugin collections goes through this
 * port. Fields are addressed by collection slug + entry id + field slug (the field names the relation and the side).
 *
 * Semantics shared by the EmDash implementation (emdash-relations.ts) and the in-memory one
 * (testing/in-memory/relations.ts), pinned by the contract in testing/contracts/relations.contract.ts:
 * - a write replaces the WHOLE set of a field and is visible immediately (no draft staging); a parent's children keep
 *   the given order, whereas a child's parents have no meaningful order (EmDash lists them by edge id);
 * - a live read (`includeDrafts: false`) hides unpublished entries;
 * - a read returns at most one page (`RELATIONS_PAGE_SIZE`); `hasMore` says the rest was cut off;
 * - failures throw `RelationError`.
 */

/** EmDash returns one page of an entry's links per read (`RelationRepository.getChildrenPageById`). */
export const RELATIONS_PAGE_SIZE = 50;

export const RELATION_ERROR = {
	/** The entry, a selected entry or the relation does not exist. */
	notFound: "notFound",
	/** The selection breaks a rule (field is not a relation field, limit exceeded, wrong collection, required empty). */
	invalid: "invalid",
	/** Anything else the host reported. */
	failed: "failed",
} as const;
export type RelationErrorKind = (typeof RELATION_ERROR)[keyof typeof RELATION_ERROR];

export class RelationError extends Error {
	readonly kind: RelationErrorKind;
	/** EmDash's own error code (`NOT_FOUND`, `VALIDATION_ERROR`, …) or a plugin one for the in-memory port. */
	readonly code: string;

	constructor(kind: RelationErrorKind, code: string, message: string) {
		super(message);
		this.name = "RelationError";
		this.kind = kind;
		this.code = code;
	}
}

/** An entry on the far side of a link. */
export interface RelationEntry {
	id: string;
	slug: string | null;
	collection: string;
	/** The collection's title field, then `title`, then `name`; null when none is set. */
	title: string | null;
	/** The link's position among the children of its parent (a parent's children: 0, 1, 2…; a child's parent: where the child sits in it). */
	sortOrder: number | null;
}

export interface RelationReadOptions {
	/** True also returns unpublished entries (admin and plugin-internal reads); false is a public, live read. */
	includeDrafts: boolean;
}

export interface RelationPage {
	items: RelationEntry[];
	/** True when the field holds more links than one page; the rest cannot be read through this port. */
	hasMore: boolean;
}

export interface RelationsPort {
	/** The entries a field links to, in order (a parent-side field: its children; a child-side field: its parents). */
	children(collection: string, id: string, field: string, options: RelationReadOptions & { limit?: number }): Promise<RelationPage>;
	/**
	 * Several fields of one entry in one read (the host loads every relation of an entry at once, so this costs the same
	 * as one `children`). A field that is not a relation field throws like `children` does.
	 */
	fields(collection: string, id: string, fields: readonly string[], options: RelationReadOptions & { limit?: number }): Promise<Record<string, RelationPage>>;
	/** The single entry a single-valued field links to, or null when it links to none. */
	parentOf(collection: string, id: string, field: string, options: RelationReadOptions): Promise<RelationEntry | null>;
	/** Replaces the field's whole set with `ids`, in this order. `[]` clears it. */
	setChildren(collection: string, id: string, field: string, ids: readonly string[]): Promise<void>;
	/** Sets (or, with null, clears) a single-valued field. */
	setParent(collection: string, id: string, field: string, parentId: string | null): Promise<void>;
	/**
	 * Creates an entry together with its links in one write. For records the plugin owns (the host's content hooks and
	 * draft staging are bypassed). `references` maps field slug to ordered entry ids.
	 */
	createWithReferences(collection: string, input: CreateWithReferencesInput, references: Readonly<Record<string, readonly string[]>>): Promise<{ id: string }>;
}

export interface CreateWithReferencesInput {
	data: Record<string, unknown>;
	slug?: string | null;
	/** `published` for records that need no review (orders, order events); omitted lets the host choose. */
	status?: string;
}
