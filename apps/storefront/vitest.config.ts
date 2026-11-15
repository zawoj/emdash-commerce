import { defineConfig } from 'vitest/config'

// The dev tools are DOM code: happy-dom gives them a document without a browser.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
  },
})
