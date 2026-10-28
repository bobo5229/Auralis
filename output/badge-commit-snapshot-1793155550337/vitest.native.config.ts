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
    maxWorkers: Math.min(4, availableParallelism()),
    include: ['src/**/*.native.test.ts'],
  },
})
