import type { LibraryStats } from '@shared/types/app'
import type { TrackLyrics, TrackListItem } from '@shared/types/libraryScan'
import { LibraryRepository } from '@main/repositories/libraryRepository'
import { TrackRepository } from '@main/repositories/trackRepository'

export class LibraryService {
  constructor(
    private readonly libraryRepository: LibraryRepository,
    private readonly trackRepository: TrackRepository,
  ) {}

  getStats(): LibraryStats {
    return this.libraryRepository.getStats()
  }

  getTracks(): TrackListItem[] {
    return this.trackRepository.getAll()
  }

  getLyrics(trackId: number): TrackLyrics | null {
    return this.trackRepository.getLyricsByTrackId(trackId)
  }
}
