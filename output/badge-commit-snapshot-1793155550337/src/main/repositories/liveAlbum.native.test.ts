import { createRequire } from 'node:module'
import { afterEach, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../database/schema'
import { TrackRepository } from './trackRepository'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const databases: Database.Database[] = []
afterEach(() => databases.splice(0).forEach((db) => db.close()))

function setup() {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  const insert = db.prepare(`INSERT INTO tracks
    (id, file_path, title, artist, album_artist, album, genre, disc_no, availability)
    VALUES (?, ?, 'Song', ?, ?, ?, ?, ?, ?)`)
  const add = (
    id: number,
    genre: string | null,
    album: string | null = 'Concert',
    artist: string | null = 'Artist',
    albumArtist: string | null = null,
    disc = 1,
    availability = 'available',
  ) => insert.run(id, `${id}.flac`, artist, albumArtist, album, genre, disc, availability)
  return { db, add, repository: new TrackRepository(db) }
}

it.each(['Live', ' LIVE ', 'Pop; Live', 'Rock; live; Cantopop'])(
  'recognizes complete Live values across all discs: %s',
  (genre) => {
    const { add, repository } = setup()
    add(1, 'Live')
    add(2, genre, 'Concert', 'Guest', 'Artist', 2)
    expect(repository.isLiveAlbum(1)).toBe(true)
    expect(repository.isLiveAlbum(2)).toBe(true)
  },
)

it.each([null, '', 'Pop', 'Live Electronic', 'Olive', 'Pop/Live', 'Pop;Live'])(
  'rejects the whole album when one member lacks a complete Live value: %s',
  (genre) => {
    const { add, repository } = setup()
    add(1, 'Live')
    add(2, genre)
    expect(repository.isLiveAlbum(1)).toBe(false)
    expect(repository.isLiveAlbum(2)).toBe(false)
  },
)

it('includes unavailable members and reads metadata changes without a result cache', () => {
  const { db, add, repository } = setup()
  add(1, 'Live')
  add(2, 'Pop', 'Concert', 'Artist', null, 2, 'missing')
  expect(repository.isLiveAlbum(1)).toBe(false)
  db.exec("UPDATE tracks SET genre = 'Live' WHERE id = 2")
  expect(repository.isLiveAlbum(1)).toBe(true)
  db.exec('UPDATE tracks SET genre = NULL WHERE id = 1')
  expect(repository.isLiveAlbum(2)).toBe(false)
})

it('separates same-title albums by displayed artist identity', () => {
  const { add, repository } = setup()
  add(1, 'Live')
  add(2, 'Pop', 'Concert', 'Other Artist')
  add(3, 'Live', 'Concert', null)
  add(4, 'Live', 'Concert', '', '')
  add(5, 'Live', 'Concert', 'Unknown Artist')
  expect(repository.isLiveAlbum(1)).toBe(true)
  expect(repository.isLiveAlbum(2)).toBe(false)
  for (const id of [3, 4, 5]) expect(repository.isLiveAlbum(id)).toBe(true)
})

it('does not classify absent tracks or unnamed albums as Live', () => {
  const { add, repository } = setup()
  add(1, 'Live', null)
  add(2, 'Live', '')
  add(3, 'Live', '   ')
  for (const id of [1, 2, 3, 999]) expect(repository.isLiveAlbum(id)).toBe(false)
})
