import { expect, it, vi } from 'vitest'
import { createStartupAlbumSession } from './startupAlbumSession'

it('claims once across callers and starts fresh only in a new application session', async () => {
  const pick = vi.fn(() => ({ albumArtist: 'Artist', album: 'Album', tracks: [] }))
  const claim = createStartupAlbumSession()
  expect((await claim(pick)).album?.album).toBe('Album')
  expect(await claim(pick)).toEqual({ album: null })
  expect(pick).toHaveBeenCalledTimes(1)
  expect((await createStartupAlbumSession()(pick)).album?.album).toBe('Album')
})
it('consumes empty and failed claims so later windows cannot introduce a delayed recommendation', async () => {
  const empty = createStartupAlbumSession()
  expect(await empty(() => null)).toEqual({ album: null })
  const pick = vi.fn(() => null)
  await empty(pick)
  expect(pick).not.toHaveBeenCalled()
  const failed = createStartupAlbumSession()
  await expect(
    failed(() => {
      throw new Error('query failed')
    }),
  ).rejects.toThrow('query failed')
  expect(await failed(pick)).toEqual({ album: null })
  expect(pick).not.toHaveBeenCalled()
})

it('reserves the opportunity before awaiting the worker, including a rejected asynchronous query', async () => {
  let rejectQuery!: (reason: Error) => void
  const pending = new Promise<null>((_resolve, reject) => {
    rejectQuery = reject
  })
  const claim = createStartupAlbumSession()
  const first = claim(() => pending)
  const pick = vi.fn(() => null)
  expect(await claim(pick)).toEqual({ album: null })
  expect(pick).not.toHaveBeenCalled()
  rejectQuery(new Error('worker failed'))
  await expect(first).rejects.toThrow('worker failed')
  expect(await claim(pick)).toEqual({ album: null })
})
