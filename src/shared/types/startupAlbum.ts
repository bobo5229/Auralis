export const STARTUP_ALBUM_HISTORY_LIMIT = 10

export interface StartupAlbumKey {
  albumArtist: string
  album: string
}

/** Newest first; records actual presentations, including ones the user skips. */
export type StartupAlbumHistory = StartupAlbumKey[]
