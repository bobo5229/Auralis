import { statSync } from 'node:fs'
import { win32 } from 'node:path'
import type { ScanFailure } from '@shared/types/libraryScan'
import type { TrackRepository } from '@main/repositories/trackRepository'
import { logger } from '@main/logging/logger'
import { findUniqueRelocations } from './trackRelocationMatcher'
import { isCurrentScanSnapshot } from './libraryScanSnapshot'
import type { ScannedTrackFile } from './libraryScanTypes'

export interface ImportedTracks {
  addedPaths: string[]
  relocatedIds: number[]
  relocatedPaths: string[]
  restoredPaths: string[]
  failures: Pick<ScanFailure, 'filePath' | 'reason'>[]
}

export function importScannedTracks(
  tracks: ScannedTrackFile[] | (() => Iterable<ScannedTrackFile>),
  candidates: ReturnType<TrackRepository['getMissingCandidates']>,
  trackRepository: TrackRepository,
  onFailure: () => void,
  checkCanceled: () => void = () => {},
): ImportedTracks {
  const newTracks: ScannedTrackFile[] = []
  const relocatedIds: number[] = []
  const relocatedPaths: string[] = []
  const restoredPaths: string[] = []
  const failures: ImportedTracks['failures'] = []
  const isCurrentFile = (track: ScannedTrackFile): boolean => {
    checkCanceled()
    if (isCurrentScanSnapshot(track, true)) return true
    onFailure()
    failures.push({
      filePath: track.filePath,
      // electron-vite 3's shim scanner mistakes a trailing module keyword in a
      // string for syntax and can insert its shim inside a later string literal.
      reason: 'Audio file changed or became unavailable before committing scanned tracks',
    })
    return false
  }
  const addedPaths: string[] = []
  const flush = () => {
    const currentNewTracks = newTracks.splice(0).filter(isCurrentFile)
    if (currentNewTracks.length > 0) {
      const newTrackPaths = currentNewTracks.map((track) => track.filePath)
      const existingPaths = trackRepository.getExistingFilePaths(newTrackPaths)
      const attemptedPaths = newTrackPaths.filter((filePath) => !existingPaths.has(filePath))

      try {
        trackRepository.upsertMany(currentNewTracks)
      } catch (error) {
        // One bad row must not drop the whole batch — retry per track.
        onFailure()
        logger.warn(
          { error, count: currentNewTracks.length },
          'Batch upsert failed; retrying per track',
        )
        for (const track of currentNewTracks) {
          if (!isCurrentFile(track)) continue
          try {
            trackRepository.upsertMany([track])
          } catch (trackError) {
            failures.push({
              filePath: track.filePath,
              reason: trackError instanceof Error ? trackError.message : 'Unable to import track',
            })
            logger.warn(
              { error: trackError, filePath: track.filePath },
              'Skipping track after upsert failure',
            )
          }
        }
      }

      const committedPaths = trackRepository.getExistingFilePaths(attemptedPaths)
      addedPaths.push(...attemptedPaths.filter((path) => committedPaths.has(path)))
    }
  }
  const enqueue = (track: ScannedTrackFile) => {
    newTracks.push(track)
  }
  const source = typeof tracks === 'function' ? tracks : () => tracks
  // Keep all claims in the match calculation: a stale input must not make an
  // otherwise ambiguous move appear unique.
  const matches = findUniqueRelocations(candidates, source())
  for (const track of source()) {
    checkCanceled()
    if (newTracks.length >= 300) flush()
    if (matches.has(track.filePath) && !isCurrentFile(track)) continue
    try {
      const match = matches.get(track.filePath)

      if (match) {
        // Case-only renames resolve through the old spelling on Windows. Other
        // moves require positive confirmation that the old path is absent now.
        const pathAlias =
          win32.normalize(match.filePath).toLowerCase() ===
          win32.normalize(track.filePath).toLowerCase()
        if (!pathAlias) {
          try {
            if (statSync(match.filePath).isFile()) restoredPaths.push(match.filePath)
            enqueue(track)
            continue
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            if (code !== 'ENOENT' && code !== 'ENOTDIR') {
              enqueue(track)
              continue
            }
          }
        }
        const relocated = trackRepository.relocateTrack(match.trackId, track, match.filePath)

        if (relocated) {
          relocatedIds.push(match.trackId)
          relocatedPaths.push(track.filePath)
        } else {
          // Path occupied or constraint race — fall back to path upsert.
          enqueue(track)
        }
      } else {
        enqueue(track)
      }
    } catch (error) {
      onFailure()
      logger.warn(
        { error, filePath: track.filePath },
        'Failed to relocate/upsert scanned track; trying upsert fallback',
      )
      enqueue(track)
    }
  }
  flush()
  return { addedPaths, relocatedIds, relocatedPaths, restoredPaths, failures }
}
