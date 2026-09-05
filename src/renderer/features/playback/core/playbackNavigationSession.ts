import type { PlaybackMode, PlaybackTrack } from '../types'
import {
  insertTrackAfterCurrent as buildSingleTrackInsertion,
  insertTracksAfterCurrent as buildMultiTrackInsertion,
  PlaybackHistory,
  type AlbumShuffleContext,
  type PlaybackHistoryEntry,
} from './playbackQueueState'
import {
  resolvePlaybackAdvance,
  type PlaybackAdvanceDecision,
  type PlaybackAdvanceTrigger,
  type PlaybackTransitionPlan,
  type PlaybackTransitionSource,
  type PlaybackTransitionState,
} from './playbackTransitionPlanner'

export type PlaybackPreviousDecision =
  | { kind: 'restore-history'; entry: PlaybackHistoryEntry }
  | { kind: 'play-queue-track'; track: PlaybackTrack }
  | { kind: 'seek-to-start' }
  | { kind: 'noop' }

export interface NavigationCurrentState {
  queue: PlaybackTrack[]
  currentIndex: number
  currentTrackId: number | null
  currentTrack: PlaybackTrack | null
  playbackMode: PlaybackMode
}

export class PlaybackNavigationSession {
  private queuedNextTrackId: number | null = null
  private albumShuffleContext: AlbumShuffleContext = null
  private shuffleTrackPool: PlaybackTrack[] | null = null
  private readonly history = new PlaybackHistory()

  getQueuedNextTrackId(): number | null {
    return this.queuedNextTrackId
  }

  setQueuedNextTrackId(id: number | null): void {
    this.queuedNextTrackId = id
  }

  getAlbumShuffleContext(): AlbumShuffleContext {
    return this.albumShuffleContext
  }

  setAlbumShuffleContext(context: AlbumShuffleContext): void {
    this.albumShuffleContext = context
  }

  getShuffleTrackPool(): PlaybackTrack[] | null {
    return this.shuffleTrackPool
  }

  setShuffleTrackPool(pool: PlaybackTrack[] | null): void {
    this.shuffleTrackPool = pool
  }

  pushHistory(
    previousTrack: PlaybackTrack | null,
    nextTrackId: number,
    currentQueue: PlaybackTrack[],
  ): void {
    this.history.push(previousTrack, nextTrackId, {
      queue: currentQueue,
      albumShuffleContext: this.albumShuffleContext,
      shuffleTrackPool: this.shuffleTrackPool,
    })
  }

  popHistory(): PlaybackHistoryEntry | null {
    return this.history.pop()
  }

  clearHistory(): void {
    this.history.clear()
  }

  setMode(mode: PlaybackMode): void {
    if (mode !== 'album-shuffle') {
      this.albumShuffleContext = null
    }
    if (mode !== 'shuffle' && mode !== 'album-shuffle') {
      this.history.clear()
    }
  }

  resetForTrackSwitch(options?: { shufflePool?: PlaybackTrack[] }): void {
    this.queuedNextTrackId = null
    this.albumShuffleContext = null
    this.shuffleTrackPool = options?.shufflePool ?? null
  }

  insertSingleTrack(
    currentQueue: PlaybackTrack[],
    currentTrackId: number,
    track: PlaybackTrack,
  ): { queue: PlaybackTrack[]; currentIndex: number; queuedTrackId: number } | null {
    const insertion = buildSingleTrackInsertion(currentQueue, currentTrackId, track)
    if (insertion) {
      this.queuedNextTrackId = insertion.queuedTrackId
    }
    return insertion
  }

  insertMultipleTracks(
    currentQueue: PlaybackTrack[],
    currentTrackId: number,
    tracks: PlaybackTrack[],
  ): { queue: PlaybackTrack[]; currentIndex: number; queuedTrackId: number } | null {
    const insertion = buildMultiTrackInsertion(currentQueue, currentTrackId, tracks)
    if (insertion) {
      this.queuedNextTrackId = insertion.queuedTrackId
    }
    return insertion
  }

  removeMissingTracks(
    missingIds: Set<number>,
    currentTrackId: number | null,
  ): { currentTrackMissing: boolean } {
    if (missingIds.size === 0) return { currentTrackMissing: false }

    const currentTrackMissing = currentTrackId !== null && missingIds.has(currentTrackId)

    this.shuffleTrackPool =
      this.shuffleTrackPool?.filter((track) => !missingIds.has(track.id)) ?? null

    if (this.albumShuffleContext) {
      const tracks = this.albumShuffleContext.tracks.filter((track) => !missingIds.has(track.id))
      this.albumShuffleContext = tracks.length > 0 ? { ...this.albumShuffleContext, tracks } : null
    }

    this.history.removeTracks(missingIds)

    if (this.queuedNextTrackId !== null && missingIds.has(this.queuedNextTrackId)) {
      this.queuedNextTrackId = null
    }

    return { currentTrackMissing }
  }

  applyPlan(
    plan: PlaybackTransitionPlan,
    currentTrack: PlaybackTrack | null,
    currentQueue: PlaybackTrack[],
  ): void {
    if (plan.recordHistory) {
      this.pushHistory(currentTrack, plan.track.id, currentQueue)
    }
    if (plan.consumeQueued) {
      this.queuedNextTrackId = null
    }
    if (plan.nextAlbumShuffleContext !== undefined) {
      this.albumShuffleContext = plan.nextAlbumShuffleContext
    }
  }

  async resolveAdvance(
    currentState: NavigationCurrentState,
    source: PlaybackTransitionSource,
    trigger: PlaybackAdvanceTrigger,
    random: () => number = Math.random,
  ): Promise<PlaybackAdvanceDecision> {
    const plannerState: PlaybackTransitionState = {
      currentTrackId: currentState.currentTrackId,
      currentTrack: currentState.currentTrack,
      queue: currentState.queue,
      currentIndex: currentState.currentIndex,
      playbackMode: currentState.playbackMode,
      queuedNextTrackId: this.queuedNextTrackId,
      albumShuffleContext: this.albumShuffleContext,
      shuffleTrackPool: this.shuffleTrackPool,
    }

    return resolvePlaybackAdvance(plannerState, source, trigger, random)
  }

  resolvePrevious(currentState: {
    queue: PlaybackTrack[]
    currentIndex: number
    playbackMode: PlaybackMode
  }): PlaybackPreviousDecision {
    this.queuedNextTrackId = null

    if (currentState.playbackMode === 'shuffle' || currentState.playbackMode === 'album-shuffle') {
      const entry = this.history.pop()
      if (entry) {
        this.albumShuffleContext = entry.albumShuffleContext
        this.shuffleTrackPool = entry.shuffleTrackPool
        return { kind: 'restore-history', entry }
      }
    }

    if (currentState.queue.length === 0) {
      return { kind: 'noop' }
    }

    const prevIndex = currentState.currentIndex - 1
    if (prevIndex < 0) {
      if (currentState.playbackMode === 'repeat-all') {
        const track = currentState.queue[currentState.queue.length - 1]
        return { kind: 'play-queue-track', track }
      }
      return { kind: 'seek-to-start' }
    }

    const track = currentState.queue[prevIndex]
    return { kind: 'play-queue-track', track }
  }

  clear(): void {
    this.queuedNextTrackId = null
    this.albumShuffleContext = null
    this.shuffleTrackPool = null
    this.history.clear()
  }
}
