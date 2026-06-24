import type { ScannedTrack } from '@shared/types/libraryScan'
import type { TrackRepository, MissingTrackCandidate } from '@main/repositories/trackRepository'
import type { NormalizedIdentity } from '@main/features/metadata/metadataNormalizer'

export interface RelocationResult {
  candidate: MissingTrackCandidate
  track: ScannedTrack
}

/**
 * Try to match a scanned track against missing candidates in the database.
 * Returns a RelocationResult if a unique match is found, null otherwise.
 *
 * Matching rules:
 * - Strong: ISRC exists on both and matches (single candidate)
 * - Medium-strong: ISRC both null, title+artist match, duration diff <= 1s,
 *   file size diff <= 2%, album matches or either is empty/Unknown
 * - Multiple candidates -> no match (avoid false positives)
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

  if (candidates.length === 0) return null
  if (candidates.length > 1) return null

  const candidate = candidates[0]

  if (identity.isrc && candidate.isrc) {
    return { candidate, track: scannedTrack }
  }

  if (!candidate.durationSeconds || !scannedTrack.durationSeconds) return null
  if (!candidate.fileSize || !scannedTrack.fileSize) return null

  const durationDiff = Math.abs(candidate.durationSeconds - scannedTrack.durationSeconds)
  if (durationDiff > 1) return null

  const sizeDiffRatio = Math.abs(candidate.fileSize - scannedTrack.fileSize) / candidate.fileSize
  if (sizeDiffRatio > 0.02) return null

  const albumMatch =
    candidate.album === scannedTrack.album ||
    !candidate.album ||
    !scannedTrack.album ||
    candidate.album === 'Unknown Album' ||
    scannedTrack.album === 'Unknown Album'

  if (!albumMatch) return null

  return { candidate, track: scannedTrack }
}
