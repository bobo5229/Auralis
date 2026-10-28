import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRenderer, h, inject, nextTick } from 'vue'
import type { RandomAlbumTracksResult } from '@shared/types/playback'
import type { StartupAlbumHistory, StartupAlbumKey } from '@shared/types/startupAlbum'
import { startupAlbumActionsKey, type StartupAlbumActions } from './startupAlbumActions'
import { useStartupAlbum } from './useStartupAlbum'

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  draw: vi.fn(),
  remember: vi.fn(),
  fonts: vi.fn(async () => {}),
  history: [] as StartupAlbumHistory,
}))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: { app: { claimStartupAlbum: mocks.claim, drawStartupAlbum: mocks.draw } },
}))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
vi.mock('./startupAlbumPreference', () => ({
  useStartupAlbumPreference: () => ({ enabled: { value: false } }),
  startupAlbumStorage: () => undefined,
  readStartupAlbumHistory: () => [...mocks.history],
  rememberStartupAlbum: mocks.remember,
}))
vi.mock('./StartupAlbumOverlay.vue', () => ({ default: { render: () => null } }))
vi.mock('./rendering/scene', () => ({ createCardScene: vi.fn() }))
vi.mock('./rendering/cardTypography', () => ({ loadCardFonts: mocks.fonts }))

const renderer = createRenderer<Record<string, unknown>, Record<string, unknown>>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp() {},
})
let unmount: (() => void) | undefined

function mount() {
  let controller!: ReturnType<typeof useStartupAlbum>
  let actions!: StartupAlbumActions
  const consumer = {
    setup() {
      actions = inject(startupAlbumActionsKey)!
      return () => null
    },
  }
  const app = renderer.createApp({
    setup() {
      controller = useStartupAlbum()
      return () => h(consumer)
    },
  })
  app.mount({})
  unmount = () => app.unmount()
  return { controller, actions }
}

function album(name: string): RandomAlbumTracksResult {
  return {
    albumArtist: 'Artist',
    album: name,
    tracks: [
      {
        id: 1,
        title: 'Track',
        artist: 'Artist',
        album: name,
        albumArtist: 'Artist',
        durationSeconds: 180,
        artworkCacheKey: null,
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.history = []
  mocks.remember.mockImplementation((_storage: unknown, value: StartupAlbumKey) => {
    mocks.history = [{ albumArtist: value.albumArtist, album: value.album }, ...mocks.history]
  })
})
afterEach(() => {
  unmount?.()
  unmount = undefined
})

it('draws repeatedly with startup disabled, preparing a fresh presentation and recent history', async () => {
  const first = album('First')
  const second = album('Second')
  mocks.draw.mockResolvedValueOnce({ album: first }).mockResolvedValueOnce({ album: second })
  const { controller, actions } = mount()
  expect(mocks.claim).not.toHaveBeenCalled()
  await expect(actions.draw(new AbortController().signal)).resolves.toBe('shown')
  const firstPresentation = controller.presentation.value
  expect(firstPresentation?.album).toEqual(first)
  expect(mocks.remember).not.toHaveBeenCalled()
  controller.shown()
  controller.close()
  expect(controller.overlay.value).toBeNull()
  await expect(actions.draw(new AbortController().signal)).resolves.toBe('shown')
  expect(controller.presentation.value).not.toBe(firstPresentation)
  expect(controller.presentation.value?.album).toEqual(second)
  expect(mocks.draw.mock.calls).toEqual([
    [{ recentAlbums: [] }],
    [{ recentAlbums: [{ albumArtist: 'Artist', album: 'First' }] }],
  ])
  expect(mocks.fonts.mock.calls).toEqual([
    ['First', 'Artist'],
    ['Second', 'Artist'],
  ])
})

it('prevents overlapping draws and discards a result after the settings caller leaves', async () => {
  let resolve!: (value: { album: RandomAlbumTracksResult }) => void
  mocks.draw.mockReturnValueOnce(
    new Promise<{ album: RandomAlbumTracksResult }>((yes) => {
      resolve = yes
    }),
  )
  const { controller, actions } = mount()
  const request = new AbortController()
  const pending = actions.draw(request.signal)
  expect(actions.busy.value).toBe(true)
  await expect(actions.draw(new AbortController().signal)).resolves.toBe('cancelled')
  request.abort()
  resolve({ album: album('Late') })
  await expect(pending).resolves.toBe('cancelled')
  expect(mocks.draw).toHaveBeenCalledTimes(1)
  expect(controller.active.value).toBe(false)
  expect(actions.busy.value).toBe(false)
  expect(mocks.remember).not.toHaveBeenCalled()
})

it('reports empty and failed draws and permits another attempt', async () => {
  mocks.draw
    .mockResolvedValueOnce({ album: null })
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce({ album: album('Retry') })
  const { controller, actions } = mount()
  await expect(actions.draw(new AbortController().signal)).resolves.toBe('empty')
  expect(actions.busy.value).toBe(false)
  await expect(actions.draw(new AbortController().signal)).resolves.toBe('failed')
  expect(actions.busy.value).toBe(false)
  expect(controller.active.value).toBe(false)
  await expect(actions.draw(new AbortController().signal)).resolves.toBe('shown')
})

it('returns focus to the draw button after closing the card', async () => {
  mocks.draw.mockResolvedValueOnce({ album: album('Draw') })
  const trigger = { isConnected: true, closest: () => null, focus: vi.fn() }
  const { controller, actions } = mount()
  await actions.draw(new AbortController().signal, trigger as unknown as HTMLElement)
  controller.close()
  await nextTick()
  expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true })
})
