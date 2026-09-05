import { isAbsolute, relative, resolve } from 'node:path'

/**
 * Returns true when `filePath` resolves under `rootPath`
 * (normalized check via path.relative — blocks `..` traversal).
 */
export function isPathUnderRoot(filePath: string, rootPath: string): boolean {
  const resolvedFile = resolve(filePath)
  const resolvedRoot = resolve(rootPath)

  // Windows paths are case-insensitive; compare on a lowercased form to avoid false denials.
  const fileForCompare = process.platform === 'win32' ? resolvedFile.toLowerCase() : resolvedFile
  const rootForCompare = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot

  const rel = relative(rootForCompare, fileForCompare)

  // Empty relative means the path is exactly the root directory itself — not a media file.
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return false
  }

  return true
}

export function isPathUnderAnyRoot(filePath: string, rootPaths: string[]): boolean {
  return rootPaths.some((rootPath) => isPathUnderRoot(filePath, rootPath))
}
