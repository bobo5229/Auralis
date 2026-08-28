export type RendererDiagnosticLevel = 'info' | 'warn' | 'error'

export interface RendererDiagnosticEvent {
  scope: string
  message: string
  context?: Readonly<object>
  cause?: unknown
}

export interface RendererDiagnosticCause {
  name: string
  message: string
  code?: string | number
}

export interface NormalizedRendererDiagnosticEvent {
  level: RendererDiagnosticLevel
  scope: string
  message: string
  context?: Record<string, unknown>
  cause?: RendererDiagnosticCause
}

interface RendererDiagnosticSink {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

interface RendererDiagnosticsOptions {
  minimumLevel?: RendererDiagnosticLevel
  sink?: RendererDiagnosticSink
}

const DIAGNOSTIC_PREFIX = '[Auralis diagnostic]'
const MAX_STRING_LENGTH = 320
const MAX_SCOPE_LENGTH = 80
const MAX_DEPTH = 3
const MAX_OBJECT_ENTRIES = 16
const MAX_ARRAY_ITEMS = 12

const levelPriority: Record<RendererDiagnosticLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
}

const sensitiveContextKey = /(?:path|file|directory|folder|url|uri|src|source)/i
const windowsPath = /(?:[a-z]:\\|\\\\)[^"'<>|\r\n]+/gi
const localFileUrl = /file:\/\/\/[^\s"'<>]+/gi
const otherUrl = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi
const localPosixPath = /\/(?:Users|home|mnt|private|tmp)\/[^\s"'<>]+/g

function truncate(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH)}…`
}

function sanitizeString(value: string): string {
  return truncate(
    value
      .replace(localFileUrl, '[local-file]')
      .replace(otherUrl, '[url]')
      .replace(windowsPath, '[local-path]')
      .replace(localPosixPath, '[local-path]'),
  )
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'undefined') return '[undefined]'
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`
  if (typeof value === 'symbol') return value.toString()
  if (value instanceof Error) return normalizeCause(value)
  if (depth >= MAX_DEPTH) return '[truncated]'

  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]'
    seen.add(value)

    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitizeValue(item, depth + 1, seen))
      if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} items]`)
      return items
    }

    const entries = Object.entries(value).slice(0, MAX_OBJECT_ENTRIES)
    const result: Record<string, unknown> = {}
    for (const [key, item] of entries) {
      result[key] = sensitiveContextKey.test(key)
        ? '[redacted]'
        : sanitizeValue(item, depth + 1, seen)
    }
    const omitted = Object.keys(value).length - entries.length
    if (omitted > 0) result.__omittedEntries = omitted
    return result
  }

  return sanitizeString(String(value))
}

function normalizeContext(context: Readonly<object>): Record<string, unknown> {
  return sanitizeValue(context, 0, new WeakSet<object>()) as Record<string, unknown>
}

function normalizeCause(cause: unknown): RendererDiagnosticCause {
  if (cause instanceof Error) {
    const code = (cause as Error & { code?: unknown }).code
    return {
      name: sanitizeString(cause.name || 'Error'),
      message: sanitizeString(cause.message || 'Unknown error'),
      ...(typeof code === 'string' || typeof code === 'number'
        ? { code: typeof code === 'string' ? sanitizeString(code) : code }
        : {}),
    }
  }

  if (typeof cause === 'string') {
    return { name: 'Error', message: sanitizeString(cause) }
  }

  if (cause && typeof cause === 'object') {
    const candidate = cause as { name?: unknown; message?: unknown; code?: unknown }
    return {
      name: typeof candidate.name === 'string' ? sanitizeString(candidate.name) : 'UnknownError',
      message:
        typeof candidate.message === 'string'
          ? sanitizeString(candidate.message)
          : 'Non-Error cause',
      ...(typeof candidate.code === 'string' || typeof candidate.code === 'number'
        ? {
            code:
              typeof candidate.code === 'string' ? sanitizeString(candidate.code) : candidate.code,
          }
        : {}),
    }
  }

  return { name: 'UnknownError', message: sanitizeString(String(cause)) }
}

export function normalizeRendererDiagnosticEvent(
  level: RendererDiagnosticLevel,
  event: RendererDiagnosticEvent,
): NormalizedRendererDiagnosticEvent {
  try {
    const scope = sanitizeString(event.scope.trim()).slice(0, MAX_SCOPE_LENGTH) || 'renderer'
    const message = sanitizeString(event.message.trim()) || 'Unspecified diagnostic event'

    return {
      level,
      scope,
      message,
      ...(event.context ? { context: normalizeContext(event.context) } : {}),
      ...(event.cause === undefined ? {} : { cause: normalizeCause(event.cause) }),
    }
  } catch {
    return {
      level,
      scope: 'renderer.diagnostics',
      message: 'Diagnostic event could not be normalized',
      cause: {
        name: 'DiagnosticNormalizationError',
        message: 'Diagnostic details unavailable',
      },
    }
  }
}

export function createRendererDiagnostics(options: RendererDiagnosticsOptions = {}) {
  const minimumLevel = options.minimumLevel ?? 'info'
  const sink = options.sink ?? console

  const emit = (level: RendererDiagnosticLevel, event: RendererDiagnosticEvent): void => {
    if (levelPriority[level] < levelPriority[minimumLevel]) return
    try {
      sink[level](DIAGNOSTIC_PREFIX, normalizeRendererDiagnosticEvent(level, event))
    } catch {
      // Diagnostics are best-effort and must never replace the original application failure.
    }
  }

  return {
    info: (event: RendererDiagnosticEvent) => emit('info', event),
    warn: (event: RendererDiagnosticEvent) => emit('warn', event),
    error: (event: RendererDiagnosticEvent) => emit('error', event),
  }
}

/**
 * Renderer-only, local diagnostics. This sink writes to DevTools and never sends telemetry.
 */
export const rendererDiagnostics = createRendererDiagnostics()
