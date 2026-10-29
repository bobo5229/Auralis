import { describe, expect, it, vi } from 'vitest'
import { PlaybackFileCoordinator } from './playbackFileCoordinator'

function setupCoordinator() {
  const trackFiles = new Map<number, string>([
    [1, 'D:/music/song1.flac'],
    [2, 'D:/music/song1.flac'], // Multiple trackIds pointing to the same file
    [3, 'D:/music/song2.flac'],
  ])

  const trackEditStateChanged = vi.fn()
  const coordinator = new PlaybackFileCoordinator({
    getTrackFilePath: (trackId) => trackFiles.get(trackId) ?? null,
    getTrackIdsByFilePath: (filePath) => {
      const normalized = filePath.replace(/\\/g, '/').toLowerCase()
      const matching: number[] = []
      for (const [id, path] of trackFiles.entries()) {
        if (path.replace(/\\/g, '/').toLowerCase() === normalized) {
          matching.push(id)
        }
      }
      return matching
    },
    trackEditStateChanged,
  })

  return { coordinator, trackEditStateChanged, trackFiles }
}

describe('PlaybackFileCoordinator', () => {
  it('checks the current catalog binding of an active read lease without releasing it', async () => {
    const { coordinator, trackFiles } = setupCoordinator()
    const original = trackFiles.get(1)!
    const lease = await coordinator.acquireReadLease(original, 'mpv-current')
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, original)).toBe(true)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 2, original)).toBe(true)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 3, original)).toBe(false)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, trackFiles.get(3)!)).toBe(false)
    expect(coordinator.isReadLeaseForTrack('expired', 1, original)).toBe(false)
    trackFiles.set(1, 'D:/music/moved.flac')
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, original)).toBe(false)
    trackFiles.delete(1)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, original)).toBe(false)
    expect(coordinator.tryAcquireWriteLease(original).ok).toBe(false)
    coordinator.releaseReadLease(lease.leaseId)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 2, original)).toBe(false)
    const write = coordinator.tryAcquireWriteLease(original)
    expect(write.ok).toBe(true)
    if (write.ok) coordinator.releaseWriteLease(write.leaseId)
  })

  it.runIf(process.platform === 'win32')(
    'accepts equivalent Windows catalog path spellings',
    async () => {
      const { coordinator, trackFiles } = setupCoordinator()
      const lease = await coordinator.acquireReadLease('d:\\MUSIC\\Song1.FLAC', 'mpv-current')
      expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, 'D:/music/song1.flac')).toBe(true)
      trackFiles.set(1, 'D:/music/Album/../song1.flac')
      expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, 'D:/music/song1.flac')).toBe(true)
      coordinator.releaseReadLease(lease.leaseId)
    },
  )

  it('retains current/next file versions and gates new opens through replacement', async () => {
    const { coordinator, trackFiles } = setupCoordinator()
    const path = 'D:/music/source.m4a'
    trackFiles.set(1, path)
    coordinator.setFileReplacementCapability((file) => file.endsWith('.m4a'))
    const current = await coordinator.acquireReadLease(path, 'mpv-current')
    const next = await coordinator.acquireReadLease(path, 'mpv-next')
    const spectrum = await coordinator.acquireReadLease(path, 'spectrum-analysis')
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
    const intent = coordinator.reserveFileReplacement(path)!
    expect(intent).toBeTruthy()
    expect(coordinator.reserveFileReplacement(path)).toBeNull()
    expect(() => coordinator.promoteFileReplacement(intent)).toThrow('Non-mpv')
    const opened = vi.fn()
    const waiting = coordinator.acquireReadLease(path, 'audio-probe').then(opened)
    await Promise.resolve()
    expect(opened).not.toHaveBeenCalled()
    coordinator.releaseReadLease(spectrum.leaseId)
    coordinator.markReadLeaseCurrent(next.leaseId)
    coordinator.promoteFileReplacement(intent)
    expect(coordinator.getTrackState(1).status).toBe('write-in-progress')
    coordinator.releaseWriteLease(intent)
    await waiting
    coordinator.releaseReadLease(opened.mock.calls[0][0].leaseId)
    expect(coordinator.tryAcquireWriteLease(path)).toEqual({ ok: false, reason: 'playback-in-use' })
    coordinator.releaseReadLease(current.leaseId)
    coordinator.releaseReadLease(next.leaseId)
    expect(coordinator.getTrackState(1).status).toBe('editable')
  })

  it.each(['html-audio', 'audio-probe', 'unknown'])(
    'does not bypass %s for file replacement',
    async (source) => {
      const { coordinator } = setupCoordinator()
      coordinator.setFileReplacementCapability(() => true)
      await coordinator.acquireReadLease('D:/music/song1.flac', 'mpv-next')
      const lease = await coordinator.acquireReadLease('D:/music/song1.flac', source)
      expect(coordinator.reserveFileReplacement('D:/music/song1.flac')).toBeNull()
      coordinator.releaseReadLease(lease.leaseId)
      expect(coordinator.reserveFileReplacement('D:/music/song1.flac')).toBeTruthy()
    },
  )
  it('distinguishes preloaded files while preserving exclusive write protection', async () => {
    const { coordinator, trackEditStateChanged } = setupCoordinator()
    const next = await coordinator.acquireReadLease('D:/music/song1.flac', 'mpv-next')
    expect(coordinator.getTrackState(1).status).toBe('preload-in-use')
    expect(trackEditStateChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'preload-in-use' }),
    )
    expect(coordinator.tryAcquireWriteLease('D:/music/song1.flac')).toEqual({
      ok: false,
      reason: 'playback-in-use',
    })
    const current = await coordinator.acquireReadLease('D:/music/song1.flac', 'mpv-current')
    expect(coordinator.getTrackState(1).status).toBe('playback-in-use')
    coordinator.releaseReadLease(current.leaseId)
    expect(coordinator.getTrackState(1).status).toBe('preload-in-use')
    coordinator.releaseReadLease(next.leaseId)
    expect(coordinator.getTrackState(1).status).toBe('editable')
  })

  it('blocks new readers during preparation and promotes only after real readers release', async () => {
    const { coordinator } = setupCoordinator()
    coordinator.setBufferedWriteCapability(() => true)
    const current = await coordinator.acquireReadLease('D:/music/song1.flac', 'mpv-current')
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
    const intent = coordinator.reserveWriteIntent('D:/music/song1.flac')!
    expect(intent).toBeTruthy()
    expect(coordinator.getTrackState(1).status).toBe('write-in-progress')
    expect(() => coordinator.promoteWriteIntent(intent)).toThrow('readers')
    const granted = vi.fn()
    const next = coordinator.acquireReadLease('D:/music/song1.flac', 'mpv-current').then(granted)
    await Promise.resolve()
    expect(granted).not.toHaveBeenCalled()
    coordinator.releaseReadLease(current.leaseId)
    coordinator.promoteWriteIntent(intent)
    coordinator.releaseWriteLease(intent)
    await next
    expect(granted).toHaveBeenCalledOnce()
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
  })

  it('does not offer buffered writes when a renderer or another non-cooperating reader owns the file', async () => {
    const { coordinator, trackEditStateChanged } = setupCoordinator()
    coordinator.setBufferedWriteCapability(() => true)
    await coordinator.acquireReadLease('D:/music/song1.flac', 'mpv-current')
    const other = await coordinator.acquireReadLease('D:/music/song1.flac', 'html-audio')
    expect(coordinator.getTrackState(1).status).toBe('playback-in-use')
    expect(coordinator.reserveWriteIntent('D:/music/song1.flac')).toBeNull()
    coordinator.releaseReadLease(other.leaseId)
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
    expect(trackEditStateChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'playback-editable' }),
    )
  })
  it('keeps versions increasing after idle entries are removed', async () => {
    const { coordinator } = setupCoordinator()
    const first = await coordinator.acquireReadLease('D:/music/song1.flac', 'player')
    coordinator.releaseReadLease(first.leaseId)
    const idle = coordinator.getTrackState(1)
    expect(idle.status).toBe('editable')
    expect(idle.version).toBeGreaterThan(first.version)
    const second = await coordinator.acquireReadLease('D:/music/song1.flac', 'player')
    expect(second.version).toBeGreaterThan(idle.version)
    coordinator.releaseReadLease(second.leaseId)
    expect(coordinator.getTrackState(1).version).toBeGreaterThan(second.version)
  })

  it('looks up catalog events with the original path rather than the canonical lease key', async () => {
    const path = 'D:\\Music\\Review.flac'
    const trackEditStateChanged = vi.fn()
    const coordinator = new PlaybackFileCoordinator({
      getTrackFilePath: () => path,
      getTrackIdsByFilePath: (candidate) => (candidate === path ? [1] : []),
      trackEditStateChanged,
    })
    const lease = await coordinator.acquireReadLease(path, 'player')
    expect(trackEditStateChanged).toHaveBeenCalledWith({
      trackId: 1,
      status: 'playback-in-use',
      version: lease.version,
    })
    coordinator.releaseReadLease(lease.leaseId)
    expect(trackEditStateChanged).toHaveBeenLastCalledWith({
      trackId: 1,
      status: 'editable',
      version: expect.any(Number),
    })
  })
  it('acquires read lease and broadcasts playback-in-use to all trackIds sharing the file', async () => {
    const { coordinator, trackEditStateChanged } = setupCoordinator()

    const { leaseId, version } = await coordinator.acquireReadLease(
      'D:/music/song1.flac',
      'mpv-main',
    )
    expect(leaseId).toMatch(/^lease_read_/)
    expect(version).toBe(1)

    // Broadcasts to both track 1 and track 2
    expect(trackEditStateChanged).toHaveBeenCalledWith({
      trackId: 1,
      status: 'playback-in-use',
      version: 1,
    })
    expect(trackEditStateChanged).toHaveBeenCalledWith({
      trackId: 2,
      status: 'playback-in-use',
      version: 1,
    })

    expect(coordinator.getTrackState(1)).toEqual({
      trackId: 1,
      status: 'playback-in-use',
      version: 1,
    })
    expect(coordinator.getTrackState(2)).toEqual({
      trackId: 2,
      status: 'playback-in-use',
      version: 1,
    })
    // Unrelated track remains editable
    expect(coordinator.getTrackState(3)).toEqual({
      trackId: 3,
      status: 'editable',
      version,
    })
  })

  it('multiple readers keep playback-in-use until the last reader releases', async () => {
    const { coordinator, trackEditStateChanged } = setupCoordinator()

    const read1 = await coordinator.acquireReadLease('D:/music/song1.flac', 'reader-1')
    const read2 = await coordinator.acquireReadLease('D:/music/song1.flac', 'reader-2')

    trackEditStateChanged.mockClear()
    coordinator.releaseReadLease(read1.leaseId)

    // Still in use because reader-2 is active
    expect(coordinator.getTrackState(1).status).toBe('playback-in-use')
    expect(trackEditStateChanged).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'editable' }),
    )

    coordinator.releaseReadLease(read2.leaseId)

    // Now released
    expect(coordinator.getTrackState(1).status).toBe('editable')
    expect(trackEditStateChanged).toHaveBeenCalledWith({
      trackId: 1,
      status: 'editable',
      version: expect.any(Number),
    })
  })

  it('rejects write lease when read lease is active (playback-in-use)', async () => {
    const { coordinator } = setupCoordinator()

    const { leaseId } = await coordinator.acquireReadLease('D:/music/song1.flac', 'mpv-main')
    const writeResult = coordinator.tryAcquireWriteLease('D:/music/song1.flac')

    expect(writeResult).toEqual({
      ok: false,
      reason: 'playback-in-use',
    })

    coordinator.releaseReadLease(leaseId)

    const retryWrite = coordinator.tryAcquireWriteLease('D:/music/song1.flac')
    expect(retryWrite).toEqual({
      ok: true,
      leaseId: expect.stringMatching(/^lease_write_/),
    })
  })

  it('rejects concurrent write lease for the same file (write-in-progress)', () => {
    const { coordinator } = setupCoordinator()

    const write1 = coordinator.tryAcquireWriteLease('D:/music/song1.flac')
    expect(write1.ok).toBe(true)

    const write2 = coordinator.tryAcquireWriteLease('D:/music/song1.flac')
    expect(write2).toEqual({
      ok: false,
      reason: 'write-in-progress',
    })

    if (write1.ok) {
      coordinator.releaseWriteLease(write1.leaseId)
    }

    const write3 = coordinator.tryAcquireWriteLease('D:/music/song1.flac')
    expect(write3.ok).toBe(true)
  })

  it('reading file A does not prevent writing file B', async () => {
    const { coordinator } = setupCoordinator()

    await coordinator.acquireReadLease('D:/music/song1.flac', 'mpv-main')
    const writeResult = coordinator.tryAcquireWriteLease('D:/music/song2.flac')

    expect(writeResult.ok).toBe(true)
  })

  it('queues playback loading when writer is active, resolving upon writer release', async () => {
    const { coordinator } = setupCoordinator()

    const write = coordinator.tryAcquireWriteLease('D:/music/song1.flac')
    expect(write.ok).toBe(true)
    if (!write.ok) return

    let resolved = false
    const readPromise = coordinator
      .acquireReadLease('D:/music/song1.flac', 'mpv-loader')
      .then((res) => {
        resolved = true
        return res
      })

    // Tick to ensure it didn't resolve synchronously
    await Promise.resolve()
    expect(resolved).toBe(false)

    // Release writer
    coordinator.releaseWriteLease(write.leaseId)

    const read = await readPromise
    expect(resolved).toBe(true)
    expect(read.leaseId).toMatch(/^lease_read_/)
    expect(coordinator.getTrackState(1).status).toBe('playback-in-use')
  })

  it('cancels queued playback loading when AbortSignal fires', async () => {
    const { coordinator } = setupCoordinator()

    const write = coordinator.tryAcquireWriteLease('D:/music/song1.flac')
    expect(write.ok).toBe(true)
    if (!write.ok) return

    const controller = new AbortController()
    const readPromise = coordinator.acquireReadLease(
      'D:/music/song1.flac',
      'mpv-loader',
      controller.signal,
    )

    controller.abort()

    await expect(readPromise).rejects.toThrow('aborted')

    // Releasing writer afterwards should not crash or resolve aborted waiter
    coordinator.releaseWriteLease(write.leaseId)
    expect(coordinator.getTrackState(1).status).toBe('editable')
  })

  it('treats different path casing and slashes as the same file on Windows', async () => {
    const { coordinator } = setupCoordinator()

    const read = await coordinator.acquireReadLease('d:\\MUSIC\\Song1.FLAC', 'mpv-main')
    const writeResult = coordinator.tryAcquireWriteLease('D:/music/song1.flac')

    expect(writeResult).toEqual({
      ok: false,
      reason: 'playback-in-use',
    })

    coordinator.releaseReadLease(read.leaseId)
  })

  it('releases all leases for a specific source ID', async () => {
    const { coordinator } = setupCoordinator()

    await coordinator.acquireReadLease('D:/music/song1.flac', 'renderer-window-1')
    await coordinator.acquireReadLease('D:/music/song2.flac', 'renderer-window-1')

    expect(coordinator.getTrackState(1).status).toBe('playback-in-use')
    expect(coordinator.getTrackState(3).status).toBe('playback-in-use')

    coordinator.releaseAllBySourceId('renderer-window-1')

    expect(coordinator.getTrackState(1).status).toBe('editable')
    expect(coordinator.getTrackState(3).status).toBe('editable')
  })

  it('turns a write lease into one mpv read lease and leaves a second release as a no-op', async () => {
    const { coordinator } = setupCoordinator()
    const path = 'D:/music/song1.flac'
    coordinator.setBufferedWriteCapability((filePath) => filePath.endsWith('.flac'))
    const write = coordinator.tryAcquireWriteLease(path)
    expect(write.ok).toBe(true)
    if (!write.ok) return
    let opened = false
    const waiting = coordinator.acquireReadLease(path, 'mpv-next').then(() => {
      opened = true
    })
    await Promise.resolve()
    expect(opened).toBe(false)
    const handed = coordinator.handoffWriteLeaseToRead(write.leaseId, 'mpv-current')
    expect(handed.leaseId).toMatch(/^lease_read_/)
    await waiting
    expect(opened).toBe(true)
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
    coordinator.releaseWriteLease(write.leaseId)
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
    expect(() => coordinator.handoffWriteLeaseToRead(write.leaseId, 'mpv-current')).toThrow(
      'File write handoff lease expired',
    )
  })

  it('reports write-in-progress while metadata activity is set and still lets the in-flight save reserve', async () => {
    const { coordinator } = setupCoordinator()
    const path = 'D:/music/song1.flac'
    coordinator.setBufferedWriteCapability((filePath) => filePath.endsWith('.flac'))
    const current = await coordinator.acquireReadLease(path, 'mpv-current')
    coordinator.setMetadataWriteActivity(() => true)
    expect(coordinator.getTrackState(1).status).toBe('write-in-progress')
    expect(coordinator.tryAcquireWriteLease(path)).toEqual({
      ok: false,
      reason: 'write-in-progress',
    })
    const intent = coordinator.reserveWriteIntent(path)
    expect(intent).toBeTruthy()
    coordinator.releaseWriteLease(intent!)
    let htmlOpened = false
    const htmlWaiting = coordinator.acquireReadLease(path, 'html-audio').then(() => {
      htmlOpened = true
    })
    let spectrumOpened = false
    const spectrumWaiting = coordinator.acquireReadLease(path, 'spectrum-analysis').then(() => {
      spectrumOpened = true
    })
    await Promise.resolve()
    expect(htmlOpened).toBe(false)
    expect(spectrumOpened).toBe(false)
    const another = await coordinator.acquireReadLease(path, 'mpv-current')
    expect(another.leaseId).not.toBe(current.leaseId)
    coordinator.setMetadataWriteActivity(() => false)
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
    coordinator.finishMetadataWrite(path)
    await htmlWaiting
    await spectrumWaiting
    expect(htmlOpened).toBe(true)
    expect(spectrumOpened).toBe(true)
    expect(coordinator.getTrackState(1).status).toBe('playback-in-use')
  })
})
