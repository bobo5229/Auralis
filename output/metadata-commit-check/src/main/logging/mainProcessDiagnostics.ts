import type { App, RenderProcessGoneDetails, WebContents } from 'electron'
import type { Logger } from 'pino'
import { normalizeDiagnosticError, sanitizeDiagnosticText } from './diagnosticError'

type DiagnosticLogger = Pick<Logger, 'error' | 'warn'>

interface ChildProcessGoneDetails {
  type: string
  reason: string
  exitCode: number
  name?: string
  serviceName?: string
}

export interface MainProcessDiagnosticsOptions {
  app: Pick<App, 'on' | 'removeListener' | 'exit'>
  process: Pick<NodeJS.Process, 'on' | 'removeListener' | 'exitCode'>
  logger: DiagnosticLogger
}

export interface MainProcessDiagnostics {
  dispose: () => void
  reportStartupFailure: (error: unknown) => void
}

const registrations = new WeakMap<object, MainProcessDiagnostics>()

function safeLog(
  logger: DiagnosticLogger,
  level: 'error' | 'warn',
  fields: Record<string, unknown>,
  message: string,
): void {
  try {
    logger[level](fields, message)
  } catch {
    // Diagnostics must never replace the original failure with a logger failure.
  }
}

function boundedLabel(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? sanitizeDiagnosticText(value, 160)
    : undefined
}

function rendererDetails(details: RenderProcessGoneDetails): Record<string, unknown> {
  return {
    reason: boundedLabel(details.reason) ?? 'unknown',
    exitCode: Number.isSafeInteger(details.exitCode) ? details.exitCode : undefined,
  }
}

function childDetails(details: ChildProcessGoneDetails): Record<string, unknown> {
  return {
    type: boundedLabel(details.type) ?? 'unknown',
    reason: boundedLabel(details.reason) ?? 'unknown',
    exitCode: Number.isSafeInteger(details.exitCode) ? details.exitCode : undefined,
    name: boundedLabel(details.name),
    serviceName: boundedLabel(details.serviceName),
  }
}

function webContentsIdentity(webContents: WebContents): Record<string, unknown> {
  let type: string | undefined
  try {
    type = boundedLabel(webContents.getType())
  } catch {
    // A destroyed WebContents may reject introspection.
  }

  return {
    webContentsId: Number.isSafeInteger(webContents.id) ? webContents.id : undefined,
    webContentsType: type,
  }
}

export function installMainProcessDiagnostics(
  options: MainProcessDiagnosticsOptions,
): MainProcessDiagnostics {
  const existingRegistration = registrations.get(options.process)
  if (existingRegistration) return existingRegistration

  let disposed = false
  let fatalExitStarted = false

  const exitAfterFatalError = (): void => {
    if (fatalExitStarted) return
    fatalExitStarted = true
    options.process.exitCode = 1
    try {
      options.app.exit(1)
    } catch {
      // exitCode remains set even if Electron cannot complete its shutdown path.
    }
  }

  const handleUncaughtException: NodeJS.UncaughtExceptionListener = (error, origin) => {
    safeLog(
      options.logger,
      'error',
      {
        diagnosticEvent: 'uncaught-exception',
        origin,
        error: normalizeDiagnosticError(error),
      },
      'Fatal uncaught exception in Electron main process',
    )
    exitAfterFatalError()
  }

  const handleUnhandledRejection: NodeJS.UnhandledRejectionListener = (reason) => {
    safeLog(
      options.logger,
      'error',
      {
        diagnosticEvent: 'unhandled-rejection',
        error: normalizeDiagnosticError(reason),
      },
      'Fatal unhandled rejection in Electron main process',
    )
    exitAfterFatalError()
  }

  const reportStartupFailure = (error: unknown): void => {
    safeLog(
      options.logger,
      'error',
      {
        diagnosticEvent: 'startup-failure',
        error: normalizeDiagnosticError(error),
      },
      'Auralis failed during main-process startup',
    )
    exitAfterFatalError()
  }

  const handleRenderProcessGone = (
    _event: Electron.Event,
    webContents: WebContents,
    details: RenderProcessGoneDetails,
  ): void => {
    const fields = {
      diagnosticEvent: 'render-process-gone',
      ...webContentsIdentity(webContents),
      ...rendererDetails(details),
    }
    const level = details.reason === 'clean-exit' || details.reason === 'killed' ? 'warn' : 'error'
    safeLog(options.logger, level, fields, 'Electron renderer process exited')
  }

  const handleChildProcessGone = (
    _event: Electron.Event,
    details: ChildProcessGoneDetails,
  ): void => {
    const fields = {
      diagnosticEvent: 'child-process-gone',
      ...childDetails(details),
    }
    const level = details.reason === 'clean-exit' || details.reason === 'killed' ? 'warn' : 'error'
    safeLog(options.logger, level, fields, 'Electron child process exited')
  }

  options.process.on('uncaughtException', handleUncaughtException)
  options.process.on('unhandledRejection', handleUnhandledRejection)
  options.app.on('render-process-gone', handleRenderProcessGone)
  options.app.on('child-process-gone', handleChildProcessGone)

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    options.process.removeListener('uncaughtException', handleUncaughtException)
    options.process.removeListener('unhandledRejection', handleUnhandledRejection)
    options.app.removeListener('render-process-gone', handleRenderProcessGone)
    options.app.removeListener('child-process-gone', handleChildProcessGone)
    registrations.delete(options.process)
  }

  const registration = { dispose, reportStartupFailure }
  registrations.set(options.process, registration)
  return registration
}
