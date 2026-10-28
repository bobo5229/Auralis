import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import createRollingLogTransport from './rollingLogTransport'

const directories: string[] = []
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })),
)

describe('rolling transport framing', () => {
  it('handles split JSONL records, waits for writes before drain, and flushes a final fragment', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'auralis-transport-'))
    directories.push(directory)
    const stream = createRollingLogTransport({ logsDirectory: directory })
    expect(stream.write('{"index":')).toBe(false)
    await once(stream, 'drain')
    stream.write('1}\n{"index":2}\n{"index":3}')
    await once(stream, 'drain')
    expect(readFileSync(join(directory, 'auralis.log'), 'utf8')).toBe('{"index":1}\n{"index":2}\n')
    stream.end()
    await once(stream, 'close')
    expect(readFileSync(join(directory, 'auralis.log'), 'utf8')).toBe(
      '{"index":1}\n{"index":2}\n{"index":3}\n',
    )
  })
})
