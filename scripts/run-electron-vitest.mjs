import { app } from 'electron'
import { startVitest } from 'vitest/node'

let exitCode = 1

try {
  await startVitest('test', [], {
    config: 'vitest.native.config.ts',
    run: true,
  })
  exitCode = process.exitCode ?? 0
} catch (error) {
  console.error('[native-test] Failed to run Vitest in Electron', error)
} finally {
  app.exit(exitCode)
}
