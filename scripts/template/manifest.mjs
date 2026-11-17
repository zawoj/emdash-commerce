import {
	DEPENDENCY_FIELDS,
	MODES,
	TEMPLATE_BUILT_DEPENDENCIES,
	TEMPLATE_DESCRIPTION,
	TEMPLATE_PACKAGE_NAME,
	TEMPLATE_SCRIPTS,
	TEST_ONLY_DEPENDENCIES,
	UNRESOLVED_PROTOCOLS,
	VENDOR_DIR,
	WORKSPACE_PACKAGES,
} from "./constants.mjs";

const WORKSPACE_SPEC = /^workspace:(.*)$/;

/**
 * Turn the part after `workspace:` into a registry range for a package of the given version.
 * `*` and `^` follow the package's own version (`^0.2.0`), `~` is tilde, anything else is taken literally.
 */
const workspaceRange = (range, version) => {
	if (range === "*" || range === "^" || range === "") return `^${version}`;
	if (range === "~") return `~${version}`;
	return range;
};

/**
 * Resolve one dependency spec so it no longer needs the workspace.
 * - `workspace:*` of one of our packages -> `file:./vendor/<folder>` (vendor mode) or `^<version>` (npm mode)
 * - `catalog:` / `catalog:<name>` -> the version from the given catalogs, or an error when it has none
 * - anything else is returned unchanged
 *
 * @param {string} name dependency name
 * @param {string} spec dependency spec
 * @param {{ mode: string, versions: Record<string, string>, catalogs?: Record<string, Record<string, string>> }} context
 */
export const resolveSpec = (name, spec, { mode, versions, catalogs = {} }) => {
	const workspace = WORKSPACE_SPEC.exec(spec);
	if (workspace) {
		const folder = WORKSPACE_PACKAGES[name];
		if (!folder) throw new Error(`${name}: ${spec} is a workspace package the template generator does not know`);
		if (mode === MODES.VENDOR) return `file:./${VENDOR_DIR}/${folder}`;
		const version = versions[name];
		if (!version) throw new Error(`${name}: no version known for ${spec}`);
		return workspaceRange(workspace[1], version);
	}
	if (spec.startsWith("catalog:")) {
		const catalogName = spec.slice("catalog:".length) || "default";
		const resolved = catalogs[catalogName]?.[name];
		if (!resolved) throw new Error(`${name}: ${spec} has no entry in the "${catalogName}" catalog`);
		return resolved;
	}
	return spec;
};

/** `field.name: spec` for every dependency whose spec still points at the workspace or a catalog. */
export const findUnresolvedSpecs = (manifest) => {
	const found = [];
	for (const field of DEPENDENCY_FIELDS) {
		for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
			if (UNRESOLVED_PROTOCOLS.some((protocol) => spec.startsWith(protocol))) found.push(`${field}.${name}: ${spec}`);
		}
	}
	return found;
};

const sortKeys = (record) => Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b)));

/**
 * The package.json of the generated copy, derived from the storefront's: concrete specs, Cloudflare as the default
 * build, no test tooling, a `packageManager` so Workers Builds picks the same pnpm as the repo.
 *
 * @param {Record<string, any>} storefront the storefront's package.json
 * @param {{ mode: string, versions: Record<string, string>, packageManager: string, nodeEngine?: string, catalogs?: Record<string, Record<string, string>>, overrides?: Record<string, string> }} options
 */
export const buildTemplateManifest = (storefront, { mode, versions, packageManager, nodeEngine, catalogs, overrides }) => {
	const resolveField = (field, skip = []) =>
		sortKeys(
			Object.fromEntries(
				Object.entries(storefront[field] ?? {})
					.filter(([name]) => !skip.includes(name))
					.map(([name, spec]) => [name, resolveSpec(name, spec, { mode, versions, catalogs })]),
			),
		);

	const manifest = {
		name: TEMPLATE_PACKAGE_NAME,
		version: storefront.version,
		private: true,
		type: storefront.type,
		description: TEMPLATE_DESCRIPTION,
		license: "MIT",
		packageManager,
		...(nodeEngine ? { engines: { node: nodeEngine } } : {}),
		emdash: storefront.emdash,
		scripts: { ...TEMPLATE_SCRIPTS },
		dependencies: resolveField("dependencies"),
		devDependencies: resolveField("devDependencies", TEST_ONLY_DEPENDENCIES),
		cloudflare: storefront.cloudflare,
		pnpm: {
			onlyBuiltDependencies: [...TEMPLATE_BUILT_DEPENDENCIES],
			...(overrides && Object.keys(overrides).length > 0 ? { overrides } : {}),
		},
	};

	const unresolved = findUnresolvedSpecs(manifest);
	if (unresolved.length > 0) throw new Error(`Unresolved specs in the generated manifest: ${unresolved.join(", ")}`);
	return manifest;
};
