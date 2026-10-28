import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { G as isSupportedAudioFile } from "./resolveLyricsForFile-COlnUOK3.js";
async function collectAudioFiles(directoryPath, onUnreadableDirectory, isCurrent = () => true) {
  const files = [];
  async function collectDirectory(currentPath, isRoot) {
    if (!isCurrent()) return;
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      if (isRoot) throw error;
      onUnreadableDirectory(currentPath);
      return;
    }
    for (const entry of entries) {
      if (!isCurrent()) return;
      const entryPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await collectDirectory(entryPath, false);
      } else if (entry.isFile() && isSupportedAudioFile(entryPath)) {
        files.push(entryPath);
      }
    }
  }
  await collectDirectory(directoryPath, true);
  return files;
}
export {
  collectAudioFiles as c
};
