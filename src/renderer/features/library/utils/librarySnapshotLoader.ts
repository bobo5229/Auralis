import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaylistDetail } from '@shared/types/playlist'
import type { SmartPlaylistDetail } from '@shared/types/smartPlaylist'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { LibraryViewMode } from '../types/libraryInteraction'
import type { LibraryRouteScope } from './libraryRouteScope'
import type { SharedLibraryCatalogLoad } from './sharedLibraryCatalogLoad'
import type { LibraryLoadMode } from './libraryRequestCoordinator'
import {
  createAllSongsLibrarySnapshot,
  createPlaylistLibrarySnapshot,
  createRecentAddedLibrarySnapshot,
  createSmartPlaylistLibrarySnapshot,
  type LibraryDataSnapshot,
} from './libraryDataSnapshot'

// Preserve one presentation array per immutable catalog generation across page visits.
const presentationTracks = new WeakMap<readonly TrackListItem[], TrackListItem[]>()
function getPresentationTracks(tracks: readonly TrackListItem[]): TrackListItem[] {
  let result = presentationTracks.get(tracks)
  if (!result) {
    result = [...tracks]
    Object.freeze(result)
    presentationTracks.set(tracks, result)
  }
  return result
}

export function dependsOnPlayStats(preset: string | undefined): boolean {
  return preset === 'recentPlayed' || preset === 'mostListened' || preset === 'recentFrequent'
}

/** Resolves complete, scoped snapshots and exposes a live validity check. */
export function createLibrarySnapshotLoader(options: {
  catalogClient: SharedLibraryCatalogLoad
  getSmartPlaylistDetail: (id: number) => Promise<SmartPlaylistDetail | null>
  getPlaylistDetail: (id: number) => Promise<PlaylistDetail | null>
  readPersistedViewMode: () => LibraryViewMode
  getPlayStatsRevision: () => number
  requestBackgroundRefresh: () => void
}) {
  async function fetchLibrarySnapshot(
    scope: LibraryRouteScope,
    isRequestCurrent: () => boolean,
    mode: LibraryLoadMode,
    libraryRevision?: string,
  ): Promise<{ snapshot: LibraryDataSnapshot | null; isSnapshotCurrent: () => boolean }> {
    if (scope.kind === 'smart-playlist') {
      const statsRevision = options.getPlayStatsRevision()
      const detail = await options.getSmartPlaylistDetail(scope.id)
      const usesPlayStats =
        detail !== null &&
        'preset' in detail.playlist.rule &&
        dependsOnPlayStats(detail.playlist.rule.preset)
      return {
        snapshot: detail ? createSmartPlaylistLibrarySnapshot(detail) : null,
        isSnapshotCurrent: () => {
          if (!usesPlayStats || statsRevision === options.getPlayStatsRevision()) return true
          // The first detail also tells us whether this route consumes statistics.
          // Check at commit time: an event can arrive after this fetch resolves
          // but before its consumer resumes, while no identity is committed yet.
          if (isRequestCurrent()) options.requestBackgroundRefresh()
          return false
        },
      }
    }

    if (scope.kind === 'playlist') {
      const detail = await options.getPlaylistDetail(scope.id)
      return {
        snapshot: detail ? createPlaylistLibrarySnapshot(detail) : null,
        isSnapshotCurrent: () => true,
      }
    }

    const catalog = await options.catalogClient.load(
      isRequestCurrent,
      mode === 'foreground' ? 'current' : 'fresh',
      libraryRevision,
    )
    if (import.meta.env.DEV) {
      rendererDiagnostics.info({
        scope: 'library.catalog',
        message: 'Library catalog snapshot loaded',
        context: {
          totalTracks: catalog.tracks.length,
          totalPages: catalog.totalPages,
          snapshotBuildMs: catalog.snapshotBuildMs,
          snapshotHeapDeltaBytes: catalog.snapshotHeapDeltaBytes,
          pageSliceMs: catalog.pageSliceMs,
          pageRoundTripMs: catalog.pageRoundTripMs,
          rendererAggregateMs: catalog.rendererAggregateMs,
          rendererLoadMs: catalog.rendererLoadMs,
          rendererHeapDeltaBytes: catalog.rendererHeapDeltaBytes,
        },
      })
    }
    return {
      snapshot:
        scope.kind === 'recent-added'
          ? createRecentAddedLibrarySnapshot(
              catalog.tracks,
              scope.range,
              options.readPersistedViewMode(),
            )
          : createAllSongsLibrarySnapshot(
              getPresentationTracks(catalog.tracks),
              options.readPersistedViewMode(),
            ),
      isSnapshotCurrent: () => options.catalogClient.isSnapshotCurrent(catalog),
    }
  }

  return { fetchLibrarySnapshot }
}
