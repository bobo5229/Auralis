import { afterEach, describe, expect, it } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RollingLogStore, isManagedLogFileName } from './rollingLogStore'

const temporaryDirectories: string[] = []

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'auralis-log-store-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('RollingLogStore', () => {
  it('bounds every file and the retained file count while rotating', async () => {
    const directory = createTemporaryDirectory()
    const store = new RollingLogStore(directory, {
      maximumFileBytes: 1_024,
      maximumFileCount: 3,
    })

    for (let index = 0; index < 10; index += 1) {
      await store.write(JSON.stringify({ index, message: 'x'.repeat(620) }))
    }
    await store.close()

    const files = readdirSync(directory).filter(isManagedLogFileName)
    expect(files).toHaveLength(3)
    expect(files.every((file) => statSync(join(directory, file)).size <= 1_024)).toBe(true)
    expect(
      files.reduce((sum, file) => sum + statSync(join(directory, file)).size, 0),
    ).toBeLessThanOrEqual(3_072)
  })

  it('prunes managed retention overflow but leaves unrelated files untouched', async () => {
    const directory = createTemporaryDirectory()
    writeFileSync(join(directory, 'auralis.8.log'), 'old', 'utf8')
    writeFileSync(join(directory, 'notes.txt'), 'keep', 'utf8')

    await new RollingLogStore(directory, { maximumFileBytes: 1_024, maximumFileCount: 2 }).close()

    expect(readdirSync(directory)).toEqual(['notes.txt'])
    expect(readFileSync(join(directory, 'notes.txt'), 'utf8')).toBe('keep')
  })

  it('swallows filesystem failures and ignores writes after close', async () => {
    const directory = createTemporaryDirectory()
    const fileInsteadOfDirectory = join(directory, 'not-a-directory')
    writeFileSync(fileInsteadOfDirectory, 'occupied', 'utf8')
    const store = new RollingLogStore(fileInsteadOfDirectory)

    await expect(store.write('{"msg":"ignored"}')).resolves.toBeUndefined()
    await store.close()
    await expect(store.write('{"msg":"also ignored"}')).resolves.toBeUndefined()
  })

  it('flushes queued writes in order on close and excludes later writes', async () => {
    const directory = createTemporaryDirectory()
    const store = new RollingLogStore(directory)
    void store.write('{"index":1}')
    void store.write('{"index":2}')
    const closing = store.close()
    await store.write('{"index":3}')
    await closing
    expect(readFileSync(join(directory, 'auralis.log'), 'utf8')).toBe('{"index":1}\n{"index":2}\n')
  })

  it('retains the strict byte limit for Unicode and replaces oversized entries', async () => {
    const directory = createTemporaryDirectory()
    const store = new RollingLogStore(directory, { maximumFileBytes: 1_024, maximumFileCount: 2 })
    await store.write(JSON.stringify({ text: '中'.repeat(300) }))
    await store.write(JSON.stringify({ text: '中'.repeat(400) }))
    await store.close()
    const files = readdirSync(directory).filter(isManagedLogFileName)
    expect(files.every((file) => statSync(join(directory, file)).size <= 1_024)).toBe(true)
    expect(files.map((file) => readFileSync(join(directory, file), 'utf8')).join('')).toContain(
      'Oversized log entry omitted',
    )
  })

  it('preserves retained entries across startups and handles a single-file limit', async () => {
    const directory = createTemporaryDirectory()
    for (let startup = 0; startup < 3; startup++) {
      const store = new RollingLogStore(directory, { maximumFileBytes: 1_024, maximumFileCount: 1 })
      await store.write(JSON.stringify({ startup, text: 'x'.repeat(700) }))
      await store.close()
    }
    expect(readdirSync(directory)).toEqual(['auralis.log'])
    expect(JSON.parse(readFileSync(join(directory, 'auralis.log'), 'utf8')).startup).toBe(2)
  })

  it('retains existing history on restart and isolates a rotation failure after writing', async () => {
    const directory = createTemporaryDirectory()
    const options = { maximumFileBytes: 1_024, maximumFileCount: 2 }
    let store = new RollingLogStore(directory, options)
    await store.write(JSON.stringify({ startup: 1, text: 'x'.repeat(650) }))
    await store.close()
    store = new RollingLogStore(directory, options)
    await store.write(JSON.stringify({ startup: 2, text: 'x'.repeat(650) }))
    await store.close()
    expect(JSON.parse(readFileSync(join(directory, 'auralis.1.log'), 'utf8')).startup).toBe(1)
    expect(JSON.parse(readFileSync(join(directory, 'auralis.log'), 'utf8')).startup).toBe(2)
    rmSync(join(directory, 'auralis.1.log'))
    mkdirSync(join(directory, 'auralis.1.log'))
    writeFileSync(join(directory, 'auralis.1.log', 'notes.txt'), 'keep')
    store = new RollingLogStore(directory, options)
    await expect(
      store.write(JSON.stringify({ startup: 3, text: 'x'.repeat(650) })),
    ).resolves.toBeUndefined()
    await store.close()
    expect(JSON.parse(readFileSync(join(directory, 'auralis.log'), 'utf8')).startup).toBe(2)
    expect(readFileSync(join(directory, 'auralis.1.log', 'notes.txt'), 'utf8')).toBe('keep')
  })
})
