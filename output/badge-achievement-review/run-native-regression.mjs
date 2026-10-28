import { app } from 'electron'
import { startVitest } from 'vitest/node'
let exitCode = 1
try {
  await startVitest('test', ['src/main/repositories/badgeAchievementRepository.native.test.ts'], { config: 'vitest.native.config.ts', run: true, cache: false, reporters: ['json'], outputFile: 'output/badge-achievement-review/native-regression-results.json' })
  exitCode = process.exitCode ?? 0
} catch (error) { console.error(error) }
finally { app.exit(exitCode) }
