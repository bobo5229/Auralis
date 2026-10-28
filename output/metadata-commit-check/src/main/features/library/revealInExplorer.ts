import { dirname, resolve } from 'node:path'
import type { Stats } from 'node:fs'
import type { RevealInExplorerResult } from '@shared/ipc/contracts'
import { isPathUnderAnyRoot, isPathUnderRoot } from '@main/features/audio/audioPathGuard'

export interface RevealInExplorerDependencies {
  getFilePathById(trackId: number): string | null
  getRootPaths(): readonly string[]
  stat(filePath: string): Promise<Stats>
  showItemInFolder(filePath: string): void
  openPath(directoryPath: string): Promise<string>
}

type Presence = 'file' | 'directory' | 'missing' | 'unreadable'

/**
 * 文件存在时在资源管理器中选中该文件。
 * 文件缺失时，仅当父目录是某个音乐库根目录本身或其子目录时打开父目录。
 * 库根判断与播放路径一致，使用 resolve 后的比较，不解析符号链接。
 */
export async function revealLibraryInExplorer(
  trackIds: readonly number[],
  dependencies: RevealInExplorerDependencies,
): Promise<RevealInExplorerResult> {
  const roots = dependencies.getRootPaths()
  let sawOutside = false
  let sawLibraryPath = false

  for (const trackId of trackIds) {
    const stored = dependencies.getFilePathById(trackId)
    if (!stored) continue
    if (!isPathUnderAnyRoot(stored, [...roots])) {
      sawOutside = true
      continue
    }

    sawLibraryPath = true
    const filePath = resolve(stored)
    const filePresence = await readPresence(dependencies, filePath)
    if (filePresence === 'file') {
      return revealFile(dependencies, filePath)
    }
    if (filePresence !== 'missing') continue

    const parent = dirname(filePath)
    if (!isLibraryDirectory(parent, roots)) continue
    if ((await readPresence(dependencies, parent)) !== 'directory') continue
    return revealDirectory(dependencies, parent)
  }

  if (sawLibraryPath) return { ok: false, reason: 'unavailable' }
  if (sawOutside) return { ok: false, reason: 'outside-library' }
  return { ok: false, reason: 'not-found' }
}

async function revealFile(
  dependencies: RevealInExplorerDependencies,
  filePath: string,
): Promise<RevealInExplorerResult> {
  try {
    dependencies.showItemInFolder(filePath)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'reveal-failed' }
  }
}

async function revealDirectory(
  dependencies: RevealInExplorerDependencies,
  directoryPath: string,
): Promise<RevealInExplorerResult> {
  try {
    const error = await dependencies.openPath(directoryPath)
    return error ? { ok: false, reason: 'reveal-failed' } : { ok: true }
  } catch {
    return { ok: false, reason: 'reveal-failed' }
  }
}

function isLibraryDirectory(candidate: string, rootPaths: readonly string[]): boolean {
  return rootPaths.some((rootPath) => {
    if (isPathUnderRoot(candidate, rootPath)) return true
    return sameResolvedPath(candidate, rootPath)
  })
}

function sameResolvedPath(left: string, right: string): boolean {
  const resolvedLeft = resolve(left)
  const resolvedRight = resolve(right)
  if (process.platform === 'win32') {
    return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
  }
  return resolvedLeft === resolvedRight
}

async function readPresence(
  dependencies: RevealInExplorerDependencies,
  filePath: string,
): Promise<Presence> {
  try {
    const stats = await dependencies.stat(filePath)
    if (stats.isFile()) return 'file'
    if (stats.isDirectory()) return 'directory'
    return 'unreadable'
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') return 'missing'
    return 'unreadable'
  }
}
