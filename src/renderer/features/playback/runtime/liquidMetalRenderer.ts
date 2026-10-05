import { vertexSource, fragmentSource } from './liquidMetalShader'
import { resolveLiquidMetalSettings, type LiquidMetalSettings } from './liquidMetalSettings'
import { alignLiquidMetalPalette, type LiquidMetalPalette } from './liquidMetalPalette'

interface RendererState {
  active: boolean
  playing: boolean
  reducedMotion: boolean
}

interface GpuResources {
  program: WebGLProgram
  buffer: WebGLBuffer
  vao: WebGLVertexArrayObject
  uniforms: Record<string, WebGLUniformLocation | null>
}

interface PendingProgram {
  program: WebGLProgram
  vertex: WebGLShader
  fragment: WebGLShader
  started: number
}

export function createLiquidMetalRenderer(
  canvas: HTMLCanvasElement,
  options: RendererState & {
    palette: LiquidMetalPalette
    settings: Readonly<LiquidMetalSettings>
    onError: (error: unknown) => void
    onReady?: () => void
    onContextLost?: () => void
    onFrameInvalidated?: () => void
  },
) {
  const context = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false })
  if (!context) throw new Error('WebGL 2 is unavailable')
  const gl = context
  let resources: GpuResources | null = null
  let pending: PendingProgram | null = null
  let parallelCompile: KHR_parallel_shader_compile | null = null
  let state: RendererState = { ...options }
  let settings = resolveLiquidMetalSettings(options.settings)
  let colors = options.palette.colors.slice()
  let weights = options.palette.weights.slice()
  let sourceColors = colors.slice(),
    sourceWeights = weights.slice()
  let targetColors = colors.slice(),
    targetWeights = weights.slice()
  let blendStarted: number | null = null
  const BLEND_MS = 700
  let frame = 0,
    lastTick = 0,
    lastDraw = 0,
    time = 9
  let dirty = true,
    lost = false,
    failed = false,
    disposed = false,
    ready = false

  function compile(type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('Unable to allocate liquid-metal shader')
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return shader
  }

  function releasePending(): void {
    if (!pending) return
    gl.deleteShader(pending.vertex)
    gl.deleteShader(pending.fragment)
    gl.deleteProgram(pending.program)
    pending = null
  }

  function releaseResources(): void {
    if (!resources) return
    gl.deleteBuffer(resources.buffer)
    gl.deleteVertexArray(resources.vao)
    gl.deleteProgram(resources.program)
    resources = null
  }

  function initialize(): void {
    parallelCompile = gl.getExtension('KHR_parallel_shader_compile')
    if (!parallelCompile) throw new Error('Non-blocking shader compilation is unavailable')
    let vertex: WebGLShader | null = null,
      fragment: WebGLShader | null = null,
      program: WebGLProgram | null = null
    try {
      vertex = compile(gl.VERTEX_SHADER, vertexSource)
      fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
      program = gl.createProgram()
      if (!program) throw new Error('Unable to allocate liquid-metal program')
      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      gl.flush()
      pending = { program, vertex, fragment, started: performance.now() }
    } catch (error) {
      if (vertex) gl.deleteShader(vertex)
      if (fragment) gl.deleteShader(fragment)
      if (program) gl.deleteProgram(program)
      throw error
    }
  }

  function finishInitialization(now: number): boolean {
    if (!pending || !parallelCompile) return true
    // LINK_STATUS, shader status and uniform lookups may wait for the driver. Only
    // query them after the extension reports completion without blocking the UI.
    if (!gl.getProgramParameter(pending.program, parallelCompile.COMPLETION_STATUS_KHR)) {
      if (now - pending.started > 10_000) throw new Error('Liquid-metal compilation timed out')
      return false
    }
    if (gl.isContextLost()) return false
    const { program, vertex, fragment } = pending
    pending = null
    let buffer: WebGLBuffer | null = null,
      vao: WebGLVertexArrayObject | null = null
    try {
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? 'Unable to link liquid-metal program')
      vao = gl.createVertexArray()
      buffer = gl.createBuffer()
      if (!vao || !buffer) throw new Error('Unable to allocate liquid-metal geometry')
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'a_position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      const uniforms = Object.fromEntries(
        ['resolution', 'time', 'folds', 'roughness', 'colors[0]', 'weights[0]'].map((name) => [
          name,
          gl.getUniformLocation(program, 'u_' + name),
        ]),
      )
      resources = { program, buffer, vao, uniforms }
    } catch (error) {
      if (buffer) gl.deleteBuffer(buffer)
      if (vao) gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
      throw error
    } finally {
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
    return true
  }

  function isVisible(): boolean {
    return state.active && !document.hidden && !lost && !failed && !disposed
  }

  function isAnimated(): boolean {
    return isVisible() && !state.reducedMotion
  }

  function requestDraw(): void {
    dirty = true
    if (!frame && isVisible()) frame = requestAnimationFrame(tick)
  }

  function resize(): void {
    if (disposed) return
    const rect = canvas.getBoundingClientRect()
    const ratio =
      Math.min(devicePixelRatio, 1.5, 1600 / Math.max(1, rect.width, rect.height)) * 0.85
    const width = Math.max(1, Math.round(rect.width * ratio))
    const height = Math.max(1, Math.round(rect.height * ratio))
    if (canvas.width === width && canvas.height === height) return
    ready = false
    options.onFrameInvalidated?.()
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    requestDraw()
  }

  function updatePalette(now: number): void {
    if (blendStarted === null) return
    const ratio = state.reducedMotion ? 1 : Math.min(1, (now - blendStarted) / BLEND_MS)
    const eased = ratio * ratio * (3 - 2 * ratio)
    for (let i = 0; i < colors.length; i++)
      colors[i] = sourceColors[i] + (targetColors[i] - sourceColors[i]) * eased
    for (let i = 0; i < weights.length; i++)
      weights[i] = sourceWeights[i] + (targetWeights[i] - sourceWeights[i]) * eased
    if (ratio === 1) blendStarted = null
  }

  function draw(now: number): void {
    if (!resources) return
    updatePalette(now)
    const { program, vao, uniforms } = resources
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
    gl.uniform1f(uniforms.time, time)
    gl.uniform1f(uniforms.folds, settings.folds)
    gl.uniform1f(uniforms.roughness, settings.roughness)
    gl.uniform3fv(uniforms['colors[0]'], colors)
    gl.uniform1fv(uniforms['weights[0]'], weights)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    dirty = false
    if (!ready) {
      ready = true
      options.onReady?.()
    }
  }

  function tick(now: number): void {
    frame = 0
    if (!isVisible()) return
    try {
      if (!finishInitialization(now)) {
        frame = requestAnimationFrame(tick)
        return
      }
    } catch (error) {
      fail(error)
      return
    }
    if (lastTick && isAnimated())
      time += Math.min((now - lastTick) / 1000, 0.05) * settings.speed * (state.playing ? 1 : 0.38)
    lastTick = now
    const interval = 1000 / (state.playing ? 60 : 30)
    const elapsed = now - lastDraw
    if (dirty || !lastDraw) {
      lastDraw = now
      draw(now)
    } else if (elapsed >= interval - 0.5) {
      // Keep the fractional interval on high-refresh displays, but skip missed
      // intervals after a stall rather than drawing a burst of catch-up frames.
      lastDraw += Math.max(1, Math.floor((elapsed + 0.5) / interval)) * interval
      draw(now)
    }
    if (isAnimated() || blendStarted !== null) frame = requestAnimationFrame(tick)
  }

  function sync(): void {
    cancelAnimationFrame(frame)
    frame = 0
    lastTick = lastDraw = 0
    if (isVisible()) requestDraw()
  }

  function fail(error: unknown): void {
    failed = true
    sync()
    releasePending()
    releaseResources()
    options.onError(error)
  }

  function onLost(event: Event): void {
    event.preventDefault()
    lost = true
    resources = null // The browser invalidates every object on context loss.
    pending = null
    parallelCompile = null
    ready = false
    sync()
    options.onContextLost?.()
  }

  function onRestored(): void {
    if (disposed) return
    try {
      initialize()
      lost = false
      resize()
      sync()
    } catch (error) {
      fail(error)
    }
  }

  initialize()
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)
  document.addEventListener('visibilitychange', sync)
  resize()
  sync()

  return {
    resize,
    setPalette(palette: LiquidMetalPalette) {
      if (disposed) return
      const now = performance.now()
      updatePalette(now)
      const aligned = alignLiquidMetalPalette({ colors, weights }, palette)
      sourceColors = aligned.source.colors
      sourceWeights = aligned.source.weights
      targetColors = aligned.target.colors
      targetWeights = aligned.target.weights
      if (state.reducedMotion || !state.active) {
        colors = targetColors.slice()
        weights = targetWeights.slice()
        blendStarted = null
      } else blendStarted = now
      requestDraw()
    },
    setMaterial(next: Readonly<LiquidMetalSettings>) {
      settings = resolveLiquidMetalSettings(next, settings)
      requestDraw()
    },
    setState(next: RendererState) {
      state = { ...next }
      sync()
    },
    dispose() {
      if (disposed) return
      disposed = true
      sync()
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      releasePending()
      releaseResources()
    },
  }
}
