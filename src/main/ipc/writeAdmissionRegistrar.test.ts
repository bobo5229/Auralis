import { describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { ipcChannels } from '@shared/ipc/channels'
import { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import { createValidatedIpcRegistrar } from './validatedIpcRegistrar'
import { createWriteAdmissionRegistrar } from './writeAdmissionRegistrar'
import { registerBadgeAchievementIpcHandlers } from './registerBadgeAchievementIpcHandlers'

const event = {} as IpcMainInvokeEvent
const payload = {
  epoch: 0,
  sessionId: 'one',
  sequence: 1,
  trackId: 1,
  samples: [
    { startedAtIso: '2026-10-28T12:00:00.000Z', startSeconds: 0, endSeconds: 1, playedSeconds: 1 },
  ],
}
describe('IPC write admission', () => {
  it('delays the actual write and success event, while reads remain available', async () => {
    const gate = new DatabaseWriteAdmission()
    const lease = await gate.acquireExclusive()
    const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>()
    const registrar = createValidatedIpcRegistrar({
      register: (c, h) => handlers.set(c, h),
      isTrustedSender: () => true,
    })
    const record = vi.fn(() => ({ ok: true, epoch: 0 }))
    const changed = vi.fn()
    registerBadgeAchievementIpcHandlers(
      createWriteAdmissionRegistrar(registrar, gate),
      { record, getEpoch: () => 9, getAchievements: vi.fn() },
      changed,
    )
    const pending = handlers.get(ipcChannels.playback.recordListeningProgress)!(event, payload)
    expect(record).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
    expect(handlers.get(ipcChannels.playback.getListeningEpoch)!(event)).toBe(9)
    lease.release()
    await expect(pending).resolves.toEqual({ ok: true, epoch: 0 })
    expect(record).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledOnce()
  })
})
