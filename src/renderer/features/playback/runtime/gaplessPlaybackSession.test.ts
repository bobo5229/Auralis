import { describe, expect, it, vi } from 'vitest'
import type { AudioResource } from '@shared/types/audioDecode'
import type { PlaybackAudioRuntime, PlaybackAudioSnapshot } from '../audio/playbackAudioRuntime'
import type { PlaybackTransitionPlan } from '../core/playbackTransitionPlanner'
import type { PlaybackTrack } from '../types'
import { createGaplessPlaybackSession } from './gaplessPlaybackSession'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function setup() {
  const tracks: PlaybackTrack[] = [1, 2, 3].map((id) => ({
    id,
    title: String(id),
    artist: 'Artist',
    albumArtist: 'Artist',
    album: 'Album',
    durationSeconds: 10,
    artworkCacheKey: null,
  }))
  const plan: PlaybackTransitionPlan = {
    track: tracks[1],
    queue: tracks,
    recordHistory: true,
    consumeQueued: false,
  }
  const playback = { currentTrackId: 1, currentTrack: tracks[0], paused: false }
  const settings = {
    enabled: true,
    skipDigitalSilence: false,
    softTransition: false,
    softTransitionDurationSeconds: 2,
  }
  const snapshot: PlaybackAudioSnapshot = {
    kind: 'mpv',
    trackId: 1,
    currentTime: 0,
    duration: 10,
    isPlaying: true,
    hasCurrentData: true,
  }
  const audio = {
    getSnapshot: () => snapshot,
    scheduleNext: vi.fn<PlaybackAudioRuntime['scheduleNext']>(async () => true),
    cancelScheduledNext: vi.fn(),
  }
  const resolvePlan = vi.fn(async () => plan as PlaybackTransitionPlan | null)
  const resolveAudioUrl = vi.fn(
    async (id: number): Promise<AudioResource> => ({ url: `audio://${id}` }),
  )
  const filterPlan = vi.fn((value: PlaybackTransitionPlan): PlaybackTransitionPlan | null => value)
  const session = createGaplessPlaybackSession({
    audio,
    getPlayback: () => playback,
    getSettings: () => settings,
    resolvePlan,
    filterPlan,
    resolveAudioUrl,
  })
  return {
    session,
    audio,
    snapshot,
    playback,
    settings,
    plan,
    tracks,
    resolvePlan,
    resolveAudioUrl,
    filterPlan,
  }
}

describe('gapless playback session', () => {
  it.each([
    { label: 'same album', current: {}, next: {}, trim: true },
    {
      label: 'case and whitespace',
      current: {},
      next: { album: ' ALBUM ', albumArtist: ' artist ' },
      trim: true,
    },
    { label: 'performer fallback', current: {}, next: { albumArtist: null }, trim: true },
    {
      label: 'missing artist and display fallback',
      current: { artist: null, albumArtist: null },
      next: { artist: 'Unknown Artist', albumArtist: 'Unknown Artist' },
      trim: true,
    },
    {
      label: 'empty artist and display fallback',
      current: { artist: '', albumArtist: '' },
      next: { artist: 'Unknown Artist', albumArtist: 'Unknown Artist' },
      trim: true,
    },
    { label: 'different album', current: {}, next: { album: 'Other' }, trim: false },
    { label: 'different artist', current: {}, next: { albumArtist: 'Other' }, trim: false },
    { label: 'missing album', current: { album: null }, next: { album: null }, trim: false },
    { label: 'empty album', current: { album: '' }, next: { album: '' }, trim: false },
    { label: 'whitespace album', current: { album: ' ' }, next: { album: '  ' }, trim: false },
  ])(
    'uses the album identity rule for digital silence: $label',
    async ({ current, next, trim }) => {
      const t = setup()
      Object.assign(t.tracks[0], current)
      Object.assign(t.tracks[1], next)
      t.settings.skipDigitalSilence = true
      try {
        await t.session.refresh(1)
        expect(t.audio.scheduleNext).toHaveBeenLastCalledWith(
          2,
          'audio://2',
          expect.objectContaining({ trimBoundarySilence: trim }),
        )
      } finally {
        t.session.dispose()
      }
    },
  )

  it('passes the selected duration to the next-track request', async () => {
    const t = setup()
    t.settings.softTransition = true
    t.settings.softTransitionDurationSeconds = 6
    await t.session.refresh(1)
    expect(t.audio.scheduleNext).toHaveBeenLastCalledWith(
      2,
      'audio://2',
      expect.objectContaining({
        softTransition: true,
        softTransitionDurationSeconds: 6,
      }),
    )
  })

  it('deduplicates preparation both before and after the ACK', async () => {
    const t = setup()
    const ack = deferred<boolean>()
    t.audio.scheduleNext.mockReturnValueOnce(ack.promise)
    const pending = t.session.refresh(1)
    await vi.waitFor(() => expect(t.audio.scheduleNext).toHaveBeenCalledOnce())
    await t.session.refresh(1)
    ack.resolve(true)
    await pending
    await t.session.refresh(1)
    expect(t.resolvePlan).toHaveBeenCalledOnce()
    expect(t.audio.scheduleNext).toHaveBeenCalledOnce()
  })

  it.each([false, true])('accepts a boundary before ACK, with cancellation=%s', async (cancel) => {
    const t = setup()
    const ack = deferred<boolean>()
    t.audio.scheduleNext.mockReturnValueOnce(ack.promise)
    const pending = t.session.refresh(1)
    await vi.waitFor(() => expect(t.audio.scheduleNext).toHaveBeenCalledOnce())
    if (cancel) t.session.cancelPreload()
    t.snapshot.trackId = 2
    expect(t.session.acceptBoundary(2)).toEqual({
      kind: 'entered',
      plan: t.plan,
      navigationStale: false,
      contextStale: false,
    })
    expect(t.session.acceptBoundary(2)).toEqual({ kind: 'ignore' })
    ack.resolve(true)
    await pending
    expect(t.session.getPreparingPlan()).toBeNull()
  })

  it.each(['resolve', 'reject'] as const)(
    'does not let a late ACK %s finish or cancel a successor',
    async (result) => {
      const t = setup()
      const oldAck = deferred<boolean>()
      const newAck = deferred<boolean>()
      t.audio.scheduleNext.mockReturnValueOnce(oldAck.promise).mockReturnValueOnce(newAck.promise)
      const old = t.session.refresh(1)
      await vi.waitFor(() => expect(t.audio.scheduleNext).toHaveBeenCalledTimes(1))
      t.session.cancelPreload()
      const current = t.session.refresh(1)
      await vi.waitFor(() => expect(t.audio.scheduleNext).toHaveBeenCalledTimes(2))
      const cancellations = t.audio.cancelScheduledNext.mock.calls.length
      if (result === 'resolve') oldAck.resolve(true)
      else oldAck.reject(new Error('old ACK failed'))
      await old
      await t.session.refresh(1)
      expect(t.audio.scheduleNext).toHaveBeenCalledTimes(2)
      expect(t.audio.cancelScheduledNext).toHaveBeenCalledTimes(cancellations)
      newAck.resolve(true)
      await current
    },
  )

  it.each([false, true])(
    'reports navigation and context revisions separately, reset=%s',
    async (reset) => {
      const t = setup()
      await t.session.refresh(1)
      t.session.navigationChanged(reset)
      t.session.cancelPreload()
      t.snapshot.trackId = 2
      expect(t.session.acceptBoundary(2)).toEqual({
        kind: 'entered',
        plan: t.plan,
        navigationStale: true,
        contextStale: reset,
      })
    },
  )

  it('allows the same track to be prepared again after a repeat-one boundary', async () => {
    const t = setup()
    t.plan.track = t.tracks[0]
    await t.session.refresh(1)
    expect(t.session.acceptBoundary(1).kind).toBe('entered')
    await t.session.refresh(1)
    expect(t.audio.scheduleNext).toHaveBeenCalledTimes(2)
  })

  it('preserves a relocated random choice and visits retained candidates without duplicates', async () => {
    const t = setup()
    await t.session.refresh(1)
    const visit = vi.fn()
    t.session.visitPlans(visit)
    expect(visit).toHaveBeenCalledExactlyOnceWith(t.plan)
    const retained = t.session.getPreparingPlan()!
    t.session.cancelPreload()
    visit.mockClear()
    t.session.visitPlans(visit)
    expect(visit).toHaveBeenCalledExactlyOnceWith(retained)
    await t.session.refresh(1, retained)
    expect(t.resolvePlan).toHaveBeenCalledOnce()
    expect(t.resolveAudioUrl).toHaveBeenCalledTimes(2)
    t.session.endAudioLifetime()
    t.snapshot.trackId = 2
    expect(t.session.acceptBoundary(2).kind).toBe('ignore')
  })

  it('ignores unknown or mismatched boundaries and clears candidates on natural end', async () => {
    const t = setup()
    await t.session.refresh(1)
    expect(t.session.acceptBoundary(3).kind).toBe('ignore')
    expect(t.session.acceptBoundary(2).kind).toBe('ignore')
    expect(t.session.getPreparingPlan()).toBe(t.plan)
    expect(t.session.acceptBoundary(null).kind).toBe('natural-ended')
    expect(t.session.getPreparingPlan()).toBeNull()
    t.snapshot.trackId = 2
    expect(t.session.acceptBoundary(2).kind).toBe('ignore')
  })

  it('filters a missing candidate before loading its audio', async () => {
    const t = setup()
    t.filterPlan.mockReturnValue(null)
    await t.session.refresh(1)
    expect(t.resolveAudioUrl).not.toHaveBeenCalled()
    expect(t.audio.scheduleNext).not.toHaveBeenCalled()
  })

  it.each(['plan', 'url', 'ack'] as const)(
    'discards asynchronous %s results after disposal',
    async (stage) => {
      const t = setup()
      const plan = deferred<PlaybackTransitionPlan | null>()
      const url = deferred<AudioResource>()
      const ack = deferred<boolean>()
      if (stage === 'plan') t.resolvePlan.mockReturnValueOnce(plan.promise)
      if (stage === 'url') t.resolveAudioUrl.mockReturnValueOnce(url.promise)
      if (stage === 'ack') t.audio.scheduleNext.mockReturnValueOnce(ack.promise)
      const pending = t.session.refresh(1)
      if (stage === 'url') await vi.waitFor(() => expect(t.resolveAudioUrl).toHaveBeenCalledOnce())
      if (stage === 'ack')
        await vi.waitFor(() => expect(t.audio.scheduleNext).toHaveBeenCalledOnce())
      t.session.dispose()
      plan.resolve(t.plan)
      url.resolve({ url: 'audio://2' })
      ack.resolve(true)
      await pending
      const calls = t.audio.cancelScheduledNext.mock.calls.length
      await t.session.refresh(1)
      t.session.dispose()
      expect(t.audio.cancelScheduledNext).toHaveBeenCalledTimes(calls)
      expect(t.audio.scheduleNext).toHaveBeenCalledTimes(stage === 'ack' ? 1 : 0)
      expect(t.session.getPreparingPlan()).toBeNull()
      t.snapshot.trackId = 2
      expect(t.session.acceptBoundary(2).kind).toBe('ignore')
      expect(t.session.acceptBoundary(null).kind).toBe('ignore')
    },
  )
})
