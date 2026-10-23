import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { LibraryScanProgress, LibraryScanStatus } from '@shared/types/libraryScan'
import { useSidebarLibraryStatus } from './useSidebarLibraryStatus'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: vi.fn() },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const root = { id: 4, path: '/isolated/music', createdAt: '', lastScannedAt: null }
function job(
  status: LibraryScanStatus['status'],
  overrides: Partial<LibraryScanStatus> = {},
): LibraryScanStatus {
  return {
    jobId: 1,
    rootId: 4,
    status,
    totalFiles: 100,
    scannedFiles: 20,
    failedFiles: 0,
    startedAt: '',
    finishedAt: null,
    errorMessage: null,
    ...overrides,
  }
}

const renderer = createRenderer<object, object>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  patchProp() {},
  parentNode: () => null,
  nextSibling: () => null,
})
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
})
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

function mount() {
  let progress!: (event: LibraryScanProgress) => void
  let changed!: Parameters<AuralisApi['library']['onChanged']>[0]
  const stopProgress = vi.fn()
  const stopChanged = vi.fn()
  const api = {
    getRoots: vi.fn(async () => [root]),
    getScanStatus: vi.fn(async (): Promise<LibraryScanStatus | null> => null),
    startScan: vi.fn(async () => ({ jobId: 1 })),
    onScanProgress: vi.fn((handler: typeof progress) => {
      progress = handler
      return stopProgress
    }),
    onChanged: vi.fn((handler: typeof changed) => {
      changed = handler
      return stopChanged
    }),
  }
  let state!: ReturnType<typeof useSidebarLibraryStatus>
  const app = renderer.createApp(
    defineComponent({
      setup() {
        state = useSidebarLibraryStatus(api)
        return () => null
      },
    }),
  )
  app.mount({})
  cleanups.push(() => app.unmount())
  return {
    state,
    api,
    progress: (event: LibraryScanStatus) =>
      progress({ ...event, currentFile: null, message: null }),
    changed: () => changed({ reason: 'file-change', trackIds: [], filePaths: [] }),
    playStats: () => changed({ reason: 'play-stats-updated', trackIds: [], filePaths: [] }),
    unmount: () => {
      cleanups.pop()?.()
    },
    stopProgress,
    stopChanged,
  }
}

describe('sidebar library status', () => {
  it('starts in loading, distinguishes an unconfigured library from the first scan', async () => {
    const h = mount()
    expect(h.state.status.value).toBe('loading')
    await settle()
    expect(h.state.status.value).toBe('waiting')
    h.api.getRoots.mockResolvedValue([])
    await h.state.reload()
    expect(h.state.status.value).toBe('notConfigured')
    await h.state.refreshLibrary()
    expect(h.api.startScan).not.toHaveBeenCalled()
  })

  it.each([
    ['scanning', 0, 0, 'scanning', 'neutral', true],
    ['scanning', 100, 0, 'progress', 'neutral', true],
    ['completed', 100, 0, 'ready', 'success', false],
    ['completed', 100, 2, 'warnings', 'warning', false],
    ['canceled', 100, 0, 'canceled', 'warning', false],
    ['failed', 100, 0, 'failed', 'error', false],
    ['idle', 0, 0, 'waiting', 'neutral', false],
  ] as const)(
    'maps %s / total %i / failed %i to its label and busy state',
    async (status, totalFiles, failedFiles, label, tone, busy) => {
      const h = mount()
      await settle()
      h.api.getScanStatus.mockResolvedValue(job(status, { totalFiles, failedFiles }))
      await h.state.reload()
      expect(h.state.status.value).toBe(label)
      expect(h.state.tone.value).toBe(tone)
      expect(h.state.isRefreshing.value).toBe(busy)
    },
  )

  it('tracks external scans and ignores older jobs and late scanning messages', async () => {
    const h = mount()
    await settle()
    h.progress(job('scanning', { jobId: 2, scannedFiles: 55 }))
    expect(h.state.status.value).toBe('progress')
    expect(h.state.counts.value).toEqual({ scanned: 55, total: 100 })
    await h.state.refreshLibrary()
    expect(h.api.startScan).not.toHaveBeenCalled()
    h.progress(job('failed'))
    expect(h.state.isRefreshing.value).toBe(true)
    h.progress(job('completed', { jobId: 2 }))
    h.progress(job('scanning', { jobId: 2 }))
    expect(h.state.status.value).toBe('ready')
    expect(h.state.isRefreshing.value).toBe(false)
  })

  it('keeps newer progress when a stale read finishes', async () => {
    const h = mount()
    await settle()
    const pending = deferred<LibraryScanStatus | null>()
    h.api.getScanStatus.mockReturnValueOnce(pending.promise)
    const read = h.state.reload()
    h.progress(job('scanning', { jobId: 3, scannedFiles: 88 }))
    pending.resolve(job('completed'))
    await read
    expect(h.state.status.value).toBe('progress')
    expect(h.state.counts.value.scanned).toBe(88)
  })

  it('prevents an older request from replacing a newer result or error', async () => {
    const h = mount()
    await settle()
    const pending = deferred<LibraryScanStatus | null>()
    h.api.getScanStatus.mockReturnValueOnce(pending.promise)
    const older = h.state.reload()
    h.api.getScanStatus.mockResolvedValue(job('completed', { jobId: 2 }))
    await h.state.reload()
    pending.reject(new Error('stale read failed'))
    await older
    expect(h.state.status.value).toBe('ready')
  })

  it('reports a read failure and recovers through library change notifications', async () => {
    const h = mount()
    await settle()
    h.api.getScanStatus.mockRejectedValueOnce(new Error('read failed'))
    await h.state.reload()
    expect(h.state.status.value).toBe('readFailed')
    h.api.getScanStatus.mockResolvedValue(job('completed'))
    h.changed()
    await settle()
    expect(h.state.status.value).toBe('ready')
    const calls = h.api.getScanStatus.mock.calls.length
    h.playStats()
    expect(h.api.getScanStatus).toHaveBeenCalledTimes(calls)
  })

  it('keeps startup busy, handles start failure and retries successfully', async () => {
    const h = mount()
    await settle()
    const pending = deferred<{ jobId: number }>()
    h.api.startScan.mockReturnValueOnce(pending.promise)
    const start = h.state.refreshLibrary()
    await settle()
    expect(h.state.status.value).toBe('starting')
    expect(h.state.isRefreshing.value).toBe(true)
    await h.state.refreshLibrary()
    expect(h.api.startScan).toHaveBeenCalledTimes(1)
    pending.reject(new Error('start failed'))
    await start
    expect(h.state.status.value).toBe('failed')
    expect(h.state.isRefreshing.value).toBe(false)
    h.api.getScanStatus.mockResolvedValue(job('scanning'))
    await h.state.refreshLibrary()
    expect(h.state.isRefreshing.value).toBe(true)
    h.progress(job('completed'))
    expect(h.state.status.value).toBe('ready')
  })

  it('does not start another job if an external scan starts during root lookup', async () => {
    const h = mount()
    await settle()
    const pending = deferred<(typeof root)[]>()
    h.api.getRoots.mockReturnValueOnce(pending.promise)
    const start = h.state.refreshLibrary()
    h.progress(job('scanning', { jobId: 2 }))
    pending.resolve([root])
    await start
    expect(h.api.startScan).not.toHaveBeenCalled()
  })

  it('unsubscribes and ignores pending reads, late callbacks and refresh after unmount', async () => {
    const h = mount()
    await settle()
    const pending = deferred<LibraryScanStatus | null>()
    h.api.getScanStatus.mockReturnValueOnce(pending.promise)
    const read = h.state.reload()
    h.unmount()
    pending.resolve(job('completed'))
    h.progress(job('scanning'))
    await read
    await h.state.refreshLibrary()
    expect(h.stopProgress).toHaveBeenCalledOnce()
    expect(h.stopChanged).toHaveBeenCalledOnce()
    expect(h.state.status.value).toBe('waiting')
    expect(h.api.startScan).not.toHaveBeenCalled()
  })

  it('does not start a job after unmount during root lookup', async () => {
    const h = mount()
    await settle()
    const pending = deferred<(typeof root)[]>()
    h.api.getRoots.mockReturnValueOnce(pending.promise)
    const start = h.state.refreshLibrary()
    h.unmount()
    pending.resolve([root])
    await start
    expect(h.api.startScan).not.toHaveBeenCalled()
  })
})
