import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Pure logic runs in node; component tests opt into happy-dom with `// @vitest-environment happy-dom`.
		environment: "node",
		include: ["src/**/*.test.{ts,tsx}"],
	},
});
