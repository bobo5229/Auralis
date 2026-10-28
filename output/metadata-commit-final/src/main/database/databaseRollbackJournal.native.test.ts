import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from './schema'
import { applyStagedRestoreIfExists, type DatabaseConstructor } from './databaseBackupService'
import { DatabaseRestoreFiles } from './databaseRestoreFiles'

vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>()
  return {
    ...actual,
    copyFileSync: vi.fn(actual.copyFileSync),
    unlinkSync: vi.fn(actual.unlinkSync),
  }
})
const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs')
const require = createRequire(import.meta.url)
const DatabaseCtor = require('better-sqlite3') as DatabaseConstructor
const childScript = `
const Database = require(process.argv[1]);
const db = new Database(process.argv[2]);
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = FULL');
db.pragma('cache_size = 1');
db.exec("BEGIN IMMEDIATE; UPDATE tracks SET artist = 'uncommitted cache spill';");
process.stdout.write('READY\\n');
setInterval(() => {}, 1000);
`
let directory: string
const connections: Database.Database[] = []
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'auralis-restore-journal-'))
  vi.mocked(copyFileSync).mockReset().mockImplementation(actualFs.copyFileSync)
  vi.mocked(unlinkSync).mockReset().mockImplementation(actualFs.unlinkSync)
})
afterEach(() => {
  for (const db of connections.splice(0)) if (db.open) db.close()
  vi.restoreAllMocks()
  if (
    resolve(dirname(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('auralis-restore-journal-')
  )
    throw new Error('Unsafe journal fixture cleanup')
  rmSync(directory, { recursive: true, force: true })
})
function open(path: string) {
  const db = new DatabaseCtor(path)
  connections.push(db)
  return db
}
function fixture() {
  const path = join(directory, 'library.sqlite')
  const db = open(path)
  db.pragma('journal_mode = DELETE')
  migrateDatabase(db)
  const insert = db.prepare('INSERT INTO tracks(id,file_path,title) VALUES(?,?,?)')
  db.transaction(() => {
    for (let id = 1; id <= 500; id++)
      insert.run(id, `isolated-${id}.flac`, `Before ${id} ${'x'.repeat(128)}`)
  })()
  db.close()
  copyFileSync(path, `${path}.restore_staged`)
  const staged = open(`${path}.restore_staged`)
  staged.exec("UPDATE tracks SET title = replace(title, 'Before', 'Target')")
  staged.close()
  return path
}
async function leaveHotJournal(path: string) {
  const child = spawn(
    process.execPath,
    ['-e', childScript, require.resolve('better-sqlite3'), path],
    {
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const closed = new Promise<void>((done) => child.once('close', () => done()))
  let output = '',
    errorOutput = ''
  child.stderr.on('data', (chunk) => {
    errorOutput = (errorOutput + String(chunk)).slice(-4096)
  })
  try {
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Crash fixture timed out: ${errorOutput}`)),
        5000,
      )
      child.stdout.on('data', (chunk) => {
        output += String(chunk)
        if (output.includes('READY\n')) {
          clearTimeout(timer)
          done()
        }
      })
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        if (!output.includes('READY\n')) {
          clearTimeout(timer)
          reject(new Error(`Crash fixture exited ${code}: ${errorOutput}`))
        }
      })
    })
    expect(readFileSync(`${path}-journal`).subarray(0, 8)).not.toEqual(Buffer.alloc(8))
  } finally {
    child.kill()
    await closed
  }
}
function title(path: string): string {
  const db = open(path)
  try {
    return db.prepare('SELECT title FROM tracks WHERE id=1').pluck().get() as string
  } finally {
    db.close()
  }
}
function apply(path: string, migrate?: (db: Database.Database) => void) {
  return applyStagedRestoreIfExists(path, {
    databaseCtor: DatabaseCtor,
    ...(migrate ? { migrate } : {}),
  })
}
function noRecoveryFiles(path: string) {
  for (const suffix of [
    '.restore_state',
    '.restore_staged',
    '.rollback',
    '-wal.rollback',
    '-shm.rollback',
    '-journal.rollback',
  ])
    expect(existsSync(`${path}${suffix}`)).toBe(false)
}
function legacyState(path: string, phase: string) {
  const state = JSON.parse(readFileSync(`${path}.restore_state`, 'utf8'))
  writeFileSync(
    `${path}.restore_state`,
    JSON.stringify({ version: 1, phase, originalExists: state.originalExists.slice(0, 3) }),
  )
}
function snapshot() {
  return readdirSync(directory).map((name) => [name, readFileSync(join(directory, name))])
}

it('keeps a new selected backup independent of the original hot journal', async () => {
  const path = fixture()
  await leaveHotJournal(path)
  expect(apply(path)).toBe(true)
  expect(title(path)).toMatch(/^Target /)
  noRecoveryFiles(path)
})
it('recovers the original after a crash during staged database migration', async () => {
  const path = fixture()
  const files = new DatabaseRestoreFiles(path)
  files.captureOriginal()
  expect(JSON.parse(readFileSync(`${path}.restore_state`, 'utf8'))).toMatchObject({
    version: 2,
    originalExists: [true, false, false, false],
  })
  files.replaceFromStaged()
  await leaveHotJournal(path)
  expect(apply(path)).toBe(false)
  expect(title(path)).toMatch(/^Before /)
  noRecoveryFiles(path)
})
it('retains a complete original hot-journal set when journal restoration fails and retries safely', async () => {
  const path = fixture()
  await leaveHotJournal(path)
  const original = new Map([path, `${path}-journal`].map((file) => [file, readFileSync(file)]))
  vi.mocked(copyFileSync).mockImplementation((source, target, mode) => {
    if (String(source) === `${path}-journal.rollback`) throw new Error('journal restore denied')
    actualFs.copyFileSync(source, target, mode)
  })
  expect(() =>
    apply(path, () => {
      throw new Error('migration failed')
    }),
  ).toThrow('migration failed')
  for (const [file, bytes] of original) expect(readFileSync(`${file}.rollback`)).toEqual(bytes)
  expect(() => apply(path)).toThrow('journal restore denied')
  for (const [file, bytes] of original) expect(readFileSync(`${file}.rollback`)).toEqual(bytes)
  vi.mocked(copyFileSync).mockImplementation(actualFs.copyFileSync)
  expect(apply(path)).toBe(false)
  for (const [file, bytes] of original) expect(readFileSync(file)).toEqual(bytes)
  expect(title(path)).toMatch(/^Before /)
  noRecoveryFiles(path)
})
it('can finish verified journal-backup cleanup later without reverting the selected database', async () => {
  const path = fixture()
  await leaveHotJournal(path)
  vi.mocked(unlinkSync).mockImplementation((file) => {
    if (String(file) === `${path}-journal.rollback`) throw new Error('journal cleanup denied')
    actualFs.unlinkSync(file)
  })
  expect(apply(path)).toBe(true)
  expect(title(path)).toMatch(/^Target /)
  expect(existsSync(`${path}-journal.rollback`)).toBe(true)
  vi.mocked(unlinkSync).mockImplementation(actualFs.unlinkSync)
  expect(apply(path)).toBe(false)
  expect(title(path)).toMatch(/^Target /)
  noRecoveryFiles(path)
})
it('retries a version-one restore without an untracked journal', () => {
  const path = fixture()
  const files = new DatabaseRestoreFiles(path)
  files.captureOriginal()
  files.replaceFromStaged()
  legacyState(path, 'replacing')
  expect(apply(path)).toBe(false)
  expect(title(path)).toMatch(/^Before /)
  noRecoveryFiles(path)
})
it('preserves the original hot journal when a version-one capture never started replacement', async () => {
  const path = fixture()
  await leaveHotJournal(path)
  const files = new DatabaseRestoreFiles(path)
  files.captureOriginal()
  actualFs.unlinkSync(`${path}-journal.rollback`)
  legacyState(path, 'capturing')
  const journal = readFileSync(`${path}-journal`)
  expect(apply(path)).toBe(false)
  expect(readFileSync(`${path}-journal`)).toEqual(journal)
  expect(title(path)).toMatch(/^Before /)
  noRecoveryFiles(path)
})
it.each(['replacing', 'restored'])(
  'preserves ambiguous version-one %s recovery material for manual recovery',
  async (phase) => {
    const path = fixture()
    const files = new DatabaseRestoreFiles(path)
    files.captureOriginal()
    files.replaceFromStaged()
    await leaveHotJournal(path)
    if (phase === 'restored') copyFileSync(`${path}.rollback`, path)
    legacyState(path, phase)
    const before = snapshot()
    expect(() => apply(path)).toThrow('Legacy database restore has an untracked journal')
    expect(snapshot()).toEqual(before)
  },
)
it('keeps the current journal while cleaning a version-one verified restore', async () => {
  const path = fixture()
  const files = new DatabaseRestoreFiles(path)
  files.captureOriginal()
  files.replaceFromStaged()
  await leaveHotJournal(path)
  legacyState(path, 'verified')
  actualFs.unlinkSync(`${path}.restore_staged`)
  const journal = readFileSync(`${path}-journal`)
  expect(apply(path)).toBe(false)
  expect(readFileSync(`${path}-journal`)).toEqual(journal)
  expect(title(path)).toMatch(/^Target /)
  noRecoveryFiles(path)
})
it('refuses an unidentified journal recovery copy without altering any files', () => {
  const path = fixture()
  writeFileSync(`${path}-journal.rollback`, 'unidentified recovery material')
  const before = snapshot()
  expect(() => apply(path)).toThrow('Unidentified database rollback files')
  expect(snapshot()).toEqual(before)
})

it('preserves a journal recovery file that the current state does not claim', () => {
  const path = fixture()
  new DatabaseRestoreFiles(path).captureOriginal()
  writeFileSync(`${path}-journal.rollback`, 'untracked journal recovery material')
  const before = snapshot()
  expect(() => apply(path)).toThrow('Unexpected database rollback file')
  expect(snapshot()).toEqual(before)
})
