import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  parseRecentAddedLibraryRange,
  parseRecentAddedLibraryTimestamp,
  selectRecentAddedLibraryTracks,
} from './recentAddedLibrary'

const DAY_MS = 86_400_000
const NOW = Date.UTC(2026, 9, 15, 12)

function createTrack(id: number, createdAt: string, album = `Album ${id}`): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    album,
    albumArtist: 'Artist',
    trackNo: id,
    discNo: 1,
    releaseDate: null,
    copyright: null,
    composer: null,
    bitrateBps: null,
    durationSeconds: null,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt,
  }
}

describe('recent-added library range parsing', () => {
  it.each([
    [7, 7],
    ['7', 7],
    [30, 30],
    ['30', 30],
    [90, 90],
    ['90', 90],
    ['all', 'all'],
  ] as const)('parses %s as %s', (value, expected) => {
    expect(parseRecentAddedLibraryRange(value)).toBe(expected)
  })

  it.each([null, undefined, '', [], ['7'], {}, true])('rejects an invalid range value', (value) => {
    expect(parseRecentAddedLibraryRange(value)).toBeNull()
  })
})

describe('selectRecentAddedLibraryTracks', () => {
  it.each([7, 30, 90] as const)('includes both boundaries for %i days', (range) => {
    const tracks = [
      createTrack(1, new Date(NOW - range * DAY_MS).toISOString()),
      createTrack(2, new Date(NOW).toISOString()),
      createTrack(3, new Date(NOW - range * DAY_MS - 1).toISOString()),
      createTrack(4, new Date(NOW + 1).toISOString()),
      createTrack(5, 'invalid timestamp'),
    ]

    expect(selectRecentAddedLibraryTracks(tracks, range, NOW).map((track) => track.id)).toEqual([
      2, 1,
    ])
  })

  it('keeps invalid timestamps at the end for the all range', () => {
    const tracks = [
      createTrack(2, 'invalid timestamp'),
      createTrack(1, new Date(NOW - DAY_MS).toISOString()),
      createTrack(4, new Date(NOW).toISOString()),
      createTrack(3, ''),
    ]

    expect(selectRecentAddedLibraryTracks(tracks, 'all', NOW).map((track) => track.id)).toEqual([
      4, 1, 3, 2,
    ])
  })

  it('orders albums with equal timestamps by descending track id', () => {
    const timestamp = new Date(NOW - DAY_MS).toISOString()
    const tracks = [createTrack(2, timestamp), createTrack(9, timestamp), createTrack(5, timestamp)]

    expect(selectRecentAddedLibraryTracks(tracks, 7, NOW).map((track) => track.id)).toEqual([
      9, 5, 2,
    ])
  })

  it('keeps albums newest first and orders their tracks by disc and track number', () => {
    const older = new Date(NOW - DAY_MS).toISOString()
    const newer = new Date(NOW).toISOString()
    const tracks = [
      { ...createTrack(4, newer, 'A'), discNo: 2, trackNo: 1 },
      { ...createTrack(3, newer, 'A'), discNo: 1, trackNo: null },
      { ...createTrack(2, newer, 'A'), discNo: 1, trackNo: 10 },
      createTrack(5, older, 'B'),
      { ...createTrack(1, older, 'A'), discNo: null, trackNo: 2 },
      { ...createTrack(6, older, 'A'), albumArtist: 'Other artist' },
    ]
    const original = [...tracks]

    expect(selectRecentAddedLibraryTracks(tracks, 'all', NOW).map((track) => track.id)).toEqual([
      1, 2, 3, 4, 6, 5,
    ])
    expect(tracks).toEqual(original)
  })

  it('interprets SQLite timestamps as UTC', () => {
    expect(parseRecentAddedLibraryTimestamp('2026-10-15 12:00:00')).toBe(NOW)
  })

  it('returns a new ordered array without changing tracks or their objects', () => {
    const recent = createTrack(1, new Date(NOW - DAY_MS).toISOString())
    const older = createTrack(2, new Date(NOW - 3 * DAY_MS).toISOString())
    const tracks = [older, recent]
    const result = selectRecentAddedLibraryTracks(tracks, 7, NOW)

    expect(result).toEqual([recent, older])
    expect(result).not.toBe(tracks)
    expect(result[0]).toBe(recent)
    expect(tracks).toEqual([older, recent])
  })

  it('returns only the in-range track from an album', () => {
    const recent = createTrack(1, new Date(NOW - DAY_MS).toISOString())
    const older = createTrack(2, new Date(NOW - 10 * DAY_MS).toISOString(), recent.album!)

    expect(selectRecentAddedLibraryTracks([older, recent], 7, NOW)).toEqual([recent])
  })
})
