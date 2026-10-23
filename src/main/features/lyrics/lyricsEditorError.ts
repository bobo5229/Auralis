import type { LyricsEditorErrorCode, LyricsEditorResult } from '@shared/types/lyricsEditor'
import { DuetLyricsError } from './duetTypes'
import { LyricsConversionError } from './conversionTypes'

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
  if (error instanceof DuetLyricsError) {
    const code =
      error.code === 'unknown-performer' ||
      error.code === 'unconfigured-role' ||
      error.code === 'unsupported-inheritance'
        ? 'unsupported-document'
        : error.code
    return { ok: false, code }
  }
  if (error instanceof LyricsConversionError) {
    return {
      ok: false,
      code: error.code === 'unsupported-timing' ? 'unsupported-timing' : 'no-timed-lyrics',
    }
  }
  if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException | null)?.code ?? '')) {
    return { ok: false, code: 'file-changed' }
  }
  return { ok: false, code: 'save-failed' }
}
