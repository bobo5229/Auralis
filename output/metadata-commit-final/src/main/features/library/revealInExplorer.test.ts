import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Stats } from 'node:fs'
import { revealLibraryInExplorer, type RevealInExplorerDependencies } from './revealInExplorer'

const root = resolve('reveal-library-root')
const secondRoot = resolve('reveal-library-second-root')

function missing(filePath: string): NodeJS.ErrnoException {
  const error = new Error(`missing ${filePath}`) as NodeJS.ErrnoException
  error.code = 'ENOENT'
  return error
}

function createDependencies(
  files: Map<number, string | null>,
  present: Map<string, 'file' | 'directory'>,
  roots: readonly string[] = [root],
): RevealInExplorerDependencies & {
  showItemInFolder: ReturnType<typeof vi.fn>
  openPath: ReturnType<typeof vi.fn>
} {
  const showItemInFolder = vi.fn()
  const openPath = vi.fn(async () => '')
  return {
    getFilePathById: (trackId) => files.get(trackId) ?? null,
    getRootPaths: () => roots,
    stat: async (filePath) => {
      const kind = present.get(resolve(filePath))
      if (!kind) throw missing(filePath)
      return {
        isFile: () => kind === 'file',
        isDirectory: () => kind === 'directory',
      } as Stats
    },
    showItemInFolder,
    openPath,
  }
}

describe('revealLibraryInExplorer', () => {
  it('selects an existing library file and does not open a directory', async () => {
    const filePath = join(root, 'Album', '01.flac')
    const dependencies = createDependencies(
      new Map([[1, filePath]]),
      new Map([[resolve(filePath), 'file']]),
    )

    await expect(revealLibraryInExplorer([1], dependencies)).resolves.toEqual({ ok: true })
    expect(dependencies.showItemInFolder).toHaveBeenCalledExactlyOnceWith(resolve(filePath))
    expect(dependencies.openPath).not.toHaveBeenCalled()
  })

  it('opens the parent directory when the file is missing inside a library folder', async () => {
    const filePath = join(root, 'Album', '01.flac')
    const dependencies = createDependencies(
      new Map([[1, filePath]]),
      new Map([[resolve(root, 'Album'), 'directory']]),
    )

    await expect(revealLibraryInExplorer([1], dependencies)).resolves.toEqual({ ok: true })
    expect(dependencies.openPath).toHaveBeenCalledExactlyOnceWith(resolve(root, 'Album'))
    expect(dependencies.showItemInFolder).not.toHaveBeenCalled()
  })

  it('opens the library root when a missing file lived directly inside it', async () => {
    const filePath = join(root, '01.flac')
    const dependencies = createDependencies(
      new Map([[1, filePath]]),
      new Map([[resolve(root), 'directory']]),
    )

    await expect(revealLibraryInExplorer([1], dependencies)).resolves.toEqual({ ok: true })
    expect(dependencies.openPath).toHaveBeenCalledExactlyOnceWith(resolve(root))
    expect(dependencies.showItemInFolder).not.toHaveBeenCalled()
  })

  it('rejects a path outside every library root without calling the shell', async () => {
    const outside = resolve('reveal-outside', 'secret.flac')
    const dependencies = createDependencies(
      new Map([[1, outside]]),
      new Map([[resolve(outside), 'file']]),
    )

    await expect(revealLibraryInExplorer([1], dependencies)).resolves.toEqual({
      ok: false,
      reason: 'outside-library',
    })
    expect(dependencies.showItemInFolder).not.toHaveBeenCalled()
    expect(dependencies.openPath).not.toHaveBeenCalled()
  })

  it('rejects a traversal path before looking at its parent', async () => {
    const traversal = join(root, '..', 'outside', 'secret.flac')
    const dependencies = createDependencies(
      new Map([[1, traversal]]),
      new Map([[resolve(traversal), 'file']]),
    )

    await expect(revealLibraryInExplorer([1], dependencies)).resolves.toEqual({
      ok: false,
      reason: 'outside-library',
    })
    expect(dependencies.showItemInFolder).not.toHaveBeenCalled()
    expect(dependencies.openPath).not.toHaveBeenCalled()
  })

  it('reports a missing track without a stored path', async () => {
    const dependencies = createDependencies(new Map([[1, null]]), new Map())

    await expect(revealLibraryInExplorer([1], dependencies)).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    })
    expect(dependencies.showItemInFolder).not.toHaveBeenCalled()
    expect(dependencies.openPath).not.toHaveBeenCalled()
  })

  it('uses the first locatable album track and skips an earlier outside path', async () => {
    const outside = resolve('reveal-outside', 'secret.flac')
    const missingFile = join(root, 'First', '01.flac')
    const laterFile = join(root, 'Second', '02.flac')
    const dependencies = createDependencies(
      new Map<number, string | null>([
        [1, outside],
        [2, missingFile],
        [3, laterFile],
      ]),
      new Map([
        [resolve(root, 'First'), 'directory'],
        [resolve(laterFile), 'file'],
      ]),
    )

    await expect(revealLibraryInExplorer([1, 2, 3], dependencies)).resolves.toEqual({ ok: true })
    expect(dependencies.openPath).toHaveBeenCalledExactlyOnceWith(resolve(root, 'First'))
    expect(dependencies.showItemInFolder).not.toHaveBeenCalled()
  })

  it('continues to the next album track when the earlier file and folder are gone', async () => {
    const missingFile = join(root, 'Gone', '01.flac')
    const laterFile = join(root, 'Second', '02.flac')
    const dependencies = createDependencies(
      new Map<number, string | null>([
        [1, missingFile],
        [2, laterFile],
      ]),
      new Map([[resolve(laterFile), 'file']]),
    )

    await expect(revealLibraryInExplorer([1, 2], dependencies)).resolves.toEqual({ ok: true })
    expect(dependencies.showItemInFolder).toHaveBeenCalledExactlyOnceWith(resolve(laterFile))
    expect(dependencies.openPath).not.toHaveBeenCalled()
  })

  it('does not open a stored directory path', async () => {
    const directory = join(root, 'Album')
    const dependencies = createDependencies(
      new Map([[1, directory]]),
      new Map([[resolve(directory), 'directory']]),
    )

    await expect(revealLibraryInExplorer([1], dependencies)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
    expect(dependencies.showItemInFolder).not.toHaveBeenCalled()
    expect(dependencies.openPath).not.toHaveBeenCalled()
  })

  it('accepts a file under another configured root', async () => {
    const filePath = join(secondRoot, '01.flac')
    const dependencies = createDependencies(
      new Map([[4, filePath]]),
      new Map([[resolve(filePath), 'file']]),
      [root, secondRoot],
    )

    await expect(revealLibraryInExplorer([4], dependencies)).resolves.toEqual({ ok: true })
    expect(dependencies.showItemInFolder).toHaveBeenCalledExactlyOnceWith(resolve(filePath))
  })

  it('returns a path-free failure when the shell cannot open the selected location', async () => {
    const filePath = join(root, '01.flac')
    const shown = createDependencies(
      new Map([[1, filePath]]),
      new Map([[resolve(filePath), 'file']]),
    )
    shown.showItemInFolder.mockImplementation(() => {
      throw new Error(`shell failed for ${filePath}`)
    })

    await expect(revealLibraryInExplorer([1], shown)).resolves.toEqual({
      ok: false,
      reason: 'reveal-failed',
    })

    const directory = join(root, 'Album')
    const opened = createDependencies(
      new Map([[2, join(directory, '01.flac')]]),
      new Map([[resolve(directory), 'directory']]),
    )
    opened.openPath.mockResolvedValue(`cannot open ${directory}`)

    await expect(revealLibraryInExplorer([2], opened)).resolves.toEqual({
      ok: false,
      reason: 'reveal-failed',
    })
  })
})
