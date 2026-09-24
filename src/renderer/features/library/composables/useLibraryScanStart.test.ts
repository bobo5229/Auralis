import { describe, expect, it, vi } from 'vitest'
import { useLibraryScanStart } from './useLibraryScanStart'

describe('useLibraryScanStart', () => {
  it('starts a library scan from the first root', async () => {
    const getLibraryRoots = vi.fn(async () => [{ id: 4 }, { id: 9 }])
    const startLibraryScan = vi.fn(async () => undefined)
    const { isStartingLibraryRefresh, refreshLibrary } = useLibraryScanStart({
      getLibraryRoots,
      startLibraryScan,
    })

    await refreshLibrary()

    expect(startLibraryScan).toHaveBeenCalledWith(4)
    expect(isStartingLibraryRefresh.value).toBe(false)
  })

  it('ignores a second click while start is in flight', async () => {
    let release!: () => void
    const started = new Promise<void>((resolve) => {
      release = resolve
    })
    const getLibraryRoots = vi.fn(async () => [{ id: 4 }])
    const startLibraryScan = vi.fn(async () => started)
    const { refreshLibrary } = useLibraryScanStart({
      getLibraryRoots,
      startLibraryScan,
    })

    const first = refreshLibrary()
    const second = refreshLibrary()
    release()
    await Promise.all([first, second])

    expect(startLibraryScan).toHaveBeenCalledOnce()
  })

  it('does not start a scan when no roots are configured', async () => {
    const startLibraryScan = vi.fn(async () => undefined)
    const { refreshLibrary } = useLibraryScanStart({
      getLibraryRoots: async () => [],
      startLibraryScan,
    })

    await refreshLibrary()

    expect(startLibraryScan).not.toHaveBeenCalled()
  })
})
