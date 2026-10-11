import type { StartupAlbumKey } from '@shared/types/startupAlbum'

export interface StartupAlbumCandidate extends StartupAlbumKey {
  averagePlayCount: number
  unheardFraction: number
  lastPlayedAt: string | null
}
