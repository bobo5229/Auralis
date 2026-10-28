import { expect, it, vi } from 'vitest'
import { createMetadataRefreshEvents } from './metadataRefreshEvents'

it('forwards semantic metadata notifications with unchanged IPC channels and payloads', () => {
  const send = vi.fn()
  const events = createMetadataRefreshEvents(send)
  const changed = {
    reason: 'metadata-refresh' as const,
    trackIds: [1],
    filePaths: ['isolated.flac'],
    libraryRevision: '12:1',
  }
  const progress = {
    jobId: 2,
    status: 'completed' as const,
    totalTracks: 1,
    processedTracks: 1,
    failedTracks: 0,
  }
  events.libraryChanged(changed)
  events.refreshProgress(progress)
  expect(send.mock.calls).toEqual([
    ['library:changed', changed],
    ['metadata:refresh-progress', progress],
  ])
  expect(send.mock.calls[0][1]).toBe(changed)
  expect(send.mock.calls[1][1]).toBe(progress)
})
