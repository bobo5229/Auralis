import { describe, it, expect, vi } from 'vitest'
import { ipcChannels } from '@shared/ipc/channels'
import type { IpcHandlerRegistrar } from './ipcHandlerRegistrar'
import { registerDownloadIpcHandlers } from './registerDownloadIpcHandlers'
import type { AmdlDownloadService } from '@main/features/amdl/amdlDownloadService'
import type { AmdlTaskProgress } from '@shared/types/amdl'

describe('registerDownloadIpcHandlers', () => {
  it('wires start, cancel, and getStatus to AmdlDownloadService', async () => {
    const handlers = new Map<string, (event: unknown, payload: any) => unknown>()
    const registrar: IpcHandlerRegistrar = {
      handle: (channel, listener) => {
        handlers.set(channel, listener as (event: unknown, payload: any) => unknown)
      },
    }

    const mockProgress: AmdlTaskProgress = {
      taskId: 'task-100',
      url: 'https://music.apple.com/song',
      state: 'running',
      stage: 'downloading',
      alreadyExists: false,
      message: null,
      error: null,
      startedAt: '2026-09-06T00:00:00Z',
      finishedAt: null,
    }

    const mockService = {
      startDownload: vi.fn().mockReturnValue({ ok: true, taskId: 'task-100' }),
      cancelDownload: vi.fn().mockReturnValue({ ok: true }),
      getActiveProgress: vi.fn().mockReturnValue(mockProgress),
    } as unknown as AmdlDownloadService

    registerDownloadIpcHandlers(registrar, { downloadService: mockService })

    expect(handlers.has(ipcChannels.download.start)).toBe(true)
    expect(handlers.has(ipcChannels.download.cancel)).toBe(true)
    expect(handlers.has(ipcChannels.download.getStatus)).toBe(true)

    // Test start
    const startHandler = handlers.get(ipcChannels.download.start)!
    const startResult = await startHandler({}, { url: 'https://music.apple.com/song' })
    expect(startResult).toEqual({ ok: true, taskId: 'task-100' })
    expect(mockService.startDownload).toHaveBeenCalledWith('https://music.apple.com/song')

    // Test cancel
    const cancelHandler = handlers.get(ipcChannels.download.cancel)!
    const cancelResult = await cancelHandler({}, { taskId: 'task-100' })
    expect(cancelResult).toEqual({ ok: true })
    expect(mockService.cancelDownload).toHaveBeenCalledWith('task-100')

    // Test getStatus matching taskId
    const getStatusHandler = handlers.get(ipcChannels.download.getStatus)!
    const statusMatch = await getStatusHandler({}, { taskId: 'task-100' })
    expect(statusMatch).toEqual(mockProgress)

    // Test getStatus non-matching taskId
    const statusMismatch = await getStatusHandler({}, { taskId: 'task-other' })
    expect(statusMismatch).toBeNull()
  })
})
