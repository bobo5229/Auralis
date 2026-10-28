import pino, { type DestinationStream, type Logger } from 'pino'
import { sanitizeLogValue } from './logSanitizer'
import type { RollingLogStoreOptions } from './rollingLogStore'

const SUPPORTED_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const

type LogLevel = (typeof SUPPORTED_LOG_LEVELS)[number]

const isDevelopment = process.env.NODE_ENV !== 'production'

function isSupportedLogLevel(value: string): value is LogLevel {
  return SUPPORTED_LOG_LEVELS.includes(value as LogLevel)
}

export function resolveLogLevel(
  development: boolean,
  configuredLevel = process.env.AURALIS_LOG_LEVEL,
): LogLevel {
  const defaultLevel: LogLevel = development ? 'debug' : 'info'
  return configuredLevel && isSupportedLogLevel(configuredLevel) ? configuredLevel : defaultLevel
}

function createLogger(destination?: DestinationStream, development = isDevelopment): Logger {
  return pino(
    {
      level: resolveLogLevel(development),
      hooks: {
        logMethod(args, method) {
          method.apply(this, args.map(sanitizeLogValue) as Parameters<typeof method>)
        },
      },
    },
    destination,
  )
}

interface LoggerEnvironmentOptions extends RollingLogStoreOptions {
  development: boolean
  logsDirectory: string
}
// Resolve in the main entry; Rollup may move logger.ts into a shared chunk.
export type InitializeLoggerOptions = LoggerEnvironmentOptions &
  ({ persistToFile: false } | { persistToFile: true; transportPath: string })

interface LogTransport {
  write(message: string): boolean
  flushSync(): void
  end(): void
  on(event: 'error', listener: (error: Error) => void): void
}
interface LogSession {
  transport?: LogTransport
  failed: boolean
  closed: boolean
}
let session: LogSession | undefined

// The live binding lets modules import the logger before Electron has finalized userData.
export let logger: Logger = createLogger(undefined, isDevelopment)

export function initializeLogger(options: InitializeLoggerOptions): void {
  shutdownLogger()

  if (!options.persistToFile) {
    logger = createLogger(undefined, options.development)
    return
  }

  const current: LogSession = { failed: false, closed: false }
  session = current
  try {
    current.transport = pino.transport({
      target: options.transportPath,
      options: {
        logsDirectory: options.logsDirectory,
        maximumFileBytes: options.maximumFileBytes,
        maximumFileCount: options.maximumFileCount,
      },
    }) as LogTransport
    current.transport.on('error', () => {
      current.failed = true
    })
  } catch {
    current.failed = true
  }
  const destination: DestinationStream & { flush(callback: () => void): void } = {
    write(message: string) {
      if (current.closed || current.failed || !current.transport) return
      try {
        current.transport.write(message)
      } catch {
        current.failed = true
      }
    },
    flush(callback) {
      try {
        if (!current.closed && !current.failed) current.transport?.flushSync()
      } catch {
        current.failed = true
      }
      callback()
    },
  }
  logger = createLogger(destination, options.development)
}

/** Flush pending records before diagnostics read the managed files. */
export function flushLogger(): void {
  try {
    if (!session?.failed) session?.transport?.flushSync()
  } catch {
    if (session) session.failed = true
  }
}

export function shutdownLogger(): void {
  const closing = session
  if (!closing) return
  session = undefined
  closing.closed = true
  try {
    if (!closing.failed) closing.transport?.flushSync()
  } catch {
    closing.failed = true
  }
  try {
    closing.transport?.end()
  } catch {
    closing.failed = true
  }
}
