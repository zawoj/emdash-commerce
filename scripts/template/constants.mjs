/** Vocabularies of the template generator (`pnpm template:cloudflare`). */

/** How the three `@emdash-commerce/*` packages reach the generated copy. */
export const MODES = /** @type {const} */ ({
	VENDOR: "vendor",
	NPM: "npm",
});

/** The workspace packages the storefront depends on: npm name -> folder under `packages/`. */
export const WORKSPACE_PACKAGES = /** @type {const} */ ({
	"@emdash-commerce/design-system": "design-system",
	"@emdash-commerce/plugin-stripe": "plugin-stripe",
	"@emdash-commerce/plugin-image-hotspots": "plugin-image-hotspots",
});

export const VENDOR_DIR = "vendor";
export const DEFAULT_OUT_DIR = ".template/cloudflare";
export const TEMPLATE_PACKAGE_NAME = "emdash-commerce-cloudflare";
export const REPO_URL = "https://github.com/zawoj/emdash-commerce";
export const TEMPLATE_BRANCH = "cloudflare-template";
export const DEPLOY_BUTTON_URL = `https://deploy.workers.cloudflare.com/?url=${REPO_URL}/tree/${TEMPLATE_BRANCH}`;

/** Specs that point at something other than the registry; none may survive in a generated manifest. */
export const UNRESOLVED_PROTOCOLS = ["workspace:", "catalog:"];

/** Dependency sections of a package.json. */
export const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/** Dev dependencies of the app that only its Vitest suite needs; the copy ships no tests. */
export const TEST_ONLY_DEPENDENCIES = ["vitest", "happy-dom"];

export const TEMPLATE_DESCRIPTION =
	"Unofficial community demo: a mock Cloudflare-merch storefront on EmDash (Astro) with Stripe Checkout, running on Cloudflare Workers + D1 + R2. Generated from zawoj/emdash-commerce.";

/** Dependencies whose install script must run (pnpm 10 skips them otherwise): esbuild and workerd ship their binary that way, sharp its libvips. */
export const TEMPLATE_BUILT_DEPENDENCIES = ["esbuild", "sharp", "workerd"];

/** Scripts of the generated copy: Cloudflare is the default target, so `build` and `deploy` are what the Deploy button runs. */
export const TEMPLATE_SCRIPTS = {
	dev: "DEPLOY_TARGET=cloudflare astro dev --port 4361",
	build: "DEPLOY_TARGET=cloudflare astro build",
	preview: "DEPLOY_TARGET=cloudflare astro preview",
	deploy: "wrangler deploy",
	types: "wrangler types",
	typecheck: "astro check && tsc -p tsconfig.cloudflare.json",
};
