/**
 * Stable 32-bit fingerprint of the library album-key set.
 *
 * Roam layout seed derives from this value so the same library always produces
 * the same brick-wall mapping (and a different set reshuffles the wall).
 *
 * Keys are sorted before hashing so call order does not matter.
 */
export function libraryFingerprint(albumKeys: readonly string[]): number {
  const sorted = albumKeys.length <= 1 ? albumKeys : [...albumKeys].sort()

  // FNV-1a 32-bit
  let hash = 0x811c9dc5

  for (const key of sorted) {
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    // Separator so ["ab","c"] and ["a","bc"] do not collide.
    hash ^= 0xff
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash >>> 0
}
