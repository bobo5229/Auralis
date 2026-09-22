import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuralisApi } from '@shared/ipc/api'
import type { TrackListItem } from '@shared/types/libraryScan'
import { useAlbumCatalog } from './useAlbumCatalog'

const scopes: EffectScope[] = []
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function setup() {
  const allowed = ref(true)
  const pending = deferred<TrackListItem[]>()
  const getTracks = vi.fn().mockReturnValueOnce(pending.promise)
  const unsubscribe = vi.fn()
  let notify!: Parameters<AuralisApi['library']['onChanged']>[0]
  const onChanged = vi.fn((callback: typeof notify) => {
    notify = callback
    return unsubscribe
  })
  const scope = effectScope()
  scopes.push(scope)
  const reportError = vi.fn()
  const catalog = scope.run(() => useAlbumCatalog({ getTracks, onChanged }, allowed, reportError))!
  const change = () => notify({ reason: 'metadata-refresh', trackIds: [], filePaths: [] })
  const statsChanged = () => notify({ reason: 'play-stats-updated', trackIds: [], filePaths: [] })
  return {
    allowed,
    pending,
    getTracks,
    unsubscribe,
    scope,
    catalog,
    change,
    statsChanged,
    reportError,
  }
}

describe('cached album catalog', () => {
  it('reuses a loaded catalog after deactivation and return without querying again', async () => {
    const state = setup()
    const tracks = [{ id: 1 }] as TrackListItem[]
    state.pending.resolve(tracks)
    await nextTick()
    expect(state.catalog.tracks.value).toBe(tracks)
    state.allowed.value = false
    await nextTick()
    state.allowed.value = true
    await nextTick()
    expect(state.getTracks).toHaveBeenCalledTimes(1)
  })

  it('coalesces hidden-page changes and refreshes only after the return transition', async () => {
    const state = setup()
    state.pending.resolve([])
    await nextTick()
    state.allowed.value = false
    await nextTick()
    state.change()
    state.change()
    expect(state.getTracks).toHaveBeenCalledTimes(1)
    const refreshed = [{ id: 2 }] as TrackListItem[]
    state.getTracks.mockResolvedValueOnce(refreshed)
    state.allowed.value = true
    await nextTick()
    await nextTick()
    expect(state.getTracks).toHaveBeenCalledTimes(2)
    expect(state.catalog.tracks.value).toBe(refreshed)
  })

  it('does not install a response during leave or accept a superseded revision', async () => {
    const state = setup()
    state.allowed.value = false
    state.pending.resolve([{ id: 1 }] as TrackListItem[])
    await nextTick()
    expect(state.catalog.tracks.value).toEqual([])
    const second = deferred<TrackListItem[]>()
    state.getTracks.mockReturnValueOnce(second.promise).mockResolvedValueOnce([{ id: 3 }])
    state.allowed.value = true
    await nextTick()
    state.change()
    second.resolve([{ id: 2 }] as TrackListItem[])
    await nextTick()
    await nextTick()
    expect(state.catalog.tracks.value.map((track) => track.id)).toEqual([3])
    expect(state.getTracks).toHaveBeenCalledTimes(3)
  })

  it('keeps the existing grid on a background failure and allows a retry', async () => {
    const state = setup()
    const tracks = [{ id: 1 }] as TrackListItem[]
    state.pending.resolve(tracks)
    await nextTick()
    state.getTracks.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    state.change()
    await nextTick()
    expect(state.catalog.tracks.value).toBe(tracks)
    expect(state.catalog.error.value).toBeNull()
    expect(state.reportError).toHaveBeenCalledTimes(1)
    state.catalog.refresh()
    await nextTick()
    expect(state.catalog.tracks.value).toEqual([])
  })

  it('releases its subscription and ignores pending work on disposal', async () => {
    const state = setup()
    state.scope.stop()
    state.pending.resolve([{ id: 1 }] as TrackListItem[])
    await nextTick()
    expect(state.unsubscribe).toHaveBeenCalledOnce()
    expect(state.catalog.tracks.value).toEqual([])
  })

  it('ends initial loading on failure and retries once on the next activation', async () => {
    const state = setup()
    state.pending.reject(new Error('offline'))
    await nextTick()
    expect(state.catalog.isLoading.value).toBe(false)
    expect(state.catalog.error.value).toBeInstanceOf(Error)
    expect(state.getTracks).toHaveBeenCalledTimes(1)
    state.allowed.value = false
    await nextTick()
    state.getTracks.mockResolvedValueOnce([])
    state.allowed.value = true
    await nextTick()
    await nextTick()
    expect(state.catalog.error.value).toBeNull()
    expect(state.catalog.isLoading.value).toBe(false)
    expect(state.getTracks).toHaveBeenCalledTimes(2)
  })

  it('defers hidden play-count changes without reloading the visible grid on every tick', async () => {
    const state = setup()
    state.pending.resolve([])
    await nextTick()
    state.statsChanged()
    expect(state.getTracks).toHaveBeenCalledTimes(1)
    state.allowed.value = false
    await nextTick()
    state.statsChanged()
    expect(state.getTracks).toHaveBeenCalledTimes(1)
    state.getTracks.mockResolvedValueOnce([])
    state.allowed.value = true
    await nextTick()
    expect(state.getTracks).toHaveBeenCalledTimes(2)
  })
})
