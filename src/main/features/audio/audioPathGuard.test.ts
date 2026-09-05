import { basename, dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathUnderAnyRoot, isPathUnderRoot } from './audioPathGuard'

describe('audioPathGuard', () => {
  const root = resolve('test-library-root')

  it('accepts descendants but rejects the root directory itself', () => {
    expect(isPathUnderRoot(join(root, 'Album', 'track.flac'), root)).toBe(true)
    expect(isPathUnderRoot(root, root)).toBe(false)
  })

  it('rejects traversal and sibling paths with a shared prefix', () => {
    const sibling = join(dirname(root), `${basename(root)}-backup`, 'track.flac')
    const traversal = join(root, '..', 'outside', 'track.flac')

    expect(isPathUnderRoot(sibling, root)).toBe(false)
    expect(isPathUnderRoot(traversal, root)).toBe(false)
  })

  it('accepts a path under any configured root', () => {
    const secondRoot = resolve('second-library-root')
    const track = join(secondRoot, 'track.mp3')

    expect(isPathUnderAnyRoot(track, [root, secondRoot])).toBe(true)
    expect(isPathUnderAnyRoot(track, [])).toBe(false)
  })

  it.runIf(process.platform === 'win32')('compares Windows paths case-insensitively', () => {
    expect(isPathUnderRoot(join(root.toLowerCase(), 'track.mp3'), root.toUpperCase())).toBe(true)
  })
})
