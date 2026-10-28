import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { flushLogger, initializeLogger, logger, shutdownLogger } from './logger'
import { exportDiagnostics } from './diagnosticExport'

const temporaryDirectories: string[] = []
const originalLogLevel = process.env.AURALIS_LOG_LEVEL
let transportPath: string
const transportDirectory = mkdtempSync(join(tmpdir(), 'auralis-log-worker-'))
beforeAll(async () => {
  transportPath = join(transportDirectory, 'transport.mjs')
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      ssr: true,
      outDir: transportDirectory,
      rollupOptions: {
        input: resolve('src/main/logging/rollingLogTransport.ts'),
        external: (id) => id.startsWith('node:'),
        output: { format: 'es', entryFileNames: 'transport.mjs' },
      },
    },
  })
})
afterAll(() => rmSync(transportDirectory, { recursive: true, force: true }))

function setLogLevel(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.AURALIS_LOG_LEVEL
    return
  }
  process.env.AURALIS_LOG_LEVEL = value
}

afterEach(() => {
  shutdownLogger()
  setLogLevel(originalLogLevel)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('persistent logger', () => {
  it('defaults to debug in development when no level is configured', () => {
    setLogLevel(undefined)
    initializeLogger({
      development: true,
      logsDirectory: tmpdir(),
      persistToFile: false,
    })

    expect(logger.level).toBe('debug')
  })

  it('defaults to info in production when no level is configured', () => {
    setLogLevel(undefined)
    initializeLogger({
      development: false,
      logsDirectory: tmpdir(),
      persistToFile: false,
    })

    expect(logger.level).toBe('info')
  })

  it('uses an explicit warn level to filter info while retaining warn logs', () => {
    setLogLevel('warn')
    const directory = mkdtempSync(join(tmpdir(), 'auralis-logger-level-'))
    temporaryDirectories.push(directory)
    initializeLogger({
      development: true,
      logsDirectory: directory,
      persistToFile: true,
      transportPath,
      maximumFileBytes: 4_096,
      maximumFileCount: 2,
    })

    expect(logger.level).toBe('warn')
    logger.info('info message should be filtered')
    logger.warn('warn message should be retained')
    shutdownLogger()

    const contents = readFileSync(join(directory, 'auralis.log'), 'utf8')
    expect(contents).not.toContain('info message should be filtered')
    expect(contents).toContain('warn message should be retained')
  })

  it('falls back to the environment default for an invalid level', () => {
    setLogLevel('verbose')
    initializeLogger({
      development: true,
      logsDirectory: tmpdir(),
      persistToFile: false,
    })
    expect(logger.level).toBe('debug')

    initializeLogger({
      development: false,
      logsDirectory: tmpdir(),
      persistToFile: false,
    })
    expect(logger.level).toBe('info')
  })

  it('writes structured sanitized JSONL through the production destination', () => {
    const directory = mkdtempSync(join(tmpdir(), 'auralis-logger-'))
    temporaryDirectories.push(directory)
    initializeLogger({
      development: false,
      logsDirectory: directory,
      persistToFile: true,
      transportPath,
      maximumFileBytes: 4_096,
      maximumFileCount: 2,
    })

    logger.info(
      {
        accessToken: 'private-token',
        databasePath: 'C:\\Users\\Listener\\Auralis\\library.db',
        sourceUrl: 'https://example.test/private',
      },
      'Opened C:\\Users\\Listener\\Music\\song.flac',
    )
    shutdownLogger()

    const entry = JSON.parse(readFileSync(join(directory, 'auralis.log'), 'utf8'))
    expect(entry).toMatchObject({
      level: 30,
      accessToken: '<redacted>',
      databasePath: '<redacted-path>',
      sourceUrl: '<redacted-url>',
      msg: 'Opened <redacted-path>',
    })
    expect(JSON.stringify(entry)).not.toContain('private-token')
    expect(JSON.stringify(entry)).not.toContain('song.flac')
  })

  it('flushes pending records before exporting diagnostics without shutting down', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'auralis-logger-export-'))
    temporaryDirectories.push(directory)
    initializeLogger({
      development: false,
      logsDirectory: directory,
      persistToFile: true,
      transportPath,
    })
    logger.info({ index: 1 }, 'before export')
    const destination = join(directory, 'export.jsonl')
    expect(
      await exportDiagnostics({
        appVersion: 'test',
        logsDirectory: directory,
        showSaveDialog: async () => ({ canceled: false, filePath: destination }),
      }),
    ).toEqual({ status: 'saved' })
    expect(readFileSync(destination, 'utf8')).toContain('before export')
    logger.info({ index: 2 }, 'after export')
    flushLogger()
    expect(readFileSync(join(directory, 'auralis.log'), 'utf8')).toContain('after export')
  })

  it('drains startup writes on immediate shutdown and ignores a retired logger after reinitialization', () => {
    const first = mkdtempSync(join(tmpdir(), 'auralis-logger-first-'))
    const second = mkdtempSync(join(tmpdir(), 'auralis-logger-second-'))
    temporaryDirectories.push(first, second)
    initializeLogger({
      development: false,
      logsDirectory: first,
      persistToFile: true,
      transportPath,
    })
    const retired = logger
    for (let index = 0; index < 100; index++) logger.info({ index }, 'queued')
    initializeLogger({
      development: false,
      logsDirectory: second,
      persistToFile: true,
      transportPath,
    })
    retired.info('must not reach either destination')
    logger.info('new destination')
    shutdownLogger()
    expect(readFileSync(join(first, 'auralis.log'), 'utf8').trim().split('\n')).toHaveLength(100)
    expect(readFileSync(join(second, 'auralis.log'), 'utf8')).toContain('new destination')
    expect(readFileSync(join(first, 'auralis.log'), 'utf8')).not.toContain('must not reach')
    expect(readFileSync(join(second, 'auralis.log'), 'utf8')).not.toContain('must not reach')
  })

  it('honors the existing Pino flush callback before reading the log file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'auralis-logger-flush-'))
    temporaryDirectories.push(directory)
    initializeLogger({
      development: false,
      logsDirectory: directory,
      persistToFile: true,
      transportPath,
    })
    logger.info('explicit flush')
    await new Promise<void>((resolve) => logger.flush(() => resolve()))
    expect(readFileSync(join(directory, 'auralis.log'), 'utf8')).toContain('explicit flush')
  })

  it('isolates a missing Worker and recovers on reinitialization', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'auralis-logger-failure-'))
    temporaryDirectories.push(directory)
    initializeLogger({
      development: false,
      logsDirectory: directory,
      persistToFile: true,
      transportPath: join(directory, 'missing.mjs'),
    })
    expect(() => logger.error('discarded')).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(() => shutdownLogger()).not.toThrow()
    initializeLogger({
      development: false,
      logsDirectory: directory,
      persistToFile: true,
      transportPath,
    })
    logger.info('recovered')
    shutdownLogger()
    expect(readFileSync(join(directory, 'auralis.log'), 'utf8')).toContain('recovered')
  })

  it('isolates an unwritable destination and safely shuts down', () => {
    const directory = mkdtempSync(join(tmpdir(), 'auralis-logger-file-'))
    temporaryDirectories.push(directory)
    const occupied = join(directory, 'occupied')
    writeFileSync(occupied, 'keep')
    initializeLogger({
      development: false,
      logsDirectory: occupied,
      persistToFile: true,
      transportPath,
    })
    expect(() => {
      logger.info('discarded')
      shutdownLogger()
      shutdownLogger()
      logger.info('closed')
    }).not.toThrow()
    expect(readdirSync(directory)).toEqual(['occupied'])
    expect(readFileSync(occupied, 'utf8')).toBe('keep')
  })
})
