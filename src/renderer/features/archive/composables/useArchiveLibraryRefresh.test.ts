import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import type { LibraryChangedReason } from '@shared/ipc/contracts'
import { useArchiveLibraryRefresh } from './useArchiveLibraryRefresh'

vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    library: { onChanged: vi.fn() },
    window: { getVisibility: vi.fn(), onVisibilityChanged: vi.fn() },
  },
}))

const scopes: ReturnType<typeof effectScope>[] = []
let documentState: EventTarget & { hidden: boolean }
let libraryChanged: Parameters<typeof auralis.library.onChanged>[0]
let visibilityChanged: Parameters<typeof auralis.window.onVisibilityChanged>[0]
let stopLibrary: ReturnType<typeof vi.fn>
let stopVisibility: ReturnType<typeof vi.fn>

function emit(reason: LibraryChangedReason): void {
  libraryChanged({ reason, trackIds: [], filePaths: [] })
}

function setup() {
  const scope = effectScope()
  scopes.push(scope)
  const refresh = vi.fn().mockResolvedValue(undefined)
  scope.run(() => useArchiveLibraryRefresh(refresh))
  return { scope, refresh }
}

beforeEach(() => {
  vi.useFakeTimers()
  documentState = Object.assign(new EventTarget(), { hidden: false })
  vi.stubGlobal('document', documentState)
  stopLibrary = vi.fn()
  stopVisibility = vi.fn()
  vi.mocked(auralis.window.getVisibility).mockReset().mockResolvedValue({ isVisible: true })
  vi.mocked(auralis.library.onChanged).mockImplementation((callback) => {
    libraryChanged = callback
    return stopLibrary
  })
  vi.mocked(auralis.window.onVisibilityChanged).mockImplementation((callback) => {
    visibilityChanged = callback
    return stopVisibility
  })
})

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('archive library refresh scheduling', () => {
  it('debounces relevant changes while visible', async () => {
    const { refresh } = setup()
    await Promise.resolve()
    emit('play-stats-updated')
    await vi.advanceTimersByTimeAsync(100)
    emit('metadata-refresh')
    await vi.advanceTimersByTimeAsync(100)
    expect(refresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('coalesces multiple changes in a minimized window until it becomes visible', async () => {
    vi.mocked(auralis.window.getVisibility).mockResolvedValue({ isVisible: false })
    const { refresh } = setup()
    await Promise.resolve()
    emit('play-stats-updated')
    emit('play-stats-reset')
    emit('track-added')
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    visibilityChanged({ isVisible: true })
    await vi.advanceTimersByTimeAsync(150)
    expect(refresh).toHaveBeenCalledOnce()
    visibilityChanged({ isVisible: false })
    visibilityChanged({ isVisible: true })
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('cancels a queued refresh on hide and keeps its changes for restoration', async () => {
    const { refresh } = setup()
    await Promise.resolve()
    emit('file-change')
    await vi.advanceTimersByTimeAsync(100)
    visibilityChanged({ isVisible: false })
    await vi.advanceTimersByTimeAsync(500)
    expect(refresh).not.toHaveBeenCalled()
    visibilityChanged({ isVisible: true })
    await vi.advanceTimersByTimeAsync(150)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('waits for both document and native visibility', async () => {
    const { refresh } = setup()
    await Promise.resolve()
    documentState.hidden = true
    documentState.dispatchEvent(new Event('visibilitychange'))
    emit('track-missing')
    visibilityChanged({ isVisible: true })
    await vi.advanceTimersByTimeAsync(500)
    expect(refresh).not.toHaveBeenCalled()
    visibilityChanged({ isVisible: false })
    documentState.hidden = false
    documentState.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(500)
    expect(refresh).not.toHaveBeenCalled()
    visibilityChanged({ isVisible: true })
    await vi.advanceTimersByTimeAsync(150)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('ignores a stale visibility snapshot when a newer visible event arrived', async () => {
    let resolve!: (value: { isVisible: boolean }) => void
    vi.mocked(auralis.window.getVisibility).mockReturnValue(new Promise((done) => (resolve = done)))
    const { refresh } = setup()
    emit('track-restored')
    visibilityChanged({ isVisible: true })
    resolve({ isVisible: false })
    await vi.advanceTimersByTimeAsync(150)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('releases queued work and subscriptions when leaving the page', async () => {
    const { scope, refresh } = setup()
    await Promise.resolve()
    emit('play-stats-updated')
    scope.stop()
    expect(stopLibrary).toHaveBeenCalledOnce()
    expect(stopVisibility).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    emit('metadata-refresh')
    visibilityChanged({ isVisible: true })
    documentState.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).not.toHaveBeenCalled()
  })
})
