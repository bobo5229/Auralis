import { describe, expect, it, vi } from 'vitest'
import { CoverPipeline } from './coverPipeline'

class MockHTMLCanvasElement {
  width = 0
  height = 0
  getContext() {
    const contextMethods: Record<string, unknown> = {
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(96 * 96 * 4),
      })),
    }
    return new Proxy(contextMethods, {
      get(target, prop) {
        if (typeof prop === 'symbol') return undefined
        if (prop in target) return target[prop as string]
        return vi.fn()
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value)
        return true
      },
    })
  }
}

if (typeof HTMLCanvasElement === 'undefined') {
  ;(globalThis as Record<string, unknown>).HTMLCanvasElement = MockHTMLCanvasElement
}
if (typeof document === 'undefined') {
  ;(globalThis as Record<string, unknown>).document = {
    createElement(tag: string) {
      if (tag === 'canvas') return new MockHTMLCanvasElement()
      return {}
    },
  }
}

describe('CoverPipeline', () => {
  it('settles and detaches an image request on disposal', async () => {
    class HangingImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      src = ''
    }
    vi.stubGlobal('Image', HangingImage)
    const pipeline = new CoverPipeline()
    const request = pipeline.getCover('hanging-art', 1)
    pipeline.dispose()
    expect((await request).width).toBe(96)
    vi.unstubAllGlobals()
  })

  it('terminates a failed worker and settles subsequent covers instead of hanging', async () => {
    class LoadedImage {
      naturalWidth = 200
      naturalHeight = 200
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(value: string) {
        if (value) queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', LoadedImage)
    const worker = { terminate: vi.fn(), onerror: null, postMessage: vi.fn() } as unknown as Worker
    const pipeline = new CoverPipeline({ workerFactory: () => worker })
    const pending = pipeline.getCover('failed-worker-1', 1)
    await Promise.resolve()
    await Promise.resolve()
    expect(worker.postMessage).toHaveBeenCalledOnce()
    worker.onerror?.({ message: 'Worker died' } as ErrorEvent)
    expect((await pending).width).toBe(96)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect((await pipeline.getCover('failed-worker-2', 2)).width).toBe(96)
    pipeline.dispose()
    vi.unstubAllGlobals()
  })
  it('falls back to placeholder when cache key is null', async () => {
    const pipeline = new CoverPipeline()
    const canvas = await pipeline.getCover(null, 1, 'Test Album')
    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(canvas.width).toBe(96)
    expect(canvas.height).toBe(96)
    pipeline.dispose()
  })

  it('deduplicates in-flight requests for the same cache key', async () => {
    const mockWorkerPostMessage = vi.fn()
    const mockWorker = {
      postMessage: mockWorkerPostMessage,
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Worker

    const pipeline = new CoverPipeline({ workerFactory: () => mockWorker })

    // Stub Image
    const originalImage = globalThis.Image
    class MockImage {
      naturalWidth = 200
      naturalHeight = 200
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 5)
      }
    }
    // @ts-expect-error test mock
    globalThis.Image = MockImage

    try {
      const p1 = pipeline.getCover('art-key-1', 1)
      const p2 = pipeline.getCover('art-key-1', 1)

      expect(p1).toBe(p2)
    } finally {
      globalThis.Image = originalImage
      pipeline.dispose()
    }
  })

  it('bounds LRU cache to 24 items', async () => {
    class LoadedImage {
      naturalWidth = 200
      naturalHeight = 200
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(value: string) {
        if (value) queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', LoadedImage)
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(public data: Uint8ClampedArray) {}
      },
    )
    const worker = {
      terminate: vi.fn(),
      onmessage: null,
      postMessage: vi.fn(),
    } as unknown as Worker
    vi.mocked(worker.postMessage).mockImplementation((message) => {
      queueMicrotask(() =>
        worker.onmessage?.({
          data: { taskId: message.taskId, pixels: new ArrayBuffer(96 * 96 * 4) },
        } as MessageEvent),
      )
    })
    const pipeline = new CoverPipeline({ workerFactory: () => worker })
    try {
      for (let i = 0; i < 25; i++) await pipeline.getCover(`key-${i}`, 1)
      expect(worker.postMessage).toHaveBeenCalledTimes(25)
      await pipeline.getCover('key-24', 2)
      expect(worker.postMessage).toHaveBeenCalledTimes(25)
      await pipeline.getCover('key-0', 2)
      expect(worker.postMessage).toHaveBeenCalledTimes(26)
    } finally {
      pipeline.dispose()
      vi.unstubAllGlobals()
    }
  })

  it('handles image loading failure by returning placeholder canvas', async () => {
    const pipeline = new CoverPipeline()

    const originalImage = globalThis.Image
    class FailingImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_val: string) {
        setTimeout(() => this.onerror?.(), 5)
      }
    }
    // @ts-expect-error test mock
    globalThis.Image = FailingImage

    try {
      const canvas = await pipeline.getCover('non-existent-art', 1)
      expect(canvas).toBeInstanceOf(HTMLCanvasElement)
      expect(canvas.width).toBe(96)
      expect(canvas.height).toBe(96)
    } finally {
      globalThis.Image = originalImage
      pipeline.dispose()
    }
  })

  it('cleans up in-flight requests, cache, and worker on dispose', async () => {
    const mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker

    const pipeline = new CoverPipeline({ workerFactory: () => mockWorker })
    const canvas = pipeline.createPlaceholderCanvas('Test')
    // @ts-expect-error private access
    pipeline.recordToCache('cached-key', canvas)

    pipeline.dispose()

    expect(mockWorker.terminate).toHaveBeenCalled()
    // @ts-expect-error private access
    expect(pipeline.lruCache.size).toBe(0)
    // @ts-expect-error private access
    expect(pipeline.inFlight.size).toBe(0)
  })
})
