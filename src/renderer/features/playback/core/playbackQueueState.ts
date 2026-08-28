import type { PlaybackTrack } from '../types'

const DEFAULT_HISTORY_LIMIT = 100

export type AlbumShuffleContext = {
  albumArtist: string
  album: string
  tracks: PlaybackTrack[]
} | null

export interface PlaybackHistoryContext {
  queue: PlaybackTrack[]
  albumShuffleContext: AlbumShuffleContext
  shuffleTrackPool: PlaybackTrack[] | null
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

  removeTracks(trackIds: ReadonlySet<number>): void {
    this.entries = this.entries
      .filter((entry) => !trackIds.has(entry.track.id))
      .map((entry) => ({
        ...entry,
        queue: entry.queue.filter((track) => !trackIds.has(track.id)),
        shuffleTrackPool:
          entry.shuffleTrackPool?.filter((track) => !trackIds.has(track.id)) ?? null,
        albumShuffleContext: entry.albumShuffleContext
          ? {
              ...entry.albumShuffleContext,
              tracks: entry.albumShuffleContext.tracks.filter((track) => !trackIds.has(track.id)),
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
  const filtered = tracks.filter((track) => insertIds.has(track.id))
  if (filtered.length === 0) return null

  const withoutInserted = queue.filter((track) => !insertIds.has(track.id))
  const currentIndex = withoutInserted.findIndex((track) => track.id === currentTrackId)
  if (currentIndex < 0) return null

  const nextQueue = [...withoutInserted]
  nextQueue.splice(currentIndex + 1, 0, ...filtered)
  return { queue: nextQueue, currentIndex, queuedTrackId: filtered[0].id }
}
