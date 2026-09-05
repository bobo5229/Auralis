import type { TrackListItem } from '@shared/types/libraryScan'
import { normalizeSearchText } from './normalizeSearchText'
import type { LibrarySearchRecord } from './librarySearchScan'

export class LibrarySearchIndexBuildStaleError extends Error {
  constructor() {
    super('Library search index build became stale')
    this.name = 'LibrarySearchIndexBuildStaleError'
  }
}

interface LibrarySearchIndexBuilder {
  append(track: TrackListItem): void
  finish(): readonly LibrarySearchRecord[]
}

function createLibrarySearchIndexBuilder(): LibrarySearchIndexBuilder {
  const records: LibrarySearchRecord[] = []
  // Artist and album values repeat heavily in real libraries. Keeping the
  // cache local to one snapshot avoids retaining metadata from old
  // generations while removing hundreds of thousands of duplicate Unicode
  // normalization passes for a 100k-track catalog.
  const normalizedBySource = new Map<string | null | undefined, string>()
  const normalizeCached = (value: string | null | undefined): string => {
    const cached = normalizedBySource.get(value)
    if (cached !== undefined) return cached
    const normalized = normalizeSearchText(value)
    normalizedBySource.set(value, normalized)
    return normalized
  }

  return {
    append(track) {
      records.push(
        Object.freeze({
          title: normalizeCached(track.title),
          artist: normalizeCached(track.artist),
          albumArtist: normalizeCached(track.albumArtist),
          album: normalizeCached(track.album),
        }),
      )
    },
    finish() {
      return Object.freeze(records)
    },
  }
}

/** Build one normalized record for each track, preserving the source order. */
export function createLibrarySearchIndex(
  tracks: readonly TrackListItem[],
): readonly LibrarySearchRecord[] {
  const builder = createLibrarySearchIndexBuilder()
  for (const track of tracks) builder.append(track)
  return builder.finish()
}

export interface IncrementalLibrarySearchIndexOptions {
  readonly isCurrent: () => boolean
  readonly yieldToMain?: () => Promise<void>
  readonly chunkBudgetMs?: number
  readonly now?: () => number
  readonly onChunk?: (durationMs: number, processedTracks: number) => void
}

/**
 * Build a complete search snapshot in bounded main-thread slices.
 *
 * The first yield lets Vue paint the atomically committed track snapshot. No
 * partial index escapes: callers receive one frozen array only after every
 * source track was normalized, and stale generations fail between slices.
 */
export async function createLibrarySearchIndexIncrementally(
  tracks: readonly TrackListItem[],
  options: IncrementalLibrarySearchIndexOptions,
): Promise<readonly LibrarySearchRecord[]> {
  const yieldToMain =
    options.yieldToMain ?? (() => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0)))
  const now = options.now ?? (() => performance.now())
  const chunkBudgetMs = Math.max(1, options.chunkBudgetMs ?? 8)
  const builder = createLibrarySearchIndexBuilder()
  let trackIndex = 0

  await yieldToMain()
  while (trackIndex < tracks.length) {
    if (!options.isCurrent()) throw new LibrarySearchIndexBuildStaleError()
    const chunkStartedAt = now()

    do {
      const chunkEnd = Math.min(trackIndex + 128, tracks.length)
      while (trackIndex < chunkEnd) {
        builder.append(tracks[trackIndex])
        trackIndex += 1
      }
    } while (trackIndex < tracks.length && now() - chunkStartedAt < chunkBudgetMs)

    options.onChunk?.(now() - chunkStartedAt, trackIndex)

    if (trackIndex < tracks.length) await yieldToMain()
  }

  if (!options.isCurrent()) throw new LibrarySearchIndexBuildStaleError()
  return builder.finish()
}
