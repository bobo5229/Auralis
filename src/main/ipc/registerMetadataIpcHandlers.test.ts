import { expect, it, vi } from 'vitest'
import { registerMetadataIpcHandlers } from './registerMetadataIpcHandlers'
import type { IpcHandlerRegistrar } from './validatedIpcRegistrar'

it('registers metadata reads and refreshes without exposing editing capabilities', async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const service = {
    refreshTrack: vi.fn(() => ({ jobId: 1 })),
    refreshTracks: vi.fn(() => ({ jobId: 2 })),
    refreshLyricsForMissing: vi.fn(() => ({ jobId: 3 })),
    getJobStatus: vi.fn(() => null),
    listFailures: vi.fn(() => []),
    clearFailures: vi.fn(() => ({ deletedCount: 0 })),
  }
  registerMetadataIpcHandlers(
    {
      handle: (channel, handler) =>
        handlers.set(channel, handler as (...args: unknown[]) => unknown),
    } as IpcHandlerRegistrar,
    { metadataRefreshService: service },
  )
  expect([...handlers.keys()]).toEqual([
    'metadata:refresh-track',
    'metadata:refresh-tracks',
    'metadata:refresh-lyrics-missing',
    'metadata:get-refresh-status',
    'metadata:list-refresh-failures',
    'metadata:clear-refresh-failures',
  ])
  expect(await handlers.get('metadata:refresh-track')!(null, { trackId: 9 })).toEqual({ jobId: 1 })
  expect(service.refreshTrack).toHaveBeenCalledWith(9)
  expect(await handlers.get('metadata:refresh-tracks')!(null, { trackIds: [2, 9] })).toEqual({
    jobId: 2,
  })
  expect(service.refreshTracks).toHaveBeenCalledWith([2, 9])
})
