import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportDiagnostics } from './diagnosticExport'

const temporaryDirectories: string[] = []

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'auralis-diagnostic-export-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('exportDiagnostics', () => {
  it('exports only managed logs and a non-sensitive summary with defense-in-depth redaction', async () => {
    const directory = createTemporaryDirectory()
    const logsDirectory = join(directory, 'logs')
    const destination = join(directory, 'diagnostics.jsonl')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(logsDirectory)
    writeFileSync(
      join(logsDirectory, 'auralis.log'),
      `${JSON.stringify({ token: 'secret', filePath: 'C:\\Users\\Me\\Music\\song.flac' })}\n`,
      'utf8',
    )
    writeFileSync(join(logsDirectory, 'library.db'), 'must-not-export', 'utf8')

    const result = await exportDiagnostics({
      appVersion: '1.2.3',
      logsDirectory,
      now: () => new Date('2026-08-24T12:00:00.000Z'),
      platform: 'win32',
      architecture: 'x64',
      showSaveDialog: async () => ({ canceled: false, filePath: destination }),
    })

    expect(result).toEqual({ status: 'saved' })
    const exported = readFileSync(destination, 'utf8')
    expect(exported).toContain('"version":"1.2.3"')
    expect(exported).toContain('<redacted>')
    expect(exported).toContain('<redacted-path>')
    expect(exported).not.toContain('must-not-export')
    expect(exported).not.toContain('secret')
    expect(exported).not.toContain('song.flac')
  })

  it('does not write when the save dialog is cancelled', async () => {
    const directory = createTemporaryDirectory()
    const destination = join(directory, 'should-not-exist.jsonl')

    await expect(
      exportDiagnostics({
        appVersion: '1.0.0',
        logsDirectory: join(directory, 'logs'),
        showSaveDialog: async () => ({ canceled: true, filePath: destination }),
      }),
    ).resolves.toEqual({ status: 'cancelled' })
    expect(() => readFileSync(destination, 'utf8')).toThrow()
  })

  it('returns a stable failure result instead of propagating write errors', async () => {
    const directory = createTemporaryDirectory()

    await expect(
      exportDiagnostics({
        appVersion: '1.0.0',
        logsDirectory: join(directory, 'logs'),
        showSaveDialog: async () => ({ canceled: false, filePath: directory }),
      }),
    ).resolves.toEqual({ status: 'failed' })
  })
})
