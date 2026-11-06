import type { LibraryStats } from '@shared/types/app'
import type { TrackLyrics, TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackTrackDto, RandomAlbumTracksResult } from '@shared/types/playback'
import { LibraryRepository } from '@main/repositories/libraryRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryCatalogSnapshotStore } from '@main/features/libraryCatalog/libraryCatalogSnapshotStore'
import type { LibraryTrackPage, LibraryTrackPageRequest } from '@shared/types/libraryCatalog'
import type { AlbumDetailRequest, AlbumDetailResult } from '@shared/types/albumDetail'
import { rankAlbumGenres } from '@shared/utils/albumGenres'
import type { LoadedLibraryCatalog } from '@main/features/libraryCatalog/libraryCatalogWorkerTypes'

export class LibraryService {
  private readonly catalogSnapshotStore: LibraryCatalogSnapshotStore

  constructor(
    private readonly libraryRepository: LibraryRepository,
    private readonly trackRepository: TrackRepository,
    private readonly catalogLoader?: {
      load(): Promise<LoadedLibraryCatalog>
      shutdown(): Promise<void>
    },
  ) {
    this.catalogSnapshotStore = new LibraryCatalogSnapshotStore(
      () => this.trackRepository.getAll(),
      Date.now,
      () => this.trackRepository.getChangeToken(),
    )
  }

  dispose(): void | Promise<void> {
    this.catalogSnapshotStore.dispose()
    return this.catalogLoader?.shutdown()
  }

  getStats(): LibraryStats {
    return this.libraryRepository.getStats()
  }

  getTracks(): TrackListItem[] | Promise<TrackListItem[]> {
    if (this.catalogLoader) return this.loadCurrentTracks()
    return this.trackRepository.getAll()
  }

  private async loadCurrentTracks(): Promise<TrackListItem[]> {
    const deadline = Date.now() + 30_000
    for (;;) {
      const catalog = await this.catalogLoader!.load()
      if (this.trackRepository.getChangeToken() === catalog.revision) return catalog.tracks
      if (Date.now() >= deadline) throw new Error('Library catalog kept changing during load')
    }
  }

  getTrackPage(request: LibraryTrackPageRequest): LibraryTrackPage | Promise<LibraryTrackPage> {
    if (this.catalogLoader)
      return this.catalogSnapshotStore.getPageAsync(request, () => this.catalogLoader!.load())
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
    const primaryGenre = moreAlbums.length === 0 ? rankAlbumGenres(tracks)[0] : undefined
    return {
      tracks,
      moreAlbums,
      genreAlbums: primaryGenre
        ? this.trackRepository.getGenreAlbumSummaries(
            primaryGenre,
            request.albumArtist,
            request.albumTitle,
          )
        : [],
    }
  }

  getLyrics(trackId: number): TrackLyrics | null {
    const result = this.trackRepository.getLyricsByTrackId(trackId)
    if (result?.lyricsFormat === 'ttml') return { ...result, lyricsText: null, lyricsFormat: null }
    return result
  }

  getPlaybackTrack(trackId: number): PlaybackTrackDto | null {
    return this.trackRepository.getPlaybackTrack(trackId)
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
