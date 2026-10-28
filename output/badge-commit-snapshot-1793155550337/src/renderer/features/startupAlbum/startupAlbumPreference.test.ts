import { expect, it, vi } from 'vitest'
import {
  LAST_STARTUP_ALBUM_KEY,
  readLastStartupAlbum,
  readStartupAlbumEnabled,
  rememberStartupAlbum,
  useStartupAlbumPreference,
  STARTUP_ALBUM_ENABLED_KEY,
  STARTUP_ALBUM_HISTORY_KEY,
  readStartupAlbumHistory,
} from './startupAlbumPreference'

it('defaults on and treats unavailable storage as a recoverable preference failure', () => {
  expect(readStartupAlbumEnabled(undefined)).toBe(true)
  expect(readStartupAlbumEnabled({ getItem: () => 'false' })).toBe(false)
  const getItem = () => {
    throw new Error('blocked')
  }
  expect(readStartupAlbumEnabled({ getItem })).toBe(true)
  expect(readLastStartupAlbum({ getItem })).toBeUndefined()
  expect(() =>
    rememberStartupAlbum(
      {
        setItem: () => {
          throw new Error('blocked')
        },
      },
      { albumArtist: 'A', album: 'B' },
    ),
  ).not.toThrow()
})
it('persists only a valid previous album identity', () => {
  const setItem = vi.fn()
  const album = { albumArtist: 'Artist', album: 'Album' }
  rememberStartupAlbum({ setItem }, album)
  expect(setItem).toHaveBeenCalledWith(LAST_STARTUP_ALBUM_KEY, JSON.stringify(album))
  expect(setItem).toHaveBeenCalledWith(STARTUP_ALBUM_HISTORY_KEY, JSON.stringify([album]))
  expect(readLastStartupAlbum({ getItem: () => JSON.stringify(album) })).toEqual(album)
  for (const raw of ['invalid', '{}', 'null', '{"albumArtist":1,"album":"A"}']) {
    expect(readLastStartupAlbum({ getItem: () => raw })).toBeUndefined()
  }
})
it('retains the ten most recent distinct presentations and migrates the previous preference', () => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
  const album = (i: number) => ({ albumArtist: 'Artist', album: String(i) })
  data.set(LAST_STARTUP_ALBUM_KEY, JSON.stringify(album(0)))
  expect(readStartupAlbumHistory(storage)).toEqual([album(0)])
  for (let i = 1; i <= 12; i++) rememberStartupAlbum(storage, album(i))
  expect(readStartupAlbumHistory(storage)).toEqual(
    Array.from({ length: 10 }, (_, i) => album(12 - i)),
  )
  rememberStartupAlbum(storage, album(8))
  expect(readStartupAlbumHistory(storage).map((item) => item.album)).toEqual([
    '8',
    '12',
    '11',
    '10',
    '9',
    '7',
    '6',
    '5',
    '4',
    '3',
  ])
  expect(readLastStartupAlbum(storage)).toEqual(album(8))
})
it('writes only identities when presentation albums contain tracks and private local paths', () => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  }
  const identity = { albumArtist: 'Artist', album: 'Album' }
  const presentationAlbum = {
    ...identity,
    tracks: [{ id: 42, filePath: 'C:/private/music/song.flac', title: 'Private title' }],
  }
  // Also sanitize old oversized stored entries when updating history.
  data.set(LAST_STARTUP_ALBUM_KEY, JSON.stringify({ ...presentationAlbum, album: 'Old' }))
  rememberStartupAlbum(storage, presentationAlbum)
  expect(JSON.parse(data.get(STARTUP_ALBUM_HISTORY_KEY)!)).toEqual([
    identity,
    { ...identity, album: 'Old' },
  ])
  expect(JSON.parse(data.get(LAST_STARTUP_ALBUM_KEY)!)).toEqual(identity)
  expect([...data.values()].join('')).not.toContain('tracks')
  expect([...data.values()].join('')).not.toContain('C:/private')
})
it('recovers stale history and removes malformed, duplicate and oversized identities', () => {
  const previous = { albumArtist: 'Old', album: 'Old' }
  const valid = { albumArtist: 'A', album: 'B' }
  const storage = (raw: string) => ({
    getItem: (key: string) => (key === LAST_STARTUP_ALBUM_KEY ? JSON.stringify(previous) : raw),
  })
  expect(readStartupAlbumHistory(storage('invalid'))).toEqual([previous])
  expect(
    readStartupAlbumHistory(
      storage(
        JSON.stringify([null, {}, valid, valid, { albumArtist: 'A', album: 'x'.repeat(8193) }]),
      ),
    ),
  ).toEqual([valid])
  expect(readStartupAlbumHistory(undefined)).toEqual([])
  expect(
    readStartupAlbumHistory({
      getItem: () => {
        throw new Error('blocked')
      },
    }),
  ).toEqual([])
})
it('saves the switch and exposes failure without interrupting the session', () => {
  const storage = { setItem: vi.fn() }
  vi.stubGlobal('localStorage', storage)
  const preference = useStartupAlbumPreference()
  preference.setEnabled(false)
  expect(preference.enabled.value).toBe(false)
  expect(storage.setItem).toHaveBeenCalledWith(STARTUP_ALBUM_ENABLED_KEY, 'false')
  storage.setItem.mockImplementation(() => {
    throw new Error('blocked')
  })
  preference.setEnabled(true)
  expect(preference.persistFailed.value).toBe(true)
  vi.unstubAllGlobals()
})
