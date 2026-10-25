import type { AlbumShuffleContext, PlaybackTrack, ShuffleCycle } from '../types'

const DEFAULT_HISTORY_LIMIT = 100

export interface PlaybackHistoryContext {
  queue: PlaybackTrack[]
  albumShuffleContext: AlbumShuffleContext
  shuffleTrackPool: PlaybackTrack[] | null
  shuffleCycle?: ShuffleCycle | null
}

export interface PlaybackHistoryEntry extends PlaybackHistoryContext {
  track: PlaybackTrack
}

export interface QueueInsertionResult {
  queue: PlaybackTrack[]
  currentIndex: number
  queuedTrackId: number
}

export class PlaybackHistory {
  private entries: PlaybackHistoryEntry[] = []

  constructor(private readonly limit = DEFAULT_HISTORY_LIMIT) {}

  push(
    previousTrack: PlaybackTrack | null,
    nextTrackId: number,
    context: PlaybackHistoryContext,
  ): void {
    if (!previousTrack || previousTrack.id === nextTrackId) return
    this.entries.push({ track: previousTrack, ...context })
    if (this.entries.length > this.limit) {
      this.entries = this.entries.slice(-this.limit)
    }
  }

  pop(): PlaybackHistoryEntry | null {
    return this.entries.pop() ?? null
  }

  clear(): void {
    this.entries = []
  }

  visitTracks(
    visit: (track: PlaybackTrack) => void,
    visitQueue: (queue: PlaybackTrack[]) => void,
  ): void {
    for (const entry of this.entries) {
      visit(entry.track)
      visitQueue(entry.queue)
      if (entry.shuffleTrackPool) visitQueue(entry.shuffleTrackPool)
      if (entry.albumShuffleContext) visitQueue(entry.albumShuffleContext.tracks)
    }
  }

  removeTracks(trackIds: ReadonlySet<number>): void {
    if (trackIds.size === 0) return
    // Many history entries share the same catalog queue. Filter each source
    // once and retain that sharing across every nested playback context.
    const filteredQueues = new Map<PlaybackTrack[], PlaybackTrack[]>()
    const removeMissing = (queue: PlaybackTrack[]): PlaybackTrack[] => {
      const cached = filteredQueues.get(queue)
      if (cached) return cached
      const filtered = queue.some((track) => trackIds.has(track.id))
        ? queue.filter((track) => !trackIds.has(track.id))
        : queue
      filteredQueues.set(queue, filtered)
      return filtered
    }
    this.entries = this.entries
      .filter((entry) => !trackIds.has(entry.track.id))
      .map((entry) => ({
        ...entry,
        queue: removeMissing(entry.queue),
        shuffleTrackPool: entry.shuffleTrackPool ? removeMissing(entry.shuffleTrackPool) : null,
        albumShuffleContext: entry.albumShuffleContext
          ? {
              ...entry.albumShuffleContext,
              tracks: removeMissing(entry.albumShuffleContext.tracks),
            }
          : null,
      }))
  }
}

export function insertTrackAfterCurrent(
  queue: PlaybackTrack[],
  currentTrackId: number,
  track: PlaybackTrack,
): QueueInsertionResult | null {
  if (track.id === currentTrackId) return null

  const withoutInsertedTrack = queue.filter((queueTrack) => queueTrack.id !== track.id)
  const currentIndex = withoutInsertedTrack.findIndex(
    (queueTrack) => queueTrack.id === currentTrackId,
  )
  if (currentIndex < 0) return null

  const nextQueue = [...withoutInsertedTrack]
  nextQueue.splice(currentIndex + 1, 0, track)
  return { queue: nextQueue, currentIndex, queuedTrackId: track.id }
}

export function insertTracksAfterCurrent(
  queue: PlaybackTrack[],
  currentTrackId: number,
  tracks: PlaybackTrack[],
): QueueInsertionResult | null {
  const insertIds = new Set(tracks.map((track) => track.id))
  insertIds.delete(currentTrackId)
  const seen = new Set<number>()
  const filtered = tracks.filter((track) => {
    if (!insertIds.has(track.id) || seen.has(track.id)) return false
    seen.add(track.id)
    return true
  })
  if (filtered.length === 0) return null

  const withoutInserted = queue.filter((track) => !insertIds.has(track.id))
  const currentIndex = withoutInserted.findIndex((track) => track.id === currentTrackId)
  if (currentIndex < 0) return null

  // Keep batch size independent of the runtime's function argument limit.
  const nextQueue = withoutInserted
    .slice(0, currentIndex + 1)
    .concat(filtered, withoutInserted.slice(currentIndex + 1))
  return { queue: nextQueue, currentIndex, queuedTrackId: filtered[0].id }
}
