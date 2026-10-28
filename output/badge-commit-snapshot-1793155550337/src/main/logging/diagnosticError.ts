const MAX_NAME_LENGTH = 120
const MAX_CODE_LENGTH = 120
const MAX_MESSAGE_LENGTH = 1_024
const MAX_STACK_LENGTH = 6_000

const WINDOWS_PATH_PATTERN = /(?:file:\/{3})?[a-z]:[\\/][^)\]}>,;"'\r\n]+/gi
const UNC_PATH_PATTERN = /\\\\[^\\/\r\n]+[\\/][^)\]}>,;"'\r\n]+/g
const COMMON_POSIX_PATH_PATTERN =
  /(?:file:\/{2})?\/(?:Users|home|private|tmp|var|opt|workspace)\/[^)\]}>,;"'\r\n]+/g
const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s)\]}>,;"']+/gi

export interface NormalizedDiagnosticError {
  name: string
  message: string
  code?: string
  stack?: string
}

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value
  return `${value.slice(0, maximumLength - 1)}…`
}

export function sanitizeDiagnosticText(value: string, maximumLength: number): string {
  const sanitized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(URL_PATTERN, '<redacted-url>')
    .replace(WINDOWS_PATH_PATTERN, '<redacted-path>')
    .replace(UNC_PATH_PATTERN, '<redacted-path>')
    .replace(COMMON_POSIX_PATH_PATTERN, '<redacted-path>')

  return truncate(sanitized, maximumLength)
}

function readStringProperty(value: object, key: string, maximumLength: number): string | undefined {
  try {
    const property = Reflect.get(value, key)
    if (typeof property === 'string' && property.length > 0) {
      return sanitizeDiagnosticText(property, maximumLength)
    }
    if (typeof property === 'number' || typeof property === 'bigint') {
      return truncate(String(property), maximumLength)
    }
  } catch {
    // Proxies and hostile getters must not make diagnostic handling fail.
  }
  return undefined
}

export function normalizeDiagnosticError(value: unknown): NormalizedDiagnosticError {
  if (typeof value === 'string') {
    return {
      name: 'Error',
      message: sanitizeDiagnosticText(value, MAX_MESSAGE_LENGTH),
    }
  }

  if (value === null || value === undefined) {
    return {
      name: 'Error',
      message: String(value),
    }
  }

  if (typeof value !== 'object' && typeof value !== 'function') {
    return {
      name: 'Error',
      message: truncate(String(value), MAX_MESSAGE_LENGTH),
    }
  }

  const name = readStringProperty(value, 'name', MAX_NAME_LENGTH) ?? 'Error'
  const message =
    readStringProperty(value, 'message', MAX_MESSAGE_LENGTH) ?? 'Unknown object rejection'
  const code = readStringProperty(value, 'code', MAX_CODE_LENGTH)
  const stack = readStringProperty(value, 'stack', MAX_STACK_LENGTH)

  return {
    name,
    message,
    ...(code ? { code } : {}),
    ...(stack ? { stack } : {}),
  }
}
