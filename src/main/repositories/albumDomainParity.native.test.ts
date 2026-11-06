import { createRequire } from 'node:module'
import { afterEach, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { ScannedTrack } from '@shared/types/libraryScan'
import { groupAlbums, moreAlbumsByGenre, selectAlbumTracks } from '@shared/utils/albumGrouping'
import { migrateDatabase } from '../database/schema'
import { LibraryService } from '../services/libraryService'
import { LibraryRepository } from './libraryRepository'
import { TrackRepository } from './trackRepository'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database
const databases: Database.Database[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
const cover = (letter: string) => `v2-${letter.repeat(64)}.webp`
function scanned(id: number, patch: Partial<ScannedTrack> = {}): ScannedTrack {
  return {
    filePath: `C:/isolated-album-parity/${id}.flac`,
    fileSize: 100,
    fileMtimeMs: 100,
    fileFingerprint: { size: 100, mtimeMs: 100, ctimeMs: 100, dev: 1, ino: id },
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Current',
    albumArtist: 'Artist',
    trackNo: null,
    discNo: 1,
    durationSeconds: 180,
    bitrateBps: null,
    year: 2020,
    releaseDate: '2020',
    copyright: null,
    composer: null,
    genre: null,
    artworkCacheKey: cover('b'),
    artworkRead: { status: 'present', cacheKey: cover('b') },
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: `signature-${id}`,
    ...patch,
  }
}
function setup(items: ScannedTrack[]) {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  const tracks = new TrackRepository(db)
  tracks.upsertMany(items)
  return { tracks, service: new LibraryService(new LibraryRepository(db), tracks) }
}

it('keeps genre associations identical for the detail query and full catalog domain rules', () => {
  const { tracks, service } = setup([
    scanned(1, { title: 'Zebra', genre: 'Rock' }),
    scanned(2, { title: 'Äther', genre: 'Jazz' }),
    scanned(3, {
      artist: 'Jazz artist',
      albumArtist: 'Jazz artist',
      album: 'Jazz match',
      genre: 'Jazz',
    }),
    scanned(4, {
      artist: 'Rock artist',
      albumArtist: 'Rock artist',
      album: 'Rock match',
      genre: 'Rock',
    }),
  ])
  const catalog = tracks.getAll()
  const detail = service.getAlbumDetail({ albumArtist: 'Artist', albumTitle: 'Current' })
  const selected = selectAlbumTracks(catalog, 'Artist', 'Current')
  const seeded = moreAlbumsByGenre(groupAlbums(catalog), selected, 'Artist', 'Current')
  expect(detail.tracks.map((track) => track.id)).toEqual(selected.map((track) => track.id))
  expect(detail.genreAlbums.map((album) => album.title)).toEqual(['Jazz match'])
  expect(seeded.map((album) => album.title)).toEqual(detail.genreAlbums.map((album) => album.title))
})

it('uses the same representative metadata in SQL and renderer summaries regardless of input order', () => {
  const { tracks } = setup([
    scanned(1, { releaseDate: '2022' }),
    scanned(2, {
      releaseDate: '2010',
      artworkCacheKey: cover('a'),
      artworkRead: { status: 'present', cacheKey: cover('a') },
    }),
  ])
  const members = tracks.getAll()
  const main = tracks.getArtistAlbumSummaries('Artist', 'Absent')[0]
  for (const input of [members, [...members].reverse()]) {
    const renderer = groupAlbums(input)[0]
    expect({
      releaseDate: renderer.releaseDate,
      artworkCacheKey: renderer.artworkCacheKey,
    }).toEqual({ releaseDate: main.releaseDate, artworkCacheKey: main.artworkCacheKey })
    expect(renderer.artworkCacheKey).toBe(cover('a'))
  }
})
