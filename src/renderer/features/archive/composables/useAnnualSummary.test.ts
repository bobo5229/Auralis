import { effectScope, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnnualSummary } from '@shared/types/listeningArchive'
import type { LibraryChangedEvent } from '@shared/ipc/contracts'
import { useAnnualSummary } from './useAnnualSummary'
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
const result = (year: number) => ({ year, playCount: 7 }) as AnnualSummary
function fixture() {
  const scope = effectScope()
  const year = ref(2026)
  let changed!: (event: LibraryChangedEvent) => void
  const unsubscribe = vi.fn()
  const getAnnualSummary = vi.fn(async (year: number) => result(year))
  const state = scope.run(() =>
    useAnnualSummary(
      year,
      { getAnnualSummary },
      {
        onChanged: (callback) => {
          changed = callback
          return unsubscribe
        },
      },
    ),
  )!
  return {
    scope,
    year,
    state,
    getAnnualSummary,
    unsubscribe,
    notify: (reason: LibraryChangedEvent['reason'], playDate?: string) =>
      changed({ reason, trackIds: [], filePaths: [], playDate }),
  }
}
afterEach(() => vi.useRealTimers())
describe('annual summary requests', () => {
  it('ignores old-year completions and unsubscribes on disposal', async () => {
    const f = fixture()
    await nextTick()
    let resolve!: (value: AnnualSummary) => void
    f.getAnnualSummary.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    f.year.value = 2025
    expect(f.state.summary.value).toBeNull()
    f.year.value = 2024
    await nextTick()
    resolve(result(2025))
    await nextTick()
    expect(f.state.summary.value?.year).toBe(2024)
    f.scope.stop()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })
  it('coalesces metadata events, clears reset data and supports failed-query retries', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await nextTick()
    f.notify('metadata-refresh')
    f.notify('track-missing')
    await vi.advanceTimersByTimeAsync(250)
    expect(f.getAnnualSummary).toHaveBeenCalledTimes(2)
    f.getAnnualSummary.mockRejectedValueOnce(new Error('read failed'))
    f.notify('play-stats-reset')
    expect(f.state.summary.value).toBeNull()
    await nextTick()
    expect(f.state.failed.value).toBe(true)
    await f.state.refresh()
    expect(f.state.failed.value).toBe(false)
    expect(f.state.summary.value?.year).toBe(2026)
    f.scope.stop()
  })
})

it('ignores another year without cancelling pending metadata refresh; unknown dates still refresh', async () => {
  vi.useFakeTimers()
  const f = fixture()
  await nextTick()
  f.notify('play-stats-updated', '2024-12-31')
  await vi.advanceTimersByTimeAsync(250)
  expect(f.getAnnualSummary).toHaveBeenCalledOnce()
  f.notify('metadata-refresh')
  await vi.advanceTimersByTimeAsync(200)
  f.notify('play-stats-updated', '2024-12-31')
  await vi.advanceTimersByTimeAsync(50)
  expect(f.getAnnualSummary).toHaveBeenCalledTimes(2)
  f.notify('play-stats-updated', '2026-01-01')
  await vi.advanceTimersByTimeAsync(250)
  expect(f.getAnnualSummary).toHaveBeenCalledTimes(3)
  f.notify('play-stats-updated', '2024-13-01')
  await vi.advanceTimersByTimeAsync(250)
  expect(f.getAnnualSummary).toHaveBeenCalledTimes(4)
  f.notify('play-stats-updated')
  await vi.advanceTimersByTimeAsync(250)
  expect(f.getAnnualSummary).toHaveBeenCalledTimes(5)
  f.scope.stop()
})
