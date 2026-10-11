import type { LibraryStats } from '@shared/types/app'
import type { TrackLyrics, TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackTrackDto, RandomAlbumTracksResult } from '@shared/types/playback'
import { LibraryRepository } from '@main/repositories/libraryRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryCatalogSnapshotStore } from '@main/features/libraryCatalog/libraryCatalogSnapshotStore'
import type { LibraryTrackPage, LibraryTrackPageRequest } from '@shared/types/libraryCatalog'
import type { AlbumDetailRequest, AlbumDetailResult } from '@shared/types/albumDetail'
import { splitDelimitedValues } from '@shared/utils/delimitedValues'

export class LibraryService {
  private readonly catalogSnapshotStore: LibraryCatalogSnapshotStore

  constructor(
    private readonly libraryRepository: LibraryRepository,
    private readonly trackRepository: TrackRepository,
  ) {
    this.catalogSnapshotStore = new LibraryCatalogSnapshotStore(
      () => this.trackRepository.getAll(),
      Date.now,
      () => this.trackRepository.getChangeToken(),
    )
  }

  getStats(): LibraryStats {
    return this.libraryRepository.getStats()
  }

  getTracks(): TrackListItem[] {
    return this.trackRepository.getAll()
  }

  getTrackPage(request: LibraryTrackPageRequest): LibraryTrackPage {
    return this.catalogSnapshotStore.getPage(request)
  }

  getAlbumDetail(request: AlbumDetailRequest): AlbumDetailResult {
    const tracks = this.trackRepository.getAlbumDetailTracks(
      request.albumArtist,
      request.albumTitle,
    )
    const moreAlbums =
      request.albumArtist === 'Unknown Artist'
        ? []
        : this.trackRepository.getArtistAlbumSummaries(request.albumArtist, request.albumTitle)
    return {
      tracks,
      moreAlbums,
      genreAlbums:
        moreAlbums.length === 0
          ? this.trackRepository.getGenreAlbumSummaries(
              tracks.flatMap((track) => splitDelimitedValues(track.genre)),
              request.albumArtist,
              request.albumTitle,
            )
          : [],
    }
  }

  getLyrics(trackId: number): TrackLyrics | null {
    return this.trackRepository.getLyricsByTrackId(trackId)
  }

  getRandomTrack(excludeTrackId?: number): PlaybackTrackDto | null {
    const track = this.trackRepository.getRandomPlayableTrack(excludeTrackId)
    if (track) return track
    return this.trackRepository.getRandomPlayableTrack()
  }

  getRandomAlbumTracks(excludeAlbumKey?: {
    albumArtist: string
    album: string
  }): RandomAlbumTracksResult | null {
    const identity = this.trackRepository.getRandomAlbumIdentity(excludeAlbumKey)
    if (!identity) {
      const fallback = this.trackRepository.getRandomAlbumIdentity()
      if (!fallback) return null
      const tracks = this.trackRepository.getAlbumTracks(fallback.albumArtist, fallback.album)
      if (tracks.length === 0) return null
      return { albumArtist: fallback.albumArtist, album: fallback.album, tracks }
    }

    const tracks = this.trackRepository.getAlbumTracks(identity.albumArtist, identity.album)
    if (tracks.length === 0) return null
    return { albumArtist: identity.albumArtist, album: identity.album, tracks }
  }

  getAlbumTracks(albumKey: { albumArtist: string; album: string }): RandomAlbumTracksResult | null {
    const tracks = this.trackRepository.getAlbumTracks(albumKey.albumArtist, albumKey.album)
    if (tracks.length === 0) return null
    return { albumArtist: albumKey.albumArtist, album: albumKey.album, tracks }
  }
}
