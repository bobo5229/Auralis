import pino, { type DestinationStream, type Logger } from 'pino'
import { sanitizeLogValue } from './logSanitizer'
import { RollingLogStore, type RollingLogStoreOptions } from './rollingLogStore'

const isDevelopment = process.env.NODE_ENV !== 'production'

function createLogger(destination?: DestinationStream, development = isDevelopment): Logger {
  return pino(
    {
      level: development ? 'debug' : 'info',
      hooks: {
        logMethod(args, method) {
          method.apply(this, args.map(sanitizeLogValue) as Parameters<typeof method>)
        },
      },
    },
    destination,
  )
}

export interface InitializeLoggerOptions extends RollingLogStoreOptions {
  development: boolean
  logsDirectory: string
  persistToFile: boolean
}

let rollingStore: RollingLogStore | undefined

// The live binding lets modules import the logger before Electron has finalized userData.
export let logger: Logger = createLogger(undefined, isDevelopment)

export function initializeLogger(options: InitializeLoggerOptions): void {
  rollingStore?.close()
  rollingStore = undefined

  if (!options.persistToFile) {
    logger = createLogger(undefined, options.development)
    return
  }

  rollingStore = new RollingLogStore(options.logsDirectory, options)
  const destination: DestinationStream = {
    write(message: string) {
      rollingStore?.write(message)
    },
  }
  logger = createLogger(destination, options.development)
}

export function shutdownLogger(): void {
  try {
    logger.flush()
  } catch {
    // The rolling destination writes synchronously; flush is best-effort for other destinations.
  }
  rollingStore?.close()
  rollingStore = undefined
}
