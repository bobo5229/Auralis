import { describe, expect, it, vi } from 'vitest'
import type { AmdlLogEvent, AmdlTaskProgress } from '@shared/types/amdl'
import type { AuralisApi } from '@shared/ipc/api'
import { useAmdlDownload } from './useAmdlDownload'

function createMockClient() {
  let progressCb: ((progress: AmdlTaskProgress) => void) | null = null
  let logCb: ((log: AmdlLogEvent) => void) | null = null

  const unsubProgress = vi.fn()
  const unsubLog = vi.fn()

  const client = {
    download: {
      start: vi.fn(),
      cancel: vi.fn(),
      getStatus: vi.fn(),
      onProgress: vi.fn((cb) => {
        progressCb = cb
        return unsubProgress
      }),
      onLog: vi.fn((cb) => {
        logCb = cb
        return unsubLog
      }),
    },
  } as unknown as AuralisApi

  return {
    client,
    unsubProgress,
    unsubLog,
    emitProgress: (p: AmdlTaskProgress) => progressCb?.(p),
    emitLog: (l: AmdlLogEvent) => logCb?.(l),
  }
}

describe('useAmdlDownload', () => {
  it('subscribes to onProgress and onLog on initialization, and cleanup unsubscribes', () => {
    const mock = createMockClient()
    const { cleanup } = useAmdlDownload({ client: mock.client })

    expect(mock.client.download.onProgress).toHaveBeenCalledTimes(1)
    expect(mock.client.download.onLog).toHaveBeenCalledTimes(1)

    cleanup()
    expect(mock.unsubProgress).toHaveBeenCalledTimes(1)
    expect(mock.unsubLog).toHaveBeenCalledTimes(1)
  })

  it('updates currentTask when progress arrives for currentTaskId', async () => {
    const mock = createMockClient()
    mock.client.download.start = vi.fn().mockResolvedValue({ ok: true, taskId: 'task-1' })
    mock.client.download.getStatus = vi.fn().mockResolvedValue({
      taskId: 'task-1',
      url: 'https://music.apple.com/us/album/test/123?i=456',
      state: 'starting',
      stage: 'launching',
      alreadyExists: false,
      message: 'Launching',
      error: null,
      startedAt: '2026-09-06T00:00:00Z',
      finishedAt: null,
    })

    const { currentTaskId, currentTask, startDownload } = useAmdlDownload({ client: mock.client })

    await startDownload('https://music.apple.com/us/album/test/123?i=456')
    expect(currentTaskId.value).toBe('task-1')
    expect(currentTask.value?.stage).toBe('launching')

    // Emit progress for task-1
    mock.emitProgress({
      taskId: 'task-1',
      url: 'https://music.apple.com/us/album/test/123?i=456',
      state: 'running',
      stage: 'downloading',
      alreadyExists: false,
      message: 'Downloading track',
      error: null,
      startedAt: '2026-09-06T00:00:00Z',
      finishedAt: null,
    })

    expect(currentTask.value?.stage).toBe('downloading')
    expect(currentTask.value?.state).toBe('running')

    // Progress for another task should be ignored
    mock.emitProgress({
      taskId: 'task-other',
      url: 'https://music.apple.com/us/album/other/999?i=888',
      state: 'running',
      stage: 'preparing',
      alreadyExists: false,
      message: 'Preparing other',
      error: null,
      startedAt: '2026-09-06T00:00:00Z',
      finishedAt: null,
    })

    expect(currentTask.value?.taskId).toBe('task-1')
    expect(currentTask.value?.stage).toBe('downloading')
  })

  it('appends logs only for current taskId and maintains ring buffer within maxLogs', async () => {
    const mock = createMockClient()
    mock.client.download.start = vi.fn().mockResolvedValue({ ok: true, taskId: 'task-1' })
    mock.client.download.getStatus = vi.fn().mockResolvedValue(null)

    const { currentTaskId, logs, startDownload } = useAmdlDownload({
      client: mock.client,
      maxLogs: 3,
    })

    await startDownload('https://music.apple.com/us/album/test/123?i=456')
    expect(currentTaskId.value).toBe('task-1')
    expect(logs.value).toEqual([])

    // Log from irrelevant task is discarded
    mock.emitLog({ taskId: 'task-other', stream: 'stdout', line: 'ignore me' })
    expect(logs.value).toHaveLength(0)

    // Append 4 logs when max is 3
    mock.emitLog({ taskId: 'task-1', stream: 'stdout', line: 'line 1' })
    mock.emitLog({ taskId: 'task-1', stream: 'stdout', line: 'line 2' })
    mock.emitLog({ taskId: 'task-1', stream: 'stderr', line: 'line 3' })
    mock.emitLog({ taskId: 'task-1', stream: 'stdout', line: 'line 4' })

    expect(logs.value).toHaveLength(3)
    expect(logs.value.map((l) => l.line)).toEqual(['line 2', 'line 3', 'line 4'])
  })

  it('clears logs and resets state when a new download starts', async () => {
    const mock = createMockClient()
    mock.client.download.start = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, taskId: 'task-1' })
      .mockResolvedValueOnce({ ok: true, taskId: 'task-2' })
    mock.client.download.getStatus = vi.fn().mockResolvedValue(null)

    const { currentTaskId, logs, startDownload } = useAmdlDownload({ client: mock.client })

    await startDownload('https://music.apple.com/us/album/test/123?i=1')
    mock.emitLog({ taskId: 'task-1', stream: 'stdout', line: 'task 1 log' })
    expect(logs.value).toHaveLength(1)

    // Start second download
    await startDownload('https://music.apple.com/us/album/test/123?i=2')
    expect(currentTaskId.value).toBe('task-2')
    expect(logs.value).toHaveLength(0)
  })

  it('prevents starting a download while a task is running', async () => {
    const mock = createMockClient()
    mock.client.download.start = vi.fn().mockResolvedValue({ ok: true, taskId: 'task-1' })
    mock.client.download.getStatus = vi.fn().mockResolvedValue(null)

    const { isRunning, startDownload } = useAmdlDownload({ client: mock.client })

    await startDownload('https://music.apple.com/us/album/test/123?i=1')

    mock.emitProgress({
      taskId: 'task-1',
      url: 'https://music.apple.com/us/album/test/123?i=1',
      state: 'running',
      stage: 'downloading',
      alreadyExists: false,
      message: 'Running',
      error: null,
      startedAt: '2026-09-06T00:00:00Z',
      finishedAt: null,
    })

    expect(isRunning.value).toBe(true)

    // Attempting start while running should return false and not call client.start
    const secondResult = await startDownload('https://music.apple.com/us/album/test/123?i=2')
    expect(secondResult).toBe(false)
    expect(mock.client.download.start).toHaveBeenCalledTimes(1)
  })

  it('allows starting a new download when previous task has settled into terminal state', async () => {
    const mock = createMockClient()
    mock.client.download.start = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, taskId: 'task-1' })
      .mockResolvedValueOnce({ ok: true, taskId: 'task-2' })
    mock.client.download.getStatus = vi.fn().mockResolvedValue(null)

    const { isRunning, startDownload } = useAmdlDownload({ client: mock.client })

    await startDownload('https://music.apple.com/us/album/test/123?i=1')
    mock.emitProgress({
      taskId: 'task-1',
      url: 'https://music.apple.com/us/album/test/123?i=1',
      state: 'completed',
      stage: null,
      alreadyExists: false,
      message: 'Done',
      error: null,
      startedAt: '2026-09-06T00:00:00Z',
      finishedAt: '2026-09-06T00:01:00Z',
    })

    expect(isRunning.value).toBe(false)

    // New start is allowed
    const secondResult = await startDownload('https://music.apple.com/us/album/test/123?i=2')
    expect(secondResult).toBe(true)
    expect(mock.client.download.start).toHaveBeenCalledTimes(2)
  })

  it('sets startError when client.download.start fails or throws', async () => {
    const mock = createMockClient()
    mock.client.download.start = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Invalid Apple Music URL',
    })

    const { startError, startDownload } = useAmdlDownload({ client: mock.client })

    const ok = await startDownload('https://example.com/not-apple')
    expect(ok).toBe(false)
    expect(startError.value).toBe('Invalid Apple Music URL')
  })

  it('cancels the current task via client.download.cancel and does not fake state', async () => {
    const mock = createMockClient()
    mock.client.download.start = vi.fn().mockResolvedValue({ ok: true, taskId: 'task-1' })
    mock.client.download.cancel = vi.fn().mockResolvedValue({ ok: true })
    mock.client.download.getStatus = vi.fn().mockResolvedValue(null)

    const { cancelDownload, currentTask, startDownload } = useAmdlDownload({ client: mock.client })

    await startDownload('https://music.apple.com/us/album/test/123?i=1')
    mock.emitProgress({
      taskId: 'task-1',
      url: 'https://music.apple.com/us/album/test/123?i=1',
      state: 'running',
      stage: 'downloading',
      alreadyExists: false,
      message: 'Downloading',
      error: null,
      startedAt: '2026-09-06T00:00:00Z',
      finishedAt: null,
    })

    const cancelResult = await cancelDownload()
    expect(cancelResult).toBe(true)
    expect(mock.client.download.cancel).toHaveBeenCalledWith('task-1')
    // composable does NOT manually set currentTask.state = 'cancelled'; it relies on event from IPC/Main
    expect(currentTask.value?.state).toBe('running')

    // Then when Main settles cancelled event
    mock.emitProgress({
      taskId: 'task-1',
      url: 'https://music.apple.com/us/album/test/123?i=1',
      state: 'cancelled',
      stage: null,
      alreadyExists: false,
      message: 'Cancelled by user',
      error: null,
      startedAt: '2026-09-06T00:00:00Z',
      finishedAt: '2026-09-06T00:00:05Z',
    })

    expect(currentTask.value?.state).toBe('cancelled')
  })
})
