import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // Isola módulos entre arquivos de teste para evitar estado compartilhado no store do rate limiter
    isolate: true,
    coverage: {
      provider: 'v8',
      include: ['src/types.ts', 'src/middleware/rateLimit.ts'],
      reporter: ['text', 'html'],
    },
  },
})
