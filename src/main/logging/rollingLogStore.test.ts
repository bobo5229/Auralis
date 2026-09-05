import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
  it('bounds every file and the retained file count while rotating', () => {
    const directory = createTemporaryDirectory()
    const store = new RollingLogStore(directory, {
      maximumFileBytes: 1_024,
      maximumFileCount: 3,
    })

    for (let index = 0; index < 10; index += 1) {
      store.write(JSON.stringify({ index, message: 'x'.repeat(620) }))
    }
    store.close()

    const files = readdirSync(directory).filter(isManagedLogFileName)
    expect(files).toHaveLength(3)
    expect(files.every((file) => statSync(join(directory, file)).size <= 1_024)).toBe(true)
    expect(
      files.reduce((sum, file) => sum + statSync(join(directory, file)).size, 0),
    ).toBeLessThanOrEqual(3_072)
  })

  it('prunes unmanaged retention overflow but leaves unrelated files untouched', () => {
    const directory = createTemporaryDirectory()
    writeFileSync(join(directory, 'auralis.8.log'), 'old', 'utf8')
    writeFileSync(join(directory, 'notes.txt'), 'keep', 'utf8')

    new RollingLogStore(directory, { maximumFileBytes: 1_024, maximumFileCount: 2 }).close()

    expect(readdirSync(directory)).toEqual(['notes.txt'])
    expect(readFileSync(join(directory, 'notes.txt'), 'utf8')).toBe('keep')
  })

  it('swallows filesystem failures and ignores writes after close', () => {
    const directory = createTemporaryDirectory()
    const fileInsteadOfDirectory = join(directory, 'not-a-directory')
    writeFileSync(fileInsteadOfDirectory, 'occupied', 'utf8')
    const store = new RollingLogStore(fileInsteadOfDirectory)

    expect(() => store.write('{"msg":"ignored"}')).not.toThrow()
    store.close()
    expect(() => store.write('{"msg":"also ignored"}')).not.toThrow()
  })
})
