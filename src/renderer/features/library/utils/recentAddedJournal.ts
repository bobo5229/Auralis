import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '@shared/types/albumSummary'
import { compareAlbumTracks } from '@shared/utils/albumGrouping'
import {
  albumIdentityKey,
  resolveAlbumArtist,
  resolveAlbumTitle,
} from '@shared/utils/albumIdentity'
import {
  parseRecentAddedLibraryTimestamp,
  type RecentAddedLibraryRange,
} from './recentAddedLibrary'

export type JournalFilter = 'all' | 'albums' | 'tracks'
export interface JournalAlbumEntry {
  album: AlbumSummary
  /** Only the members added on this day and inside the active time range. */
  tracks: TrackListItem[]
}
export interface JournalDay {
  key: string
  date: number | null
  albums: JournalAlbumEntry[]
  additions: JournalAlbumEntry[]
  looseTracks: TrackListItem[]
}
export function journalDayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
interface BuiltJournal {
  days: JournalDay[]
  validUntil: number
}
interface CachedJournal extends BuiltJournal {
  computedAt: number
}
const journals = new WeakMap<
  readonly TrackListItem[],
  Map<RecentAddedLibraryRange, CachedJournal>
>()
function readCached(tracks: readonly TrackListItem[], range: RecentAddedLibraryRange, now: number) {
  const cached = Object.isFrozen(tracks) ? journals.get(tracks)?.get(range) : undefined
  return cached && now >= cached.computedAt && now < cached.validUntil ? cached : undefined
}
function remember(
  tracks: readonly TrackListItem[],
  range: RecentAddedLibraryRange,
  now: number,
  built: BuiltJournal,
) {
  if (!Object.isFrozen(tracks)) return
  let variants = journals.get(tracks)
  if (!variants) journals.set(tracks, (variants = new Map()))
  variants.delete(range)
  variants.set(range, { ...built, computedAt: now })
  if (variants.size > 4) variants.delete(variants.keys().next().value!)
}
/** Reuse a generation until a timestamp enters or leaves its rolling range. */
export function getRecentAddedJournal(
  tracks: readonly TrackListItem[],
  range: RecentAddedLibraryRange,
  now: number,
): JournalDay[] {
  const cached = readCached(tracks, range, now)
  if (cached) return cached.days
  const built = finishJournal(buildJournal(tracks, range, now))
  remember(tracks, range, now, built)
  return built.days
}
/** A reconstruction of the available collection, not a persistent import event log. */
export function buildRecentAddedJournal(
  tracks: readonly TrackListItem[],
  range: RecentAddedLibraryRange,
  now: number,
): JournalDay[] {
  return finishJournal(buildJournal(tracks, range, now)).days
}
function finishJournal(builder: Generator<void, BuiltJournal>): BuiltJournal {
  let result = builder.next()
  while (!result.done) result = builder.next()
  return result.value
}
export class RecentJournalBuildStaleError extends Error {
  constructor() {
    super('Collection journal build became stale')
    this.name = 'RecentJournalBuildStaleError'
  }
}
export interface JournalBuildOptions {
  isCurrent: () => boolean
  yieldToMain?: () => Promise<void>
  now?: () => number
  chunkBudgetMs?: number
  onChunk?: (durationMs: number) => void
}
function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield(): Promise<void> } })
    .scheduler
  return scheduler ? scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0))
}
/** Publish only a complete journal; allow input and painting between bounded slices. */
export async function getRecentAddedJournalIncrementally(
  tracks: readonly TrackListItem[],
  range: RecentAddedLibraryRange,
  now: number,
  options: JournalBuildOptions,
): Promise<JournalDay[]> {
  const assertCurrent = () => {
    if (!options.isCurrent()) throw new RecentJournalBuildStaleError()
  }
  assertCurrent()
  const cached = readCached(tracks, range, now)
  if (cached) return cached.days
  const yieldMain = options.yieldToMain ?? yieldToMain
  const clock = options.now ?? (() => performance.now())
  const budget = Math.max(1, options.chunkBudgetMs ?? 4)
  const builder = buildJournal(tracks, range, now)
  await yieldMain()
  for (;;) {
    assertCurrent()
    const startedAt = clock()
    let result = builder.next()
    while (!result.done && clock() - startedAt < budget) result = builder.next()
    options.onChunk?.(clock() - startedAt)
    if (result.done) {
      assertCurrent()
      remember(tracks, range, now, result.value)
      return result.value.days
    }
    await yieldMain()
  }
}
interface Stamp {
  time: number
  key?: string
}
interface AlbumBuild {
  album: AlbumSummary & { tracks: TrackListItem[] }
  first: Stamp | null
  entries: Map<string, JournalAlbumEntry>
}

function* buildJournal(
  tracks: readonly TrackListItem[],
  range: RecentAddedLibraryRange,
  now: number,
): Generator<void, BuiltJournal> {
  const stamps = new Map<string, Stamp>()
  const albums = new Map<string, AlbumBuild>()
  const days = new Map<string, JournalDay>()
  const latest = new Map<JournalAlbumEntry, number>()
  const start = range === 'all' ? -Infinity : now - range * 86_400_000
  let validUntil = Infinity
  const keyFor = (stamp: Stamp) =>
    (stamp.key ??= Number.isFinite(stamp.time) ? journalDayKey(stamp.time) : 'undated')
  function dayFor(stamp: Stamp): JournalDay {
    const key = keyFor(stamp)
    let day = days.get(key)
    if (!day) {
      const date = new Date(stamp.time)
      day = {
        key,
        date: Number.isFinite(stamp.time)
          ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
          : null,
        albums: [],
        additions: [],
        looseTracks: [],
      }
      days.set(key, day)
    }
    return day
  }
  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index]
    if (track.availability === 'available') {
      let stamp = stamps.get(track.createdAt)
      if (!stamp) {
        stamp = { time: parseRecentAddedLibraryTimestamp(track.createdAt) }
        stamps.set(track.createdAt, stamp)
        if (Number.isFinite(stamp.time)) {
          if (stamp.time > now) validUntil = Math.min(validUntil, stamp.time)
          if (range !== 'all') {
            const expires = stamp.time + range * 86_400_000 + 1
            if (expires > now) validUntil = Math.min(validUntil, expires)
          }
        }
      }
      const time = stamp.time
      const included = Number.isFinite(time) ? time >= start && time <= now : range === 'all'
      if (track.album?.trim()) {
        const artist = resolveAlbumArtist(track),
          title = resolveAlbumTitle(track)
        const key = albumIdentityKey(artist, title)
        let grouped = albums.get(key)
        if (!grouped) {
          grouped = {
            album: {
              key,
              title,
              albumArtist: artist,
              releaseDate: track.releaseDate,
              artworkCacheKey: track.artworkCacheKey,
              tracks: [],
            },
            first: null,
            entries: new Map(),
          }
          albums.set(key, grouped)
        }
        const album = grouped.album
        album.releaseDate ??= track.releaseDate
        album.artworkCacheKey ??= track.artworkCacheKey
        album.tracks.push(track)
        // Classification uses the full collection, even outside the selected range.
        if (Number.isFinite(time) && time <= now && (!grouped.first || time < grouped.first.time))
          grouped.first = stamp
        if (included) {
          const day = dayFor(stamp)
          let entry = grouped.entries.get(day.key)
          if (!entry) {
            entry = { album, tracks: [] }
            grouped.entries.set(day.key, entry)
            latest.set(entry, -Infinity)
          }
          entry.tracks.push(track)
          if (Number.isFinite(time)) latest.set(entry, Math.max(latest.get(entry)!, time))
        }
      } else if (included) dayFor(stamp).looseTracks.push(track)
    }
    if ((index & 127) === 127) yield
  }
  for (const grouped of albums.values()) {
    const firstDay = grouped.first ? keyFor(grouped.first) : null
    let entryCount = 0
    for (const [key, entry] of grouped.entries) {
      yield* sortJournalItems(entry.tracks, compareAlbumTracks)
      const day = days.get(key)!
      ;(key === firstDay ? day.albums : day.additions).push(entry)
      if ((++entryCount & 127) === 0) yield
    }
    yield
  }
  for (const day of days.values()) {
    const compareEntries = (a: JournalAlbumEntry, b: JournalAlbumEntry) =>
      latest.get(b)! - latest.get(a)! || a.album.key.localeCompare(b.album.key)
    yield* sortJournalItems(day.albums, compareEntries)
    yield* sortJournalItems(day.additions, compareEntries)
    yield* sortJournalItems(
      day.looseTracks,
      (a, b) => stamps.get(b.createdAt)!.time - stamps.get(a.createdAt)!.time || b.id - a.id,
    )
    yield
  }
  const result = [...days.values()]
  yield* sortJournalItems(result, (a, b) => (b.date ?? -Infinity) - (a.date ?? -Infinity))
  return { days: result, validUntil }
}
/** Native sort for small lists; bounded runs and stable merges for unusually large days/albums. */
function* sortJournalItems<T>(items: T[], compare: (a: T, b: T) => number): Generator<void> {
  const runSize = 256
  if (items.length <= runSize) {
    items.sort(compare)
    return
  }
  for (let start = 0; start < items.length; start += runSize) {
    const run = items.slice(start, start + runSize).sort(compare)
    for (let i = 0; i < run.length; i++) items[start + i] = run[i]
    yield
  }
  let source = items,
    target = new Array<T>(items.length)
  for (let width = runSize; width < items.length; width *= 2) {
    for (let start = 0; start < items.length; start += 2 * width) {
      const middle = Math.min(start + width, items.length),
        end = Math.min(start + 2 * width, items.length)
      let left = start,
        right = middle
      for (let i = start; i < end; i++) {
        // NaN comparisons have the same stable-equality semantics as Array.sort.
        target[i] =
          left < middle && (right >= end || !(compare(source[left], source[right]) > 0))
            ? source[left++]
            : source[right++]
        if ((i & 127) === 127) yield
      }
    }
    ;[source, target] = [target, source]
  }
  if (source !== items)
    for (let i = 0; i < items.length; i++) {
      items[i] = source[i]
      if ((i & 127) === 127) yield
    }
}
export function filterJournalDays(
  days: readonly JournalDay[],
  filter: JournalFilter,
): JournalDay[] {
  return days
    .map((day) => ({
      ...day,
      albums: filter === 'tracks' ? [] : day.albums,
      additions: filter === 'albums' ? [] : day.additions,
      looseTracks: filter === 'albums' ? [] : day.looseTracks,
    }))
    .filter((day) => day.albums.length || day.additions.length || day.looseTracks.length)
}
