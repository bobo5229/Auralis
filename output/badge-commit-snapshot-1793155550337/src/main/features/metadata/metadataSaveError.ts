import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'

type SaveFailureReason = Extract<UpdateTrackMetadataResult, { ok: false }>['reason']

export class MetadataSaveError extends Error {
  constructor(
    readonly reason: SaveFailureReason,
    message: string,
  ) {
    super(message)
    this.name = 'MetadataSaveError'
  }
}

/** Return safe, localized reason codes; never send raw filesystem/tool errors to the UI. */
export function metadataSaveFailureReason(error: unknown): SaveFailureReason | null {
  if (error && typeof error === 'object' && 'code' in error) {
    switch (error.code) {
      case 'ENOSPC':
      case 'EDQUOT':
        return 'disk-full'
      case 'EACCES':
      case 'EPERM':
        return 'permission-denied'
      case 'EBUSY':
      case 'ETXTBSY':
        return 'file-in-use'
      case 'ENOENT':
        return 'file-not-found'
    }
  }
  if (error instanceof MetadataSaveError) return error.reason
  return null
}
