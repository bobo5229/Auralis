import { effectScope } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import type { DailyTopTrack } from '@shared/types/listeningArchive'
import { useArchiveDayBubble } from './useArchiveDayBubble'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
const anchor = {} as HTMLElement
const tracks = [{ trackId: 1, title: 'One', artist: 'Artist', playCount: 5 }]
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
const scopes: ReturnType<typeof effectScope>[] = []
function fixture(query = vi.fn(async (): Promise<DailyTopTrack[]> => tracks)) {
  vi.useFakeTimers()
  const scope = effectScope()
  scopes.push(scope)
  const state = scope.run(() => useArchiveDayBubble({ getDayTopTracks: query }))!
  return { scope, state, query }
}
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.useRealTimers()
})
it('previews after a brief hover without querying track details, then dismisses after leaving', () => {
  const { state, query } = fixture()
  state.preview('2026-10-09', anchor)
  vi.advanceTimersByTime(149)
  expect(state.date.value).toBeNull()
  vi.advanceTimersByTime(1)
  expect(state.date.value).toBe('2026-10-09')
  expect(state.expanded.value).toBe(false)
  expect(query).not.toHaveBeenCalled()
  state.leave()
  vi.advanceTimersByTime(150)
  expect(state.date.value).toBeNull()
})
it('cancels brief hovers and keeps a bubble open while the pointer crosses into it', () => {
  const { state } = fixture()
  state.preview('2026-10-09', anchor)
  state.leave()
  vi.advanceTimersByTime(300)
  expect(state.date.value).toBeNull()
  state.preview('2026-10-09', anchor, true)
  state.leave()
  vi.advanceTimersByTime(100)
  state.keepOpen()
  vi.advanceTimersByTime(300)
  expect(state.date.value).toBe('2026-10-09')
})
it('pins and queries on click, ignores other hovers, and switches only on another click', async () => {
  const { state, query } = fixture()
  state.select('2026-10-09', anchor)
  await flush()
  expect(state.tracks.value).toEqual(tracks)
  expect(query).toHaveBeenCalledExactlyOnceWith('2026-10-09')
  state.preview('2026-10-10', anchor)
  state.leave()
  vi.advanceTimersByTime(300)
  expect(state.date.value).toBe('2026-10-09')
  state.select('2026-10-10', anchor)
  await flush()
  expect(query).toHaveBeenLastCalledWith('2026-10-10')
  state.select('2026-10-10', anchor)
  expect(state.date.value).toBeNull()
})
it('discards obsolete daily results after selecting another date or closing', async () => {
  let resolveOld!: (value: DailyTopTrack[]) => void
  const query = vi.fn(async (): Promise<DailyTopTrack[]> => [])
  query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve
      }),
  )
  const { state } = fixture(query)
  state.select('2026-10-09', anchor)
  state.select('2026-10-10', anchor)
  await flush()
  resolveOld(tracks)
  await flush()
  expect(state.tracks.value).toEqual([])
  expect(state.date.value).toBe('2026-10-10')
  expect(state.loading.value).toBe(false)
  state.close()
  expect(state.tracks.value).toEqual([])
})
it('distinguishes a failed query from an empty day and can retry', async () => {
  const query = vi.fn(async (): Promise<DailyTopTrack[]> => [])
  query.mockRejectedValueOnce(new Error('read failed'))
  const { state } = fixture(query)
  state.select('2026-10-09', anchor)
  await flush()
  expect(state.failed.value).toBe(true)
  await state.refresh()
  expect(state.failed.value).toBe(false)
  expect(state.tracks.value).toEqual([])
})
it('invalidates pending results and timers on page exit', async () => {
  let resolve!: (value: DailyTopTrack[]) => void
  const { state, scope, query } = fixture(
    vi.fn(
      () =>
        new Promise<DailyTopTrack[]>((done) => {
          resolve = done
        }),
    ),
  )
  state.select('2026-10-09', anchor)
  scope.stop()
  resolve(tracks)
  await flush()
  state.preview('2026-10-10', anchor)
  state.select('2026-10-10', anchor)
  vi.advanceTimersByTime(500)
  expect(state.date.value).toBeNull()
  expect(state.tracks.value).toEqual([])
  expect(query).toHaveBeenCalledOnce()
})
