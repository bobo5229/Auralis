import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'
import type { LibraryScanProgress, LibraryScanStatus } from '@shared/types/libraryScan'
import {
  ShellTestElement,
  shellTestDocument,
  shellTestRenderer,
} from '@renderer/testUtils/rendererTestHost'
import MusicLibrarySettings from './MusicLibrarySettings.vue'

const api = vi.hoisted(() => ({
  getRoots: vi.fn(),
  getScanStatus: vi.fn(),
  selectRoot: vi.fn(),
  startScan: vi.fn(),
  cancelScan: vi.fn(),
  onScanProgress: vi.fn(),
  listRefreshFailures: vi.fn(),
  clearRefreshFailures: vi.fn(),
  onRefreshProgress: vi.fn(),
  stopScan: vi.fn(),
  stopRefresh: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { library: api, metadata: api } }))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: api.error },
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: ref('en') }) }))
vi.mock('./DatabaseMaintenanceSettings.vue', () => ({ default: { render: () => null } }))

const root = { id: 1, path: 'C:\\Music', lastScannedAt: null }
const failure = {
  id: 1,
  jobId: 2,
  trackId: 3,
  filePath: 'broken.flac',
  reason: 'unreadable',
  createdAt: '2026-10-25',
}
const mounted: Array<ReturnType<typeof shellTestRenderer.createApp>> = []
const status = (
  jobId: number,
  value: LibraryScanStatus['status'] = 'scanning',
): LibraryScanStatus => ({
  jobId,
  rootId: 1,
  status: value,
  totalFiles: 10,
  scannedFiles: 4,
  failedFiles: 0,
  startedAt: '2026-10-25',
  finishedAt: null,
  errorMessage: null,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function settle() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function text(node: ShellTestElement): string {
  return node.text + node.children.map(text).join(' ')
}
function button(label: string) {
  label =
    (
      {
        cancelScan: 'settings.library.cancel',
        showFailures: 'failuresSummary',
        clearFailures: 'clearRecords',
      } as Record<string, string>
    )[label] ?? label
  const node = shellTestDocument.body
    .querySelectorAll('button')
    .find((node) => text(node).includes(label))
  expect(node, label).toBeDefined()
  return node!
}
async function click(label: string) {
  const node = button(label)
  await (node.props.onClick as () => unknown)()
  await settle()
}
function mount() {
  const app = shellTestRenderer.createApp({ render: () => h(MusicLibrarySettings) })
  app.directive('tooltip', {})
  mounted.push(app)
  app.mount(shellTestDocument.body)
  return app
}
function scanProgress(progress: LibraryScanProgress) {
  return (api.onScanProgress.mock.calls[0][0] as (value: LibraryScanProgress) => Promise<void>)(
    progress,
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  shellTestDocument.body.replaceChildren()
  shellTestDocument.activeElement = shellTestDocument.body
  vi.stubGlobal('document', shellTestDocument)
  api.getRoots.mockResolvedValue([root])
  api.getScanStatus.mockResolvedValue(null)
  api.selectRoot.mockResolvedValue({ canceled: true })
  api.startScan.mockResolvedValue({ jobId: 1 })
  api.cancelScan.mockResolvedValue({ ok: true })
  api.listRefreshFailures.mockResolvedValue([failure])
  api.clearRefreshFailures.mockResolvedValue(undefined)
  api.onScanProgress.mockReturnValue(api.stopScan)
  api.onRefreshProgress.mockReturnValue(api.stopRefresh)
})
afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})

it('preserves directory cancellation and replacement, then starts and cancels a scan', async () => {
  mount()
  await settle()
  expect(text(shellTestDocument.body)).toContain(root.path)
  await click('changeFolder')
  expect(text(shellTestDocument.body)).toContain(root.path)
  api.selectRoot.mockResolvedValue({ canceled: false, root: { ...root, id: 8, path: 'D:\\Next' } })
  await click('changeFolder')
  expect(text(shellTestDocument.body)).toContain('D:\\Next')
  api.getScanStatus.mockResolvedValue(status(1))
  button('scanLibrary').focus()
  await click('scanLibrary')
  expect(api.startScan).toHaveBeenCalledWith(8)
  expect(shellTestDocument.activeElement).toBe(button('cancelScan'))
  api.getScanStatus.mockResolvedValue(status(1, 'canceled'))
  await click('cancelScan')
  expect(api.cancelScan).toHaveBeenCalledWith(1)
  expect(shellTestDocument.activeElement).toBe(button('rescan'))
})

it('keeps initial publication atomic when the failure-list query rejects', async () => {
  api.listRefreshFailures.mockRejectedValue(new Error('failure-list unavailable'))
  mount()
  await settle()
  expect(text(shellTestDocument.body)).not.toContain(root.path)
  expect(text(shellTestDocument.body)).toContain('settings.library.errors.loadState')
  expect(api.error).toHaveBeenCalledOnce()
})

it('rejects older job events and stale status responses', async () => {
  mount()
  await settle()
  const older = deferred<LibraryScanStatus>()
  api.getScanStatus.mockReturnValueOnce(older.promise).mockResolvedValueOnce(status(3))
  const first = scanProgress({ ...status(2), currentFile: null, message: null })
  await scanProgress({ ...status(3), currentFile: null, message: null })
  older.resolve(status(2, 'completed'))
  await first
  await settle()
  const calls = api.getScanStatus.mock.calls.length
  await scanProgress({ ...status(1), currentFile: null, message: null })
  expect(api.getScanStatus).toHaveBeenCalledTimes(calls)
  await click('cancelScan')
  expect(api.cancelScan).toHaveBeenLastCalledWith(3)
})

it('refreshes roots on completion and does not steal focus from another control', async () => {
  api.getScanStatus.mockResolvedValue(status(1))
  mount()
  await settle()
  button('changeFolder').focus()
  const focused = shellTestDocument.activeElement
  api.getRoots.mockResolvedValue([{ ...root, path: 'C:\\Completed' }])
  api.getScanStatus.mockResolvedValue(status(1, 'completed'))
  await scanProgress({ ...status(1, 'completed'), currentFile: null, message: null })
  await settle()
  expect(text(shellTestDocument.body)).toContain('C:\\Completed')
  expect(shellTestDocument.activeElement).toBe(focused)
})

it('owns failure-list refresh, clear failure and retry independently of scan operations', async () => {
  mount()
  await settle()
  const refresh = api.onRefreshProgress.mock.calls[0][0] as (value: {
    status: string
  }) => Promise<void>
  const initial = api.listRefreshFailures.mock.calls.length
  await refresh({ status: 'running' })
  expect(api.listRefreshFailures).toHaveBeenCalledTimes(initial)
  api.listRefreshFailures.mockResolvedValue([{ ...failure, filePath: 'next.flac' }])
  await refresh({ status: 'failed' })
  await settle()
  await click('showFailures')
  expect(text(shellTestDocument.body)).toContain('next.flac')
  api.clearRefreshFailures.mockRejectedValueOnce(new Error('clear failed'))
  await click('clearFailures')
  expect(text(shellTestDocument.body)).toContain('settings.library.errors.clearFailures')
  expect(text(shellTestDocument.body)).toContain('next.flac')
  await click('clearFailures')
  expect(text(shellTestDocument.body)).not.toContain('next.flac')
  expect(api.startScan).not.toHaveBeenCalled()
})

it('unsubscribes both sessions and ignores pending initial results after unmount', async () => {
  const roots = deferred<(typeof root)[]>()
  api.getRoots.mockReturnValue(roots.promise)
  const app = mount()
  app.unmount()
  mounted.pop()
  roots.resolve([root])
  await settle()
  expect(api.stopScan).toHaveBeenCalledOnce()
  expect(api.stopRefresh).toHaveBeenCalledOnce()
  expect(text(shellTestDocument.body)).not.toContain(root.path)
  expect(api.error).not.toHaveBeenCalled()
})

it.each(['selectFolder', 'startScan', 'cancelScan'] as const)(
  'preserves %s error feedback',
  async (operation) => {
    if (operation === 'cancelScan') api.getScanStatus.mockResolvedValue(status(1))
    mount()
    await settle()
    const name = operation === 'selectFolder' ? 'selectRoot' : operation
    api[name].mockRejectedValue(new Error('operation failed'))
    await click(
      operation === 'selectFolder'
        ? 'changeFolder'
        : operation === 'startScan'
          ? 'scanLibrary'
          : 'cancelScan',
    )
    expect(text(shellTestDocument.body)).toContain(`settings.library.errors.${operation}`)
  },
)
