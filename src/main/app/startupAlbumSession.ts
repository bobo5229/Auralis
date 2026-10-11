import type { RandomAlbumTracksResult } from '@shared/types/playback'

/** Owned by the main process; reloads and later windows cannot claim again. */
export function createStartupAlbumSession() {
  let claimed = false
  return async (
    pick: () => RandomAlbumTracksResult | null | Promise<RandomAlbumTracksResult | null>,
  ): Promise<{ album: RandomAlbumTracksResult | null }> => {
    if (claimed) return { album: null }
    claimed = true
    return { album: await pick() }
  }
}

export const claimStartupAlbum = createStartupAlbumSession()
