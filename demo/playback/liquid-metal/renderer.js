import { vertexSource, fragmentSource } from './shader.js'

export function createMetalRenderer(canvas, onStatus) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false })
  if (!gl) throw new Error('当前环境无法创建 WebGL 2，无法显示实时金属材质。')
  let program, buffer, vao, uniforms
  let frame = 0,
    lastTime = 0,
    lost = false,
    disposed = false
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches
  let time = 9,
    speed = 0.7,
    folds = 1.15,
    roughness = 0.12
  let colors = new Float32Array(18),
    weights = new Float32Array([1, 0, 0, 0, 0, 0])
  let draws = 0,
    fpsWindow = 0,
    fpsTime = performance.now(),
    measuredFPS = 0

  function compile(type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(error)
    }
    return shader
  }
  function initialize() {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource)
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
    program = gl.createProgram()
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program))
    vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    uniforms = Object.fromEntries(
      ['resolution', 'time', 'folds', 'roughness', 'colors[0]', 'weights[0]'].map((name) => [
        name,
        gl.getUniformLocation(program, 'u_' + name),
      ]),
    )
  }
  function resize() {
    const rect = canvas.getBoundingClientRect()
    // Bound the cost of this full-screen pixel shader, including high-DPI displays.
    const ratio = Math.min(devicePixelRatio, 1.5, 1600 / Math.max(rect.width, rect.height)) * 0.85
    canvas.width = Math.max(1, Math.round(rect.width * ratio))
    canvas.height = Math.max(1, Math.round(rect.height * ratio))
    draw()
  }
  function draw() {
    if (lost || disposed) return
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
    gl.uniform1f(uniforms.time, time)
    gl.uniform1f(uniforms.folds, folds)
    gl.uniform1f(uniforms.roughness, roughness)
    gl.uniform3fv(uniforms['colors[0]'], colors)
    gl.uniform1fv(uniforms['weights[0]'], weights)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    draws++
  }
  function tick(now) {
    frame = 0
    if (paused || lost || disposed || document.hidden) return
    if (lastTime) time += Math.min((now - lastTime) / 1000, 0.05) * speed
    lastTime = now
    draw()
    fpsWindow++
    if (now - fpsTime > 1000) {
      measuredFPS = Math.round((fpsWindow * 1000) / (now - fpsTime))
      fpsWindow = 0
      fpsTime = now
      onStatus(`${measuredFPS} FPS · 实时曲面与镜面反射`)
    }
    frame = requestAnimationFrame(tick)
  }
  function sync() {
    cancelAnimationFrame(frame)
    frame = 0
    lastTime = 0
    fpsWindow = 0
    fpsTime = performance.now()
    if (!paused && !lost && !disposed && !document.hidden) frame = requestAnimationFrame(tick)
  }
  function onLost(event) {
    event.preventDefault()
    lost = true
    sync()
    onStatus('图形上下文暂时不可用，等待恢复…')
  }
  function onRestored() {
    if (disposed) return
    lost = false
    try {
      initialize()
      resize()
      sync()
    } catch (error) {
      onStatus(error.message)
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
    setPalette(palette) {
      colors = new Float32Array(18)
      weights = new Float32Array(6)
      palette.slice(0, 6).forEach((entry, i) => {
        colors.set(entry.linear, i * 3)
        weights[i] = entry.weight
      })
      draw()
    },
    setMaterial(settings) {
      speed = settings.speed ?? speed
      folds = settings.folds ?? folds
      roughness = settings.roughness ?? roughness
      draw()
    },
    setPaused(value) {
      paused = value
      sync()
      draw()
      return paused
    },
    renderAt(value) {
      time = value
      draw()
    },
    getState() {
      return {
        paused,
        lost,
        time,
        speed,
        folds,
        roughness,
        draws,
        fps: measuredFPS,
        resolution: [canvas.width, canvas.height],
        error: gl.getError(),
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      sync()
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    },
  }
}
