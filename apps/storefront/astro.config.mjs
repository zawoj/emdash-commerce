import { createRequire } from "node:module";

import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";

// The image-hotspots admin entry imports `@emdash-cms/admin` (MediaPickerModal). pnpm can link a workspace
// package to a different copy of it than the one `emdash` renders the admin with, and two copies mean two
// React contexts (query client, i18n). Alias it to the exact copy `emdash` resolves.
const adminEntry = createRequire(createRequire(import.meta.url).resolve("emdash")).resolve("@emdash-cms/admin");

// One app, two runtimes. Unset (or anything but "cloudflare") is the Node target: standalone server, SQLite file,
// uploads on disk. `DEPLOY_TARGET=cloudflare` is the Workers target: D1 (`DB`), R2 (`MEDIA`), see wrangler.jsonc and
// docs/cloudflare.md. The runtime-specific packages are imported lazily so the Node target never loads the Cloudflare
// ones and the other way round.
const isCloudflare = process.env.DEPLOY_TARGET === "cloudflare";

// Where the Node target keeps its state. Both default to the folders next to this file; the end-to-end suite points
// them at a throwaway directory (`.e2e/`, see docs/testing.md) so a test run never touches `data.db` or `uploads/`.
const databaseFile = process.env.EMDASH_DATABASE_FILE || "./data.db";
const uploadsDirectory = process.env.EMDASH_UPLOADS_DIR || "./uploads";

const nodeRuntime = async () => {
	const [{ default: node }, { sqlite }] = await Promise.all([import("@astrojs/node"), import("emdash/db")]);
	return {
		adapter: node({ mode: "standalone" }),
		database: sqlite({ url: `file:${databaseFile}` }),
		storage: local({
			directory: uploadsDirectory,
			baseUrl: "/_emdash/api/media/file",
		}),
	};
};

// Where the Cloudflare target keeps its local D1/R2/Durable Object state under `astro dev`. Unset, the adapter uses
// `.wrangler/state` next to this file; the end-to-end suite points it at a throwaway directory (docs/testing.md).
const cloudflareStateDirectory = process.env.EMDASH_CLOUDFLARE_STATE_DIR;

const cloudflareRuntime = async () => {
	const [{ default: cloudflare }, { d1, r2 }] = await Promise.all([import("@astrojs/cloudflare"), import("@emdash-cms/cloudflare")]);
	return {
		adapter: cloudflare(cloudflareStateDirectory ? { persistState: { path: cloudflareStateDirectory } } : undefined),
		database: d1({ binding: "DB", session: "auto", coalesce: true }),
		storage: r2({ binding: "MEDIA" }),
	};
};

const runtime = await (isCloudflare ? cloudflareRuntime() : nodeRuntime());

export default defineConfig({
	output: "server",
	adapter: runtime.adapter,
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: runtime.database,
			storage: runtime.storage,
			plugins: [
				{
					id: "image-hotspots",
					entrypoint: "@emdash-commerce/plugin-image-hotspots",
					adminEntry: "@emdash-commerce/plugin-image-hotspots/admin",
					fieldWidgets: [{ name: "hotspots", label: "Image with points", fieldTypes: ["json"] }],
				},
				{
					id: "stripe-commerce",
					entrypoint: "@emdash-commerce/plugin-stripe",
					componentsEntry: "@emdash-commerce/plugin-stripe/astro",
					// Mock Cloudflare merch is priced in USD (the storefront's DEFAULT_CURRENCY in src/lib/money.ts).
					options: { storeName: "Cloudflare Merch", defaultCurrency: "usd", supportedCurrencies: ["usd"] },
				},
			],
		}),
	],
	fonts: [],
	devToolbar: { enabled: false },
	vite: {
		resolve: {
			alias: [{ find: /^@emdash-cms\/admin$/, replacement: adminEntry }],
		},
		plugins: [
			{
				// `astro dev` and `astro build` default to the same cache folder, so a build run next to a
				// running dev server rewrites its pre-bundled dependencies and React ends up loaded twice
				// ("Cannot read properties of null (reading 'useState')"). Keep them apart.
				name: "separate-dev-and-build-cache",
				config: (_config, { command }) => ({
					cacheDir: command === "serve" ? "node_modules/.vite-dev" : "node_modules/.vite-build",
				}),
			},
		],
		// emdash's admin islands live outside the app root (pnpm store), so Vite does not pre-bundle
		// react-dom/client on its own and serves the raw CJS file ("does not provide an export named createRoot").
		optimizeDeps: {
			include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
		},
		assetsInclude: ["**/*.svg?no-inline"],
		ssr: {
			noExternal: ["@emdash-commerce/design-system", "@emdash-commerce/plugin-image-hotspots"],
		},
	},
});
