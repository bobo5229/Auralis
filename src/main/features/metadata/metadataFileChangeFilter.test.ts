import { describe, expect, it } from 'vitest'
import { resolveChangedFilePaths, type FileScanFingerprint } from './metadataFileChangeFilter'

function toFingerprints(
  entries: Array<[string, FileScanFingerprint]>,
): Map<string, FileScanFingerprint> {
  return new Map(entries)
}

describe('resolveChangedFilePaths', () => {
  it('drops files whose size and mtime both match the scan fingerprint', () => {
    const stats = [
      { filePath: 'a.mp3', size: 100, mtimeMs: 1690000000000.5 },
      { filePath: 'b.flac', size: 200, mtimeMs: 1690000000000.5 },
    ]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000.5 }],
      ['b.flac', { fileSize: 200, fileMtimeMs: 1690000000000.5 }],
    ])

    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual([])
  })

  it('keeps files whose size changed', () => {
    const stats = [{ filePath: 'a.mp3', size: 101, mtimeMs: 1690000000000.5 }]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000.5 }],
    ])

    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual(['a.mp3'])
  })

  it('keeps files whose mtime changed even at identical size', () => {
    const stats = [{ filePath: 'a.mp3', size: 100, mtimeMs: 1690000002000 }]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000 }],
    ])

    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual(['a.mp3'])
  })

  it('keeps files with no persisted fingerprint (conservative)', () => {
    const stats = [{ filePath: 'new.mp3', size: 100, mtimeMs: 1690000000000 }]

    expect(resolveChangedFilePaths({ stats, fingerprints: new Map() })).toEqual(['new.mp3'])
  })

  it('keeps files whose stat mtime is not usable (conservative)', () => {
    const stats = [{ filePath: 'a.mp3', size: 100, mtimeMs: Number.NaN }]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000 }],
    ])

    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual(['a.mp3'])
  })
})
