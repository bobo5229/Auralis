import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const dependencies = vi.hoisted(() => ({
  read: vi.fn(),
  preference: vi.fn(),
  peek: vi.fn(),
  load: vi.fn(),
}))
vi.mock('./albumDetailSnapshot', () => ({ readAlbumDetailSnapshot: dependencies.read }))
vi.mock('./albumColorPreferences', () => ({ getAlbumColorPreference: dependencies.preference }))
vi.mock('@renderer/shared/artwork/useArtworkPalette', () => ({
  getArtworkPalette: dependencies.load,
  peekArtworkPalette: dependencies.peek,
}))
import {
  prepareAlbumDetailNavigation,
  prepareAlbumDetailPalette,
} from './prepareAlbumDetailPalette'

beforeEach(() => {
  vi.resetAllMocks()
  dependencies.read.mockReturnValue({
    artworkCacheKey: 'cover',
    tracks: [{ id: 1, createdAt: 'date' }],
  })
})

describe('prepareAlbumDetailPalette', () => {
  it('waits for an uncached palette', async () => {
    let resolve!: () => void
    dependencies.load.mockReturnValue(new Promise<void>((done) => (resolve = done)))
    let ready = false
    const pending = prepareAlbumDetailPalette('artist', 'album').then(() => (ready = true))
    await Promise.resolve()
    expect(ready).toBe(false)
    expect(dependencies.load).toHaveBeenCalledWith('cover')
    resolve()
    await pending
    expect(ready).toBe(true)
  })

  it('uses the fallback after the total deadline if palette loading stalls', async () => {
    vi.useFakeTimers()
    try {
      dependencies.load.mockReturnValue(new Promise(() => {}))
      const pending = prepareAlbumDetailPalette('artist', 'album')
      await vi.advanceTimersByTimeAsync(1000)
      await expect(pending).resolves.toEqual({ fallback: true })
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['cached', 'custom', 'missing'] as const)(
    'does not load a palette when %s',
    async (condition) => {
      if (condition === 'cached') dependencies.peek.mockReturnValue({})
      if (condition === 'custom') dependencies.preference.mockReturnValue({ r: 0, g: 0, b: 0 })
      if (condition === 'missing') dependencies.read.mockReturnValue(null)
      await prepareAlbumDetailPalette('artist', 'album')
      expect(dependencies.load).not.toHaveBeenCalled()
    },
  )

  it('keeps the list visible while loading and cancels a superseded navigation', async () => {
    let resolve!: () => void
    dependencies.load.mockReturnValue(new Promise<void>((done) => (resolve = done)))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/albums', name: 'albums', component: {} },
        { path: '/detail', name: 'album-detail', component: {} },
        { path: '/other', name: 'other', component: {} },
      ],
    })
    router.beforeEach(prepareAlbumDetailNavigation)
    await router.push('/albums')
    const pending = router.push({ path: '/detail', query: { artist: 'artist', title: 'album' } })
    await vi.waitFor(() => expect(dependencies.load).toHaveBeenCalledOnce())
    expect(router.currentRoute.value.name).toBe('albums')
    await router.push('/other')
    resolve()
    await pending
    expect(router.currentRoute.value.name).toBe('other')
  })
})
