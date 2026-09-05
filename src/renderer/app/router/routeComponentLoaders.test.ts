import { describe, expect, it, vi } from 'vitest'
import {
  createRouteLoaderRegistry,
  PRIMARY_WARMABLE_ROUTES,
  type RouteComponentLoader,
} from './routeComponentLoaders'

describe('routeComponentLoaders', () => {
  it('defines primary warmable routes strictly matching albums, archive, and settings', () => {
    expect(PRIMARY_WARMABLE_ROUTES).toEqual(['albums', 'archive', 'settings'])
  })

  it('correctly checks isWarmableRoute only for valid warmable routes', () => {
    const registry = createRouteLoaderRegistry({
      library: vi.fn(),
      albums: vi.fn(),
      albumDetail: vi.fn(),
      archive: vi.fn(),
      settings: vi.fn(),
    })

    expect(registry.isWarmableRoute('albums')).toBe(true)
    expect(registry.isWarmableRoute('archive')).toBe(true)
    expect(registry.isWarmableRoute('settings')).toBe(true)

    expect(registry.isWarmableRoute('library')).toBe(false)
    expect(registry.isWarmableRoute('album-detail')).toBe(false)
    expect(registry.isWarmableRoute('playlist')).toBe(false)
    expect(registry.isWarmableRoute(null)).toBe(false)
    expect(registry.isWarmableRoute(undefined)).toBe(false)
    expect(registry.isWarmableRoute('')).toBe(false)
  })

  it('deduplicates concurrent in-flight loading promises for the same route', async () => {
    let resolveAlbums!: (val: { default: object }) => void
    const albumsMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAlbums = resolve
        }),
    )

    const registry = createRouteLoaderRegistry({
      library: vi.fn(),
      albums: albumsMock as RouteComponentLoader,
      albumDetail: vi.fn(),
      archive: vi.fn(),
      settings: vi.fn(),
    })

    const p1 = registry.loadRoute('albums')
    const p2 = registry.loadRoute('albums')
    const p3 = registry.routeLoaders.albums()

    expect(p1).toBe(p2)
    expect(p2).toBe(p3)
    expect(albumsMock).toHaveBeenCalledTimes(1)
    expect(registry.isInFlight('albums')).toBe(true)

    const fakeComp = { default: { name: 'AlbumsPage' } }
    resolveAlbums(fakeComp)

    const [res1, res2, res3] = await Promise.all([p1, p2, p3])
    expect(res1).toBe(fakeComp)
    expect(res2).toBe(fakeComp)
    expect(res3).toBe(fakeComp)
    expect(registry.isInFlight('albums')).toBe(false)
  })

  it('cleans up in-flight promise on error, allowing subsequent retry', async () => {
    let callCount = 0
    const failingLoader = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('Network / bundle load failure')
      }
      return { default: { name: 'ArchivePage' } }
    })

    const registry = createRouteLoaderRegistry({
      library: vi.fn(),
      albums: vi.fn(),
      albumDetail: vi.fn(),
      archive: failingLoader as RouteComponentLoader,
      settings: vi.fn(),
    })

    await expect(registry.loadRoute('archive')).rejects.toThrow('Network / bundle load failure')
    expect(registry.isInFlight('archive')).toBe(false)

    // Second call should retry and succeed
    const res = await registry.loadRoute('archive')
    expect(res).toEqual({ default: { name: 'ArchivePage' } })
    expect(failingLoader).toHaveBeenCalledTimes(2)
  })
})
