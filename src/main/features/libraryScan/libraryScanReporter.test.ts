import { afterEach, expect, it, vi } from 'vitest'
import { LibraryScanReporter } from './libraryScanReporter'
import type { LibraryScanWorkerMessage } from './libraryScanTypes'

afterEach(() => vi.restoreAllMocks())

it('bounds intermediate notifications by time and always sends settlement counters', () => {
  let now = 1000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const messages: LibraryScanWorkerMessage[] = []
  const reporter = new LibraryScanReporter(1, (message) => messages.push(message))
  reporter.beginScanning(0)
  for (let i = 0; i < 10000; i++) {
    reporter.discoverFile()
    reporter.handleReadResult({ kind: 'skip' }, `${i}.flac`)
  }
  expect(messages.filter((message) => message.type === 'progress')).toHaveLength(1)
  now += 200
  reporter.discoverFile()
  reporter.handleReadResult({ kind: 'skip' }, 'last.flac')
  reporter.complete()
  const progress = messages.filter((message) => message.type === 'progress')
  expect(progress).toHaveLength(3)
  expect(progress.at(-1)?.payload).toMatchObject({
    phase: 'settling',
    status: 'scanning',
    totalFiles: 10001,
    scannedFiles: 10001,
  })
  const inventory = messages.filter(
    (message) => message.type === 'inventory' || message.type === 'complete',
  )
  expect(
    Math.max(...inventory.map((message) => message.payload.foundFilePaths.length)),
  ).toBeLessThanOrEqual(300)
  expect(inventory.flatMap((message) => message.payload.foundFilePaths)).toHaveLength(10001)
})
