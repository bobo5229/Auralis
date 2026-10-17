import { effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { LibraryChangedEvent } from '@shared/ipc/contracts'
import type { DailyTopAlbum } from '@shared/types/listeningArchive'
import { useDayTopAlbums } from './useDayTopAlbums'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

const albums = [
  {
    album: 'Alpha',
    albumArtist: 'Artist',
    artworkCacheKey: null,
    playCount: 7,
    durationSeconds: 1200,
    trackCount: 2,
  },
]
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
function deferred() {
  let resolve!: (result: DailyTopAlbum[]) => void
  const promise = new Promise<DailyTopAlbum[]>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
type DayTopAlbumsQuery = (date: string) => Promise<DailyTopAlbum[]>
function fixture(
  date = ref<string | null>('2026-10-09'),
  getDayTopAlbums: DayTopAlbumsQuery = vi.fn(async () => albums),
) {
  let changed!: (event: LibraryChangedEvent) => void
  const unsubscribe = vi.fn()
  const scope = effectScope()
  const state = scope.run(() =>
    useDayTopAlbums(
      date,
      { getDayTopAlbums },
      {
        onChanged: (callback) => {
          changed = callback
          return unsubscribe
        },
      },
    ),
  )!
  const notify = (reason: LibraryChangedEvent['reason']) =>
    changed({ reason, trackIds: [], filePaths: [] })
  return { scope, state, date, getDayTopAlbums, notify, unsubscribe }
}

describe('daily top albums', () => {
  it('loads the selected date on creation', async () => {
    const { scope, state, getDayTopAlbums } = fixture()
    expect(state.isLoading.value).toBe(true)
    await flush()
    expect(getDayTopAlbums).toHaveBeenCalledExactlyOnceWith('2026-10-09')
    expect(state.albums.value).toEqual(albums)
    expect(state.isLoading.value).toBe(false)
    expect(state.hasError.value).toBe(false)
    scope.stop()
  })

  it('clears state without querying when no date is selected', async () => {
    const { scope, state, getDayTopAlbums } = fixture(ref<string | null>(null))
    await flush()
    expect(getDayTopAlbums).not.toHaveBeenCalled()
    expect(state.albums.value).toEqual([])
    expect(state.isLoading.value).toBe(false)
    expect(state.hasError.value).toBe(false)
    scope.stop()
  })

  it('discards an older date result after switching dates', async () => {
    const first = deferred()
    const second = deferred()
    const getDayTopAlbums = vi
      .fn<(date: string) => Promise<DailyTopAlbum[]>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { scope, state, date } = fixture(ref<string | null>('2026-10-09'), getDayTopAlbums)
    date.value = '2026-10-10'
    await flush()
    second.resolve([{ ...albums[0], album: 'Beta' }])
    await flush()
    expect(state.albums.value[0]?.album).toBe('Beta')
    first.resolve([{ ...albums[0], album: 'Alpha' }])
    await flush()
    expect(state.albums.value[0]?.album).toBe('Beta')
    scope.stop()
  })

  it('refreshes after effective plays, clears on reset, and ignores unrelated changes', async () => {
    const { scope, state, getDayTopAlbums, notify } = fixture()
    await flush()
    notify('metadata-refresh')
    await flush()
    expect(getDayTopAlbums).toHaveBeenCalledOnce()
    notify('play-stats-updated')
    await flush()
    expect(getDayTopAlbums).toHaveBeenCalledTimes(2)
    notify('play-stats-reset')
    expect(state.albums.value).toEqual([])
    await flush()
    expect(getDayTopAlbums).toHaveBeenCalledTimes(3)
    scope.stop()
  })

  it('reports a failed load and retries the same date', async () => {
    const getDayTopAlbums = vi
      .fn<(date: string) => Promise<DailyTopAlbum[]>>()
      .mockRejectedValueOnce(new Error('database busy'))
      .mockResolvedValueOnce(albums)
    const { scope, state } = fixture(ref<string | null>('2026-10-09'), getDayTopAlbums)
    await flush()
    expect(state.hasError.value).toBe(true)
    expect(state.albums.value).toEqual([])
    await state.refresh()
    expect(state.hasError.value).toBe(false)
    expect(state.albums.value).toEqual(albums)
    scope.stop()
  })

  it('unsubscribes on exit and ignores pending results', async () => {
    const pending = deferred()
    const getDayTopAlbums = vi.fn(() => pending.promise)
    const { scope, state, unsubscribe } = fixture(ref<string | null>('2026-10-09'), getDayTopAlbums)
    scope.stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
    pending.resolve(albums)
    await flush()
    expect(state.albums.value).toEqual([])
  })
})
