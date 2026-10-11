import { expect, it, vi } from 'vitest'
import { createStartupAlbumSession } from './startupAlbumSession'

it('claims once across callers and starts fresh only in a new application session', () => {
  const pick = vi.fn(() => ({ albumArtist: 'Artist', album: 'Album', tracks: [] }))
  const claim = createStartupAlbumSession()
  expect(claim(pick).album?.album).toBe('Album')
  expect(claim(pick)).toEqual({ album: null })
  expect(pick).toHaveBeenCalledTimes(1)
  expect(createStartupAlbumSession()(pick).album?.album).toBe('Album')
})
it('consumes empty and failed claims so later windows cannot introduce a delayed recommendation', () => {
  const empty = createStartupAlbumSession()
  expect(empty(() => null)).toEqual({ album: null })
  const pick = vi.fn(() => null)
  empty(pick)
  expect(pick).not.toHaveBeenCalled()
  const failed = createStartupAlbumSession()
  expect(() =>
    failed(() => {
      throw new Error('query failed')
    }),
  ).toThrow('query failed')
  expect(failed(pick)).toEqual({ album: null })
  expect(pick).not.toHaveBeenCalled()
})
