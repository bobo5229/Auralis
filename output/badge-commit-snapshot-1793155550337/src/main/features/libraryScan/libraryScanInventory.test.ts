import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectAudioFiles } from './libraryScanInventory'

const { readdir } = vi.hoisted(() => ({ readdir: vi.fn() }))
vi.mock('node:fs/promises', () => ({ readdir }))

function entry(name: string, kind: 'file' | 'directory' | 'link' = 'file') {
  return { name, isDirectory: () => kind === 'directory', isFile: () => kind === 'file' }
}

beforeEach(() => vi.resetAllMocks())

describe('collectAudioFiles', () => {
  it('collects a 600000-file subtree without dropping it or duplicating paths', async () => {
    const root = 'C:\\IsolatedInventory'
    const collection = join(root, 'Collection')
    const albumFiles = Array.from({ length: 2000 }, (_, index) => entry(`${index}.flac`))
    readdir.mockImplementation(async (path: string) => {
      if (path === root) return [entry('Collection', 'directory'), entry('last.mp3')]
      if (path === collection)
        return Array.from({ length: 300 }, (_, index) => entry(`${index}`, 'directory'))
      return albumFiles
    })
    const unreadable = vi.fn()
    const files = await collectAudioFiles(root, unreadable)
    expect(files).toHaveLength(600001)
    for (let album = 0; album < 300; album += 1) {
      expect(files[album * 2000]).toBe(join(collection, `${album}`, '0.flac'))
      expect(files[(album + 1) * 2000 - 1]).toBe(join(collection, `${album}`, '1999.flac'))
    }
    expect(files.at(-1)).toBe(join(root, 'last.mp3'))
    expect(unreadable).not.toHaveBeenCalled()
  })

  it('reports only unreadable children, skips links, and continues readable siblings', async () => {
    const root = 'C:\\IsolatedInventory'
    readdir.mockImplementation(async (path: string) => {
      if (path === join(root, 'denied')) throw new Error('EACCES')
      if (path === root)
        return [
          entry('denied', 'directory'),
          entry('good', 'directory'),
          entry('alias.flac', 'link'),
        ]
      return [entry('song.flac'), entry('readme.txt')]
    })
    const unreadable = vi.fn()
    expect(await collectAudioFiles(root, unreadable)).toEqual([join(root, 'good', 'song.flac')])
    expect(unreadable.mock.calls).toEqual([[join(root, 'denied')]])
  })

  it('propagates a root read failure and errors outside directory reads', async () => {
    const unreadable = vi.fn()
    readdir.mockRejectedValueOnce(new Error('root denied'))
    await expect(collectAudioFiles('root', unreadable)).rejects.toThrow('root denied')
    readdir.mockResolvedValueOnce([entry('child', 'directory')])
    readdir.mockResolvedValueOnce([
      {
        name: 'broken',
        isDirectory: () => {
          throw new Error('unexpected traversal error')
        },
      },
    ])
    await expect(collectAudioFiles('root', unreadable)).rejects.toThrow(
      'unexpected traversal error',
    )
    expect(unreadable).not.toHaveBeenCalled()
  })
})
