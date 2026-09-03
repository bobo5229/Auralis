import { describe, expect, it } from 'vitest'
import {
  resolveChangedFilePaths,
  resolveWatchRefreshPaths,
  type FileScanFingerprint,
} from './metadataFileChangeFilter'

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
    const fingerprints = toFingerprints([['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000 }]])

    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual(['a.mp3'])
  })

  it('keeps files with no persisted fingerprint (conservative)', () => {
    const stats = [{ filePath: 'new.mp3', size: 100, mtimeMs: 1690000000000 }]

    expect(resolveChangedFilePaths({ stats, fingerprints: new Map() })).toEqual(['new.mp3'])
  })

  it('keeps files whose stat mtime is not usable (conservative)', () => {
    const stats = [{ filePath: 'a.mp3', size: 100, mtimeMs: Number.NaN }]
    const fingerprints = toFingerprints([['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000 }]])

    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual(['a.mp3'])
  })
})

describe('resolveWatchRefreshPaths', () => {
  it('selects sidecar-only paths whose audio fingerprint is unchanged', () => {
    const stats = [{ filePath: 'a.mp3', size: 100, mtimeMs: 1690000000000.5 }]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000.5 }],
    ])

    expect(
      resolveWatchRefreshPaths({
        stats,
        fingerprints,
        lyricsIntentPaths: ['a.mp3'],
      }),
    ).toEqual(['a.mp3'])
  })

  it('skips unchanged audio when there is no lyrics intent (playback open)', () => {
    const stats = [{ filePath: 'a.mp3', size: 100, mtimeMs: 1690000000000.5 }]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000.5 }],
    ])

    expect(resolveWatchRefreshPaths({ stats, fingerprints })).toEqual([])
    expect(resolveWatchRefreshPaths({ stats, fingerprints, lyricsIntentPaths: [] })).toEqual([])
  })

  it('selects audio fingerprint changes regardless of lyrics intent', () => {
    const stats = [{ filePath: 'a.mp3', size: 101, mtimeMs: 1690000000000.5 }]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000.5 }],
    ])

    expect(resolveWatchRefreshPaths({ stats, fingerprints })).toEqual(['a.mp3'])
    expect(
      resolveWatchRefreshPaths({
        stats,
        fingerprints,
        lyricsIntentPaths: ['a.mp3'],
      }),
    ).toEqual(['a.mp3'])
  })

  it('does not select lyrics intent paths that are absent from stats', () => {
    const stats = [{ filePath: 'a.mp3', size: 100, mtimeMs: 1690000000000.5 }]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000.5 }],
    ])

    expect(
      resolveWatchRefreshPaths({
        stats,
        fingerprints,
        lyricsIntentPaths: ['other.flac', 'a.mp3.lrc'],
      }),
    ).toEqual([])
  })

  it('returns stats order and ignores extra intent paths outside the batch', () => {
    const stats = [
      { filePath: 'sidecar.mp3', size: 100, mtimeMs: 1690000000000.5 },
      { filePath: 'changed.flac', size: 201, mtimeMs: 1690000000000.5 },
      { filePath: 'unchanged.wav', size: 300, mtimeMs: 1690000000000.5 },
    ]
    const fingerprints = toFingerprints([
      ['sidecar.mp3', { fileSize: 100, fileMtimeMs: 1690000000000.5 }],
      ['changed.flac', { fileSize: 200, fileMtimeMs: 1690000000000.5 }],
      ['unchanged.wav', { fileSize: 300, fileMtimeMs: 1690000000000.5 }],
    ])

    expect(
      resolveWatchRefreshPaths({
        stats,
        fingerprints,
        lyricsIntentPaths: new Set(['unchanged.wav.lrc', 'sidecar.mp3', 'missing.mp3']),
      }),
    ).toEqual(['sidecar.mp3', 'changed.flac'])
  })
})
