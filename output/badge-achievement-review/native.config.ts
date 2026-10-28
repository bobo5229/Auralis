import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
export default defineConfig({
  resolve: { alias: { '@renderer': resolve('src/renderer'), '@shared': resolve('src/shared'), '@main': resolve('src/main') } },
  test: { environment: 'node', include: ['output/badge-achievement-review/repository.native.test.ts'], maxWorkers: 1, minWorkers: 1 },
})
