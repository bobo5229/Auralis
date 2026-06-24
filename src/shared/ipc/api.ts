import type { AppInfo, LibraryStats } from '@shared/types/app'
import type {
  LibraryRoot,
  LibraryScanProgress,
  LibraryScanStatus,
  SelectLibraryRootResult,
  TrackListItem,
  TrackLyrics,
} from '@shared/types/libraryScan'

export interface AuralisApi {
  app: {
    getInfo: () => Promise<AppInfo>
    rendererReady: () => void
  }
  library: {
    getStats: () => Promise<LibraryStats>
    selectRoot: () => Promise<SelectLibraryRootResult>
    getRoots: () => Promise<LibraryRoot[]>
    startScan: (rootId: number) => Promise<{ jobId: number }>
    cancelScan: (jobId: number) => Promise<{ ok: boolean }>
    getScanStatus: (jobId?: number) => Promise<LibraryScanStatus | null>
    getTracks: () => Promise<TrackListItem[]>
    onScanProgress: (callback: (progress: LibraryScanProgress) => void) => () => void
  }
  lyrics: {
    getByTrackId: (trackId: number) => Promise<TrackLyrics | null>
  }
}
