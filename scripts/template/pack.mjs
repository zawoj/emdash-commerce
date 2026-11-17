import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findUnresolvedSpecs } from "./manifest.mjs";

/**
 * Pack one workspace package with `pnpm pack` (so its `files` allow-list decides what ships, exactly as for npm) and
 * extract the tarball into `destination`. pnpm rewrites `workspace:`/`catalog:` specs while packing; the result is checked.
 *
 * @param {string} packageDir absolute path of the package folder
 * @param {string} destination absolute path to extract into (created)
 */
export const vendorPackage = (packageDir, destination) => {
	const scratch = mkdtempSync(join(tmpdir(), "emdash-template-pack-"));
	try {
		execFileSync("pnpm", ["pack", "--pack-destination", scratch], { cwd: packageDir, stdio: ["ignore", "ignore", "inherit"] });
		const tarballs = readdirSync(scratch).filter((file) => file.endsWith(".tgz"));
		if (tarballs.length !== 1) throw new Error(`${packageDir}: expected one tarball, got ${tarballs.length}`);
		mkdirSync(destination, { recursive: true });
		// An npm tarball keeps everything under a single `package/` folder.
		execFileSync("tar", ["-xzf", join(scratch, tarballs[0]), "-C", destination, "--strip-components=1"]);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
	const manifest = JSON.parse(readFileSync(join(destination, "package.json"), "utf8"));
	const unresolved = findUnresolvedSpecs(manifest);
	if (unresolved.length > 0) throw new Error(`${manifest.name}: packed manifest still has ${unresolved.join(", ")}`);
	return manifest;
};
