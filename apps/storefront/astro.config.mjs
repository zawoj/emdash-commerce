import { createRequire } from "node:module";

import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

// The image-hotspots admin entry imports `@emdash-cms/admin` (MediaPickerModal). pnpm can link a workspace
// package to a different copy of it than the one `emdash` renders the admin with, and two copies mean two
// React contexts (query client, i18n). Alias it to the exact copy `emdash` resolves.
const adminEntry = createRequire(createRequire(import.meta.url).resolve("emdash")).resolve("@emdash-cms/admin");

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
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
