import { describe, expect, it } from 'vitest'
import {
  resolveChangedFilePaths,
  resolveWatchRefreshPaths,
  type FileScanFingerprint,
} from './metadataFileChangeFilter'

const identity = { ctimeMs: 100, dev: 1, ino: 1 }

function toFingerprints(
  entries: Array<[string, FileScanFingerprint]>,
): Map<string, FileScanFingerprint> {
  return new Map(
    entries.map(([path, file]) => [
      path,
      { ...file, fileFingerprint: { size: file.fileSize, mtimeMs: file.fileMtimeMs, ...identity } },
    ]),
  )
}

describe('resolveChangedFilePaths', () => {
  it.each(['ctimeMs', 'dev', 'ino'] as const)(
    'detects a changed %s even when size and mtime match',
    (field) => {
      const stats = [{ ...identity, filePath: 'a.flac', size: 100, mtimeMs: 100, [field]: 200 }]
      const fingerprints = toFingerprints([['a.flac', { fileSize: 100, fileMtimeMs: 100 }]])
      expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual(['a.flac'])
    },
  )

  it('refreshes a legacy fingerprint once and skips it after a stable baseline is stored', () => {
    const file = { ...identity, size: 100, mtimeMs: 100 }
    const stats = [{ filePath: 'a.flac', ...file }]
    const fingerprints = new Map<string, FileScanFingerprint>([
      ['a.flac', { fileSize: 100, fileMtimeMs: 100 }],
    ])
    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual(['a.flac'])
    fingerprints.set('a.flac', { fileSize: 100, fileMtimeMs: 100, fileFingerprint: file })
    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual([])
  })
  it('drops files whose size and mtime both match the scan fingerprint', () => {
    const stats = [
      { ...identity, filePath: 'a.mp3', size: 100, mtimeMs: 1690000000000.5 },
      { ...identity, filePath: 'b.flac', size: 200, mtimeMs: 1690000000000.5 },
    ]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000.5 }],
      ['b.flac', { fileSize: 200, fileMtimeMs: 1690000000000.5 }],
    ])

    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual([])
  })

  it('keeps files whose size changed', () => {
    const stats = [{ ...identity, filePath: 'a.mp3', size: 101, mtimeMs: 1690000000000.5 }]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000.5 }],
    ])

    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual(['a.mp3'])
  })

  it('keeps files whose mtime changed even at identical size', () => {
    const stats = [{ ...identity, filePath: 'a.mp3', size: 100, mtimeMs: 1690000002000 }]
    const fingerprints = toFingerprints([['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000 }]])

    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual(['a.mp3'])
  })

  it('keeps files with no persisted fingerprint (conservative)', () => {
    const stats = [{ ...identity, filePath: 'new.mp3', size: 100, mtimeMs: 1690000000000 }]

    expect(resolveChangedFilePaths({ stats, fingerprints: new Map() })).toEqual(['new.mp3'])
  })

  it('keeps files whose stat mtime is not usable (conservative)', () => {
    const stats = [{ ...identity, filePath: 'a.mp3', size: 100, mtimeMs: Number.NaN }]
    const fingerprints = toFingerprints([['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000 }]])

    expect(resolveChangedFilePaths({ stats, fingerprints })).toEqual(['a.mp3'])
  })
})

describe('resolveWatchRefreshPaths', () => {
  it('selects sidecar-only paths whose audio fingerprint is unchanged', () => {
    const stats = [{ ...identity, filePath: 'a.mp3', size: 100, mtimeMs: 1690000000000.5 }]
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
    const stats = [{ ...identity, filePath: 'a.mp3', size: 100, mtimeMs: 1690000000000.5 }]
    const fingerprints = toFingerprints([
      ['a.mp3', { fileSize: 100, fileMtimeMs: 1690000000000.5 }],
    ])

    expect(resolveWatchRefreshPaths({ stats, fingerprints })).toEqual([])
    expect(resolveWatchRefreshPaths({ stats, fingerprints, lyricsIntentPaths: [] })).toEqual([])
  })

  it('selects audio fingerprint changes regardless of lyrics intent', () => {
    const stats = [{ ...identity, filePath: 'a.mp3', size: 101, mtimeMs: 1690000000000.5 }]
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
    const stats = [{ ...identity, filePath: 'a.mp3', size: 100, mtimeMs: 1690000000000.5 }]
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
      { ...identity, filePath: 'sidecar.mp3', size: 100, mtimeMs: 1690000000000.5 },
      { ...identity, filePath: 'changed.flac', size: 201, mtimeMs: 1690000000000.5 },
      { ...identity, filePath: 'unchanged.wav', size: 300, mtimeMs: 1690000000000.5 },
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
