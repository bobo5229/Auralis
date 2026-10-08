import { describe, expect, it, vi } from 'vitest'
import type { PlayStatsRepository } from '../repositories/playStatsRepository'
import { PlayStatsService } from './playStatsService'

function createService() {
  const playStatsRepo = {
    trackExists: vi.fn(() => true),
    incrementPlayCount: vi.fn(),
    resetAll: vi.fn(),
  }
  return {
    service: new PlayStatsService(playStatsRepo as unknown as PlayStatsRepository),
    playStatsRepo,
  }
}

const payload = {
  trackId: 42,
  sessionId: 'session-42',
  playedAtIso: new Date(2026, 9, 8, 12).toISOString(),
}

describe('PlayStatsService recording and reset', () => {
  it('records an effective play once per session with its local date', () => {
    const { service, playStatsRepo } = createService()
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: true })
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: false })
    expect(playStatsRepo.incrementPlayCount).toHaveBeenCalledExactlyOnceWith(
      42,
      payload.playedAtIso,
      '2026-10-08',
    )
  })

  it.each([{ trackId: 0 }, { trackId: 1.5 }, { sessionId: ' ' }, { playedAtIso: 'invalid-date' }])(
    'rejects invalid recording input %j before writing',
    (patch) => {
      const { service, playStatsRepo } = createService()
      expect(service.recordEffectivePlay({ ...payload, ...patch })).toEqual({
        ok: false,
        recorded: false,
      })
      expect(playStatsRepo.trackExists).not.toHaveBeenCalled()
      expect(playStatsRepo.incrementPlayCount).not.toHaveBeenCalled()
    },
  )

  it('rejects unknown tracks without writing or remembering their sessions', () => {
    const { service, playStatsRepo } = createService()
    playStatsRepo.trackExists.mockReturnValueOnce(false)
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: false, recorded: false })
    expect(playStatsRepo.incrementPlayCount).not.toHaveBeenCalled()
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: true })
  })

  it('allows retry after a recording write fails', () => {
    const { service, playStatsRepo } = createService()
    playStatsRepo.incrementPlayCount.mockImplementationOnce(() => {
      throw new Error('write failed')
    })
    expect(() => service.recordEffectivePlay(payload)).toThrow('write failed')
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: true })
  })

  it('resets persisted statistics before clearing the session cache', () => {
    const { service, playStatsRepo } = createService()
    service.recordEffectivePlay(payload)
    playStatsRepo.resetAll.mockImplementationOnce(() => {
      throw new Error('reset failed')
    })
    expect(() => service.resetAll()).toThrow('reset failed')
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: false })
    expect(service.resetAll()).toEqual({ ok: true })
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: true })
  })
})
