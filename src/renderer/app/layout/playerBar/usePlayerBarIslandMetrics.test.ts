import { describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, nextTick, ref, type Ref } from 'vue'
import { readIslandInlineSize, usePlayerBarIslandMetrics } from './usePlayerBarIslandMetrics'

class FakeResizeObserver {
  callback: ResizeObserverCallback
  observed: Element[] = []
  disconnected = false

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(element: Element): void {
    this.observed.push(element)
  }

  disconnect(): void {
    this.disconnected = true
    this.observed = []
  }

  trigger(width: number): void {
    if (this.disconnected) return
    this.callback(
      [
        {
          borderBoxSize: [{ inlineSize: width, blockSize: 72 }],
          contentRect: { width } as DOMRectReadOnly,
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    )
  }
}

function mountMetrics(options: {
  island: HTMLElement
  host: HTMLElement
  enabled: Ref<boolean>
  onIslandSizeChange: () => void
}) {
  const holder: { current: ReturnType<typeof usePlayerBarIslandMetrics> | null } = {
    current: null,
  }
  const { createApp } = createRenderer({
    patchProp: () => undefined,
    insert: () => undefined,
    remove: () => undefined,
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText: () => undefined,
    setElementText: () => undefined,
    parentNode: () => null,
    nextSibling: () => null,
  })
  const app = createApp(
    defineComponent({
      setup() {
        holder.current = usePlayerBarIslandMetrics({
          islandRef: ref(options.island),
          hostRef: ref(options.host),
          enabled: options.enabled,
          onIslandSizeChange: options.onIslandSizeChange,
        })
        return () => null
      },
    }),
  )
  app.mount({})
  return { app, metrics: holder.current! }
}

describe('readIslandInlineSize', () => {
  it('prefers border-box inline size, then content rect, then fallback', () => {
    expect(
      readIslandInlineSize(
        {
          borderBoxSize: [{ inlineSize: 640, blockSize: 72 } as ResizeObserverSize],
          contentRect: { width: 600 } as DOMRectReadOnly,
        },
        920,
      ),
    ).toBe(640)
    expect(
      readIslandInlineSize(
        { borderBoxSize: [], contentRect: { width: 600 } as DOMRectReadOnly },
        920,
      ),
    ).toBe(600)
    expect(readIslandInlineSize(undefined, 920)).toBe(920)
  })
})

describe('usePlayerBarIslandMetrics', () => {
  it('binds a ResizeObserver while enabled and reports island size changes', async () => {
    const observers: FakeResizeObserver[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          const observer = new FakeResizeObserver(callback)
          observers.push(observer)
          return observer
        }
      },
    )

    const island = {
      clientWidth: 920,
      getBoundingClientRect: () => ({ width: 880 }),
    } as unknown as HTMLElement
    const host = {
      getBoundingClientRect: () => ({ width: 1100 }),
    } as unknown as HTMLElement
    const enabled = ref<boolean>(true)
    const onIslandSizeChange = vi.fn()
    const { app, metrics } = mountMetrics({
      island,
      host,
      enabled,
      onIslandSizeChange,
    })

    expect(metrics.islandInlineSize.value).toBe(880)
    expect(metrics.measureHostInlineSize()).toBe(1100)
    expect(onIslandSizeChange).toHaveBeenCalledTimes(1)

    observers[0]?.trigger(640)
    expect(metrics.islandInlineSize.value).toBe(640)
    expect(onIslandSizeChange).toHaveBeenCalledTimes(2)

    enabled.value = false
    await nextTick()
    expect(observers[0]?.observed).toEqual([])

    observers[0]?.trigger(500)
    expect(metrics.islandInlineSize.value).toBe(640)

    app.unmount()
    vi.unstubAllGlobals()
  })
})
