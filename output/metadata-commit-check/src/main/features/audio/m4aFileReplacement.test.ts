import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { replacePlayingM4a } from './m4aFileReplacement'
import { PlaybackFileCoordinator } from './playbackFileCoordinator'
import { prepareAudioTagWrite } from '../metadata/audioTagWriteService'

vi.mock('../metadata/audioTagWriteService', () => ({ prepareAudioTagWrite: vi.fn() }))
vi.mock('../metadata/windowsM4aPublication', () => ({ hasM4aPublicationHelper: () => true }))
const path = join(tmpdir(), 'auralis-replacement-unit', 'synthetic.m4a')
const metadata = {
  trackId: 1,
  title: 'New',
  artistDisplay: null,
  albumTitle: null,
  albumArtistDisplay: null,
  genreDisplay: null,
  year: null,
  releaseDate: null,
}
beforeEach(() => vi.resetAllMocks())
function setup() {
  const coordinator = new PlaybackFileCoordinator({
    getTrackFilePath: () => path,
    getTrackIdsByFilePath: () => [1],
    sendToRenderer: () => {},
  })
  coordinator.setFileReplacementCapability(() => true)
  const commit = vi.fn(async () => {}),
    dispose = vi.fn(async () => {})
  vi.mocked(prepareAudioTagWrite).mockResolvedValue({
    stagingPath: path + '.staging',
    assertUnchanged: async () => {},
    commit,
    dispose,
  })
  const resumeAnalysis = vi.fn(),
    resumeReaders = vi.fn()
  const suspend = vi.fn(async () => resumeAnalysis)
  const options = {
    coordinator,
    ffmpegPath: 'isolated/ffmpeg.exe',
    suspendFileReaders: vi.fn(async () => resumeReaders),
    warn: vi.fn(),
  }
  return { coordinator, commit, dispose, resumeAnalysis, resumeReaders, suspend, options }
}
describe('M4A replacement ownership and recovery', () => {
  it('keeps decoder leases and new readers gated until database reconciliation finishes', async () => {
    const test = setup()
    const next = await test.coordinator.acquireReadLease(path, 'mpv-next')
    let reconcile!: () => void
    const gate = new Promise<void>((yes) => (reconcile = yes))
    const request = replacePlayingM4a(
      test.options,
      test.suspend,
      path,
      metadata,
      async (commit) => {
        await commit()
        await gate
      },
    )
    const opened = vi.fn()
    const reader = test.coordinator.acquireReadLease(path, 'audio-probe').then(opened)
    await vi.waitFor(() => expect(test.commit).toHaveBeenCalledWith(undefined, true))
    test.coordinator.markReadLeaseCurrent(next.leaseId)
    expect(opened).not.toHaveBeenCalled()
    expect(test.coordinator.getTrackState(1).status).toBe('write-in-progress')
    reconcile()
    expect(await request).toEqual({ ok: true })
    await reader
    expect(opened).toHaveBeenCalledOnce()
    test.coordinator.releaseReadLease(opened.mock.calls[0][0].leaseId)
    expect(test.coordinator.getTrackState(1).status).toBe('playback-editable')
    expect(test.resumeAnalysis).toHaveBeenCalledOnce()
    expect(test.resumeReaders).toHaveBeenCalledOnce()
  })
  it.each(['prepare', 'publish', 'database'] as const)(
    'recovers writer ownership after %s fails without releasing the playing decoder',
    async (phase) => {
      const test = setup()
      await test.coordinator.acquireReadLease(path, 'mpv-current')
      if (phase === 'prepare')
        vi.mocked(prepareAudioTagWrite).mockRejectedValueOnce(
          Object.assign(new Error('full'), { code: 'ENOSPC' }),
        )
      if (phase === 'publish')
        test.commit.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
      const result = await replacePlayingM4a(
        test.options,
        test.suspend,
        path,
        metadata,
        async (commit) => {
          await commit()
          if (phase === 'database') throw new Error('SQL failed')
        },
      )
      expect(result).toEqual({
        ok: false,
        reason:
          phase === 'prepare' ? 'disk-full' : phase === 'publish' ? 'file-in-use' : 'save-failed',
      })
      expect(test.coordinator.getTrackState(1).status).toBe('playback-editable')
      expect(test.coordinator.tryAcquireWriteLease(path)).toEqual({
        ok: false,
        reason: 'playback-in-use',
      })
      expect(test.resumeAnalysis).toHaveBeenCalledOnce()
      expect(test.resumeReaders).toHaveBeenCalledTimes(phase === 'prepare' ? 0 : 1)
      if (phase !== 'prepare') expect(test.dispose).toHaveBeenCalledOnce()
    },
  )
  it('waits for spectrum readers to release and refuses unknown readers', async () => {
    const test = setup()
    await test.coordinator.acquireReadLease(path, 'mpv-current')
    const unknown = await test.coordinator.acquireReadLease(path, 'html-audio')
    expect(
      await replacePlayingM4a(test.options, test.suspend, path, metadata, (commit) => commit()),
    ).toEqual({ ok: false, reason: 'playback-in-use' })
    expect(prepareAudioTagWrite).not.toHaveBeenCalled()
    test.coordinator.releaseReadLease(unknown.leaseId)
    const spectrum = await test.coordinator.acquireReadLease(path, 'spectrum-analysis')
    test.options.suspendFileReaders.mockImplementationOnce(async () => {
      test.coordinator.releaseReadLease(spectrum.leaseId)
      return test.resumeReaders
    })
    expect(
      await replacePlayingM4a(test.options, test.suspend, path, metadata, (commit) => commit()),
    ).toEqual({ ok: true })
  })
})
