import { join } from 'node:path'
import type { Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { isSupportedAudioFile } from '@main/shared/audioFileFilter'

export async function collectAudioFiles(
  directoryPath: string,
  onUnreadableDirectory: (directoryPath: string) => void,
  isCurrent: () => boolean = () => true,
): Promise<string[]> {
  const files: string[] = []
  await visitAudioFiles(
    directoryPath,
    onUnreadableDirectory,
    (path) => {
      files.push(path)
    },
    isCurrent,
  )
  return files
}

/** Discovery waits only for bounded reader capacity, rather than the entire inventory. */
export async function visitAudioFiles(
  directoryPath: string,
  onUnreadableDirectory: (directoryPath: string) => void,
  onFile: (filePath: string) => void | Promise<void>,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  async function collectDirectory(currentPath: string, isRoot: boolean): Promise<void> {
    if (!isCurrent()) return
    let entries: Dirent[]
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch (error) {
      if (isRoot) throw error
      onUnreadableDirectory(currentPath)
      return
    }

    for (const entry of entries) {
      if (!isCurrent()) return
      const entryPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await collectDirectory(entryPath, false)
      } else if (entry.isFile() && isSupportedAudioFile(entryPath)) {
        // Append once, without spreading a whole subtree into function arguments.
        await onFile(entryPath)
      }
    }
  }

  await collectDirectory(directoryPath, true)
}
