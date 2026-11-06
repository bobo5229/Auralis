import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryChangedReason } from '@shared/types/libraryEvents'
import { SharedLibraryCatalogLoad } from '@renderer/shared/catalog/sharedLibraryCatalogLoad'
import { useRecentJournalCatalog } from './useRecentJournalCatalog'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.useRealTimers()
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function setup(failFirst = false) {
  vi.useFakeTimers()
  const changed = new Set<Parameters<AuralisApi['library']['onChanged']>[0]>()
  const progress = new Set<Parameters<AuralisApi['library']['onScanProgress']>[0]>()
  const library = {
    onChanged: (callback: Parameters<AuralisApi['library']['onChanged']>[0]) => {
      changed.add(callback)
      return () => {
        changed.delete(callback)
      }
    },
    onScanProgress: (callback: Parameters<AuralisApi['library']['onScanProgress']>[0]) => {
      progress.add(callback)
      return () => {
        progress.delete(callback)
      }
    },
  }
  const page = (id: number) => ({
    snapshotId: `s${id}`,
    totalTracks: 1,
    tracks: [{ id }] as TrackListItem[],
    nextCursor: null,
    diagnostics: { snapshotBuildMs: null, pageSliceMs: 0 },
  })
  const fetchPage = vi.fn(async () => {
    if (failFirst) {
      failFirst = false
      throw new Error('initial failure')
    }
    return page(1)
  })
  const client = new SharedLibraryCatalogLoad(fetchPage, library)
  const active = ref(true)
  const report = vi.fn()
  const scope: EffectScope = effectScope()
  const state = scope.run(() => useRecentJournalCatalog(active, library, client, report))!
  const emit = (reason: LibraryChangedReason = 'track-added') =>
    changed.forEach((fn) => fn({ reason, trackIds: [], filePaths: [] }))
  cleanup.push(() => {
    scope.stop()
    client.dispose()
  })
  return { fetchPage, client, active, state, report, scope, changed, progress, emit, page }
}
async function settle() {
  await vi.advanceTimersByTimeAsync(200)
  await nextTick()
}
describe('journal shared catalog lifecycle', () => {
  it('uses the shared page cache on return and coalesces import events', async () => {
    const f = setup()
    await settle()
    expect(f.state.tracks.value[0].id).toBe(1)
    f.active.value = false
    f.active.value = true
    await settle()
    expect(f.fetchPage).toHaveBeenCalledTimes(1)
    f.fetchPage.mockResolvedValue(f.page(2))
    f.emit()
    f.emit()
    f.emit()
    await settle()
    expect(f.fetchPage).toHaveBeenCalledTimes(2)
    expect(f.state.tracks.value[0].id).toBe(2)
  })
  it('keeps old content on refresh failure and retries with a fresh snapshot', async () => {
    const f = setup()
    await settle()
    f.fetchPage.mockRejectedValueOnce(new Error('offline'))
    f.emit()
    await settle()
    expect(f.state.loaded.value).toBe(true)
    expect(f.state.tracks.value[0].id).toBe(1)
    expect(f.state.error.value).toBeInstanceOf(Error)
    f.fetchPage.mockResolvedValue(f.page(2))
    f.state.refresh()
    await settle()
    expect(f.state.error.value).toBeNull()
    expect(f.state.tracks.value[0].id).toBe(2)
  })
  it('ignores obsolete responses, defers hidden-page refreshes, and unsubscribes', async () => {
    const f = setup()
    await settle()
    const pending = deferred<ReturnType<typeof f.page>>()
    f.fetchPage.mockReturnValueOnce(pending.promise)
    f.emit()
    await settle()
    f.active.value = false
    f.emit('metadata-refresh')
    pending.resolve(f.page(2))
    await settle()
    expect(f.state.tracks.value[0].id).toBe(1)
    f.fetchPage.mockResolvedValue(f.page(3))
    f.active.value = true
    await settle()
    expect(f.state.tracks.value[0].id).toBe(3)
    f.scope.stop()
    expect(f.changed.size).toBe(1)
    expect(f.progress.size).toBe(1)
  })
  it('does not refresh for play statistics and recovers after an explicit retry', async () => {
    const f = setup()
    await settle()
    f.emit('play-stats-updated')
    await settle()
    expect(f.fetchPage).toHaveBeenCalledTimes(1)
    f.fetchPage.mockRejectedValueOnce(new Error('failure'))
    f.state.refresh()
    await settle()
    expect(f.state.isLoading.value).toBe(false)
    f.state.refresh()
    await settle()
    expect(f.state.error.value).toBeNull()
  })
  it('surfaces first-load errors and retries without marking the failed load as complete', async () => {
    const f = setup(true)
    await settle()
    expect(f.state.loaded.value).toBe(false)
    expect(f.state.isLoading.value).toBe(false)
    expect(f.state.error.value).toBeInstanceOf(Error)
    f.state.refresh()
    await settle()
    expect(f.state.loaded.value).toBe(true)
    expect(f.state.error.value).toBeNull()
  })
  it('discards a response superseded by metadata changes while still on the page', async () => {
    const f = setup()
    await settle()
    const pending = deferred<ReturnType<typeof f.page>>()
    f.fetchPage.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(f.page(3))
    f.emit()
    await settle()
    f.emit('metadata-refresh')
    pending.resolve(f.page(2))
    await settle()
    expect(f.state.tracks.value[0].id).toBe(3)
    expect(f.state.error.value).toBeNull()
  })
})
