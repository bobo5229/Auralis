import { describe, expect, it, vi } from 'vitest'
import { createArtworkBackgroundSession } from './artworkBackgroundSession'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function image(src: string): HTMLImageElement {
  return { src } as HTMLImageElement
}

describe('artwork background session', () => {
  it('serializes decoding and commits only the latest queued cover', async () => {
    const decoding = deferred()
    let visible = ''
    const renderer = {
      setAlbum: vi.fn(async (album: HTMLImageElement) => {
        if (album.src === 'old') await decoding.promise
        visible = album.src
      }),
      pause: vi.fn(),
      dispose: vi.fn(),
    }
    const session = createArtworkBackgroundSession(renderer)
    const old = session.setAlbum(image('old'))
    const skipped = session.setAlbum(image('intermediate'))
    const latest = session.setAlbum(image('latest'))
    expect(renderer.setAlbum).toHaveBeenCalledTimes(1)
    decoding.resolve()
    await Promise.all([old, skipped, latest])
    expect(visible).toBe('latest')
    expect(renderer.setAlbum.mock.calls.map(([album]) => album.src)).toEqual(['old', 'latest'])
  })

  it('pauses immediately and disposes all resources after in-flight decoding settles', async () => {
    const decoding = deferred()
    const resources: string[] = []
    const renderer = {
      setAlbum: vi.fn(async () => {
        await decoding.promise
        resources.push('texture')
      }),
      pause: vi.fn(),
      dispose: vi.fn(() => resources.splice(0)),
    }
    const session = createArtworkBackgroundSession(renderer)
    const active = session.setAlbum(image('old'))
    const queued = session.setAlbum(image('latest'))
    session.dispose()
    session.dispose()
    await session.setAlbum(image('after-close'))
    expect(renderer.pause).toHaveBeenCalledTimes(1)
    expect(renderer.dispose).not.toHaveBeenCalled()
    decoding.resolve()
    await Promise.all([active, queued])
    await Promise.resolve()
    expect(renderer.setAlbum).toHaveBeenCalledTimes(1)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    expect(resources).toEqual([])
  })

  it('continues with the latest cover after a failed commit', async () => {
    const decoding = deferred()
    const renderer = {
      setAlbum: vi.fn().mockReturnValueOnce(decoding.promise).mockResolvedValue(undefined),
      pause: vi.fn(),
      dispose: vi.fn(),
    }
    const session = createArtworkBackgroundSession(renderer)
    const failed = expect(session.setAlbum(image('broken'))).rejects.toThrow('decode failed')
    const latest = session.setAlbum(image('latest'))
    decoding.reject(new Error('decode failed'))
    await failed
    await latest
    expect(renderer.setAlbum).toHaveBeenLastCalledWith(image('latest'))
    session.dispose()
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })

  it('invalidates queued covers when the context is lost', async () => {
    const decoding = deferred()
    const renderer = {
      setAlbum: vi.fn().mockReturnValue(decoding.promise),
      pause: vi.fn(),
      dispose: vi.fn(),
    }
    const session = createArtworkBackgroundSession(renderer)
    const active = session.setAlbum(image('active'))
    const queued = session.setAlbum(image('queued'))
    session.cancelPendingAlbum()
    decoding.resolve()
    await Promise.all([active, queued])
    expect(renderer.setAlbum).toHaveBeenCalledTimes(1)
  })

  it('still disposes when the last in-flight commit fails', async () => {
    const decoding = deferred()
    const renderer = {
      setAlbum: vi.fn().mockReturnValue(decoding.promise),
      pause: vi.fn(),
      dispose: vi.fn(),
    }
    const session = createArtworkBackgroundSession(renderer)
    const failed = expect(session.setAlbum(image('broken'))).rejects.toThrow('decode failed')
    session.dispose()
    decoding.reject(new Error('decode failed'))
    await failed
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })
})
