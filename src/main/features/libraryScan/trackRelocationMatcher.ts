import type { ScannedTrack } from '@shared/types/libraryScan'
import type { TrackRepository, MissingTrackCandidate } from '@main/repositories/trackRepository'
import type { NormalizedIdentity } from '@main/features/metadata/metadataNormalizer'

export interface RelocationResult {
  candidate: MissingTrackCandidate
  track: ScannedTrack
}

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

/**
 * Pure function: find the unique missing-candidate match for a file's identity.
 *
 * Matching rules (shared across full scan and watcher):
 * 1. ISRC match — both must have the same non-null ISRC,
 *    and there must be exactly one matching candidate.
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
    if (isrcMatches.length === 1) return isrcMatches[0]
    return null
  }

  // Rule 2 — title + artist + duration + size + album
  const titleMatches = candidates.filter((c) => {
    if (c.isrc) return false // skip ISRC-bearing candidates
    if (c.title !== identity.title) return false
    if (c.artist !== identity.artist) return false

    if (!c.durationSeconds || !identity.durationSeconds) return false
    if (Math.abs(c.durationSeconds - identity.durationSeconds) > 1) return false

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

/**
 * Try to match a scanned track against missing candidates in the database.
 * Returns a RelocationResult if a unique match is found, null otherwise.
 */
export function tryRelocateMissingCandidate(
  trackRepository: TrackRepository,
  scannedTrack: ScannedTrack,
): RelocationResult | null {
  const identity: NormalizedIdentity = {
    title: scannedTrack.title,
    artist: scannedTrack.artist,
    album: scannedTrack.album,
    isrc: scannedTrack.isrc,
  }

  const candidates = trackRepository.findMissingCandidatesByIdentity(identity)
  const match = findUniqueRelocationCandidate(candidates, {
    title: scannedTrack.title,
    artist: scannedTrack.artist,
    album: scannedTrack.album,
    isrc: scannedTrack.isrc,
    durationSeconds: scannedTrack.durationSeconds,
    fileSize: scannedTrack.fileSize,
  })

  return match ? { candidate: match, track: scannedTrack } : null
}
