/**
 * Error codes that indicate a file is temporarily inaccessible rather than deleted.
 * These should trigger a retry instead of marking the track as missing.
 */
const TRANSIENT_STAT_ERROR_CODES = new Set([
  'EACCES',
  'EPERM',
  'EBUSY',
  'ETIMEDOUT',
  'ENETDOWN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EHOSTDOWN',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAGAIN',
])

export function isTransientStatError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as NodeJS.ErrnoException).code
  return typeof code === 'string' && TRANSIENT_STAT_ERROR_CODES.has(code)
}
