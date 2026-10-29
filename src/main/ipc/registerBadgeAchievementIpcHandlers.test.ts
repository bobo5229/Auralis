import type { IpcMainInvokeEvent } from 'electron'
import { expect, it, vi } from 'vitest'
import { createValidatedIpcRegistrar, IpcInvokeSourceError } from './validatedIpcRegistrar'
import { IpcPayloadValidationError } from './ipcPayloadValidation'
import { registerBadgeAchievementIpcHandlers } from './registerBadgeAchievementIpcHandlers'
function fixture(trusted = true) {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>()
  const registrar = createValidatedIpcRegistrar({
    register: (c, h) => handlers.set(c, h),
    isTrustedSender: () => trusted,
  })
  const record = vi.fn(() => ({ ok: true, epoch: 0 })),
    getEpoch = vi.fn(() => 17),
    getAchievements = vi.fn(),
    changed = vi.fn()
  registerBadgeAchievementIpcHandlers(registrar, { record, getEpoch, getAchievements }, changed)
  return {
    record,
    getEpoch,
    changed,
    getAchievements,
    invoke: (c: string, ...args: unknown[]) => handlers.get(c)!({} as IpcMainInvokeEvent, ...args),
  }
}
const sample = {
  startedAtIso: '2026-10-28T12:00:00.000Z',
  startSeconds: 0,
  endSeconds: 1,
  playedSeconds: 1,
}
const batch = { epoch: 0, sessionId: 'one', sequence: 1, trackId: 1, samples: [sample] }
it('validates sender and bounded evidence before writes and emits changes only on success', () => {
  const f = fixture()
  f.invoke('playback:record-listening-progress', batch)
  expect(f.record).toHaveBeenCalledExactlyOnceWith(batch)
  expect(f.changed).toHaveBeenCalledOnce()
  f.record.mockReturnValueOnce({ ok: false, epoch: 1 })
  f.invoke('playback:record-listening-progress', batch)
  expect(f.changed).toHaveBeenCalledOnce()
  for (const payload of [
    { ...batch, trackId: 0 },
    { ...batch, epoch: -1 },
    { ...batch, sequence: 1.2 },
    { ...batch, samples: [] },
    { ...batch, samples: Array(33).fill(sample) },
    { ...batch, samples: [{ ...sample, playedSeconds: NaN }] },
    { ...batch, path: 'unsafe' },
  ])
    expect(() => f.invoke('playback:record-listening-progress', payload)).toThrow(
      IpcPayloadValidationError,
    )
  expect(f.record).toHaveBeenCalledTimes(2)
  const denied = fixture(false)
  expect(() => denied.invoke('playback:record-listening-progress', batch)).toThrow(
    IpcInvokeSourceError,
  )
  expect(denied.record).not.toHaveBeenCalled()
})
it('accepts only a void read and never writes during achievement queries', () => {
  const f = fixture()
  f.invoke('archive:get-badge-achievements')
  expect(f.getAchievements).toHaveBeenCalledOnce()
  expect(() => f.invoke('archive:get-badge-achievements', {})).toThrow(IpcPayloadValidationError)
  expect(f.record).not.toHaveBeenCalled()
  expect(f.changed).not.toHaveBeenCalled()
})
it('reads the epoch without calculating achievements and enforces sender and void payload', () => {
  const f = fixture()
  expect(f.invoke('playback:get-listening-epoch')).toBe(17)
  expect(f.getEpoch).toHaveBeenCalledOnce()
  expect(f.getAchievements).not.toHaveBeenCalled()
  expect(() => f.invoke('playback:get-listening-epoch', {})).toThrow(IpcPayloadValidationError)
  expect(() => fixture(false).invoke('playback:get-listening-epoch')).toThrow(IpcInvokeSourceError)
})
