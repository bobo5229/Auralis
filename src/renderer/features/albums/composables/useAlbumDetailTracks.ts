import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { AlbumDetailResult, AlbumDetailSummary } from '@shared/types/albumDetail'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  invalidateAlbumDetailSnapshot,
  readAlbumDetailSnapshot,
  snapshotHasCatalog,
  writeAlbumDetailSnapshot,
  type AlbumDetailSnapshot,
} from '../albumDetailSnapshot'
import type { AlbumSummary } from '../types'
import { moreAlbumsByArtist, moreAlbumsByGenre } from '../utils/albumGrouping'
import { splitDelimitedValues } from '@shared/utils/delimitedValues'
import { getAlbumCatalogIndex } from '../utils/albumCatalogIndex'
import { albumIdentityKey } from '../utils/albumIdentity'

export type AlbumDetailLoadState = 'loading' | 'ready' | 'not-found' | 'error'
export { selectAlbumTracks } from '../utils/albumGrouping'

type AlbumDetailLibraryClient = Pick<AuralisApi['library'], 'getAlbumDetail' | 'onChanged'>

interface UseAlbumDetailTracksOptions {
  albumArtist: Readonly<Ref<string>>
  albumTitle: Readonly<Ref<string>>
  library: AlbumDetailLibraryClient
  playStatsReloadDebounceMs?: number
}

interface UseAlbumDetailTracksResult {
  tracks: Ref<TrackListItem[]>
  albumTracks: ComputedRef<TrackListItem[]>
  moreAlbums: ComputedRef<AlbumSummary[]>
  genreAlbums: ComputedRef<AlbumSummary[]>
  previewArtworkCacheKey: Ref<string | null>
  previewReleaseDate: Ref<string | null>
  loadState: Ref<AlbumDetailLoadState>
  initialize: () => Promise<void>
  reloadTracks: (options?: { background?: boolean }) => Promise<boolean>
  ensureCurrentAlbum: () => Promise<void>
  syncLoadStateFromTracks: () => void
  dispose: () => void
}

const DEFAULT_PLAY_STATS_RELOAD_DEBOUNCE_MS = 400

function toAlbumSummary(summary: AlbumDetailSummary): AlbumSummary {
  return {
    key: albumIdentityKey(summary.albumArtist, summary.title),
    title: summary.title,
    albumArtist: summary.albumArtist,
    releaseDate: summary.releaseDate,
    artworkCacheKey: summary.artworkCacheKey,
    tracks: [],
  }
}

function snapshotWorkingTracks(snapshot: AlbumDetailSnapshot | null): TrackListItem[] {
  if (!snapshot) return []
  if (snapshotHasCatalog(snapshot) && snapshot.catalogTracks) return snapshot.catalogTracks
  return snapshot.tracks
}

export function useAlbumDetailTracks({
  albumArtist,
  albumTitle,
  library,
  playStatsReloadDebounceMs = DEFAULT_PLAY_STATS_RELOAD_DEBOUNCE_MS,
}: UseAlbumDetailTracksOptions): UseAlbumDetailTracksResult {
  const initialSnapshot = readAlbumDetailSnapshot(albumArtist.value, albumTitle.value)
  const tracks = shallowRef<TrackListItem[]>(snapshotWorkingTracks(initialSnapshot))
  const storedMoreAlbums = shallowRef<AlbumSummary[]>(
    initialSnapshot && !snapshotHasCatalog(initialSnapshot) ? initialSnapshot.moreAlbums : [],
  )
  const storedGenreAlbums = shallowRef<AlbumSummary[]>(initialSnapshot?.genreAlbums ?? [])
  const storedAlbumKey = ref(
    initialSnapshot
      ? albumIdentityKey(initialSnapshot.albumArtist, initialSnapshot.albumTitle)
      : '',
  )
  const previewArtworkCacheKey = ref<string | null>(initialSnapshot?.artworkCacheKey ?? null)
  const previewReleaseDate = ref<string | null>(initialSnapshot?.releaseDate ?? null)
  let hasCatalogSnapshot = snapshotHasCatalog(initialSnapshot)
  const albumTracks = computed(() =>
    getAlbumCatalogIndex(tracks.value).selectTracks(albumArtist.value, albumTitle.value),
  )
  const loadState = shallowRef<AlbumDetailLoadState>(
    albumTracks.value.length > 0 ? 'ready' : 'loading',
  )
  const moreAlbums = computed(() => {
    if (!hasCatalogSnapshot && storedMoreAlbums.value.length > 0) {
      return moreAlbumsByArtist(storedMoreAlbums.value, albumArtist.value, albumTitle.value)
    }

    return getAlbumCatalogIndex(tracks.value).moreAlbums(albumArtist.value, albumTitle.value)
  })
  const genreAlbums = computed(() => {
    if (moreAlbums.value.length > 0 || albumTracks.value.length === 0) return []
    if (hasCatalogSnapshot) {
      return moreAlbumsByGenre(
        getAlbumCatalogIndex(tracks.value).albums,
        albumTracks.value,
        albumArtist.value,
        albumTitle.value,
      )
    }
    return storedAlbumKey.value === albumIdentityKey(albumArtist.value, albumTitle.value)
      ? storedGenreAlbums.value
      : []
  })

  let disposed = false
  let loadGeneration = 0
  let playStatsReloadTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribeChanged: (() => void) | null = null

  function syncLoadStateFromTracks(): void {
    loadState.value = albumTracks.value.length > 0 ? 'ready' : 'not-found'
  }

  function applySnapshot(snapshot: AlbumDetailSnapshot): void {
    storedGenreAlbums.value = snapshot.genreAlbums ?? []
    storedAlbumKey.value = albumIdentityKey(snapshot.albumArtist, snapshot.albumTitle)
    previewArtworkCacheKey.value = snapshot.artworkCacheKey
    previewReleaseDate.value = snapshot.releaseDate

    if (snapshotHasCatalog(snapshot) && snapshot.catalogTracks) {
      tracks.value = snapshot.catalogTracks
      storedMoreAlbums.value = []
      hasCatalogSnapshot = true
    } else if (!hasCatalogSnapshot) {
      tracks.value = snapshot.tracks
      storedMoreAlbums.value = snapshot.moreAlbums
    }

    if (albumTracks.value.length > 0) {
      previewArtworkCacheKey.value =
        albumTracks.value.find((track) => track.artworkCacheKey)?.artworkCacheKey ??
        snapshot.artworkCacheKey
      previewReleaseDate.value =
        albumTracks.value.find((track) => track.releaseDate)?.releaseDate ?? snapshot.releaseDate
      loadState.value = 'ready'
    }
  }

  function mergeAlbumTracks(nextAlbumTracks: TrackListItem[]): void {
    if (!hasCatalogSnapshot) {
      tracks.value = nextAlbumTracks
      return
    }

    const replacements = new Map(nextAlbumTracks.map((track) => [track.id, track]))
    const seen = new Set<number>()
    const merged: TrackListItem[] = []

    for (const track of tracks.value) {
      const replacement = replacements.get(track.id)
      if (replacement) {
        merged.push(replacement)
        seen.add(track.id)
      } else {
        merged.push(track)
      }
    }

    for (const track of nextAlbumTracks) {
      if (!seen.has(track.id)) merged.push(track)
    }

    tracks.value = merged
  }

  function rememberSnapshot(result: AlbumDetailResult): void {
    writeAlbumDetailSnapshot({
      albumArtist: albumArtist.value,
      albumTitle: albumTitle.value,
      artworkCacheKey:
        result.tracks.find((track) => track.artworkCacheKey)?.artworkCacheKey ??
        previewArtworkCacheKey.value,
      releaseDate:
        result.tracks.find((track) => track.releaseDate)?.releaseDate ?? previewReleaseDate.value,
      tracks: result.tracks,
      moreAlbums: result.moreAlbums.map(toAlbumSummary),
      genreAlbums: result.genreAlbums.map(toAlbumSummary),
      catalogTracks: hasCatalogSnapshot ? tracks.value : null,
    })
  }

  function syncToCurrentAlbum(): boolean {
    const snapshot = readAlbumDetailSnapshot(albumArtist.value, albumTitle.value)
    if (snapshot) applySnapshot(snapshot)

    if (albumTracks.value.length > 0) {
      if (!previewArtworkCacheKey.value) {
        previewArtworkCacheKey.value =
          albumTracks.value.find((track) => track.artworkCacheKey)?.artworkCacheKey ?? null
      }
      if (!previewReleaseDate.value) {
        previewReleaseDate.value =
          albumTracks.value.find((track) => track.releaseDate)?.releaseDate ?? null
      }
      loadState.value = 'ready'
      return true
    }

    if (snapshot) {
      loadState.value = 'loading'
      return false
    }

    if (hasCatalogSnapshot) {
      syncLoadStateFromTracks()
      return loadState.value === 'ready'
    }

    return false
  }

  async function reloadTracks(options: { background?: boolean } = {}): Promise<boolean> {
    const requestGeneration = ++loadGeneration
    const hasExistingSnapshot = albumTracks.value.length > 0
    if (!options.background && !hasExistingSnapshot) loadState.value = 'loading'

    try {
      const result = await library.getAlbumDetail({
        albumArtist: albumArtist.value,
        albumTitle: albumTitle.value,
      })
      if (disposed || requestGeneration !== loadGeneration) return false

      mergeAlbumTracks(result.tracks)
      if (!hasCatalogSnapshot) storedMoreAlbums.value = result.moreAlbums.map(toAlbumSummary)
      storedGenreAlbums.value = result.genreAlbums.map(toAlbumSummary)
      storedAlbumKey.value = albumIdentityKey(albumArtist.value, albumTitle.value)
      previewArtworkCacheKey.value =
        result.tracks.find((track) => track.artworkCacheKey)?.artworkCacheKey ??
        previewArtworkCacheKey.value
      previewReleaseDate.value =
        result.tracks.find((track) => track.releaseDate)?.releaseDate ?? previewReleaseDate.value
      syncLoadStateFromTracks()
      rememberSnapshot(result)
      return true
    } catch {
      if (disposed || requestGeneration !== loadGeneration) return false

      if (hasExistingSnapshot || options.background) {
        if (hasExistingSnapshot) syncLoadStateFromTracks()
      } else {
        loadState.value = 'error'
      }
      return false
    }
  }

  async function ensureCurrentAlbum(): Promise<void> {
    if (syncToCurrentAlbum()) {
      const snapshot = readAlbumDetailSnapshot(albumArtist.value, albumTitle.value)
      const needsGenreAlbums =
        !hasCatalogSnapshot &&
        moreAlbums.value.length === 0 &&
        snapshot?.genreAlbums === undefined &&
        albumTracks.value.some((track) => splitDelimitedValues(track.genre).length > 0)
      if (!needsGenreAlbums) return
    }
    await reloadTracks()
  }

  function schedulePlayStatsReload(): void {
    if (playStatsReloadTimer) clearTimeout(playStatsReloadTimer)
    playStatsReloadTimer = setTimeout(() => {
      playStatsReloadTimer = null
      void reloadTracks({ background: true })
    }, playStatsReloadDebounceMs)
  }

  async function initialize(): Promise<void> {
    await ensureCurrentAlbum()
    if (disposed) return

    unsubscribeChanged?.()
    unsubscribeChanged = library.onChanged((event) => {
      if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') {
        schedulePlayStatsReload()
        return
      }
      hasCatalogSnapshot = false
      storedMoreAlbums.value = []
      storedGenreAlbums.value = []
      invalidateAlbumDetailSnapshot()
      void reloadTracks({ background: true })
    })
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    loadGeneration += 1

    if (playStatsReloadTimer) {
      clearTimeout(playStatsReloadTimer)
      playStatsReloadTimer = null
    }

    unsubscribeChanged?.()
    unsubscribeChanged = null
  }

  return {
    tracks,
    albumTracks,
    moreAlbums,
    genreAlbums,
    previewArtworkCacheKey,
    previewReleaseDate,
    loadState,
    initialize,
    reloadTracks,
    ensureCurrentAlbum,
    syncLoadStateFromTracks,
    dispose,
  }
}
