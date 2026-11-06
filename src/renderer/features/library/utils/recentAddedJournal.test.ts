import { describe, expect, it, vi } from 'vitest'
import { selectAlbumTracks } from '@shared/utils/albumGrouping'
import * as timestampUtils from './recentAddedLibrary'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  buildRecentAddedJournal,
  getRecentAddedJournal,
  getRecentAddedJournalIncrementally,
  RecentJournalBuildStaleError,
  filterJournalDays,
  journalDayKey,
} from './recentAddedJournal'

const time = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime()
function track(id: number, day: number, patch: Partial<TrackListItem> = {}): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    albumArtist: 'Artist',
    album: 'Album',
    trackNo: id,
    discNo: 1,
    releaseDate: null,
    copyright: null,
    composer: null,
    durationSeconds: 120,
    bitrateBps: null,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: new Date(time(day)).toISOString(),
    ...patch,
  }
}
describe('daily collection journal', () => {
  it('keeps first-day album entries and later additions separate while retaining complete album membership', () => {
    const tracks = [track(3, 7), track(2, 1), track(1, 1)]
    const days = buildRecentAddedJournal(tracks, 'all', time(8))
    expect(days.map((day) => day.key)).toEqual([journalDayKey(time(7)), journalDayKey(time(1))])
    expect(days[0].albums).toEqual([])
    expect(days[0].additions[0].tracks.map((t) => t.id)).toEqual([3])
    expect(days[1].albums[0].tracks.map((t) => t.id)).toEqual([1, 2])
    expect(days[1].albums[0].album.tracks).toHaveLength(3)
    expect(tracks.map((t) => t.id)).toEqual([3, 2, 1])
  })
  it('classifies before applying the range and never turns an old album into a new one', () => {
    const days = buildRecentAddedJournal([track(1, 1), track(2, 7)], 2, time(8))
    expect(days).toHaveLength(1)
    expect(days[0].albums).toHaveLength(0)
    expect(days[0].additions[0].tracks.map((t) => t.id)).toEqual([2])
    expect(filterJournalDays(days, 'albums')).toEqual([])
    expect(filterJournalDays(days, 'tracks')[0].additions).toHaveLength(1)
  })
  it('uses local calendar midnight, merges separate additions within a day and respects disc ordering', () => {
    const days = buildRecentAddedJournal(
      [
        track(1, 6, { createdAt: new Date(2026, 10, 6, 23, 59).toISOString(), discNo: 2 }),
        track(2, 6, { createdAt: new Date(2026, 10, 6, 1).toISOString(), discNo: 1 }),
        track(3, 7, { createdAt: new Date(2026, 10, 7, 0, 1).toISOString() }),
      ],
      'all',
      time(8),
    )
    expect(days).toHaveLength(2)
    expect(days[1].albums).toHaveLength(1)
    expect(days[1].albums[0].tracks.map((t) => t.id)).toEqual([2, 1])
    expect(days[0].additions[0].tracks.map((t) => t.id)).toEqual([3])
  })
  it('keeps missing album tags as loose tracks and follows album-artist identity', () => {
    const days = buildRecentAddedJournal(
      [
        track(1, 7, { album: null }),
        track(2, 7, { album: '  ' }),
        track(3, 7, { artist: 'Guest', albumArtist: 'Various' }),
        track(4, 7, { artist: 'Another', albumArtist: 'Various' }),
        track(5, 7, { albumArtist: null }),
      ],
      'all',
      time(8),
    )
    expect(days[0].looseTracks.map((t) => t.id)).toEqual([2, 1])
    expect(days[0].albums).toHaveLength(2)
    expect(filterJournalDays(days, 'albums')[0].looseTracks).toEqual([])
    expect(filterJournalDays(days, 'tracks')[0].albums).toEqual([])
  })
  it('isolates unknown timestamps, excludes future and missing tracks, and reconstructs metadata changes', () => {
    const original = [
      track(1, 1),
      track(2, 7),
      track(3, 7, { createdAt: 'invalid' }),
      track(4, 10),
      track(5, 7, { availability: 'missing' }),
    ]
    const days = buildRecentAddedJournal(original, 'all', time(8))
    expect(days.map((day) => day.key)).toEqual([
      journalDayKey(time(7)),
      journalDayKey(time(1)),
      'undated',
    ])
    expect(days[2].date).toBeNull()
    expect(buildRecentAddedJournal(original, 2, time(8))).toHaveLength(1)
    const renamed = buildRecentAddedJournal(
      [original[0], { ...original[1], album: 'Different' }],
      'all',
      time(8),
    )
    expect(renamed[0].albums[0].album.title).toBe('Different')
    expect(
      buildRecentAddedJournal(
        [original[0], { ...original[1], availability: 'missing' }],
        'all',
        time(8),
      ),
    ).toHaveLength(1)
    expect(
      buildRecentAddedJournal(original.slice(0, 2), 'all', time(8))[0].additions[0].tracks[0].id,
    ).toBe(2)
  })
  it('does not duplicate members across type filters', () => {
    const days = buildRecentAddedJournal(
      [track(1, 1), track(2, 7), track(3, 7, { album: null }), track(4, 7, { album: 'New' })],
      'all',
      time(8),
    )
    const ids = days
      .flatMap((day) => [
        ...day.albums.flatMap((e) => e.tracks),
        ...day.additions.flatMap((e) => e.tracks),
        ...day.looseTracks,
      ])
      .map((t) => t.id)
    expect(ids.sort()).toEqual([1, 2, 3, 4])
  })
})

describe('journal generation reuse', () => {
  it('reuses an immutable catalog until an inclusive rolling range expires', () => {
    const rows = [track(1, 1)]
    Object.freeze(rows)
    const first = getRecentAddedJournal(rows, 7, time(2))
    expect(getRecentAddedJournal(rows, 7, time(8))).toBe(first)
    expect(first).toHaveLength(1)
    expect(getRecentAddedJournal(rows, 7, time(8) + 1)).toEqual([])
  })
  it('includes future-dated entries when their timestamp arrives and handles a clock moving backwards', () => {
    const rows = [track(1, 7), track(2, 8)]
    Object.freeze(rows)
    const first = getRecentAddedJournal(rows, 'all', time(7))
    expect(getRecentAddedJournal(rows, 'all', time(7) + 1)).toBe(first)
    expect(getRecentAddedJournal(rows, 'all', time(8))).toHaveLength(2)
    expect(getRecentAddedJournal(rows, 'all', time(7))).toEqual(first)
  })
  it('does not reuse a different catalog generation or a mutable input', () => {
    const rows = [track(1, 7)]
    const first = getRecentAddedJournal(rows, 'all', time(8))
    rows.push(track(2, 8))
    expect(getRecentAddedJournal(rows, 'all', time(8))).toHaveLength(2)
    const frozen = Object.freeze([track(1, 7)])
    expect(getRecentAddedJournal(frozen, 'all', time(8))).not.toBe(first)
  })
})

describe('incremental journal construction', () => {
  it('parses repeated timestamps once and preserves full album metadata', () => {
    const parse = vi.spyOn(timestampUtils, 'parseRecentAddedLibraryTimestamp')
    try {
      const rows = Array.from({ length: 1000 }, (_, i) =>
        track(i, 7, { releaseDate: i === 999 ? '2020' : null }),
      )
      const result = buildRecentAddedJournal(rows, 'all', time(8))
      expect(parse).toHaveBeenCalledTimes(1)
      expect(result[0].albums[0].album.releaseDate).toBe('2020')
      expect(result[0].albums[0].album.tracks).toHaveLength(1000)
      expect(rows[0].releaseDate).toBeNull()
    } finally {
      parse.mockRestore()
    }
  })
  it('yields during large album and loose-track sorting and publishes the same complete order', async () => {
    const album = Array.from({ length: 1200 }, (_, i) =>
      track(i, 7, { trackNo: 1200 - i, discNo: i % 3 }),
    )
    const loose = Array.from({ length: 1300 }, (_, i) =>
      track(2000 + i, i % 2 ? 6 : 7, { album: null }),
    )
    const rows = [...album, ...loose]
    Object.freeze(rows)
    let clock = 0
    const yieldMain = vi.fn(async () => {})
    const result = await getRecentAddedJournalIncrementally(rows, 'all', time(8), {
      isCurrent: () => true,
      yieldToMain: yieldMain,
      now: () => clock++,
      chunkBudgetMs: 1,
    })
    expect(yieldMain.mock.calls.length).toBeGreaterThan(10)
    expect(result).toEqual(buildRecentAddedJournal(rows, 'all', time(8)))
    expect(result[0].albums[0].tracks).toEqual(selectAlbumTracks(album, 'Artist', 'Album'))
    expect(result[0].looseTracks.map((t) => t.id)).toEqual(
      loose
        .filter((t) => t.id % 2 === 0)
        .map((t) => t.id)
        .reverse(),
    )
    const unused = vi.fn(async () => {})
    expect(
      await getRecentAddedJournalIncrementally(rows, 'all', time(8), {
        isCurrent: () => true,
        yieldToMain: unused,
      }),
    ).toBe(result)
    expect(unused).not.toHaveBeenCalled()
  })
  it('cancels between slices without caching a partial journal', async () => {
    const rows = Object.freeze(Array.from({ length: 1000 }, (_, i) => track(i, 7)))
    let allowed = true,
      clock = 0,
      yields = 0
    await expect(
      getRecentAddedJournalIncrementally(rows, 'all', time(8), {
        isCurrent: () => allowed,
        now: () => clock++,
        chunkBudgetMs: 1,
        yieldToMain: async () => {
          if (++yields === 2) allowed = false
        },
      }),
    ).rejects.toBeInstanceOf(RecentJournalBuildStaleError)
    const resume = vi.fn(async () => {})
    const result = await getRecentAddedJournalIncrementally(rows, 'all', time(8), {
      isCurrent: () => true,
      yieldToMain: resume,
    })
    expect(resume).toHaveBeenCalled()
    expect(result[0].albums[0].tracks).toHaveLength(1000)
  })
  it('rechecks future and inclusive range boundaries on the asynchronous cache path', async () => {
    const rows = Object.freeze([track(1, 1), track(2, 8)])
    const options = { isCurrent: () => true, yieldToMain: async () => {} }
    const before = await getRecentAddedJournalIncrementally(rows, 7, time(8) - 1, options)
    expect(
      before
        .flatMap((d) => [...d.albums, ...d.additions])
        .flatMap((e) => e.tracks)
        .map((t) => t.id),
    ).toEqual([1])
    const boundary = await getRecentAddedJournalIncrementally(rows, 7, time(8), options)
    expect(boundary).toHaveLength(2)
    const after = await getRecentAddedJournalIncrementally(rows, 7, time(8) + 1, options)
    expect(after).toHaveLength(1)
    expect(after[0].additions[0].tracks.map((t) => t.id)).toEqual([2])
  })
})
