import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export function librarySettingsError(error: unknown, fallback: string): string {
  rendererDiagnostics.error({
    scope: 'settings.library',
    message: 'Library operation failed',
    cause: error,
  })
  return fallback
}
