import { vertexSource } from '../../../src/renderer/features/playback/runtime/liquidMetalShader.ts'

export function createSurface(canvas, fragment, onAvailability) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true,
  })
  if (!gl) throw new Error('无法创建 WebGL 2。请在启用硬件加速的 Chrome / Edge 中打开。')
  let program, buffer, vao, uniforms
  let lost = false,
    disposed = false,
    draws = 0

  function release() {
    if (buffer) gl.deleteBuffer(buffer)
    if (vao) gl.deleteVertexArray(vao)
    if (program) gl.deleteProgram(program)
    buffer = vao = program = null
  }
  function initialize() {
    const shaders = []
    try {
      for (const [type, source] of [
        [gl.VERTEX_SHADER, vertexSource],
        [gl.FRAGMENT_SHADER, fragment],
      ]) {
        const shader = gl.createShader(type)
        if (!shader) throw new Error('无法分配 shader。')
        shaders.push(shader)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) || 'Shader 编译失败。')
      }
      program = gl.createProgram()
      if (!program) throw new Error('无法创建 WebGL 程序。')
      shaders.forEach((shader) => gl.attachShader(program, shader))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) || 'Shader 链接失败。')
      buffer = gl.createBuffer()
      vao = gl.createVertexArray()
      if (!buffer || !vao) throw new Error('无法创建画布几何。')
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'a_position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      uniforms = Object.fromEntries(
        [
          'resolution',
          'time',
          'folds',
          'roughness',
          'mirror',
          'depth',
          'detail',
          'colors[0]',
          'weights[0]',
        ].map((name) => [name, gl.getUniformLocation(program, 'u_' + name)]),
      )
    } catch (error) {
      release()
      throw error
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader))
    }
  }
  function draw(time, material, colors, weights) {
    if (lost || disposed || !program) return
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    // Same 1x CSS pixel sampling and cap for both algorithms.
    const ratio = Math.min(1, 1600 / Math.max(bounds.width, bounds.height))
    const width = Math.max(1, Math.round(bounds.width * ratio))
    const height = Math.max(1, Math.round(bounds.height * ratio))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    gl.viewport(0, 0, width, height)
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.uniform2f(uniforms.resolution, width, height)
    gl.uniform1f(uniforms.time, time)
    for (const key of ['folds', 'roughness', 'mirror', 'depth', 'detail'])
      gl.uniform1f(uniforms[key], material[key])
    gl.uniform3fv(uniforms['colors[0]'], colors)
    gl.uniform1fv(uniforms['weights[0]'], weights)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    draws++
  }
  function onLost(event) {
    event.preventDefault()
    lost = true
    buffer = vao = program = null
    onAvailability(false)
  }
  function onRestored() {
    if (disposed) return
    try {
      initialize()
      lost = false
      onAvailability(true)
    } catch (error) {
      onAvailability(false, error)
    }
  }
  initialize()
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)
  return {
    draw,
    getState: () => ({ lost, draws, size: [canvas.width, canvas.height], error: gl.getError() }),
    readPixels() {
      const pixels = new Uint8Array(canvas.width * canvas.height * 4)
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      return pixels
    },
    dispose() {
      if (disposed) return
      disposed = true
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      release()
    },
  }
}
