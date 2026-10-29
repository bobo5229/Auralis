import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeasonMesh } from './seasonMesh'
import type { SeasonMeshResponse } from './seasonMeshProtocol'
import { createSeasonMeshSession } from './seasonMeshSession'

const warmup = vi.hoisted(() => ({ take: vi.fn() }))
vi.mock('./seasonMeshWarmup', () => ({ takeSeasonMeshWarmup: warmup.take }))

class MeshWorker {
  static instances: MeshWorker[] = []
  onmessage: ((event: MessageEvent<SeasonMeshResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() {
    MeshWorker.instances.push(this)
  }
  reply(data: SeasonMeshResponse) {
    this.onmessage?.({ data } as MessageEvent<SeasonMeshResponse>)
  }
}

beforeEach(() => {
  MeshWorker.instances = []
  warmup.take.mockReset()
  vi.stubGlobal('Worker', MeshWorker)
  vi.stubGlobal('devicePixelRatio', 1.5)
  vi.stubGlobal(
    'getComputedStyle',
    vi.fn(() => ({ getPropertyValue: () => 'rgb(18 18 18 / 12%)' })),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function setup(session = createSeasonMeshSession(), prepared = false) {
  const host = {
    clientWidth: 900,
    clientHeight: 180,
  } as HTMLElement
  const offscreen = {} as OffscreenCanvas
  const getContext = vi.fn()
  const canvas = {
    transferControlToOffscreen: vi.fn(() => offscreen),
    getContext,
    remove: vi.fn(),
  } as unknown as HTMLCanvasElement
  const surface = { append: vi.fn() } as unknown as HTMLElement
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
  if (prepared) warmup.take.mockReturnValue({ canvas, worker: new MeshWorker() })
  const ready = vi.fn()
  const error = vi.fn()
  const runtime = createSeasonMesh(host, surface, ready, error, session)
  return {
    runtime,
    offscreen,
    getContext,
    ready,
    error,
    session,
    surface,
    canvas,
    worker: MeshWorker.instances[0],
  }
}

function frame(elapsed = 4.25) {
  return {
    type: 'snapshot' as const,
    bitmap: { close: vi.fn(), width: 900, height: 180 } as unknown as ImageBitmap,
    elapsed,
  }
}

describe('season mesh worker ownership', () => {
  it('adopts a paused surface and waits for its correctly sized first frame', () => {
    const t = setup(createSeasonMeshSession(), true)
    expect(MeshWorker.instances).toHaveLength(1)
    expect(t.canvas.transferControlToOffscreen).not.toHaveBeenCalled()
    expect(t.surface.append).not.toHaveBeenCalled()
    expect(t.worker.postMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'attach',
        layout: { width: 900, height: 180, pixelRatio: 1.25 },
      }),
    )
    t.worker.reply({ type: 'warmed' })
    expect(t.runtime.isReady()).toBe(false)
    t.worker.reply({ type: 'ready' })
    expect(t.surface.append).toHaveBeenCalledExactlyOnceWith(t.canvas)
    expect(t.ready).toHaveBeenCalledOnce()
    t.runtime.dispose()
    t.worker.reply(frame())
    expect(t.canvas.remove).toHaveBeenCalledOnce()
    expect(t.worker.terminate).toHaveBeenCalledOnce()
  })

  it('transfers the canvas and waits for the first frame without creating a main-thread context', () => {
    const t = setup()
    expect(t.getContext).not.toHaveBeenCalled()
    expect(t.worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'init', canvas: t.offscreen }),
      [t.offscreen],
    )
    expect(t.runtime.isReady()).toBe(false)
    expect(t.ready).not.toHaveBeenCalled()
    t.worker.reply({ type: 'ready' })
    expect(t.runtime.isReady()).toBe(true)
    expect(t.ready).toHaveBeenCalledOnce()
    t.runtime.dispose()
    t.worker.reply(frame())
  })

  it('reads theme colors only initially and when appearance changes', () => {
    const t = setup()
    expect(getComputedStyle).toHaveBeenCalledTimes(1)
    t.runtime.setPlaying(true)
    t.runtime.resize()
    t.runtime.setPlaying(false)
    expect(getComputedStyle).toHaveBeenCalledTimes(1)
    vi.mocked(getComputedStyle).mockReturnValue({
      getPropertyValue: () => 'rgb(255 255 255 / 4%)',
    } as unknown as CSSStyleDeclaration)
    t.runtime.refreshAppearance()
    expect(getComputedStyle).toHaveBeenCalledTimes(2)
    expect(t.worker.postMessage).toHaveBeenLastCalledWith({
      type: 'appearance',
      wash: [1, 1, 1, 0.04],
    })
    t.runtime.dispose()
  })

  it('terminates initialization on leave and ignores late readiness', () => {
    const t = setup()
    const late = t.worker.onmessage!
    t.runtime.dispose()
    t.runtime.dispose()
    late({ data: { type: 'ready' } } as MessageEvent<SeasonMeshResponse>)
    t.worker.postMessage.mockClear()
    t.runtime.setPlaying(true)
    t.runtime.resize()
    t.runtime.refreshAppearance()
    expect(t.worker.terminate).toHaveBeenCalledOnce()
    expect(t.worker.postMessage).not.toHaveBeenCalled()
    expect(t.ready).not.toHaveBeenCalled()
    expect(t.runtime.isReady()).toBe(false)
  })

  it('terminates a failed worker so its animation cannot continue behind static artwork', () => {
    const t = setup()
    t.runtime.setPlaying(true)
    t.worker.reply({ type: 'error', message: 'context lost' })
    expect(t.worker.terminate).toHaveBeenCalledOnce()
    expect(t.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'context lost' }))
    expect(t.runtime.isReady()).toBe(false)
    expect(t.worker.onmessage).toBe(null)
  })

  it('caches the final frame and its exact time before terminating a ready worker', async () => {
    const t = setup()
    t.worker.reply({ type: 'ready' })
    t.runtime.dispose()
    t.runtime.dispose()
    expect(t.worker.postMessage).toHaveBeenLastCalledWith({ type: 'snapshot' })
    expect(t.worker.terminate).not.toHaveBeenCalled()
    const captured = t.session.whenCaptured()
    const snapshot = frame()
    t.worker.reply(snapshot)
    await captured
    expect(t.session.read()).toMatchObject({
      bitmap: snapshot.bitmap,
      elapsed: 4.25,
      appearance: 'rgb(18 18 18 / 12%)',
    })
    expect(t.worker.terminate).toHaveBeenCalledOnce()
    expect(t.error).not.toHaveBeenCalled()
  })

  it('restores animation time without including time spent off the page', () => {
    const session = createSeasonMeshSession()
    session.save(session.begin(), { ...frame(12), appearance: 'rgb(18 18 18 / 12%)' })
    const t = setup(session)
    expect(t.worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'init', elapsed: 12 }),
      [t.offscreen],
    )
    t.runtime.dispose()
  })

  it('bounds snapshot shutdown and releases a bitmap arriving after the deadline', async () => {
    vi.useFakeTimers()
    const t = setup()
    t.worker.reply({ type: 'ready' })
    const late = t.worker.onmessage!
    t.runtime.dispose()
    const captured = t.session.whenCaptured()
    vi.advanceTimersByTime(250)
    await captured
    expect(t.worker.terminate).toHaveBeenCalledOnce()
    expect(t.session.read()).toBeUndefined()
    const snapshot = frame()
    late({ data: snapshot } as MessageEvent<SeasonMeshResponse>)
    expect(snapshot.bitmap.close).toHaveBeenCalledOnce()
    expect(t.session.read()).toBeUndefined()
  })

  it('releases a worker that fails during capture without replacing the cached frame', async () => {
    const t = setup()
    t.worker.reply({ type: 'ready' })
    t.runtime.dispose()
    const captured = t.session.whenCaptured()
    t.worker.reply({ type: 'error', message: 'capture failed' })
    await captured
    expect(t.worker.terminate).toHaveBeenCalledOnce()
    expect(t.error).not.toHaveBeenCalled()
  })
})
