import { z } from "zod";

/**
 * The subset of Block Kit (`@emdash-cms/blocks`) the catalog editor panels use. Declared locally so the plugin does
 * not depend on the blocks package at runtime; the tests validate every rendered panel with the host's own validator.
 */

export interface OptionItem {
	label: string;
	value: string;
}

export type FormField =
	| { type: "checkbox"; action_id: string; label: string; options: OptionItem[]; initial_value?: string[] }
	| { type: "select"; action_id: string; label: string; options: OptionItem[]; initial_value?: string }
	| { type: "text_input"; action_id: string; label: string; initial_value?: string }
	| { type: "number_input"; action_id: string; label: string; initial_value?: number }
	| { type: "toggle"; action_id: string; label: string; initial_value?: boolean };

export interface LinkElement {
	type: "link";
	label: string;
	target: { kind: "content"; collection: string; id: string };
}

export interface TableColumn {
	key: string;
	label: string;
	format?: "text" | "badge" | "number" | "element";
}

export type PanelBlock =
	| { type: "header"; text: string }
	| { type: "context"; text: string }
	| { type: "banner"; title?: string; description?: string; variant?: "default" | "alert" | "error" }
	| { type: "form"; block_id: string; fields: FormField[]; submit: { label: string; action_id: string } }
	| { type: "table"; columns: TableColumn[]; rows: Array<Record<string, unknown>>; page_action_id: string; empty_text?: string };

export interface PanelResponse {
	blocks: PanelBlock[];
	toast?: { message: string; type: "success" | "error" | "info" };
	refresh?: true;
}

/** What EmDash posts to an editor panel route (`ContentEditorPanelInteraction`): the load, a button or a form submit. */
export const editorPanelInteractionSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("panel_load") }),
	z.object({ type: z.literal("block_action"), action_id: z.string().min(1).max(128), block_id: z.string().optional(), value: z.unknown().optional() }),
	z.object({ type: z.literal("form_submit"), action_id: z.string().min(1).max(128), block_id: z.string().optional(), values: z.record(z.string(), z.unknown()) }),
]);
export type EditorPanelInteraction = z.infer<typeof editorPanelInteractionSchema>;

/** The saved entry a panel or action was opened on (`routeCtx.ui.entry`, attested by the host). */
export interface EditorEntry {
	collection: string;
	id: string;
}

/** `rows` of a table cell that is a link to another entry. */
export const contentLink = (label: string, collection: string, id: string): LinkElement => ({ type: "link", label, target: { kind: "content", collection, id } });
