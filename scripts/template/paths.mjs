import { posix } from "node:path";

/** Folders and files that never belong in the copy: build output, local state, secrets. Matched on any path segment. */
const SKIPPED_NAMES = new Set(["node_modules", "dist", ".astro", ".wrangler", ".nx", ".cache", "uploads", "data.db", ".dev.vars"]);

/**
 * Repo-only files of `apps/storefront` (relative path): agent skills and MCP configs that describe the monorepo, the Nx project,
 * Vitest, and the dev-tools seed fragment (only the monorepo's `pnpm seed` applies it, against a dev server).
 */
const SKIPPED_PATHS = new Set([
	".agents",
	".cursor",
	".vscode",
	".mcp.json",
	"AGENTS.md",
	"README.md",
	"project.json",
	"vitest.config.ts",
	"package.json",
	".env.example",
	"seed/dev-tools.json",
]);

const isSecretFile = (name) =>
	name === ".env" || name.startsWith(".env.") || name.startsWith("data.db-") || (name.startsWith(".dev.vars.") && name !== ".dev.vars.example");
const isTestFile = (name) => /\.test\.(ts|tsx|mjs|js)$/.test(name);

/**
 * Whether a file or folder of the storefront (path relative to `apps/storefront`, posix separators) is copied.
 * `package.json` and `README.md` are skipped because the generator writes its own.
 */
export const isCopied = (relativePath) => {
	const parts = relativePath.split("/");
	// A top-level entry listed in SKIPPED_PATHS takes everything below it along.
	if (SKIPPED_PATHS.has(relativePath) || (parts.length > 1 && SKIPPED_PATHS.has(parts[0]))) return false;
	if (parts.some((part) => SKIPPED_NAMES.has(part))) return false;
	const name = parts[parts.length - 1];
	return !(isSecretFile(name) || isTestFile(name));
};

const CODE_FILE = /\.(ts|tsx|mts|mjs|js|jsx|astro|css|json|jsonc)$/;
const RELATIVE_SPECIFIER = /["'`(](\.{1,2}\/[^"'`()\s]*)/g;

/** Whether the file's text is scanned for relative paths (a package.json is not: its scripts never run from the copy). */
export const isCheckedFile = (relativePath) => CODE_FILE.test(relativePath) && posix.basename(relativePath) !== "package.json";

/**
 * Relative paths in a file's text (`"../x"`, `'./y'`, `url(../z)`) that resolve to somewhere outside the copy's root.
 * A text scan, not a parser: it can flag a path inside a comment, which is the safe direction.
 *
 * @param {string} relativePath path of the file inside the copy, posix separators
 * @param {string} text file content
 * @returns {string[]} the offending specifiers
 */
export const findEscapingPaths = (relativePath, text) => {
	const directory = posix.dirname(relativePath);
	const escaping = [];
	for (const [, specifier] of text.matchAll(RELATIVE_SPECIFIER)) {
		const resolved = posix.normalize(posix.join(directory, specifier));
		if (resolved === ".." || resolved.startsWith("../")) escaping.push(specifier);
	}
	return [...new Set(escaping)];
};
