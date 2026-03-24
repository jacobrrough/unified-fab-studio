import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __APP_PRODUCT__: JSON.stringify('unified')
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html'],
      include: ['src/shared/**/*.ts'],
      exclude: ['src/shared/**/*.test.ts']
    }
  }
})
