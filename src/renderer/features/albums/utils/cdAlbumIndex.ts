import { pinyin } from 'pinyin-pro'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '../types'
import {
  albumIdentityKey,
  resolveAlbumArtist,
  resolveAlbumTitle,
  UNKNOWN_ALBUM_ARTIST,
} from './albumIdentity'

export const CD_ALBUM_INDEX_SOURCE = 'index'
export const CD_INDEX_LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'] as const

export type CdIndexLetter = (typeof CD_INDEX_LETTERS)[number]

export interface CdIndexHeadingRow {
  type: 'heading'
  key: string
  artist: string
  letter: CdIndexLetter
}

export interface CdIndexAlbumRow {
  type: 'albums'
  key: string
  albums: AlbumSummary[]
}

export interface CdIndexArtistBlock {
  artist: string
  letter: CdIndexLetter
  albums: AlbumSummary[]
}

export interface CdIndexSharedRow {
  type: 'shared'
  key: string
  blocks: CdIndexArtistBlock[]
}

export type CdIndexRow = CdIndexHeadingRow | CdIndexAlbumRow | CdIndexSharedRow

export interface CdIndexLetterAnchor {
  letter: CdIndexLetter
  rowIndex: number | null
}

export interface CdAlbumIndexModel {
  rows: CdIndexRow[]
  anchors: CdIndexLetterAnchor[]
}

export interface CdIndexArtistGroup {
  name: string
  letter: CdIndexLetter
  sortKey: string
  albums: AlbumSummary[]
}

export function cdAlbumFocusQuery(album: Pick<AlbumSummary, 'albumArtist' | 'title'>): {
  artist: string
  title: string
  from: typeof CD_ALBUM_INDEX_SOURCE
} {
  return {
    artist: album.albumArtist,
    title: album.title,
    from: CD_ALBUM_INDEX_SOURCE,
  }
}

export function isCdAlbumIndexSource(from: unknown): boolean {
  return from === CD_ALBUM_INDEX_SOURCE
}

/** Back leaves focus first, then leaves CD browsing. */
export function cdFocusBackTarget(focused: boolean): 'browse' | 'albums' {
  return focused ? 'browse' : 'albums'
}

export function isSameAlbumTrack(
  track: Pick<TrackListItem, 'id' | 'album' | 'artist' | 'albumArtist'>,
  album: Pick<AlbumSummary, 'key'> & { tracks?: Pick<TrackListItem, 'id'>[] },
): boolean {
  if (album.tracks?.some((item) => item.id === track.id)) return true
  const trackArtist = resolveAlbumArtist(track)
  const trackTitle = resolveAlbumTitle(track)
  return albumIdentityKey(trackArtist, trackTitle) === album.key
}

export function shouldShowCdFocusedPlayback(
  focused: boolean,
  focusSettled: boolean,
  loading: boolean,
  failed: boolean,
  track: Pick<TrackListItem, 'id' | 'album' | 'artist' | 'albumArtist'> | null,
  album: (Pick<AlbumSummary, 'key'> & { tracks?: Pick<TrackListItem, 'id'>[] }) | null,
): boolean {
  if (!focused || !focusSettled || loading || failed || !track || !album) {
    return false
  }
  return !isSameAlbumTrack(track, album)
}

export function cdIndexArtistOrder(name: string): { letter: CdIndexLetter; sortKey: string } {
  const trimmed = name.trim()
  if (!trimmed || name === UNKNOWN_ALBUM_ARTIST) {
    return { letter: '#', sortKey: `\uffff${name}` }
  }
  const transcribed = pinyin(trimmed, {
    toneType: 'none',
    type: 'string',
    nonZh: 'consecutive',
  })
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  const first = transcribed[0]
  if (!first || first < 'a' || first > 'z') {
    return { letter: '#', sortKey: `\uffff${name}` }
  }
  return { letter: first.toUpperCase() as CdIndexLetter, sortKey: transcribed }
}

/** Comparable YYYY-MM-DD. Partial dates fill missing month and day with 01. */
export function cdIndexReleaseOrder(value: string | null): string | null {
  if (!value) return null
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(value.trim())
  if (!match) return null
  const month = match[2] ? Number(match[2]) : 1
  const day = match[3] ? Number(match[3]) : 1
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function cdIndexReleaseLabel(value: string | null): string | null {
  if (!cdIndexReleaseOrder(value) || !value) return null
  return value.trim()
}

function compareAlbums(left: AlbumSummary, right: AlbumSummary): number {
  const leftDate = cdIndexReleaseOrder(left.releaseDate)
  const rightDate = cdIndexReleaseOrder(right.releaseDate)
  if (leftDate !== rightDate) {
    if (leftDate === null) return 1
    if (rightDate === null) return -1
    return leftDate < rightDate ? -1 : 1
  }
  const title = left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  if (title !== 0) return title
  return left.key.localeCompare(right.key)
}

function compareArtists(left: CdIndexArtistGroup, right: CdIndexArtistGroup): number {
  const sortKey = left.sortKey.localeCompare(right.sortKey)
  if (sortKey !== 0) return sortKey
  return left.name.localeCompare(right.name)
}

export function groupCdAlbumIndexArtists(albums: readonly AlbumSummary[]): CdIndexArtistGroup[] {
  const grouped = new Map<string, CdIndexArtistGroup>()
  for (const album of albums) {
    const existing = grouped.get(album.albumArtist)
    if (existing) {
      existing.albums.push(album)
      continue
    }
    const order = cdIndexArtistOrder(album.albumArtist)
    grouped.set(album.albumArtist, {
      name: album.albumArtist,
      letter: order.letter,
      sortKey: order.sortKey,
      albums: [album],
    })
  }

  const artists = [...grouped.values()].sort(compareArtists)
  for (const artist of artists) artist.albums.sort(compareAlbums)
  return artists
}

export function canShareCdIndexRow(artist: CdIndexArtistGroup, columnCount: number): boolean {
  const columns = Math.max(1, Math.floor(columnCount))
  return artist.albums.length >= 1 && artist.albums.length <= columns
}

export function layoutCdAlbumIndex(
  artists: readonly CdIndexArtistGroup[],
  columnCount: number,
): CdAlbumIndexModel {
  const columns = Math.max(1, Math.floor(columnCount))

  const rows: CdIndexRow[] = []
  const anchorIndex = new Map<CdIndexLetter, number>()

  let currentSharedBlocks: CdIndexArtistBlock[] = []
  let currentSharedColumns = 0

  function flushShared(): void {
    if (currentSharedBlocks.length === 0) return
    rows.push({
      type: 'shared',
      key: `shared:${currentSharedBlocks.map((block) => block.artist).join('|')}`,
      blocks: currentSharedBlocks,
    })
    currentSharedBlocks = []
    currentSharedColumns = 0
  }

  for (const artist of artists) {
    if (canShareCdIndexRow(artist, columns)) {
      const span = artist.albums.length
      if (currentSharedColumns + span > columns) {
        flushShared()
      }
      if (!anchorIndex.has(artist.letter)) {
        anchorIndex.set(artist.letter, rows.length)
      }
      currentSharedBlocks.push({
        artist: artist.name,
        letter: artist.letter,
        albums: artist.albums,
      })
      currentSharedColumns += span
    } else {
      flushShared()
      if (!anchorIndex.has(artist.letter)) {
        anchorIndex.set(artist.letter, rows.length)
      }
      rows.push({
        type: 'heading',
        key: `heading:${artist.name}`,
        artist: artist.name,
        letter: artist.letter,
      })
      for (let index = 0; index < artist.albums.length; index += columns) {
        const slice = artist.albums.slice(index, index + columns)
        rows.push({
          type: 'albums',
          key: `albums:${artist.name}:${slice[0]?.key ?? index}`,
          albums: slice,
        })
      }
    }
  }

  flushShared()

  return {
    rows,
    anchors: CD_INDEX_LETTERS.map((letter) => ({
      letter,
      rowIndex: anchorIndex.get(letter) ?? null,
    })),
  }
}

export function buildCdAlbumIndex(
  albums: readonly AlbumSummary[],
  columnCount: number,
): CdAlbumIndexModel {
  return layoutCdAlbumIndex(groupCdAlbumIndexArtists(albums), columnCount)
}

export function findCdIndexAlbumRow(rows: readonly CdIndexRow[], albumKey: string): number {
  return rows.findIndex((row) => {
    if (row.type === 'albums') {
      return row.albums.some((album) => album.key === albumKey)
    }
    if (row.type === 'shared') {
      return row.blocks.some((block) => block.albums.some((album) => album.key === albumKey))
    }
    return false
  })
}
