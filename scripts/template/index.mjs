#!/usr/bin/env node
/**
 * Generate the standalone Cloudflare template: a self-contained copy of `apps/storefront` that builds without the
 * monorepo, for the Deploy to Cloudflare button (docs/cloudflare.md, .ai/decisions/2026-11-17-cloudflare-deploy-template.md).
 *
 * Usage: node scripts/template/index.mjs [outDir] [--npm] [--sha <commit>]
 *   outDir   where to write (default .template/cloudflare, git-ignored); an existing folder is replaced only when this
 *            script generated it
 *   --npm    depend on the published @emdash-commerce/* versions instead of vendoring the packages in vendor/
 *   --sha    commit of the monorepo, noted in the generated README
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_OUT_DIR, MODES } from "./constants.mjs";
import { generateTemplate } from "./generate.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const parseArguments = (argv) => {
	const options = { outDir: undefined, mode: MODES.VENDOR, sourceSha: undefined };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--npm") options.mode = MODES.NPM;
		else if (argument === "--sha") options.sourceSha = argv[++index];
		else if (argument.startsWith("--")) throw new Error(`Unknown option ${argument}`);
		else options.outDir = argument;
	}
	return options;
};

try {
	const { outDir = join(repoRoot, DEFAULT_OUT_DIR), mode, sourceSha } = parseArguments(process.argv.slice(2));
	const result = generateTemplate({ repoRoot, outDir, mode, sourceSha });
	console.log(`Template (${result.mode}) written to ${result.outDir}: ${result.files} files${result.vendored.length ? `, vendored ${result.vendored.join(", ")}` : ""}`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
