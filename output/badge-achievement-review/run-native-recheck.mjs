import { app } from 'electron'
import { startVitest } from 'vitest/node'
let exitCode = 1
try {
  await startVitest('test', [], { config: 'output/badge-achievement-review/native.config.ts', run: true, cache: false, reporters: ['json'], outputFile: 'output/badge-achievement-review/native-recheck-results.json' })
  exitCode = process.exitCode ?? 0
} catch (error) { console.error(error) }
finally { app.exit(exitCode) }
