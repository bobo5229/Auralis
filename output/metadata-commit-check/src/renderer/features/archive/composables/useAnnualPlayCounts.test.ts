import { effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { LibraryChangedEvent } from '@shared/ipc/contracts'
import type { DailyPlayCount } from '@shared/types/listeningArchive'
import { useAnnualPlayCounts } from './useAnnualPlayCounts'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

const counts = [{ date: '2026-10-09', playCount: 5, durationSeconds: 900 }]
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
function deferred() {
  let resolve!: (result: DailyPlayCount[]) => void
  const promise = new Promise<DailyPlayCount[]>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function fixture(getAnnualPlayCounts = vi.fn(async (): Promise<DailyPlayCount[]> => counts)) {
  let changed!: (event: LibraryChangedEvent) => void
  const unsubscribe = vi.fn()
  const scope = effectScope()
  const year = ref(2026)
  const state = scope.run(() =>
    useAnnualPlayCounts(
      year,
      { getAnnualPlayCounts },
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
  return { scope, state, year, getAnnualPlayCounts, notify, unsubscribe }
}

describe('annual listening counts', () => {
  it('loads the requested year when the page is created', async () => {
    const { scope, state, getAnnualPlayCounts } = fixture()
    expect(state.isLoading.value).toBe(true)
    await flush()
    expect(getAnnualPlayCounts).toHaveBeenCalledExactlyOnceWith(2026)
    expect(state.days.value).toEqual(counts)
    expect(state.isLoading.value).toBe(false)
    expect(state.hasError.value).toBe(false)
    scope.stop()
  })

  it('refreshes after effective plays and reset, while ignoring unrelated changes', async () => {
    const { scope, state, getAnnualPlayCounts, notify } = fixture()
    await flush()
    notify('metadata-refresh')
    expect(getAnnualPlayCounts).toHaveBeenCalledOnce()
    notify('play-stats-updated')
    await flush()
    expect(getAnnualPlayCounts).toHaveBeenCalledTimes(2)
    getAnnualPlayCounts.mockResolvedValueOnce([])
    notify('play-stats-reset')
    expect(state.days.value).toEqual([])
    await flush()
    expect(getAnnualPlayCounts).toHaveBeenCalledTimes(3)
    expect(state.days.value).toEqual([])
    scope.stop()
  })

  it('loads consecutive empty and future years and refreshes the selected year', async () => {
    const { scope, state, year, getAnnualPlayCounts, notify } = fixture()
    await flush()
    getAnnualPlayCounts.mockResolvedValue([])
    year.value = 2025
    expect(state.days.value).toEqual([])
    expect(state.isLoading.value).toBe(true)
    await flush()
    year.value = 2024
    await flush()
    year.value = 2027
    await flush()
    notify('play-stats-updated')
    await flush()
    expect(getAnnualPlayCounts.mock.calls).toEqual([[2026], [2025], [2024], [2027], [2027]])
    expect(state.days.value).toEqual([])
    expect(state.hasError.value).toBe(false)
    scope.stop()
  })

  it('discards older year results when switching rapidly or returning to a year', async () => {
    const old = deferred(),
      other = deferred(),
      latest = deferred()
    const query = vi.fn(async (): Promise<DailyPlayCount[]> => old.promise)
    query
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => other.promise)
      .mockImplementationOnce(() => latest.promise)
    const { scope, state, year } = fixture(query)
    year.value = 2025
    year.value = 2026
    latest.resolve(counts)
    await flush()
    other.resolve([{ date: '2025-01-01', playCount: 3, durationSeconds: 600 }])
    old.resolve([])
    await flush()
    expect(state.days.value).toEqual(counts)
    expect(state.isLoading.value).toBe(false)
    scope.stop()
  })

  it('does not show the previous year counts when the new year load fails', async () => {
    const { scope, state, year, getAnnualPlayCounts } = fixture()
    await flush()
    getAnnualPlayCounts.mockRejectedValueOnce(new Error('read failed'))
    year.value = 2025
    await flush()
    expect(state.days.value).toEqual([])
    expect(state.hasError.value).toBe(true)
    expect(state.isLoading.value).toBe(false)
    scope.stop()
  })

  it('reports failed loads without interpreting them as successful empty results', async () => {
    const query = vi.fn(async (): Promise<DailyPlayCount[]> => {
      throw new Error('read failed')
    })
    const { scope, state } = fixture(query)
    await flush()
    expect(state.hasError.value).toBe(true)
    expect(state.isLoading.value).toBe(false)
    scope.stop()
  })

  it('preserves the last counts on refresh failure and recovers on the next event', async () => {
    const { scope, state, getAnnualPlayCounts, notify } = fixture()
    await flush()
    getAnnualPlayCounts.mockRejectedValueOnce(new Error('read failed'))
    notify('play-stats-updated')
    await flush()
    expect(state.days.value).toEqual(counts)
    expect(state.hasError.value).toBe(true)
    notify('play-stats-updated')
    await flush()
    expect(state.hasError.value).toBe(false)
    scope.stop()
  })

  it('preserves the annual array when a notification does not change the selected year', async () => {
    const { scope, state, getAnnualPlayCounts, notify } = fixture()
    await flush()
    const previous = state.days.value
    getAnnualPlayCounts.mockResolvedValueOnce(counts.map((day) => ({ ...day })))
    notify('play-stats-updated')
    await flush()
    expect(state.days.value).toBe(previous)
    getAnnualPlayCounts.mockResolvedValueOnce([{ ...counts[0], durationSeconds: 1200 }])
    notify('play-stats-updated')
    await flush()
    expect(state.days.value).not.toBe(previous)
    expect(state.days.value[0].durationSeconds).toBe(1200)
    scope.stop()
  })

  it('does not let an older in-flight result restore counts after reset', async () => {
    const old = deferred(),
      latest = deferred()
    const query = vi.fn(async (): Promise<DailyPlayCount[]> => old.promise)
    query.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => latest.promise)
    const { scope, state, notify } = fixture(query)
    notify('play-stats-reset')
    latest.resolve([])
    await flush()
    old.resolve(counts)
    await flush()
    expect(state.days.value).toEqual([])
    expect(state.isLoading.value).toBe(false)
    scope.stop()
  })

  it('unsubscribes on exit and discards pending results and late notifications', async () => {
    const pending = deferred()
    const query = vi.fn(async (): Promise<DailyPlayCount[]> => pending.promise)
    const { scope, state, notify, unsubscribe } = fixture(query)
    scope.stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
    notify('play-stats-updated')
    expect(query).toHaveBeenCalledOnce()
    pending.resolve(counts)
    await flush()
    expect(state.days.value).toEqual([])
  })
})
