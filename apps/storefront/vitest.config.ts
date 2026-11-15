import { defineConfig } from 'vitest/config'

// The dev tools are DOM code: happy-dom gives them a document without a browser.
export default defineConfig({
  test: {
    // The seed script's helpers live in the repo's scripts folder and are tested here (the only project with a root-level runner).
    include: ['src/**/*.test.ts', '../../scripts/**/*.test.mjs'],
    environment: 'happy-dom',
  },
})
