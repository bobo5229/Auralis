import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeLogger, logger, shutdownLogger } from './logger'

const temporaryDirectories: string[] = []
const originalLogLevel = process.env.AURALIS_LOG_LEVEL

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
})
