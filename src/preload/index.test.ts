import { describe, expect, it, vi } from 'vitest'

const { invoke, exposeInMainWorld } = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ ok: true })),
  exposeInMainWorld: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}))

import { auralisApi } from './index'

describe('preload after archive query retirement', () => {
  it('exposes only the retained reset capability in the archive namespace', () => {
    expect(exposeInMainWorld).toHaveBeenCalledExactlyOnceWith('auralis', auralisApi)
    expect(Object.keys(auralisApi.archive)).toEqual(['resetPlayStats'])
  })

  it('continues routing reset through its explicit IPC channel', async () => {
    await expect(auralisApi.archive.resetPlayStats()).resolves.toEqual({ ok: true })
    expect(invoke).toHaveBeenCalledExactlyOnceWith('archive:reset-play-stats')
  })
})
