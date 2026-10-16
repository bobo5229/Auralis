import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeasonMesh } from './seasonMesh'
import type { SeasonMeshResponse } from './seasonMeshProtocol'

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
  vi.stubGlobal('Worker', MeshWorker)
  vi.stubGlobal('devicePixelRatio', 1.5)
  vi.stubGlobal(
    'getComputedStyle',
    vi.fn(() => ({ getPropertyValue: () => 'rgb(18 18 18 / 12%)' })),
  )
})
afterEach(() => vi.unstubAllGlobals())

function setup() {
  const host = {
    clientWidth: 900,
    clientHeight: 180,
  } as HTMLElement
  const offscreen = {} as OffscreenCanvas
  const getContext = vi.fn()
  const canvas = {
    transferControlToOffscreen: vi.fn(() => offscreen),
    getContext,
  } as unknown as HTMLCanvasElement
  const ready = vi.fn()
  const error = vi.fn()
  const runtime = createSeasonMesh(host, canvas, ready, error)
  return { runtime, offscreen, getContext, ready, error, worker: MeshWorker.instances[0] }
}

describe('season mesh worker ownership', () => {
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
})
