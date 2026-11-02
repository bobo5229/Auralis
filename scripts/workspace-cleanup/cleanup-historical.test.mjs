import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

test('previews, rejects stale plans and protects tracked files and library data', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'auralis-cleanup-test-'))
  try {
    const scriptDir = path.join(root, 'scripts/workspace-cleanup')
    mkdirSync(scriptDir, { recursive: true })
    const script = path.join(scriptDir, 'cleanup-historical.mjs')
    copyFileSync(fileURLToPath(new URL('./cleanup-historical.mjs', import.meta.url)), script)
    execFileSync('git', ['init', '-q', root])
    const make = (relative, content) => {
      const file = path.join(root, relative)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, content)
      return file
    }
    const disposable = make('.cache/full-regression-20261027/head-baseline/src/file.js', 'old')
    const dependency = make(
      'output/lyrics-editor-validation-runtime/node_modules/example/data/fixture.zip',
      'package fixture',
    )
    const backup = make(
      '.cache/full-regression-20261027/head-baseline/scripts/backups/keep.txt',
      'backup',
    )
    const tracked = make('output/metadata-commit-check/keep.txt', 'tracked')
    execFileSync('git', ['-C', root, 'add', '-f', 'output/metadata-commit-check/keep.txt'])
    execFileSync('git', [
      '-C',
      root,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'fixture',
    ])
    execFileSync('git', [
      '-C',
      root,
      'rm',
      '--cached',
      '-q',
      'output/metadata-commit-check/keep.txt',
    ])
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
    const database = make(
      'output/lyrics-editor-validation-runtime/node_modules/example/library.db',
      'data',
    )
    const withDatabase = run()
    assert.match(withDatabase.stdout, /包含数据、备份或音频文件/)
    assert.doesNotMatch(
      withDatabase.stdout,
      /个文件  output\/lyrics-editor-validation-runtime\/node_modules/,
    )
    rmSync(database)
    const first = run()
    assert.equal(first.status, 0)
    assert.match(first.stdout, /包含 Git 跟踪文件/)
    assert.match(first.stdout, /包含数据、备份或音频文件/)
    assert.equal(readFileSync(disposable, 'utf8'), 'old')
    const id = first.stdout.match(/Plan ID: ([a-f0-9]{64})/)[1]
    writeFileSync(disposable, 'changed')
    assert.equal(run('--execute', id).status, 1)
    assert.equal(readFileSync(disposable, 'utf8'), 'changed')
    const next = run()
    const nextId = next.stdout.match(/Plan ID: ([a-f0-9]{64})/)[1]
    assert.equal(run('--execute', nextId).status, 0)
    assert.equal(readFileSync(backup, 'utf8'), 'backup')
    assert.equal(readFileSync(tracked, 'utf8'), 'tracked')
    assert.throws(() => readFileSync(disposable))
    assert.throws(() => readFileSync(dependency))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
