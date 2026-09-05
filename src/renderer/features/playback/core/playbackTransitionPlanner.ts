import type { PlaybackMode, PlaybackTrack } from '../types'
import type { AlbumShuffleContext } from './playbackQueueState'

export type PlaybackAdvanceTrigger = 'manual-next' | 'natural-ended' | 'gapless-prefetch'

export interface PlaybackTransitionPlan {
  queue: PlaybackTrack[]
  track: PlaybackTrack
  recordHistory: boolean
  consumeQueued: boolean
  nextAlbumShuffleContext?: AlbumShuffleContext
}

export type PlaybackAdvanceDecision =
  | { kind: 'play'; plan: PlaybackTransitionPlan }
  | { kind: 'stop'; resetTime: boolean }
  | { kind: 'noop' }

export interface PlaybackTransitionState {
  currentTrackId: number | null
  currentTrack: PlaybackTrack | null
  queue: PlaybackTrack[]
  currentIndex: number
  playbackMode: PlaybackMode
  queuedNextTrackId: number | null
  albumShuffleContext: AlbumShuffleContext
  shuffleTrackPool: PlaybackTrack[] | null
}

export interface PlaybackTransitionSource {
  getRandomTrack: (excludeTrackId?: number) => Promise<PlaybackTrack | null | undefined>
  getAlbumTracks: (albumKey: {
    albumArtist: string
    album: string
  }) => Promise<AlbumShuffleContext | null | undefined>
  getRandomAlbumTracks: (excludeAlbumKey?: {
    albumArtist: string
    album: string
  }) => Promise<AlbumShuffleContext | null | undefined>
}

export function getAlbumIdentity(track: PlaybackTrack): string | null {
  const album = track.album?.trim()
  if (!album) return null
  const albumArtist = (track.albumArtist || track.artist || '').trim()
  return `${albumArtist.toLocaleLowerCase()}\u0000${album.toLocaleLowerCase()}`
}

export function getAlbumKey(
  track: PlaybackTrack | null,
): { albumArtist: string; album: string } | undefined {
  if (!track?.album) return undefined
  return {
    albumArtist: track.albumArtist || track.artist || '',
    album: track.album,
  }
}

export function buildAlbumShuffleContexts(
  tracks: PlaybackTrack[] | null,
): NonNullable<AlbumShuffleContext>[] {
  if (!tracks?.length) return []
  const contexts = new Map<string, NonNullable<AlbumShuffleContext>>()

  for (const track of tracks) {
    const identity = getAlbumIdentity(track)
    if (!identity) continue
    const context = contexts.get(identity)
    if (context) {
      context.tracks.push(track)
    } else {
      contexts.set(identity, {
        albumArtist: track.albumArtist || track.artist || '',
        album: track.album!.trim(),
        tracks: [track],
      })
    }
  }

  return [...contexts.values()]
}

export function findCurrentAlbumShuffleContext(
  tracks: PlaybackTrack[] | null,
  currentTrackId: number | null,
): NonNullable<AlbumShuffleContext> | null {
  if (!currentTrackId) return null
  return (
    buildAlbumShuffleContexts(tracks).find((context) =>
      context.tracks.some((track) => track.id === currentTrackId),
    ) ?? null
  )
}

export function selectRandomAlbumShuffleContext(
  tracks: PlaybackTrack[] | null,
  currentTrack: PlaybackTrack | null,
  random: () => number = Math.random,
): NonNullable<AlbumShuffleContext> | null {
  const currentIdentity = currentTrack ? getAlbumIdentity(currentTrack) : null
  const candidates = buildAlbumShuffleContexts(tracks).filter(
    (context) => getAlbumIdentity(context.tracks[0]) !== currentIdentity,
  )
  if (candidates.length === 0) return null
  return candidates[Math.floor(random() * candidates.length)] ?? null
}

export async function resolvePlaybackAdvance(
  state: PlaybackTransitionState,
  source: PlaybackTransitionSource,
  trigger: PlaybackAdvanceTrigger,
  random: () => number = Math.random,
): Promise<PlaybackAdvanceDecision> {
  const fromTrackId = state.currentTrackId
  if (!fromTrackId) return { kind: 'noop' }

  // 1. Queued next track priority
  const allowQueued = trigger === 'manual-next' || state.playbackMode !== 'repeat-one'
  if (allowQueued && state.queuedNextTrackId !== null) {
    const next = state.queue[state.currentIndex + 1]
    if (next?.id === state.queuedNextTrackId) {
      return {
        kind: 'play',
        plan: { queue: state.queue, track: next, recordHistory: true, consumeQueued: true },
      }
    }
  }

  // 2. Repeat-one
  if (state.playbackMode === 'repeat-one') {
    if (trigger === 'manual-next') {
      const next = state.queue[state.currentIndex + 1]
      return next
        ? {
            kind: 'play',
            plan: { queue: state.queue, track: next, recordHistory: true, consumeQueued: false },
          }
        : { kind: 'noop' }
    }

    if (state.currentTrack) {
      return {
        kind: 'play',
        plan: {
          queue: state.queue,
          track: state.currentTrack,
          recordHistory: false,
          consumeQueued: false,
        },
      }
    }
    return { kind: 'noop' }
  }

  // 3. Sequential / Repeat-all
  if (state.playbackMode === 'sequential' || state.playbackMode === 'repeat-all') {
    const next = state.queue[state.currentIndex + 1]
    if (next) {
      return {
        kind: 'play',
        plan: { queue: state.queue, track: next, recordHistory: true, consumeQueued: false },
      }
    }

    if (state.playbackMode === 'repeat-all' && state.queue.length > 0) {
      return {
        kind: 'play',
        plan: {
          queue: state.queue,
          track: state.queue[0],
          recordHistory: true,
          consumeQueued: false,
        },
      }
    }

    if (state.playbackMode === 'sequential' && trigger === 'natural-ended') {
      return { kind: 'stop', resetTime: true }
    }

    return { kind: 'noop' }
  }

  // 4. Shuffle
  if (state.playbackMode === 'shuffle') {
    if (state.shuffleTrackPool?.length) {
      const candidates = state.shuffleTrackPool.filter((track) => track.id !== fromTrackId)
      const track = candidates[Math.floor(random() * candidates.length)]
      return track
        ? {
            kind: 'play',
            plan: {
              queue: state.shuffleTrackPool,
              track,
              recordHistory: true,
              consumeQueued: false,
            },
          }
        : { kind: 'noop' }
    }
    const track = await source.getRandomTrack(fromTrackId)
    return track
      ? {
          kind: 'play',
          plan: { queue: [track], track, recordHistory: true, consumeQueued: false },
        }
      : { kind: 'noop' }
  }

  // 5. Album shuffle
  if (state.playbackMode === 'album-shuffle') {
    let context = state.albumShuffleContext
    if (!context) {
      if (state.shuffleTrackPool?.length) {
        context = findCurrentAlbumShuffleContext(state.shuffleTrackPool, fromTrackId)
      } else {
        const currentAlbumKey = getAlbumKey(state.currentTrack)
        if (currentAlbumKey) {
          const candidate = await source.getAlbumTracks(currentAlbumKey)
          if (candidate?.tracks.some((track) => track.id === fromTrackId)) {
            context = candidate
          }
        }
      }
    }

    if (context) {
      const albumIndex = context.tracks.findIndex((track) => track.id === fromTrackId)
      const track = context.tracks[albumIndex + 1]
      if (track) {
        return {
          kind: 'play',
          plan: {
            queue: context.tracks,
            track,
            recordHistory: true,
            consumeQueued: false,
            nextAlbumShuffleContext: context,
          },
        }
      }
    }

    const nextContext = state.shuffleTrackPool?.length
      ? selectRandomAlbumShuffleContext(state.shuffleTrackPool, state.currentTrack, random)
      : await source.getRandomAlbumTracks(getAlbumKey(state.currentTrack))
    const track = nextContext?.tracks[0]
    return track
      ? {
          kind: 'play',
          plan: {
            queue: nextContext!.tracks,
            track,
            recordHistory: true,
            consumeQueued: false,
            nextAlbumShuffleContext: nextContext,
          },
        }
      : { kind: 'noop' }
  }

  return { kind: 'noop' }
}

export async function resolvePlaybackTransition(
  state: PlaybackTransitionState,
  source: PlaybackTransitionSource,
  random: () => number = Math.random,
): Promise<PlaybackTransitionPlan | null> {
  const decision = await resolvePlaybackAdvance(state, source, 'gapless-prefetch', random)
  return decision.kind === 'play' ? decision.plan : null
}
