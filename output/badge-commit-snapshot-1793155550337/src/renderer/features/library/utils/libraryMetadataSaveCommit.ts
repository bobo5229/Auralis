import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { isSameEditableMetadata } from '@shared/utils/editableMetadata'

interface CommittedMetadataSave {
  metadata: EditableTrackMetadata
  libraryRevision?: string
}

/** Disk publication is independent from refreshing the catalog and closing the form. */
export function createLibraryMetadataSaveCommit() {
  // An IPC rejection may follow a successful disk publication. Retain uncertainty
  // across closing/reopening until the backend confirms a save for that track.
  const uncertainSaves = new Set<number>()
  let committedSave: CommittedMetadataSave | null = null

  function isUnchanged(metadata: EditableTrackMetadata, formSeed: EditableTrackMetadata): boolean {
    return (
      !uncertainSaves.has(metadata.trackId) &&
      isSameEditableMetadata(metadata, committedSave?.metadata ?? formSeed)
    )
  }

  function beginWrite(trackId: number): void {
    uncertainSaves.add(trackId)
  }

  function recordCommitted(metadata: EditableTrackMetadata, saveResult: unknown): void {
    // Keep the form seed intact; refresh retries compare with confirmed disk values.
    uncertainSaves.delete(metadata.trackId)
    committedSave = {
      metadata: { ...metadata },
      libraryRevision:
        saveResult &&
        typeof saveResult === 'object' &&
        'ok' in saveResult &&
        saveResult.ok === true &&
        'libraryRevision' in saveResult &&
        typeof saveResult.libraryRevision === 'string'
          ? saveResult.libraryRevision
          : undefined,
    }
  }

  function reset(): void {
    committedSave = null
  }

  return {
    get current() {
      return committedSave
    },
    isUnchanged,
    beginWrite,
    recordCommitted,
    reset,
  }
}
