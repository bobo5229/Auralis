import { normalizeDiagnosticError, sanitizeDiagnosticText } from './diagnosticError'

const MAX_LOG_STRING_LENGTH = 8_192
const MAX_COLLECTION_ITEMS = 128
const MAX_OBJECT_DEPTH = 12
const REDACTED_VALUE = '<redacted>'

const sensitiveKeyPattern =
  /(?:^|[_-])(authorization|cookie|credential|password|passwd|secret|session|token|api[_-]?key)(?:$|[_-])/i

function isSensitiveKey(key: string): boolean {
  const compactKey = key.replace(/[_-]/g, '').toLowerCase()
  return (
    sensitiveKeyPattern.test(key) ||
    /^(authorization|cookie|credentials?|password|passwd|secret|sessionid)$/.test(compactKey) ||
    compactKey.endsWith('token') ||
    compactKey.endsWith('apikey')
  )
}

function sanitizeInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return sanitizeDiagnosticText(value, MAX_LOG_STRING_LENGTH)
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value
  }
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'symbol' || typeof value === 'function') return undefined
  if (value instanceof Error) return normalizeDiagnosticError(value)
  if (depth >= MAX_OBJECT_DEPTH) return '<truncated-depth>'
  if (seen.has(value)) return '<circular>'

  seen.add(value)
  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_COLLECTION_ITEMS)
        .map((item) => sanitizeInternal(item, depth + 1, seen))
      if (value.length > MAX_COLLECTION_ITEMS) items.push('<truncated-items>')
      return items
    }

    const output: Record<string, unknown> = {}
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const entries = Object.entries(descriptors).slice(0, MAX_COLLECTION_ITEMS)
    for (const [key, descriptor] of entries) {
      if (!('value' in descriptor)) continue
      output[key] = isSensitiveKey(key)
        ? REDACTED_VALUE
        : sanitizeInternal(descriptor.value, depth + 1, seen)
    }
    if (Object.keys(descriptors).length > MAX_COLLECTION_ITEMS) {
      output.truncatedFields = true
    }
    return output
  } catch {
    return '<unavailable>'
  } finally {
    seen.delete(value)
  }
}

/** Sanitizes arbitrary structured log values without invoking getters or serializers. */
export function sanitizeLogValue(value: unknown): unknown {
  return sanitizeInternal(value, 0, new WeakSet())
}

/** Defense-in-depth sanitization for already serialized JSONL lines. */
export function sanitizeSerializedLogLine(value: string, maximumLength = 65_536): string {
  if (value.length <= maximumLength * 2) {
    try {
      return sanitizeDiagnosticText(
        JSON.stringify(sanitizeLogValue(JSON.parse(value))),
        maximumLength,
      )
    } catch {
      // Non-JSON diagnostic text is still path/URL sanitized and bounded below.
    }
  }
  return sanitizeDiagnosticText(value, maximumLength)
}
