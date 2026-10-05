import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLiquidMetalRenderer } from './liquidMetalRenderer'
import { DEFAULT_LIQUID_METAL_SETTINGS } from './liquidMetalSettings'
import type { LiquidMetalPalette } from './liquidMetalPalette'

function setup() {
  let complete = false,
    linked = true,
    contextLost = false,
    extensionAvailable = true
  const extension = { COMPLETION_STATUS_KHR: 0x91b1 }
  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLES: 4,
    getExtension: vi.fn(() => (extensionAvailable ? extension : null)),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => {
      throw new Error('Compile status may block before linking completes')
    }),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    flush: vi.fn(),
    getProgramParameter: vi.fn((_program: unknown, parameter: number) => {
      if (parameter === extension.COMPLETION_STATUS_KHR) return complete
      if (!complete) throw new Error('Queried blocking link status before completion')
      return linked
    }),
    isContextLost: vi.fn(() => contextLost),
    getProgramInfoLog: vi.fn(() => 'Test shader link failure'),
    createVertexArray: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn((_program: unknown, name: string) => name),
    viewport: vi.fn(),
    useProgram: vi.fn(),
    uniform2f: vi.fn(),
    uniform1f: vi.fn(),
    uniform3fv: vi.fn(),
    uniform1fv: vi.fn(),
    drawArrays: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
  }
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0,
    now = 1000
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('devicePixelRatio', 1.5)
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  let rect = { width: 1440, height: 900 }
  const canvas = Object.assign(new EventTarget(), {
    width: 0,
    height: 0,
    getContext: () => gl,
    getBoundingClientRect: () => rect,
  })
  const onError = vi.fn()
  const onReady = vi.fn()
  const onContextLost = vi.fn()
  const onFrameInvalidated = vi.fn()
  const create = (reducedMotion = false, palette?: LiquidMetalPalette) =>
    createLiquidMetalRenderer(canvas as unknown as HTMLCanvasElement, {
      active: true,
      playing: true,
      reducedMotion,
      palette: palette ?? {
        colors: new Float32Array(18),
        weights: new Float32Array([1, 0, 0, 0, 0, 0]),
      },
      settings: DEFAULT_LIQUID_METAL_SETTINGS,
      onError,
      onReady,
      onContextLost,
      onFrameInvalidated,
    })
  return {
    gl,
    canvas,
    frames,
    create,
    onError,
    onReady,
    onContextLost,
    onFrameInvalidated,
    setSize(width: number, height: number) {
      rect = { width, height }
    },
    complete: () => (complete = true),
    failLink: () => (linked = false),
    disableExtension: () => (extensionAvailable = false),
    setHidden(hidden: boolean) {
      Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
      document.dispatchEvent(new Event('visibilitychange'))
    },
    drawnTime: () => gl.uniform1f.mock.calls.filter(([name]) => name === 'u_time').at(-1)?.[1],
    lose() {
      contextLost = true
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    },
    restore() {
      contextLost = false
      complete = false
      canvas.dispatchEvent(new Event('webglcontextrestored'))
    },
    advance(elapsed = 16.7) {
      now += elapsed
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(now))
    },
  }
}

describe('liquid-metal non-blocking initialization', () => {
  let runtime: ReturnType<typeof setup>
  beforeEach(() => (runtime = setup()))
  afterEach(() => vi.unstubAllGlobals())

  it('keeps waiting without blocking queries or drawing until the GPU is ready', () => {
    const renderer = runtime.create()
    expect(runtime.gl.getProgramParameter).not.toHaveBeenCalled()
    runtime.advance()
    runtime.advance()
    expect(runtime.gl.drawArrays).not.toHaveBeenCalled()
    expect(runtime.onReady).not.toHaveBeenCalled()
    expect(runtime.gl.getShaderParameter).not.toHaveBeenCalled()
    expect(runtime.gl.getProgramParameter.mock.calls.every(([, type]) => type === 0x91b1)).toBe(
      true,
    )
    runtime.complete()
    runtime.advance()
    expect(runtime.gl.drawArrays).toHaveBeenCalledOnce()
    expect(runtime.onReady).toHaveBeenCalledOnce()
    runtime.advance()
    expect(runtime.onReady).toHaveBeenCalledOnce()
    expect(runtime.gl.getProgramParameter).toHaveBeenCalledWith(expect.anything(), 0x8b82)
    expect(runtime.onError).not.toHaveBeenCalled()
    renderer.dispose()
  })

  it('still prepares one static frame when motion is reduced', () => {
    const renderer = runtime.create(true)
    runtime.advance()
    expect(runtime.frames.size).toBe(1)
    runtime.complete()
    runtime.advance()
    expect(runtime.gl.drawArrays).toHaveBeenCalledOnce()
    expect(runtime.frames.size).toBe(0)
    renderer.dispose()
  })

  it('does not report readiness until an active canvas submits its first frame', () => {
    const renderer = runtime.create()
    renderer.setState({ active: false, playing: true, reducedMotion: false })
    runtime.complete()
    runtime.advance(5000)
    expect(runtime.gl.getProgramParameter).not.toHaveBeenCalled()
    expect(runtime.gl.drawArrays).not.toHaveBeenCalled()
    expect(runtime.onReady).not.toHaveBeenCalled()
    renderer.setState({ active: true, playing: true, reducedMotion: false })
    runtime.advance()
    expect(runtime.gl.drawArrays).toHaveBeenCalledOnce()
    expect(runtime.onReady).toHaveBeenCalledOnce()
    renderer.dispose()
  })

  it('notifies context loss and reports the first submitted frame again after restoration', () => {
    const renderer = runtime.create()
    runtime.complete()
    runtime.advance()
    expect(runtime.onReady).toHaveBeenCalledOnce()
    runtime.lose()
    expect(runtime.onContextLost).toHaveBeenCalledOnce()
    runtime.restore()
    runtime.advance()
    expect(runtime.onReady).toHaveBeenCalledOnce()
    runtime.complete()
    runtime.advance()
    expect(runtime.onReady).toHaveBeenCalledTimes(2)
    expect(runtime.onReady.mock.invocationCallOrder[1]).toBeGreaterThan(
      runtime.gl.drawArrays.mock.invocationCallOrder[1],
    )
    runtime.advance()
    expect(runtime.onReady).toHaveBeenCalledTimes(2)
    renderer.dispose()
  })

  it('cancels waiting and releases the pending program when exited before completion', () => {
    const renderer = runtime.create()
    runtime.advance()
    renderer.dispose()
    runtime.complete()
    runtime.advance()
    expect(runtime.frames.size).toBe(0)
    expect(runtime.gl.deleteShader).toHaveBeenCalledTimes(2)
    expect(runtime.gl.deleteProgram).toHaveBeenCalledOnce()
    expect(runtime.gl.drawArrays).not.toHaveBeenCalled()
    expect(runtime.onError).not.toHaveBeenCalled()
  })

  it('discards pending work on context loss and asynchronously rebuilds after restoration', () => {
    const renderer = runtime.create()
    runtime.advance()
    runtime.lose()
    expect(runtime.frames.size).toBe(0)
    runtime.restore()
    runtime.advance()
    expect(runtime.gl.drawArrays).not.toHaveBeenCalled()
    runtime.complete()
    runtime.advance()
    expect(runtime.gl.drawArrays).toHaveBeenCalledOnce()
    expect(runtime.gl.createProgram).toHaveBeenCalledTimes(2)
    expect(runtime.gl.getExtension).toHaveBeenCalledTimes(2)
    renderer.dispose()
    expect(runtime.gl.deleteProgram).toHaveBeenCalledOnce()
  })

  it('reports a completed link failure once and releases resources for the existing fallback', () => {
    runtime.failLink()
    const renderer = runtime.create()
    runtime.complete()
    runtime.advance()
    runtime.advance()
    expect(runtime.onError).toHaveBeenCalledOnce()
    expect(runtime.onError.mock.calls[0][0].message).toBe('Test shader link failure')
    expect(runtime.gl.deleteProgram).toHaveBeenCalledOnce()
    expect(runtime.gl.deleteShader).toHaveBeenCalledTimes(2)
    expect(runtime.frames.size).toBe(0)
    expect(runtime.gl.drawArrays).not.toHaveBeenCalled()
    renderer.dispose()
  })

  it('uses the fallback when non-blocking compilation is unavailable', () => {
    runtime.disableExtension()
    expect(() => runtime.create()).toThrow('Non-blocking shader compilation is unavailable')
    expect(runtime.gl.createProgram).not.toHaveBeenCalled()
    expect(runtime.gl.getProgramParameter).not.toHaveBeenCalled()
    expect(runtime.frames.size).toBe(0)
  })

  it('bounds unsuccessful polling instead of waiting forever', () => {
    const renderer = runtime.create()
    runtime.advance(20_000)
    expect(runtime.onError).toHaveBeenCalledOnce()
    expect(runtime.gl.deleteProgram).toHaveBeenCalledOnce()
    expect(runtime.frames.size).toBe(0)
    renderer.dispose()
  })
})

describe('liquid-metal palette transitions sent to the GPU', () => {
  let runtime: ReturnType<typeof setup>
  beforeEach(() => (runtime = setup()))
  afterEach(() => vi.unstubAllGlobals())
  const yellow = [1, 1, 0]
  const blue = [0, 0, 1]
  const red = [1, 0, 0]
  const palette = (colors: number[][], weights: number[]): LiquidMetalPalette => ({
    colors: new Float32Array([...colors.flat(), ...Array(18 - colors.length * 3).fill(0)]),
    weights: new Float32Array([...weights, ...Array(6 - weights.length).fill(0)]),
  })
  function start(initial: LiquidMetalPalette) {
    const renderer = runtime.create(false, initial)
    runtime.complete()
    runtime.advance(0)
    return renderer
  }
  function uploaded() {
    const colors = Array.from(runtime.gl.uniform3fv.mock.calls.at(-1)![1] as Float32Array)
    const weights = Array.from(runtime.gl.uniform1fv.mock.calls.at(-1)![1] as Float32Array)
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 6)
    return { colors, weights }
  }
  it('keeps yellow and blue saturated when their coverage order reverses', () => {
    const renderer = start(palette([yellow, blue], [0.501, 0.499]))
    renderer.setPalette(palette([blue, yellow], [0.501, 0.499]))
    runtime.advance(350)
    expect(uploaded().colors.slice(0, 6)).toEqual([...yellow, ...blue])
    expect(uploaded().weights.slice(0, 2)).toEqual([0.5, 0.5])
    runtime.advance(350)
    expect(uploaded().weights[0]).toBeCloseTo(0.499)
    renderer.dispose()
  })
  it('fades new and removed colors by coverage without darkening them through empty slots', () => {
    const renderer = start(palette([yellow], [1]))
    renderer.setPalette(palette([blue, yellow], [0.6, 0.4]))
    runtime.advance(350)
    expect(uploaded().colors.slice(0, 6)).toEqual([...yellow, ...blue])
    expect(uploaded().weights.slice(0, 2)[1]).toBeCloseTo(0.3)
    runtime.advance(350)
    renderer.setPalette(palette([yellow], [1]))
    runtime.advance(350)
    expect(uploaded().colors.slice(0, 6)).toEqual([...yellow, ...blue])
    expect(uploaded().weights[1]).toBeCloseTo(0.3)
    runtime.advance(350)
    expect(uploaded().weights[1]).toBe(0)
    renderer.dispose()
  })
  it('continues rapid switches from the current interpolated color and weight', () => {
    const renderer = start(palette([yellow, blue], [0.8, 0.2]))
    renderer.setPalette(palette([red, blue], [0.4, 0.6]))
    runtime.advance(175)
    const before = uploaded()
    renderer.setPalette(palette([yellow, blue], [0.501, 0.499]))
    runtime.advance(0)
    expect(uploaded()).toEqual(before)
    runtime.advance(700)
    expect(uploaded().colors.slice(0, 6)).toEqual([...yellow, ...blue])
    renderer.dispose()
  })
  it('retains a matching non-first slot when reducing to one color and growing again', () => {
    const renderer = start(palette([red, blue], [0.5, 0.5]))
    renderer.setPalette(palette([blue], [1]))
    runtime.advance(700)
    expect(uploaded().weights.slice(0, 2)).toEqual([0, 1])
    expect(uploaded().colors.slice(3, 6)).toEqual(blue)
    renderer.setPalette(palette([blue, red], [0.5, 0.5]))
    runtime.advance(350)
    expect(uploaded().weights.slice(0, 2)).toEqual([0.25, 0.75])
    expect(uploaded().colors.slice(0, 6)).toEqual([...red, ...blue])
    renderer.dispose()
  })
  it('matches all six colors deterministically through repeated reversed coverage', () => {
    const colors = [yellow, blue, red, [0, 1, 0], [0, 1, 1], [1, 0, 1]]
    const renderer = start(palette(colors, [0.3, 0.25, 0.2, 0.1, 0.09, 0.06]))
    for (let index = 0; index < 4; index++) {
      renderer.setPalette(palette([...colors].reverse(), [0.3, 0.25, 0.2, 0.1, 0.09, 0.06]))
      runtime.advance(350)
      expect(uploaded().colors).toEqual(colors.flat())
    }
    renderer.dispose()
  })
})

describe('liquid-metal frame scheduling', () => {
  let runtime: ReturnType<typeof setup>
  beforeEach(() => (runtime = setup()))
  afterEach(() => vi.unstubAllGlobals())

  function start(playing = true) {
    const renderer = runtime.create()
    if (!playing) renderer.setState({ active: true, playing, reducedMotion: false })
    runtime.complete()
    runtime.advance(0)
    runtime.gl.drawArrays.mockClear()
    return renderer
  }

  it('invalidates the old buffer before resizing and reports readiness after the new first draw', () => {
    const renderer = start()
    const oldWidth = runtime.canvas.width
    const oldHeight = runtime.canvas.height
    runtime.onFrameInvalidated.mockClear()
    runtime.onReady.mockClear()
    runtime.onFrameInvalidated.mockImplementation(() => {
      expect(runtime.canvas.width).toBe(oldWidth)
      expect(runtime.canvas.height).toBe(oldHeight)
    })
    runtime.setSize(800, 600)
    renderer.resize()
    expect(runtime.onFrameInvalidated).toHaveBeenCalledOnce()
    expect(runtime.canvas.width).toBe(1020)
    expect(runtime.canvas.height).toBe(765)
    expect(runtime.onReady).not.toHaveBeenCalled()
    expect(runtime.gl.drawArrays).not.toHaveBeenCalled()
    runtime.advance(1000 / 144)
    expect(runtime.gl.viewport).toHaveBeenLastCalledWith(0, 0, 1020, 765)
    expect(runtime.gl.drawArrays).toHaveBeenCalledOnce()
    expect(runtime.onReady).toHaveBeenCalledOnce()
    expect(runtime.onReady.mock.invocationCallOrder[0]).toBeGreaterThan(
      runtime.gl.drawArrays.mock.invocationCallOrder[0],
    )
    runtime.advance(1000 / 60)
    expect(runtime.onReady).toHaveBeenCalledOnce()
    renderer.dispose()
  })

  it('does not invalidate or repeat readiness when the buffer dimensions stay unchanged', () => {
    const renderer = runtime.create(true)
    runtime.complete()
    runtime.advance()
    runtime.onFrameInvalidated.mockClear()
    runtime.onReady.mockClear()
    runtime.gl.drawArrays.mockClear()
    renderer.resize()
    expect(runtime.frames.size).toBe(0)
    runtime.advance()
    expect(runtime.onFrameInvalidated).not.toHaveBeenCalled()
    expect(runtime.onReady).not.toHaveBeenCalled()
    expect(runtime.gl.drawArrays).not.toHaveBeenCalled()
    renderer.dispose()
  })

  it('resizes an inactive canvas without drawing until activation', () => {
    const renderer = start()
    renderer.setState({ active: false, playing: true, reducedMotion: false })
    runtime.onFrameInvalidated.mockClear()
    runtime.onReady.mockClear()
    runtime.setSize(800, 600)
    renderer.resize()
    expect(runtime.onFrameInvalidated).toHaveBeenCalledOnce()
    expect(runtime.frames.size).toBe(0)
    runtime.advance(5000)
    expect(runtime.gl.drawArrays).not.toHaveBeenCalled()
    expect(runtime.onReady).not.toHaveBeenCalled()
    renderer.setState({ active: true, playing: true, reducedMotion: false })
    runtime.advance(1000 / 144)
    expect(runtime.gl.viewport).toHaveBeenLastCalledWith(0, 0, 1020, 765)
    expect(runtime.gl.drawArrays).toHaveBeenCalledOnce()
    expect(runtime.onReady).toHaveBeenCalledOnce()
    renderer.dispose()
  })

  it.each([24, 60, 120, 144, 165, 240])(
    'keeps the playing cadence at %i Hz without exceeding the display refresh rate',
    (refreshRate) => {
      const renderer = start()
      for (let i = 0; i < refreshRate * 10; i++) runtime.advance(1000 / refreshRate)
      expect(runtime.gl.drawArrays).toHaveBeenCalledTimes(Math.min(refreshRate, 60) * 10)
      expect(runtime.frames.size).toBe(1)
      renderer.dispose()
    },
  )

  it.each([24, 60, 120, 144, 165, 240])('keeps the paused cadence at %i Hz', (refreshRate) => {
    const renderer = start(false)
    for (let i = 0; i < refreshRate * 10; i++) runtime.advance(1000 / refreshRate)
    expect(runtime.gl.drawArrays).toHaveBeenCalledTimes(Math.min(refreshRate, 30) * 10)
    renderer.dispose()
  })

  it('changes the drawing cadence and animation speed when playback pauses and resumes', () => {
    const renderer = start()
    for (const playing of [false, true]) {
      renderer.setState({ active: true, playing, reducedMotion: false })
      runtime.advance(0)
      runtime.gl.drawArrays.mockClear()
      const before = runtime.drawnTime()!
      for (let i = 0; i < 144; i++) runtime.advance(1000 / 144)
      expect(runtime.gl.drawArrays).toHaveBeenCalledTimes(playing ? 60 : 30)
      expect(runtime.drawnTime()! - before).toBeCloseTo(
        DEFAULT_LIQUID_METAL_SETTINGS.speed * (playing ? 1 : 0.38),
        5,
      )
    }
    renderer.dispose()
  })

  it('draws once after a long stall and does not burst through missed frames', () => {
    const renderer = start()
    const before = runtime.drawnTime()!
    runtime.advance(5000)
    expect(runtime.gl.drawArrays).toHaveBeenCalledOnce()
    expect(runtime.drawnTime()! - before).toBeCloseTo(DEFAULT_LIQUID_METAL_SETTINGS.speed * 0.05)
    runtime.gl.drawArrays.mockClear()
    for (let i = 0; i < 144; i++) runtime.advance(1000 / 144)
    expect(runtime.gl.drawArrays).toHaveBeenCalledTimes(60)
    renderer.dispose()
  })

  it.each(['inactive', 'hidden'] as const)(
    'cancels work while %s and resumes without advancing the suspended animation time',
    (reason) => {
      const renderer = start()
      runtime.advance(1000 / 60)
      const before = runtime.drawnTime()!
      const suspend = (value: boolean) => {
        if (reason === 'hidden') runtime.setHidden(value)
        else renderer.setState({ active: !value, playing: true, reducedMotion: false })
      }
      suspend(true)
      expect(runtime.frames.size).toBe(0)
      runtime.gl.drawArrays.mockClear()
      runtime.advance(5000)
      expect(runtime.gl.drawArrays).not.toHaveBeenCalled()
      suspend(false)
      expect(runtime.frames.size).toBe(1)
      runtime.advance(1000 / 144)
      expect(runtime.gl.drawArrays).toHaveBeenCalledOnce()
      expect(runtime.drawnTime()).toBe(before)
      runtime.gl.drawArrays.mockClear()
      for (let i = 0; i < 144; i++) runtime.advance(1000 / 144)
      expect(runtime.gl.drawArrays).toHaveBeenCalledTimes(60)
      renderer.dispose()
    },
  )

  it('replaces ongoing animation with a static frame for reduced motion and safely resumes', () => {
    const renderer = start()
    runtime.advance(1000 / 60)
    const before = runtime.drawnTime()!
    const previousFrame = [...runtime.frames.keys()][0]
    renderer.setState({ active: true, playing: true, reducedMotion: true })
    expect(runtime.frames.has(previousFrame)).toBe(false)
    runtime.gl.drawArrays.mockClear()
    runtime.advance(1000 / 144)
    expect(runtime.gl.drawArrays).toHaveBeenCalledOnce()
    expect(runtime.drawnTime()).toBe(before)
    expect(runtime.frames.size).toBe(0)
    runtime.advance(5000)
    renderer.setState({ active: true, playing: true, reducedMotion: false })
    runtime.advance(1000 / 144)
    expect(runtime.drawnTime()).toBe(before)
    expect(runtime.frames.size).toBe(1)
    renderer.dispose()
  })

  it('cancels animation on disposal and ignores subsequent state and visibility changes', () => {
    const renderer = start()
    renderer.dispose()
    renderer.dispose()
    renderer.setState({ active: true, playing: true, reducedMotion: false })
    runtime.setHidden(true)
    runtime.setHidden(false)
    runtime.advance(5000)
    expect(runtime.frames.size).toBe(0)
    expect(runtime.gl.drawArrays).not.toHaveBeenCalled()
    expect(runtime.gl.deleteBuffer).toHaveBeenCalledOnce()
    expect(runtime.gl.deleteVertexArray).toHaveBeenCalledOnce()
    expect(runtime.gl.deleteProgram).toHaveBeenCalledOnce()
    expect(runtime.onError).not.toHaveBeenCalled()
  })
})
