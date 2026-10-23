import type { LyricsEditorErrorCode, LyricsEditorResult } from '@shared/types/lyricsEditor'

export class LyricsEditorError extends Error {
  constructor(
    readonly code: LyricsEditorErrorCode,
    readonly recoveryBackupPath?: string,
  ) {
    super(code)
    this.name = 'LyricsEditorError'
  }
}

export function editorFailure(error: unknown): LyricsEditorResult<never> {
  if (error instanceof LyricsEditorError) {
    return {
      ok: false,
      code: error.code,
      ...(error.recoveryBackupPath ? { recoveryBackupPath: error.recoveryBackupPath } : {}),
    }
  }
  if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException | null)?.code ?? '')) {
    return { ok: false, code: 'file-changed' }
  }
  return { ok: false, code: 'save-failed' }
}
