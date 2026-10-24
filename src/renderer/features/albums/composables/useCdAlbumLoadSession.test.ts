import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { AlbumSummary } from '../types'
import { useCdAlbumLoadSession } from './useCdAlbumLoadSession'
import { useCdRoomScene } from './useCdRoomScene'
import { createCdStage } from '../utils/cdStageController'

vi.mock('../utils/cdStageController', () => ({ createCdStage: vi.fn() }))
const scopes: ReturnType<typeof effectScope>[] = []

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: vi.fn() },
}))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function album(key = 'one'): AlbumSummary {
  return {
    key,
    title: key,
    albumArtist: 'Artist',
    artworkCacheKey: null,
    releaseDate: ' 2026 ',
    tracks: [],
  }
}
function fixture(options: { first?: boolean; requested?: string; index?: boolean } = {}) {
  const load = vi.fn(async () => [album()])
  const claim = vi.fn(async () => ({ firstEntry: options.first ?? true }))
  const stage = { focus: vi.fn() }
  const controller = {
    setAlbums: vi.fn(),
    setFocused: vi.fn(),
    setMaterialAppearance: vi.fn(),
    setPlayback: vi.fn(),
    dispose: vi.fn(),
  }
  vi.mocked(createCdStage).mockReturnValue(
    controller as unknown as ReturnType<typeof createCdStage>,
  )
  const body = { closest: () => null }
  const doc = { body, activeElement: body }
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  let disposed = false
  const scope = effectScope()
  scopes.push(scope)
  const session = scope.run(() => {
    const scene = useCdRoomScene({
      canvasTheme: () => 'light',
      reducedMotion: { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() },
      isDisposed: () => disposed,
      isLoading: () => data.loading.value,
      hasFailed: () => data.failed.value,
      settleInfo: vi.fn(),
      setRapidBrowse: vi.fn(),
      reduceBrowsingPlaybackMotion: vi.fn(),
      playbackRing: () => ({ visible: false, playing: false, progress: 0, accent: 'red' }),
      togglePlayback: vi.fn(),
      back: vi.fn(),
      claimStartupEntry: claim,
      requestedAlbumKey: options.requested ?? null,
      fromIndexViewSwitch: options.index ?? false,
    })
    const data = useCdAlbumLoadSession({
      catalogSession: { load },
      onAlbums: scene.presentAlbums,
      isDisposed: () => disposed,
    })
    scene.stageRef.value = stage as unknown as HTMLElement
    scene.mount()
    stage.focus.mockClear()
    return {
      ...data,
      repeatEntry: scene.repeatEntry,
      async loadAlbums() {
        if (await data.loadAlbums()) await scene.restoreBrowseFocus()
      },
    }
  })!

  return {
    ...session,
    load,
    claim,
    controller,
    stage,
    doc,
    dispose: () => {
      disposed = true
    },
  }
}
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.unstubAllGlobals()
})
describe('CD catalog and scene coordination', () => {
  it('publishes a complete catalog, claims startup once and keeps source track arrays', async () => {
    const f = fixture()
    const source = album()
    f.load.mockResolvedValue([source])
    expect(f.load).not.toHaveBeenCalled()
    await f.loadAlbums()
    expect(f.albumInfo.value[0]).toMatchObject({
      key: 'one',
      releaseDate: '2026',
      trackCount: 0,
      copyright: null,
    })
    expect(f.albumInfo.value[0].tracks).toBe(source.tracks)
    expect(f.controller.setAlbums).toHaveBeenLastCalledWith(f.albumInfo.value, true, undefined)
    expect(f.stage.focus).toHaveBeenCalledWith({ preventScroll: true })
    await f.loadAlbums()
    expect(f.claim).toHaveBeenCalledOnce()
    expect(f.controller.setAlbums).toHaveBeenLastCalledWith(f.albumInfo.value, false, undefined)
  })
  it.each([{ requested: 'one' }, { index: true }, { first: false }])(
    'preserves the entry/target policy for %j',
    async (options) => {
      const f = fixture(options)
      await f.loadAlbums()
      expect(f.controller.setAlbums).toHaveBeenCalledWith(
        f.albumInfo.value,
        false,
        options.requested,
      )
      expect(f.repeatEntry.value).toBe(options.first === false)
      if (options.requested) expect(f.controller.setFocused).toHaveBeenCalledWith(true, 'fade')
      else expect(f.controller.setFocused).not.toHaveBeenCalled()
    },
  )
  it('ignores a missing target but preserves the initial entrance', async () => {
    const f = fixture({ requested: 'missing' })
    await f.loadAlbums()
    expect(f.controller.setAlbums).toHaveBeenCalledWith(f.albumInfo.value, true, undefined)
    expect(f.controller.setFocused).not.toHaveBeenCalled()
  })
  it('does not consume startup entry for an empty catalog', async () => {
    const f = fixture()
    f.load.mockResolvedValueOnce([])
    await f.loadAlbums()
    expect(f.claim).not.toHaveBeenCalled()
    await f.loadAlbums()
    expect(f.claim).toHaveBeenCalledOnce()
    expect(f.controller.setAlbums).toHaveBeenLastCalledWith(f.albumInfo.value, true, undefined)
  })
  it('coalesces overlapping refresh calls into one follow-up load', async () => {
    const f = fixture()
    const pending = deferred<AlbumSummary[]>()
    f.load.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([album('two')])
    const first = f.loadAlbums()
    await f.loadAlbums()
    await f.loadAlbums()
    expect(f.load).toHaveBeenCalledOnce()
    pending.resolve([album()])
    await first
    expect(f.load).toHaveBeenCalledTimes(2)
    expect(f.claim).toHaveBeenCalledOnce()
    expect(f.albumInfo.value[0].key).toBe('two')
  })
  it('keeps the prior catalog visible through refresh failure and permits retry', async () => {
    const f = fixture()
    await f.loadAlbums()
    const previous = f.albumInfo.value
    f.load.mockRejectedValueOnce(new Error('fixture failure'))
    const refresh = f.loadAlbums()
    expect(f.loading.value).toBe(false)
    await refresh
    expect(f.albumInfo.value).toBe(previous)
    expect(f.failed.value).toBe(true)
    await f.loadAlbums()
    expect(f.failed.value).toBe(false)
  })
  it('does not publish or claim after disposal during catalog loading', async () => {
    const f = fixture()
    const pending = deferred<AlbumSummary[]>()
    f.load.mockReturnValueOnce(pending.promise)
    const loaded = f.loadAlbums()
    f.dispose()
    pending.resolve([album()])
    await loaded
    expect(f.albumInfo.value).toEqual([])
    expect(f.claim).not.toHaveBeenCalled()
    expect(f.controller.setAlbums).not.toHaveBeenCalled()
    expect(f.stage.focus).not.toHaveBeenCalled()
  })
  it('does not drive the stage after disposal during the startup handshake', async () => {
    const f = fixture()
    const pending = deferred<{ firstEntry: boolean }>()
    f.claim.mockReturnValueOnce(pending.promise)
    const loaded = f.loadAlbums()
    await Promise.resolve()
    expect(f.count.value).toBe(1)
    f.dispose()
    pending.resolve({ firstEntry: true })
    await loaded
    expect(f.controller.setAlbums).not.toHaveBeenCalled()
  })
  it('does not take focus from an existing control', async () => {
    const f = fixture()
    f.doc.activeElement = { closest: () => null }
    await f.loadAlbums()
    expect(f.stage.focus).not.toHaveBeenCalled()
  })
})
