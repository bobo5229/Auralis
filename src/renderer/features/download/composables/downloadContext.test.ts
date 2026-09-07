import { describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue'
import { provideAmdlDownload, useProvidedAmdlDownload } from './downloadContext'
import { useAmdlDownload } from './useAmdlDownload'

function createTestApp(rootComponent: Parameters<typeof createApp>[0]) {
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
    let injected: ReturnType<typeof useAmdlDownload> | null = null

    const Child = defineComponent({
      setup() {
        injected = useProvidedAmdlDownload()
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

    expect(injected).not.toBeNull()
    expect(injected?.currentTaskId.value).toBeNull()
    expect(typeof injected?.startDownload).toBe('function')
  })

  it('preserves state when child components unmount and remount (app session lifetime)', async () => {
    let injectedFirst: ReturnType<typeof useAmdlDownload> | null = null
    let injectedSecond: ReturnType<typeof useAmdlDownload> | null = null

    const Child1 = defineComponent({
      setup() {
        injectedFirst = useProvidedAmdlDownload()
        return () => null
      },
    })

    const Child2 = defineComponent({
      setup() {
        injectedSecond = useProvidedAmdlDownload()
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
    expect(injectedFirst).not.toBeNull()

    // 在页面 1 启动下载任务
    await injectedFirst?.startDownload('https://music.apple.com/album/1')
    expect(injectedFirst?.currentTaskId.value).toBe('t-2')

    // 路由切换离开（Child1 卸载，Child2 挂载）
    showFirst.value = false
    await nextTick()

    // 重新进入页面，从 context 注入的仍是同一个全局 session 实例，状态完整保留
    expect(injectedSecond).toBe(injectedFirst)
    expect(injectedSecond?.currentTaskId.value).toBe('t-2')
  })

  it('supports restarting a new task after terminal state (completed, failed, cancelled)', async () => {
    let injected: ReturnType<typeof useAmdlDownload> | null = null

    const Child = defineComponent({
      setup() {
        injected = useProvidedAmdlDownload()
        return () => null
      },
    })

    let currentMockId = 't-first'
    const startMock = vi.fn().mockImplementation(async () => ({ ok: true, taskId: currentMockId }))

    let progressCb: ((p: any) => void) | null = null
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
                progressCb = cb
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

    // Task 1: start and complete
    await injected!.startDownload('https://music.apple.com/album/1', 'direct')
    expect(injected!.currentTaskId.value).toBe('t-first')

    // Simulate progress settling into terminal state 'completed'
    progressCb?.({
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

    expect(injected!.currentTask.value?.state).toBe('completed')
    expect(injected!.isRunning.value).toBe(false)

    // Task 2: start new download after terminal
    currentMockId = 't-second'
    const ok = await injected!.startDownload('https://music.apple.com/album/2', 'select')
    expect(ok).toBe(true)
    expect(injected!.currentTaskId.value).toBe('t-second')
    expect(startMock).toHaveBeenCalledWith('https://music.apple.com/album/2', 'select')
  })
})
