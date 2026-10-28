import { effectScope, nextTick, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import type { DailyPlayCount, DailyTopTrack } from '@shared/types/listeningArchive'
import type { LibraryChangedEvent } from '@shared/ipc/contracts'
import { useDayTopTracks } from './useDayTopTracks'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
const tracks = [{ artworkCacheKey: null, trackId: 1, title: 'One', artist: 'Artist', playCount: 5 }]
const scopes: ReturnType<typeof effectScope>[] = []
async function flush() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}
function deferred() {
  let resolve!: (value: DailyTopTrack[]) => void
  const promise = new Promise<DailyTopTrack[]>((done) => {
    resolve = done
  })
  return { resolve, promise }
}
function fixture(query = vi.fn<(date: string) => Promise<DailyTopTrack[]>>(async () => tracks)) {
  const date = ref('2026-10-24')
  const summary = ref<DailyPlayCount | undefined>({
    date: date.value,
    playCount: 5,
    durationSeconds: 300,
  })
  const scope = effectScope()
  scopes.push(scope)
  let changed!: (event: LibraryChangedEvent) => void
  const unsubscribe = vi.fn()
  const state = scope.run(() =>
    useDayTopTracks(
      date,
      { getDayTopTracks: query },
      {
        onChanged(callback) {
          changed = callback
          return unsubscribe
        },
      },
      summary,
    ),
  )!
  return {
    state,
    date,
    summary,
    scope,
    query,
    unsubscribe,
    notify: (reason: LibraryChangedEvent['reason']) =>
      changed({ reason, trackIds: [], filePaths: [] }),
  }
}
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
})

it('loads on daily list mount and reports an empty day separately from failures', async () => {
  const { state, query } = fixture(vi.fn(async () => []))
  expect(state.loading.value).toBe(true)
  await flush()
  expect(query).toHaveBeenCalledExactlyOnceWith('2026-10-24')
  expect(state.loading.value).toBe(false)
  expect(state.failed.value).toBe(false)
  expect(state.tracks.value).toEqual([])
})
it('clears the previous date synchronously and rejects its late response', async () => {
  const older = deferred(),
    newer = deferred()
  const query = vi
    .fn<(date: string) => Promise<DailyTopTrack[]>>()
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise)
  const { state, date } = fixture(query)
  date.value = '2026-10-23'
  expect(state.tracks.value).toEqual([])
  await flush()
  newer.resolve([{ ...tracks[0], title: 'New day' }])
  await flush()
  older.resolve(tracks)
  await flush()
  expect(state.tracks.value[0].title).toBe('New day')
  expect(state.loading.value).toBe(false)
})
it('can retry a failed query for the same date', async () => {
  const query = vi
    .fn<(date: string) => Promise<DailyTopTrack[]>>()
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce(tracks)
  const { state } = fixture(query)
  await flush()
  expect(state.failed.value).toBe(true)
  await state.refresh()
  expect(state.failed.value).toBe(false)
  expect(state.tracks.value).toEqual(tracks)
})
it('refreshes only for relevant metadata or selected-day totals and discards reads on reset', async () => {
  const { state, summary, query, notify } = fixture()
  await flush()
  notify('play-stats-updated')
  await flush()
  expect(query).toHaveBeenCalledOnce()
  summary.value = { ...summary.value!, playCount: 6 }
  await flush()
  expect(query).toHaveBeenCalledTimes(2)
  const stale = deferred()
  query.mockReturnValueOnce(stale.promise)
  notify('metadata-refresh')
  notify('play-stats-reset')
  expect(state.tracks.value).toEqual([])
  stale.resolve(tracks)
  await flush()
  expect(state.tracks.value).toEqual([])
  expect(state.loading.value).toBe(false)
})
it('invalidates an outstanding read and unsubscribes when the daily list unmounts', async () => {
  const pending = deferred()
  const { state, scope, unsubscribe, query, notify } = fixture(vi.fn(() => pending.promise))
  scope.stop()
  expect(unsubscribe).toHaveBeenCalledOnce()
  pending.resolve(tracks)
  await flush()
  notify('file-change')
  await state.refresh()
  expect(query).toHaveBeenCalledOnce()
  expect(state.tracks.value).toEqual([])
})
