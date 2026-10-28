import { reactive, toRaw } from 'vue'
import type { PlaybackTrack } from '../types'

const TRACK_FIELDS = [
  'id',
  'title',
  'artist',
  'album',
  'albumArtist',
  'durationSeconds',
  'artworkCacheKey',
] as const satisfies readonly (keyof PlaybackTrack)[]

function snapshotTrack(track: PlaybackTrack): PlaybackTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    durationSeconds: track.durationSeconds,
    artworkCacheKey: track.artworkCacheKey,
  }
}

/** Owns playback copies; external catalogs can change only at an explicit ingestion boundary. */
export function createPlaybackDataOwner() {
  const tracks = new WeakMap<PlaybackTrack, { snapshot: PlaybackTrack; copy: PlaybackTrack }>()
  const queues = new WeakMap<readonly PlaybackTrack[], PlaybackTrack[]>()
  const ownedTracks = new WeakSet<PlaybackTrack>()
  const ownedQueues = new WeakSet<PlaybackTrack[]>()

  function track(input: PlaybackTrack): PlaybackTrack {
    const source = toRaw(input)
    // Readonly public views can return through queue commands. Restore only our
    // own writable handle; another module's reactive/readonly objects stay isolated.
    if (ownedTracks.has(source)) return reactive(source)
    const cached = tracks.get(source)
    if (cached && TRACK_FIELDS.every((field) => source[field] === cached.snapshot[field])) {
      return cached.copy
    }
    const snapshot = Object.isFrozen(source) ? source : snapshotTrack(source)
    const copy = reactive(snapshotTrack(source))
    ownedTracks.add(toRaw(copy))
    tracks.set(source, { snapshot, copy })
    return copy
  }

  function queue(input: readonly PlaybackTrack[]): PlaybackTrack[] {
    const source = toRaw(input)
    if (ownedQueues.has(source as PlaybackTrack[])) return reactive(source as PlaybackTrack[])
    const cached = queues.get(source)
    if (
      cached &&
      cached.length === source.length &&
      source.every((item, index) => track(item) === cached[index])
    ) {
      return cached
    }
    // A changed source gets a new container so history and submitted plans keep
    // their old order. Unchanged tracks still share metadata within playback.
    const copy = reactive(source.map(track))
    ownedQueues.add(toRaw(copy))
    queues.set(source, copy)
    return copy
  }

  return { track, queue }
}
