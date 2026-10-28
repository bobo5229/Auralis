import type {
  AnnualAlbum,
  AnnualSummary,
  AnnualTrack,
  DailyPlayCount,
} from '@shared/types/listeningArchive'
import { cleanDelimitedValues, normalizeDelimitedValue } from '@shared/utils/delimitedValues'

import type { AnnualListeningRow } from '@shared/types/annualListening'
export type { AnnualListeningRow } from '@shared/types/annualListening'

interface AlbumAggregate extends AnnualAlbum {
  trackKeys: Set<string>
}
interface TrackAggregate extends AnnualTrack {
  albumKey: string
  monthlyPlays: number[]
}

function compare(a: { playCount: number; key: string }, b: { playCount: number; key: string }) {
  return b.playCount - a.playCount || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

export function buildAnnualSummary(
  year: number,
  days: DailyPlayCount[],
  rows: Iterable<AnnualListeningRow>,
): AnnualSummary {
  const albums = new Map<string, AlbumAggregate>()
  const tracks = new Map<string, TrackAggregate>()
  const artists = new Map<
    string,
    { name: string; playCount: number; albums: Map<string, number> }
  >()
  for (const row of rows) {
    const trackKey = `${row.source}:${row.trackId}`
    const albumArtist = row.albumArtist?.trim() || row.artist?.trim() || null
    const albumKey = JSON.stringify([row.album || '', albumArtist])
    let track = tracks.get(trackKey)
    if (!track) {
      track = {
        key: trackKey,
        title: row.title,
        artist: row.artist,
        album: row.album,
        artworkCacheKey: row.artworkCacheKey,
        playCount: 0,
        albumKey,
        monthlyPlays: Array<number>(12).fill(0),
        playback:
          row.source === 'library' && row.available
            ? {
                id: row.trackId,
                title: row.title,
                artist: row.artist,
                album: row.album,
                albumArtist,
                artworkCacheKey: row.artworkCacheKey,
                durationSeconds: row.durationSeconds,
              }
            : null,
      }
      tracks.set(trackKey, track)
    }
    track.playCount += row.playCount
    track.monthlyPlays[row.month - 1] += row.playCount
    if (row.album?.trim()) {
      let album = albums.get(albumKey)
      if (!album) {
        album = {
          key: albumKey,
          album: row.album,
          albumArtist,
          artworkCacheKey: row.artworkCacheKey,
          playCount: 0,
          durationSeconds: 0,
          trackCount: 0,
          trackKeys: new Set(),
          firstPlayedDate: row.firstPlayedDate,
          monthlyPlays: Array<number>(12).fill(0),
          available: false,
        }
        albums.set(albumKey, album)
      }
      album.playCount += row.playCount
      album.durationSeconds += row.recordedDuration
      album.monthlyPlays[row.month - 1] += row.playCount
      album.trackKeys.add(trackKey)
      album.trackCount = album.trackKeys.size
      album.available ||= Boolean(track.playback)
      if (row.firstPlayedDate < album.firstPlayedDate) album.firstPlayedDate = row.firstPlayedDate
      album.artworkCacheKey ||= row.artworkCacheKey
    }
    for (const name of cleanDelimitedValues([row.artist || albumArtist])) {
      const key = normalizeDelimitedValue(name)
      let artist = artists.get(key)
      if (!artist) {
        artist = { name, playCount: 0, albums: new Map() }
        artists.set(key, artist)
      }
      artist.playCount += row.playCount
      if (row.album?.trim())
        artist.albums.set(albumKey, (artist.albums.get(albumKey) ?? 0) + row.playCount)
    }
  }
  const rankedAlbums = [...albums.values()].sort(compare)
  const rankedTracks = [...tracks.values()].sort(compare)
  const albumDto = (album: AlbumAggregate): AnnualAlbum => ({
    key: album.key,
    album: album.album,
    albumArtist: album.albumArtist,
    artworkCacheKey: album.artworkCacheKey,
    playCount: album.playCount,
    durationSeconds: album.durationSeconds,
    trackCount: album.trackCount,
    firstPlayedDate: album.firstPlayedDate,
    monthlyPlays: album.monthlyPlays,
    available: album.available,
  })
  const albumsForMonths = (months: number[], limit: number) =>
    rankedAlbums
      .map((album) => ({
        album,
        key: album.key,
        playCount: months.reduce((total, month) => total + album.monthlyPlays[month - 1], 0),
      }))
      .filter((entry) => entry.playCount > 0)
      .sort(compare)
      .slice(0, limit)
      .map((entry) => albumDto(entry.album))
  const activeDays = days
    .filter((day) => day.playCount > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const peak = [...activeDays].sort(
    (a, b) => b.playCount - a.playCount || a.date.localeCompare(b.date),
  )[0]
  let longestRun: AnnualSummary['longestRun'] = null
  let run: NonNullable<AnnualSummary['longestRun']> | null = null
  for (const day of activeDays) {
    if (
      run &&
      Date.parse(`${day.date}T00:00:00Z`) - Date.parse(`${run.end}T00:00:00Z`) === 86_400_000
    ) {
      run = { start: run.start, end: day.date, days: run.days + 1 }
    } else run = { start: day.date, end: day.date, days: 1 }
    if (!longestRun || run.days > longestRun.days) longestRun = run
  }
  // Monthly choices preserve quieter parts of the year; annual favourites fill the remainder.
  // Only available tracks enter the selection, at most three from each identified album.
  const available = rankedTracks.filter((track) => track.playback)
  const candidates = Array.from(
    { length: 12 },
    (_, month) =>
      available
        .filter((track) => track.monthlyPlays[month] > 0)
        .sort((a, b) => b.monthlyPlays[month] - a.monthlyPlays[month] || compare(a, b))[0],
  )
  const selection: AnnualSummary['selection'] = []
  const selected = new Set<string>()
  const albumCounts = new Map<string, number>()
  for (const track of [...candidates, ...available]) {
    if (!track?.playback || selected.has(track.key)) continue
    const group = track.album?.trim() ? track.albumKey : track.key
    if ((albumCounts.get(group) ?? 0) >= 3) continue
    selected.add(track.key)
    albumCounts.set(group, (albumCounts.get(group) ?? 0) + 1)
    selection.push(track.playback)
    if (selection.length === 30) break
  }
  return {
    year,
    playCount: activeDays.reduce((sum, day) => sum + day.playCount, 0),
    activeDays: activeDays.length,
    albumCount: albums.size,
    albums: rankedAlbums.slice(0, 10).map(albumDto),
    tracks: rankedTracks.slice(0, 5).map((track) => ({
      key: track.key,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artworkCacheKey: track.artworkCacheKey,
      playCount: track.playCount,
      playback: track.playback,
    })),
    artists: [...artists.entries()]
      .map(([key, artist]) => ({ key, ...artist }))
      .sort(compare)
      .slice(0, 5)
      .map((artist) => ({
        name: artist.name,
        playCount: artist.playCount,
        albums: [...artist.albums.entries()]
          .map(([key, playCount]) => ({ key, playCount }))
          .sort(compare)
          .slice(0, 3)
          .map(({ key }) => albumDto(albums.get(key)!)),
      })),
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      playCount: activeDays
        .filter((day) => Number(day.date.slice(5, 7)) === index + 1)
        .reduce((sum, day) => sum + day.playCount, 0),
      albums: albumsForMonths([index + 1], 3),
    })),
    seasons: [
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
      [1, 2, 12],
    ].map((months) => ({ months, album: albumsForMonths(months, 1)[0] ?? null })),
    peakDay: peak ? { date: peak.date, playCount: peak.playCount, album: null } : null,
    longestRun,
    selection,
  }
}
