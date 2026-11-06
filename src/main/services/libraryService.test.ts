import { afterEach, expect, it, vi } from 'vitest'
import type { LibraryRepository } from '@main/repositories/libraryRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryService } from './libraryService'

afterEach(() => vi.useRealTimers())
it('disposes the catalog timer and prevents new snapshots during service shutdown', () => {
  vi.useFakeTimers()
  const tracks = { getAll: vi.fn(() => []), getChangeToken: vi.fn(() => '1') }
  const service = new LibraryService({} as LibraryRepository, tracks as unknown as TrackRepository)
  service.getTrackPage({ refresh: true })
  expect(vi.getTimerCount()).toBe(1)
  service.dispose()
  expect(vi.getTimerCount()).toBe(0)
  expect(() => service.getTrackPage({})).toThrow('disposed')
  expect(tracks.getAll).toHaveBeenCalledOnce()
})
