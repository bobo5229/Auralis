const keys: Record<string, string> = {
  'buffer-preparation-failed': 'bufferPreparationFailed',
  'file-in-use': 'fileInUse',
  'playback-restore-failed': 'playbackRestoreFailed',
  'playback-changed': 'playbackChanged',
  'tag-preservation-failed': 'tagPreservationFailed',
  'tag-verification-failed': 'tagVerificationFailed',
  'tag-write-failed': 'tagWriteFailed',
  'file-changed': 'fileChanged',
  'disk-full': 'diskFull',
  'permission-denied': 'permissionDenied',
  'file-not-found': 'fileNotFound',
}

export function metadataSaveFailureMessageKey(reason: string): string {
  return `library.metadataEditor.errors.${keys[reason] ?? 'saveFailed'}`
}
