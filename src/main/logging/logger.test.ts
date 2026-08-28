import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeLogger, logger, shutdownLogger } from './logger'

const temporaryDirectories: string[] = []

afterEach(() => {
  shutdownLogger()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('persistent logger', () => {
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
