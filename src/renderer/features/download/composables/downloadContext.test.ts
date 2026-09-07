import { describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick, ref, type Component } from 'vue'
import { provideAmdlDownload, useProvidedAmdlDownload } from './downloadContext'
import type { useAmdlDownload } from './useAmdlDownload'

type AmdlDownloadContext = ReturnType<typeof useAmdlDownload>

function createValueHolder<T>() {
  let value: T | undefined
  return {
    set(v: T) {
      value = v
    },
    get(): T {
      if (value === undefined) {
        throw new Error('Expected value to be set in holder')
      }
      return value
    },
  }
}

function createTestApp(rootComponent: Component) {
  const { createApp } = createRenderer({
    patchProp: () => {},
    insert: () => {},
    remove: () => {},
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText: () => {},
    setElementText: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  const app = createApp(rootComponent)
  app.mount({})
  return app
}

describe('downloadContext', () => {
  it('throws error when useProvidedAmdlDownload is called outside provider', () => {
    const Child = defineComponent({
      setup() {
        useProvidedAmdlDownload()
        return () => null
      },
    })

    expect(() => createTestApp(Child)).toThrow(
      'useProvidedAmdlDownload must be used within a provideAmdlDownload scope',
    )
  })

  it('provides and injects download instance down the component tree', () => {
    const injected = createValueHolder<AmdlDownloadContext>()

    const Child = defineComponent({
      setup() {
        injected.set(useProvidedAmdlDownload())
        return () => null
      },
    })

    const Parent = defineComponent({
      setup() {
        const download = provideAmdlDownload({
          client: {
            download: {
              start: async () => ({ ok: true, taskId: 't-1' }),
              cancel: async () => ({ ok: true }),
              getStatus: async () => null,
              submitSelection: async () => ({ ok: true }),
              onProgress: () => () => {},
              onLog: () => () => {},
              onSelectionRequest: () => () => {},
            },
          } as any,
        })
        return { download }
      },
      render() {
        return h(Child)
      },
    })

    createTestApp(Parent)

    const download = injected.get()
    expect(download.currentTaskId.value).toBeNull()
    expect(typeof download.startDownload).toBe('function')
  })

  it('preserves state when child components unmount and remount (app session lifetime)', async () => {
    const injectedFirst = createValueHolder<AmdlDownloadContext>()
    const injectedSecond = createValueHolder<AmdlDownloadContext>()

    const Child1 = defineComponent({
      setup() {
        injectedFirst.set(useProvidedAmdlDownload())
        return () => null
      },
    })

    const Child2 = defineComponent({
      setup() {
        injectedSecond.set(useProvidedAmdlDownload())
        return () => null
      },
    })

    const showFirst = ref(true)

    const Parent = defineComponent({
      setup() {
        provideAmdlDownload({
          client: {
            download: {
              start: async () => ({ ok: true, taskId: 't-2' }),
              cancel: async () => ({ ok: true }),
              getStatus: async () => null,
              submitSelection: async () => ({ ok: true }),
              onProgress: () => () => {},
              onLog: () => () => {},
              onSelectionRequest: () => () => {},
            },
          } as any,
        })
        return () => (showFirst.value ? h(Child1) : h(Child2))
      },
    })

    createTestApp(Parent)

    const first = injectedFirst.get()
    // 在页面 1 启动下载任务
    await first.startDownload('https://music.apple.com/album/1')
    expect(first.currentTaskId.value).toBe('t-2')

    // 路由切换离开（Child1 卸载，Child2 挂载）
    showFirst.value = false
    await nextTick()

    // 重新进入页面，从 context 注入的仍是同一个全局 session 实例，状态完整保留
    const second = injectedSecond.get()
    expect(second).toBe(first)
    expect(second.currentTaskId.value).toBe('t-2')
  })

  it('supports restarting a new task after terminal state (completed, failed, cancelled)', async () => {
    const injected = createValueHolder<AmdlDownloadContext>()

    const Child = defineComponent({
      setup() {
        injected.set(useProvidedAmdlDownload())
        return () => null
      },
    })

    let currentMockId = 't-first'
    const startMock = vi.fn().mockImplementation(async () => ({ ok: true, taskId: currentMockId }))

    const progressHolder = createValueHolder<(p: any) => void>()
    const Parent = defineComponent({
      setup() {
        provideAmdlDownload({
          client: {
            download: {
              start: startMock,
              cancel: async () => ({ ok: true }),
              getStatus: async () => null,
              submitSelection: async () => ({ ok: true }),
              onProgress: (cb: any) => {
                progressHolder.set(cb)
                return () => {}
              },
              onLog: () => () => {},
              onSelectionRequest: () => () => {},
            },
          } as any,
        })
        return () => h(Child)
      },
    })

    createTestApp(Parent)

    const download = injected.get()

    // Task 1: start and complete
    await download.startDownload('https://music.apple.com/album/1', 'direct')
    expect(download.currentTaskId.value).toBe('t-first')

    // Simulate progress settling into terminal state 'completed'
    const emitProgress = progressHolder.get()
    emitProgress({
      taskId: 't-first',
      url: 'https://music.apple.com/album/1',
      state: 'completed',
      stage: null,
      alreadyExists: false,
      message: 'Download complete',
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    })

    expect(download.currentTask.value?.state).toBe('completed')
    expect(download.isRunning.value).toBe(false)

    // Task 2: start new download after terminal
    currentMockId = 't-second'
    const ok = await download.startDownload('https://music.apple.com/album/2', 'select')
    expect(ok).toBe(true)
    expect(download.currentTaskId.value).toBe('t-second')
    expect(startMock).toHaveBeenCalledWith('https://music.apple.com/album/2', 'select')
  })

  it('preserves selected track indexes across component unmount and remount', async () => {
    const injectedFirst = createValueHolder<AmdlDownloadContext>()
    const injectedSecond = createValueHolder<AmdlDownloadContext>()

    const Child1 = defineComponent({
      setup() {
        injectedFirst.set(useProvidedAmdlDownload())
        return () => null
      },
    })

    const Child2 = defineComponent({
      setup() {
        injectedSecond.set(useProvidedAmdlDownload())
        return () => null
      },
    })

    const showFirst = ref(true)
    const selectionRequestHolder = createValueHolder<(req: any) => void>()

    const Parent = defineComponent({
      setup() {
        provideAmdlDownload({
          client: {
            download: {
              start: async () => ({ ok: true, taskId: 't-sel' }),
              cancel: async () => ({ ok: true }),
              getStatus: async () => null,
              submitSelection: async () => ({ ok: true }),
              onProgress: () => () => {},
              onLog: () => () => {},
              onSelectionRequest: (cb: any) => {
                selectionRequestHolder.set(cb)
                return () => {}
              },
            },
          } as any,
        })
        return () => (showFirst.value ? h(Child1) : h(Child2))
      },
    })

    createTestApp(Parent)
    const first = injectedFirst.get()

    // Start select download
    await first.startDownload('https://music.apple.com/album/sel', 'select')
    const emitSelection = selectionRequestHolder.get()
    emitSelection({
      taskId: 't-sel',
      tracks: [
        { index: 1, title: 'Track 1', type: 'song' },
        { index: 2, title: 'Track 2', type: 'song' },
        { index: 3, title: 'Track 3', type: 'song' },
      ],
    })

    // User selects tracks 1 and 3 in Child1 (e.g. /download)
    first.toggleTrack(1)
    first.toggleTrack(3)
    expect(first.selectedTrackIndexes.value).toEqual([1, 3])

    // Route changes: Child1 unmounts, Child2 mounts (e.g. /albums -> /download)
    showFirst.value = false
    await nextTick()

    // Returned to download page: Child2 has access to the exact same selections
    const second = injectedSecond.get()
    expect(second.selectedTrackIndexes.value).toEqual([1, 3])
    expect(second.isTrackSelected(1)).toBe(true)
    expect(second.isTrackSelected(2)).toBe(false)
    expect(second.isTrackSelected(3)).toBe(true)
  })
})
