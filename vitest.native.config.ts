import { fileURLToPath, URL } from 'node:url'
import { availableParallelism } from 'node:os'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': fileURLToPath(new URL('./src/renderer', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@main': fileURLToPath(new URL('./src/main', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    minWorkers: 1,
    // Native restore fixtures use real SQLite files and compete for disk I/O on CI runners.
    maxWorkers: Math.min(process.env.CI === 'true' ? 2 : 4, availableParallelism()),
    testTimeout: process.env.CI === 'true' ? 60000 : 5000,
    include: ['src/**/*.native.test.ts'],
  },
})
