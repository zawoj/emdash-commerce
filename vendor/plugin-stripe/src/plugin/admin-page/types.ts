/**
 * The subset of Block Kit (`@emdash-cms/blocks`, validation in its `validateBlockResponse`) this page uses.
 * Declared locally so the plugin does not depend on the blocks package at runtime; the test suite validates
 * every rendered response with the host's own validator, which is the authority on shapes and limits.
 */

export interface ConfirmDialog {
	title: string;
	text: string;
	confirm: string;
	deny: string;
	style?: "danger";
}

export interface ButtonElement {
	type: "button";
	action_id: string;
	label: string;
	style?: "primary" | "danger" | "secondary";
	value?: string;
	confirm?: ConfirmDialog;
}

export interface TableColumn {
	key: string;
	label: string;
	format?: "text" | "badge" | "relative_time" | "number" | "code" | "element";
}

export type Block =
	| { type: "header"; text: string }
	| { type: "divider" }
	| { type: "context"; text: string }
	| { type: "fields"; fields: Array<{ label: string; value: string }> }
	| { type: "stats"; items: Array<{ label: string; value: string | number; description?: string; trend?: "up" | "down" | "neutral" }> }
	| { type: "banner"; title?: string; description?: string; variant?: "default" | "alert" | "error" }
	| { type: "actions"; elements: ButtonElement[] }
	| { type: "table"; columns: TableColumn[]; rows: Array<Record<string, unknown>>; page_action_id: string; empty_text?: string };

export interface BlockResponse {
	blocks: Block[];
	toast?: { message: string; type: "success" | "error" | "info" };
}
