import { statSync } from 'node:fs'
import type { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import type { TrackRepository } from '@main/repositories/trackRepository'
import type { LibraryChangedEvent } from '@shared/types/libraryEvents'
import { isPathUnderAnyRoot } from './audioPathGuard'

/** The protocol callback is shared by app assembly and the real SQLite lock probe. */
export function createAudioMissingHandler(options: {
  tracks: Pick<TrackRepository, 'getFilePathById' | 'markMissingByFilePaths'>
  getRootPaths(): string[]
  admission: Pick<DatabaseWriteAdmission, 'runWrite'>
  changed(event: LibraryChangedEvent): void
}) {
  return (trackId: number, filePath: string): Promise<void> =>
    options.admission.runWrite(() => {
      if (options.tracks.getFilePathById(trackId) !== filePath) return
      if (!isPathUnderAnyRoot(filePath, options.getRootPaths())) return
      try {
        if (statSync(filePath).isFile()) return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
      }
      const trackIds = options.tracks.markMissingByFilePaths([filePath])
      if (trackIds.length)
        options.changed({ reason: 'track-missing', trackIds, filePaths: [filePath] })
    })
}
