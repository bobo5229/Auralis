import type { ScannedTrack } from '@shared/types/libraryScan'
import type { TrackRepository } from '@main/repositories/trackRepository'
import { logger } from '@main/logging/logger'
import { findUniqueRelocations } from './trackRelocationMatcher'

export interface ImportedTracks {
  addedPaths: string[]
  relocatedIds: number[]
  relocatedPaths: string[]
}

export function importScannedTracks(
  tracks: ScannedTrack[],
  candidates: ReturnType<TrackRepository['getMissingCandidates']>,
  trackRepository: TrackRepository,
  onFailure: () => void,
): ImportedTracks {
  const newTracks: ScannedTrack[] = []
  const relocatedIds: number[] = []
  const relocatedPaths: string[] = []
  const matches = findUniqueRelocations(candidates, tracks)
  for (const track of tracks) {
    try {
      const match = matches.get(track.filePath)

      if (match) {
        const relocated = trackRepository.relocateTrack(match.trackId, track, match.filePath)

        if (relocated) {
          relocatedIds.push(match.trackId)
          relocatedPaths.push(track.filePath)
        } else {
          // Path occupied or constraint race — fall back to path upsert.
          newTracks.push(track)
        }
      } else {
        newTracks.push(track)
      }
    } catch (error) {
      onFailure()
      logger.warn(
        { error, filePath: track.filePath },
        'Failed to relocate/upsert scanned track; trying upsert fallback',
      )
      newTracks.push(track)
    }
  }
  let addedPaths: string[] = []
  if (newTracks.length > 0) {
    const newTrackPaths = newTracks.map((track) => track.filePath)
    const existingPaths = trackRepository.getExistingFilePaths(newTrackPaths)
    addedPaths = newTrackPaths.filter((filePath) => !existingPaths.has(filePath))

    try {
      trackRepository.upsertMany(newTracks)
    } catch (error) {
      // One bad row must not drop the whole batch — retry per track.
      onFailure()
      logger.warn({ error, count: newTracks.length }, 'Batch upsert failed; retrying per track')
      for (const track of newTracks) {
        try {
          trackRepository.upsertMany([track])
        } catch (trackError) {
          logger.warn(
            { error: trackError, filePath: track.filePath },
            'Skipping track after upsert failure',
          )
        }
      }
    }

    const committedPaths = trackRepository.getExistingFilePaths(addedPaths)
    addedPaths = addedPaths.filter((path) => committedPaths.has(path))
  }
  return { addedPaths, relocatedIds, relocatedPaths }
}
