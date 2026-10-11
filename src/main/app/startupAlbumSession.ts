import type { RandomAlbumTracksResult } from '@shared/types/playback'

/** Owned by the main process; reloads and later windows cannot claim again. */
export function createStartupAlbumSession() {
  let claimed = false
  return (
    pick: () => RandomAlbumTracksResult | null,
  ): { album: RandomAlbumTracksResult | null } => {
    if (claimed) return { album: null }
    claimed = true
    return { album: pick() }
  }
}

export const claimStartupAlbum = createStartupAlbumSession()
