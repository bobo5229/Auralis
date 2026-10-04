import type { ScannedTrack } from '@shared/types/libraryScan'
import type { MissingTrackCandidate } from '@main/repositories/trackRepository'

/**
 * Minimal file identity needed for relocation matching.
 * Both the full-scan path and the watcher path build this from parsed metadata.
 */
export interface FileIdentity {
  title: string
  artist: string
  album: string
  isrc: string | null
  durationSeconds: number | null
  fileSize: number | null
}

function durationsMatch(candidate: number | null, file: number | null): boolean {
  return (
    candidate !== null &&
    file !== null &&
    Number.isFinite(candidate) &&
    Number.isFinite(file) &&
    candidate > 0 &&
    file > 0 &&
    Math.abs(candidate - file) <= 1
  )
}

/**
 * Pure function: find the unique missing-candidate match for a file's identity.
 *
 * Matching rules (shared across full scan and watcher):
 * 1. ISRC match — both must have the same non-null ISRC,
 *    there must be exactly one matching candidate, and both must have
 *    known positive durations differing by at most 1s. A whole album and
 *    an individual track can share an ISRC; that alone cannot relocate them.
 *    Zero ISRC matches fall through to Rule 2; ambiguous or conflicting matches abort.
 * 2. Title+artist match — title and artist must match exactly,
 *    duration diff ≤ 1s, file size diff ≤ 2%, album matches or
 *    either side is empty / Unknown Album.
 * 3. Multiple candidates for either rule → null (avoid false positives).
 *
 * Returns the matched candidate, or null if no unique match.
 */
export function findUniqueRelocationCandidate(
  candidates: MissingTrackCandidate[],
  identity: FileIdentity,
): MissingTrackCandidate | null {
  if (candidates.length === 0) return null

  // Rule 1 — ISRC
  if (identity.isrc) {
    const isrcMatches = candidates.filter((c) => c.isrc === identity.isrc)
    if (isrcMatches.length === 1) {
      const match = isrcMatches[0]!
      return durationsMatch(match.durationSeconds, identity.durationSeconds) ? match : null
    }
    if (isrcMatches.length > 1) return null
    // 0 ISRC matches → fall through to Rule 2
  }

  // Rule 2 — title + artist + duration + size + album
  const titleMatches = candidates.filter((c) => {
    if (c.isrc) return false // skip ISRC-bearing candidates
    if (c.title !== identity.title) return false
    if (c.artist !== identity.artist) return false

    if (!durationsMatch(c.durationSeconds, identity.durationSeconds)) return false

    if (!c.fileSize || !identity.fileSize) return false
    if (Math.abs(c.fileSize - identity.fileSize) / c.fileSize > 0.02) return false

    const albumMatch =
      c.album === identity.album ||
      !c.album ||
      !identity.album ||
      c.album === 'Unknown Album' ||
      identity.album === 'Unknown Album'

    return albumMatch
  })

  return titleMatches.length === 1 ? titleMatches[0] : null
}

/** Decide the entire batch before writing; two new paths must not claim one old record. */
export function findUniqueRelocations(
  candidates: MissingTrackCandidate[],
  tracks: ScannedTrack[],
  canRelocate: (candidate: MissingTrackCandidate, track: ScannedTrack) => boolean = () => true,
): Map<string, MissingTrackCandidate> {
  const matches = new Map<string, MissingTrackCandidate>()
  const claims = new Map<number, number>()
  for (const track of tracks) {
    const match = findUniqueRelocationCandidate(candidates, track)
    if (!match || !canRelocate(match, track)) continue
    matches.set(track.filePath, match)
    claims.set(match.trackId, (claims.get(match.trackId) ?? 0) + 1)
  }
  for (const [filePath, match] of matches) {
    if (claims.get(match.trackId) !== 1) matches.delete(filePath)
  }
  return matches
}
