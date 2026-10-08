import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { isSupportedAudioFile } from './audioFileFilter'

export async function collectAudioFiles(
  directoryPath: string,
  onUnreadableDirectory: (directoryPath: string) => void,
): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      try {
        files.push(...(await collectAudioFiles(entryPath, onUnreadableDirectory)))
      } catch {
        onUnreadableDirectory(entryPath)
      }
    } else if (entry.isFile() && isSupportedAudioFile(entryPath)) {
      files.push(entryPath)
    }
  }

  return files
}
