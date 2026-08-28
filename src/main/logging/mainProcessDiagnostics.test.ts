import { EventEmitter } from 'node:events'
import type { App, RenderProcessGoneDetails, WebContents } from 'electron'
import type { Logger } from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installMainProcessDiagnostics,
  type MainProcessDiagnosticsOptions,
} from './mainProcessDiagnostics'

interface TestSources {
  appEmitter: EventEmitter
  processEmitter: EventEmitter & { exitCode?: number }
  appExit: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  options: MainProcessDiagnosticsOptions
}

const disposers: Array<() => void> = []

function createTestSources(): TestSources {
  const appEmitter = new EventEmitter()
  const processEmitter = Object.assign(new EventEmitter(), {
    exitCode: undefined as number | undefined,
  })
  const appExit = vi.fn()
  const error = vi.fn()
  const warn = vi.fn()

  const options: MainProcessDiagnosticsOptions = {
    app: Object.assign(appEmitter, { exit: appExit }) as unknown as Pick<
      App,
      'on' | 'removeListener' | 'exit'
    >,
    process: processEmitter as unknown as MainProcessDiagnosticsOptions['process'],
    logger: { error, warn } as unknown as Pick<Logger, 'error' | 'warn'>,
  }

  return { appEmitter, processEmitter, appExit, error, warn, options }
}

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.()
})

describe('installMainProcessDiagnostics', () => {
  it('installs once per process source and releases every listener', () => {
    const sources = createTestSources()
    const first = installMainProcessDiagnostics(sources.options)
    const second = installMainProcessDiagnostics(sources.options)
    disposers.push(first.dispose)

    expect(second).toBe(first)
    expect(sources.processEmitter.listenerCount('uncaughtException')).toBe(1)
    expect(sources.processEmitter.listenerCount('unhandledRejection')).toBe(1)
    expect(sources.appEmitter.listenerCount('render-process-gone')).toBe(1)
    expect(sources.appEmitter.listenerCount('child-process-gone')).toBe(1)

    first.dispose()

    expect(sources.processEmitter.listenerCount('uncaughtException')).toBe(0)
    expect(sources.processEmitter.listenerCount('unhandledRejection')).toBe(0)
    expect(sources.appEmitter.listenerCount('render-process-gone')).toBe(0)
    expect(sources.appEmitter.listenerCount('child-process-gone')).toBe(0)
  })

  it('records bounded fatal diagnostics and exits only once', () => {
    const sources = createTestSources()
    const diagnostics = installMainProcessDiagnostics(sources.options)
    disposers.push(diagnostics.dispose)

    sources.processEmitter.emit(
      'uncaughtException',
      new Error('failure at C:\\Users\\BoBo\\secret.txt'),
      'uncaughtException',
    )
    sources.processEmitter.emit('unhandledRejection', 'second failure', Promise.resolve())

    expect(sources.error).toHaveBeenCalledTimes(2)
    expect(sources.error.mock.calls[0]?.[0]).toMatchObject({
      diagnosticEvent: 'uncaught-exception',
      error: { message: 'failure at <redacted-path>' },
    })
    expect(sources.processEmitter.exitCode).toBe(1)
    expect(sources.appExit).toHaveBeenCalledTimes(1)
    expect(sources.appExit).toHaveBeenCalledWith(1)
  })

  it('does not throw when fatal logging or the Electron exit path fails', () => {
    const sources = createTestSources()
    sources.error.mockImplementation(() => {
      throw new Error('logger unavailable')
    })
    sources.appExit.mockImplementation(() => {
      throw new Error('Electron shutdown unavailable')
    })
    const diagnostics = installMainProcessDiagnostics(sources.options)
    disposers.push(diagnostics.dispose)

    expect(() => diagnostics.reportStartupFailure(new Error('startup failed'))).not.toThrow()
    expect(sources.processEmitter.exitCode).toBe(1)
    expect(sources.appExit).toHaveBeenCalledWith(1)
  })

  it('records only whitelisted renderer and child-process fields', () => {
    const sources = createTestSources()
    const diagnostics = installMainProcessDiagnostics(sources.options)
    disposers.push(diagnostics.dispose)
    const webContents = {
      id: 42,
      getType: () => 'window',
      getURL: () => 'https://secret.invalid/?token=secret',
    } as unknown as WebContents

    sources.appEmitter.emit('render-process-gone', {}, webContents, {
      reason: 'crashed',
      exitCode: 9,
    } satisfies RenderProcessGoneDetails)
    sources.appEmitter.emit(
      'child-process-gone',
      {},
      {
        type: 'GPU',
        reason: 'oom',
        exitCode: 5,
        name: 'GPU Process',
        serviceName: 'gpu',
      },
    )

    expect(sources.error).toHaveBeenNthCalledWith(
      1,
      {
        diagnosticEvent: 'render-process-gone',
        webContentsId: 42,
        webContentsType: 'window',
        reason: 'crashed',
        exitCode: 9,
      },
      'Electron renderer process exited',
    )
    expect(sources.error).toHaveBeenNthCalledWith(
      2,
      {
        diagnosticEvent: 'child-process-gone',
        type: 'GPU',
        reason: 'oom',
        exitCode: 5,
        name: 'GPU Process',
        serviceName: 'gpu',
      },
      'Electron child process exited',
    )
  })
})
