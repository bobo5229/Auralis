import { STARTUP_ALBUM_HISTORY_LIMIT, type StartupAlbumKey } from '@shared/types/startupAlbum'
import type { StartupAlbumCandidate } from '@main/repositories/startupAlbumCandidate'

export const STARTUP_ALBUM_MIX = { lessPlayed: 0.6, rediscover: 0.25, random: 0.15 } as const

function key(album: StartupAlbumKey): string {
  return JSON.stringify([album.albumArtist, album.album])
}

/** Business weights; draws are injected so boundaries and probabilities can be tested. */
export function selectStartupAlbum(
  candidates: readonly StartupAlbumCandidate[],
  history: readonly StartupAlbumKey[] = [],
  random: () => number = Math.random,
  now: number = Date.now(),
): StartupAlbumKey | null {
  if (!candidates.length) return null
  const recent = history.slice(0, STARTUP_ALBUM_HISTORY_LIMIT)
  const blocked = new Set(recent.map(key))
  let eligible = candidates.filter((album) => !blocked.has(key(album)))
  // Release oldest presentations first, retaining the previous album until necessary.
  for (let i = recent.length - 1; !eligible.length && i >= 0; i--) {
    blocked.delete(key(recent[i]))
    eligible = candidates.filter((album) => !blocked.has(key(album)))
  }

  const branch = random()
  const rediscover =
    branch >= STARTUP_ALBUM_MIX.lessPlayed &&
    branch < STARTUP_ALBUM_MIX.lessPlayed + STARTUP_ALBUM_MIX.rediscover
  if (rediscover) {
    const heard = eligible.filter((album) => Number.isFinite(Date.parse(album.lastPlayedAt ?? '')))
    if (heard.length) eligible = heard
    // With no listening history this direction naturally falls back to a uniform draw.
    else return identity(eligible[Math.floor(random() * eligible.length)])
  }
  if (branch >= STARTUP_ALBUM_MIX.lessPlayed + STARTUP_ALBUM_MIX.rediscover) {
    return identity(eligible[Math.floor(random() * eligible.length)])
  }

  const weights = eligible.map((album) => {
    const artistAppearances = recent
      .slice(0, 3)
      .filter((shown) => shown.albumArtist === album.albumArtist).length
    const artistWeight = 1 / (1 + 0.5 * artistAppearances)
    if (rediscover) {
      const days = Math.max(0, (now - Date.parse(album.lastPlayedAt!)) / 86_400_000)
      return (0.1 + 0.9 * Math.min(days / 90, 1)) * artistWeight
    }
    return (
      ((1 + 0.5 * album.unheardFraction) / Math.sqrt(1 + album.averagePlayCount)) * artistWeight
    )
  })
  let draw = random() * weights.reduce((sum, weight) => sum + weight, 0)
  for (let i = 0; i < eligible.length; i++) {
    draw -= weights[i]
    if (draw < 0) return identity(eligible[i])
  }
  return identity(eligible[eligible.length - 1])
}

function identity(album: StartupAlbumKey): StartupAlbumKey {
  return { albumArtist: album.albumArtist, album: album.album }
}
