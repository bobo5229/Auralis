import { describe, expect, it, vi } from 'vitest'
import type { AmdlLogEvent, AmdlSelectionRequest, AmdlTaskProgress } from '@shared/types/amdl'
import type { AuralisApi } from '@shared/ipc/api'
import { useAmdlDownload } from './useAmdlDownload'

function createMockClient() {
  let progressCb: ((progress: AmdlTaskProgress) => void) | null = null
  let logCb: ((log: AmdlLogEvent) => void) | null = null
  let selectionRequestCb: ((request: AmdlSelectionRequest) => void) | null = null

  const unsubProgress = vi.fn()
  const unsubLog = vi.fn()
  const unsubSelectionRequest = vi.fn()

  const client = {
    download: {
      start: vi.fn(),
      cancel: vi.fn(),
      getStatus: vi.fn(),
      submitSelection: vi.fn(),
      onProgress: vi.fn((cb) => {
        progressCb = cb
        return unsubProgress
      }),
      onLog: vi.fn((cb) => {
        logCb = cb
        return unsubLog
      }),
      onSelectionRequest: vi.fn((cb) => {
        selectionRequestCb = cb
        return unsubSelectionRequest
      }),
    },
  } as unknown as AuralisApi

  return {
    client,
    unsubProgress,
    unsubLog,
    unsubSelectionRequest,
    emitProgress: (p: AmdlTaskProgress) => progressCb?.(p),
    emitLog: (l: AmdlLogEvent) => logCb?.(l),
    emitSelectionRequest: (r: AmdlSelectionRequest) => selectionRequestCb?.(r),
  }
}

describe('useAmdlDownload', () => {
  it('subscribes to onProgress, onLog, and onSelectionRequest on initialization, and cleanup unsubscribes', () => {
    const mock = createMockClient()
    const { cleanup } = useAmdlDownload({ client: mock.client })

    expect(mock.client.download.onProgress).toHaveBeenCalledTimes(1)
    expect(mock.client.download.onLog).toHaveBeenCalledTimes(1)
    expect(mock.client.download.onSelectionRequest).toHaveBeenCalledTimes(1)

    cleanup()
    expect(mock.unsubProgress).toHaveBeenCalledTimes(1)
    expect(mock.unsubLog).toHaveBeenCalledTimes(1)
    expect(mock.unsubSelectionRequest).toHaveBeenCalledTimes(1)
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

    const { currentTaskId, currentTask, logs, startDownload } = useAmdlDownload({
      client: mock.client,
    })

    await startDownload('https://music.apple.com/us/album/test/123?i=1')
    mock.emitLog({ taskId: 'task-1', stream: 'stdout', line: 'task 1 log' })
    mock.emitProgress({
      taskId: 'task-1',
      url: 'https://music.apple.com/us/album/test/123?i=1',
      state: 'completed',
      stage: null,
      alreadyExists: false,
      message: 'Completed',
      error: null,
      startedAt: '2026-09-06T00:00:00Z',
      finishedAt: '2026-09-06T00:00:01Z',
    })
    expect(logs.value).toHaveLength(1)
    expect(currentTask.value?.state).toBe('completed')

    // Start second download - should clear old logs and old terminal state
    await startDownload('https://music.apple.com/us/album/test/123?i=2')
    expect(currentTaskId.value).toBe('task-2')
    expect(logs.value).toHaveLength(0)
    expect(currentTask.value).toBeNull()
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

  describe('selection flow (Phase 3A)', () => {
    it('accepts selection request for currentTaskId and exposes it', async () => {
      const mock = createMockClient()
      mock.client.download.start = vi.fn().mockResolvedValue({ ok: true, taskId: 'task-1' })
      mock.client.download.getStatus = vi.fn().mockResolvedValue(null)

      const { currentTaskId, selectionRequest, startDownload } = useAmdlDownload({
        client: mock.client,
      })

      await startDownload('https://music.apple.com/us/album/test/123', 'select')
      expect(currentTaskId.value).toBe('task-1')
      expect(selectionRequest.value).toBeNull()

      const requestPayload: AmdlSelectionRequest = {
        taskId: 'task-1',
        tracks: [
          { index: 1, title: 'Track 1', type: 'song' },
          { index: 2, title: 'Track 2', type: 'song' },
        ],
      }

      mock.emitSelectionRequest(requestPayload)
      expect(selectionRequest.value).toEqual(requestPayload)

      // Irrelevant selection request should be ignored
      mock.emitSelectionRequest({
        taskId: 'task-other',
        tracks: [{ index: 99, title: 'Track Other', type: 'song' }],
      })
      expect(selectionRequest.value).toEqual(requestPayload)
    })

    it('handles race condition: selectionRequest arrives while isStarting=true and mode=select before start resolves', async () => {
      const mock = createMockClient()
      let resolveStart: (value: { ok: boolean; taskId: string }) => void
      const startPromise = new Promise<{ ok: boolean; taskId: string }>((resolve) => {
        resolveStart = resolve
      })
      mock.client.download.start = vi.fn().mockReturnValue(startPromise)
      mock.client.download.getStatus = vi.fn().mockResolvedValue(null)

      const { currentTaskId, selectionRequest, isStarting, startDownload } = useAmdlDownload({
        client: mock.client,
      })

      // Initiate startDownload with 'select'
      const startPromiseCall = startDownload('https://music.apple.com/us/album/test/123', 'select')
      expect(isStarting.value).toBe(true)
      expect(currentTaskId.value).toBeNull()

      // SelectionRequest arrives BEFORE start resolves
      const requestPayload: AmdlSelectionRequest = {
        taskId: 'task-new-race',
        tracks: [
          { index: 1, title: 'Track 1', type: 'song' },
          { index: 2, title: 'Track 2', type: 'song' },
        ],
      }
      mock.emitSelectionRequest(requestPayload)

      // It must be accepted and associate taskId with the new task
      expect(currentTaskId.value).toBe('task-new-race')
      expect(selectionRequest.value).toEqual(requestPayload)

      // Now start resolves
      resolveStart!({ ok: true, taskId: 'task-new-race' })
      const ok = await startPromiseCall
      expect(ok).toBe(true)
      expect(isStarting.value).toBe(false)
      expect(currentTaskId.value).toBe('task-new-race')
      expect(selectionRequest.value).toEqual(requestPayload)
    })

    it('submits selection successfully and sets selectionSubmitted', async () => {
      const mock = createMockClient()
      mock.client.download.start = vi.fn().mockResolvedValue({ ok: true, taskId: 'task-1' })
      mock.client.download.getStatus = vi.fn().mockResolvedValue(null)
      mock.client.download.submitSelection = vi.fn().mockResolvedValue({ ok: true })

      const {
        selectionRequest,
        selectionSubmitted,
        selectionError,
        isSubmittingSelection,
        startDownload,
        submitSelection,
      } = useAmdlDownload({ client: mock.client })

      await startDownload('https://music.apple.com/us/album/test/123', 'select')
      mock.emitSelectionRequest({
        taskId: 'task-1',
        tracks: [{ index: 1, title: 'Track 1', type: 'song' }],
      })

      expect(selectionRequest.value).not.toBeNull()
      expect(selectionSubmitted.value).toBe(false)

      const submitPromise = submitSelection([1])
      expect(isSubmittingSelection.value).toBe(true)

      const ok = await submitPromise
      expect(ok).toBe(true)
      expect(isSubmittingSelection.value).toBe(false)
      expect(selectionSubmitted.value).toBe(true)
      expect(selectionError.value).toBeNull()
      expect(mock.client.download.submitSelection).toHaveBeenCalledWith('task-1', [1])
    })

    it('sets selectionError when submitSelection fails', async () => {
      const mock = createMockClient()
      mock.client.download.start = vi.fn().mockResolvedValue({ ok: true, taskId: 'task-1' })
      mock.client.download.getStatus = vi.fn().mockResolvedValue(null)
      mock.client.download.submitSelection = vi.fn().mockResolvedValue({
        ok: false,
        error: 'AMDL process terminated before selection received',
      })

      const { selectionError, startDownload, submitSelection } = useAmdlDownload({
        client: mock.client,
      })

      await startDownload('https://music.apple.com/us/album/test/123', 'select')
      const ok = await submitSelection([1, 2])
      expect(ok).toBe(false)
      expect(selectionError.value).toBe('AMDL process terminated before selection received')
    })

    it('clears selection state when progress moves past selecting or task reaches terminal state', async () => {
      const mock = createMockClient()
      mock.client.download.start = vi.fn().mockResolvedValue({ ok: true, taskId: 'task-1' })
      mock.client.download.getStatus = vi.fn().mockResolvedValue(null)

      const { selectionRequest, startDownload } = useAmdlDownload({ client: mock.client })

      await startDownload('https://music.apple.com/us/album/test/123', 'select')
      mock.emitProgress({
        taskId: 'task-1',
        url: 'https://music.apple.com/us/album/test/123',
        state: 'running',
        stage: 'selecting',
        alreadyExists: false,
        message: 'Waiting for selection',
        error: null,
        startedAt: '2026-09-06T00:00:00Z',
        finishedAt: null,
      })

      mock.emitSelectionRequest({
        taskId: 'task-1',
        tracks: [{ index: 1, title: 'Track 1', type: 'song' }],
      })
      expect(selectionRequest.value).not.toBeNull()

      // Progress moves stage to downloading -> selection state cleared
      mock.emitProgress({
        taskId: 'task-1',
        url: 'https://music.apple.com/us/album/test/123',
        state: 'running',
        stage: 'downloading',
        alreadyExists: false,
        message: 'Downloading selected track',
        error: null,
        startedAt: '2026-09-06T00:00:00Z',
        finishedAt: null,
      })
      expect(selectionRequest.value).toBeNull()

      // Simulate a terminal state clearing selection state as well
      mock.emitSelectionRequest({
        taskId: 'task-1',
        tracks: [{ index: 1, title: 'Track 1', type: 'song' }],
      })
      expect(selectionRequest.value).not.toBeNull()

      mock.emitProgress({
        taskId: 'task-1',
        url: 'https://music.apple.com/us/album/test/123',
        state: 'failed',
        stage: null,
        alreadyExists: false,
        message: 'Failed',
        error: 'Some error',
        startedAt: '2026-09-06T00:00:00Z',
        finishedAt: '2026-09-06T00:01:00Z',
      })
      expect(selectionRequest.value).toBeNull()
    })
  })
})
