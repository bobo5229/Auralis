import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PressureRequest, PressureResponse } from './badgePressurePreparation'

class PressureWorker {
  static instances: PressureWorker[] = []
  onmessage: ((event: MessageEvent<PressureResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage = vi.fn<(data: PressureRequest, transfer: Transferable[]) => void>()
  terminate = vi.fn()
  constructor() {
    PressureWorker.instances.push(this)
  }
  reply(data: PressureResponse) {
    this.onmessage?.({ data } as MessageEvent<PressureResponse>)
  }
}
const controllers: AbortController[] = []
let resized: () => void
let context: { putImageData: ReturnType<typeof vi.fn>; getImageData: ReturnType<typeof vi.fn> }
let removed: ReturnType<typeof vi.fn>
let bitmap: { close: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.resetModules()
  PressureWorker.instances = []
  bitmap = { close: vi.fn() }
  context = { putImageData: vi.fn(), getImageData: vi.fn() }
  removed = vi.fn()
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    createElement: vi.fn(() => ({
      dataset: {},
      setAttribute: vi.fn(),
      getContext: () => context,
      remove: removed,
    })),
  })
  const query = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('document', document)
  vi.stubGlobal('window', Object.assign(new EventTarget(), { matchMedia: () => query }))
  vi.stubGlobal('matchMedia', () => query)
  vi.stubGlobal('devicePixelRatio', 1.5)
  vi.stubGlobal('Worker', PressureWorker)
  vi.stubGlobal(
    'Image',
    class {
      decode = () => Promise.resolve()
    },
  )
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  )
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback
      }
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
})
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.abort())
  vi.unstubAllGlobals()
})
async function setup() {
  const controller = new AbortController()
  controllers.push(controller)
  const sheet = {
    clientWidth: 900,
    clientHeight: 800,
    prepend: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  }
  const image = { offsetLeft: 0, offsetTop: 0, offsetWidth: 184 }
  const box = { left: 44, top: 40 }
  const button = {
    offsetWidth: 184,
    offsetHeight: 208,
    getBoundingClientRect: () => box,
    querySelector: () => image,
    getAttribute: () => 'false',
  }
  const row = { querySelector: () => button }
  const { createPressureSurface } = await import('./badgePressureSurface')
  const surface = await createPressureSurface(
    sheet as unknown as HTMLElement,
    row as unknown as HTMLElement,
    controller.signal,
  )
  const badges = [{ id: 'one', contour: 'M0 0H330V370H0Z' }]
  surface.setBadges(badges)
  return {
    surface,
    controller,
    sheet,
    box,
    image,
    badges,
    worker: PressureWorker.instances.at(-1)!,
  }
}
const patch = () => ({ left: 0, top: 0, width: 2, height: 2, pixels: new Uint8ClampedArray(16) })

describe('pressure surface preparation', () => {
  it('deduplicates initial resize and identical entries without preparing pixels on the main thread', async () => {
    const t = await setup()
    resized()
    t.surface.setBadges(t.badges)
    expect(t.worker.postMessage).toHaveBeenCalledOnce()
    expect(context.getImageData).not.toHaveBeenCalled()
    expect(t.surface.snapshot().rebuilds).toBe(1)
  })
  it('invalidates layout for moved slots and shape data for resolution changes', async () => {
    const t = await setup()
    const first = t.worker.postMessage.mock.calls[0][0]
    t.box.top += 250
    resized()
    const moved = t.worker.postMessage.mock.calls[1][0]
    expect(moved.type).toBe('reset')
    if (first.type !== 'reset' || moved.type !== 'reset') throw new Error('Expected reset')
    expect(moved.configuration.fields[0].key).toBe(first.configuration.fields[0].key)
    expect(moved.configuration.fields[0].y).not.toBe(first.configuration.fields[0].y)
    vi.stubGlobal('devicePixelRatio', 1)
    resized()
    const scaled = t.worker.postMessage.mock.calls[2][0]
    if (scaled.type !== 'reset') throw new Error('Expected reset')
    expect(scaled.configuration.fields[0].key).not.toBe(first.configuration.fields[0].key)
  })
  it('waits for the current committed generation and ignores replies after cancellation', async () => {
    const t = await setup(),
      ready = vi.fn()
    void t.surface.ready.then(ready)
    t.box.top += 250
    resized()
    t.worker.reply({ generation: 1, patch: patch(), computeMs: 1 })
    await Promise.resolve()
    expect(ready).not.toHaveBeenCalled()
    expect(context.putImageData).not.toHaveBeenCalled()
    t.worker.reply({ generation: 2, patch: patch(), computeMs: 1 })
    await t.surface.ready
    expect(context.putImageData).toHaveBeenCalledOnce()
    t.controller.abort()
    expect(t.worker.terminate).toHaveBeenCalledOnce()
    t.worker.reply({ generation: 2, patch: patch(), computeMs: 1 })
    expect(context.putImageData).toHaveBeenCalledOnce()
    expect(removed).toHaveBeenCalledOnce()
  })
  it('reuses immutable worker-produced shapes across panel lifetimes', async () => {
    const t = await setup()
    const request = t.worker.postMessage.mock.calls[0][0]
    if (request.type !== 'reset') throw new Error('Expected reset')
    const shape = {
      envelope: new Float32Array([1]),
      gx: new Float32Array([0]),
      gy: new Float32Array([0]),
    }
    t.worker.reply({
      generation: 1,
      patch: patch(),
      computeMs: 1,
      shapes: [{ key: request.configuration.fields[0].key, shape }],
    })
    t.controller.abort()
    const reopened = await setup()
    const next = reopened.worker.postMessage.mock.calls[0]
    if (next[0].type !== 'reset') throw new Error('Expected reset')
    expect(next[0].configuration.fields[0].shape).toBe(shape)
    expect(next[1]).not.toContain(shape.envelope.buffer)
    expect(reopened.surface.snapshot().cacheHits).toBe(1)
  })
  it('closes a bitmap that finishes after the panel has been cancelled', async () => {
    let release!: (value: typeof bitmap) => void
    vi.stubGlobal(
      'createImageBitmap',
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const controller = new AbortController()
    const { createPressureSurface } = await import('./badgePressureSurface')
    const pending = createPressureSurface({} as HTMLElement, {} as HTMLElement, controller.signal)
    await Promise.resolve()
    controller.abort()
    release(bitmap)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(PressureWorker.instances).toHaveLength(0)
  })
})
