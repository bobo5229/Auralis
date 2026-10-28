import { describe, expect, it } from 'vitest'
import { buildAnnualSummary, type AnnualListeningRow } from './annualSummary'

function row(overrides: Partial<AnnualListeningRow> = {}): AnnualListeningRow {
  return {
    source: 'library',
    trackId: 1,
    month: 3,
    firstPlayedDate: '2026-03-01',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    artworkCacheKey: null,
    durationSeconds: 180,
    available: 1,
    playCount: 3,
    recordedDuration: 540,
    ...overrides,
  }
}
describe('annual listening aggregation', () => {
  it('keeps distinct albums/artists, accumulates month records, and splits canonical artist lists', () => {
    const result = buildAnnualSummary(
      2026,
      [],
      [
        row({ artist: 'AC/DC; Guest' }),
        row({ month: 4, playCount: 2 }),
        row({ trackId: 2, albumArtist: 'Other', artist: 'Other', playCount: 4 }),
      ],
    )
    expect(result.albumCount).toBe(2)
    expect(result.albums[0]).toMatchObject({
      playCount: 5,
      trackCount: 1,
      firstPlayedDate: '2026-03-01',
    })
    expect(result.albums[0].monthlyPlays.slice(2, 4)).toEqual([3, 2])
    expect(result.artists.map((a) => a.name)).toEqual(['Other', 'AC/DC', 'Guest', 'Artist'])
    expect(result.months[2].albums[0].albumArtist).toBe('Other')
    expect(result.seasons[0].album?.albumArtist).toBe('Artist')
  })
  it('preserves removed and missing history without allowing ID collisions to enter playback', () => {
    const result = buildAnnualSummary(
      2026,
      [],
      [
        row({ source: 'removed', playCount: 20 }),
        row({ trackId: 2, available: 0, playCount: 10 }),
        row(),
      ],
    )
    expect(result.tracks.map((track) => track.playback?.id ?? null)).toEqual([null, null, 1])
    expect(result.albums[0].playCount).toBe(33)
    expect(result.selection.map((track) => track.id)).toEqual([1])
  })
  it('includes quiet-month highlights, deduplicates and caps albums at three tracks', () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      row({ trackId: i + 1, album: i < 5 ? 'Dominant' : `Album ${i}`, playCount: 100 - i }),
    )
    rows.push(row({ trackId: 100, month: 12, album: 'December', playCount: 1 }))
    const result = buildAnnualSummary(2026, [], rows)
    expect(result.selection).toHaveLength(30)
    expect(result.selection.some((track) => track.id === 100)).toBe(true)
    expect(result.selection.filter((track) => track.album === 'Dominant')).toHaveLength(3)
    expect(new Set(result.selection.map((track) => track.id)).size).toBe(30)
  })
  it('derives peak dates and consecutive-day spans across leap day without inventing records', () => {
    const days = ['2024-02-28', '2024-02-29', '2024-03-01', '2024-04-01'].map((date, i) => ({
      date,
      playCount: i === 1 ? 9 : 1,
      durationSeconds: 0,
    }))
    const result = buildAnnualSummary(2024, days, [])
    expect(result).toMatchObject({
      playCount: 12,
      activeDays: 4,
      albumCount: 0,
      peakDay: { date: '2024-02-29', playCount: 9 },
      longestRun: { start: '2024-02-28', end: '2024-03-01', days: 3 },
    })
    expect(result.albums).toEqual([])
    expect(buildAnnualSummary(2026, [], [])).toMatchObject({
      peakDay: null,
      longestRun: null,
      selection: [],
    })
  })
})
