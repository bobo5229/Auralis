import { vertexSource, morphFragmentSource } from './morphShader.mjs'
import { fragmentSource as metalFragmentSource } from '../../../src/renderer/features/playback/runtime/liquidMetalShader.ts'
import { DEFAULT_LIQUID_METAL_SETTINGS } from '../../../src/renderer/features/playback/runtime/liquidMetalSettings.ts'

export function createMorphRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false })
  if (!gl) throw new Error('此演示需要 WebGL 2，请使用支持硬件加速的浏览器。')
  let palette = {
    colors: new Float32Array(18).fill(0.2),
    weights: new Float32Array([1, 0, 0, 0, 0, 0]),
  }
  let uploads = 0
  let lastState = { phase: 0, time: 9 }
  let lost = false

  function programFor(fragment) {
    const shaders = []
    const program = gl.createProgram()
    try {
      for (const [type, source] of [
        [gl.VERTEX_SHADER, vertexSource],
        [gl.FRAGMENT_SHADER, fragment],
      ]) {
        const shader = gl.createShader(type)
        shaders.push(shader)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader))
        gl.attachShader(program, shader)
      }
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program))
      return {
        program,
        uniforms: Object.fromEntries(
          [
            'resolution',
            'time',
            'folds',
            'roughness',
            'colors[0]',
            'weights[0]',
            'flow',
            'phase',
          ].map((name) => [name, gl.getUniformLocation(program, `u_${name}`)]),
        ),
      }
    } catch (error) {
      gl.deleteProgram(program)
      throw error
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader))
    }
  }

  const material = programFor(morphFragmentSource)
  let reference = null
  const buffer = gl.createBuffer()
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(material.program, 'a_position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([24, 27, 32, 255]),
  )

  function contextLost(event) {
    event.preventDefault()
    lost = true
    canvas.dispatchEvent(
      new CustomEvent('morph-error', { detail: '图形上下文已丢失，请重新打开演示。' }),
    )
  }
  canvas.addEventListener('webglcontextlost', contextLost)

  function resize() {
    const ratio = Math.min(devicePixelRatio, 1.5, 1440 / Math.max(innerWidth, innerHeight))
    canvas.width = Math.max(1, Math.round(innerWidth * ratio))
    canvas.height = Math.max(1, Math.round(innerHeight * ratio))
  }
  resize()

  function draw(material, state) {
    const { uniforms: u, program } = material
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    // Attribute locations may differ in the lazily compiled reference program.
    const location = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(u.flow, 0)
    gl.uniform1f(u.phase, state.phase)
    gl.uniform2f(u.resolution, canvas.width, canvas.height)
    gl.uniform1f(u.time, state.time)
    gl.uniform1f(u.folds, DEFAULT_LIQUID_METAL_SETTINGS.folds)
    gl.uniform1f(u.roughness, DEFAULT_LIQUID_METAL_SETTINGS.roughness)
    gl.uniform3fv(u['colors[0]'], palette.colors)
    gl.uniform1fv(u['weights[0]'], palette.weights)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  function pixelSamples() {
    const result = []
    for (let y = 1; y <= 4; y++)
      for (let x = 1; x <= 8; x++) {
        const pixel = new Uint8Array(4)
        gl.readPixels(
          Math.floor((canvas.width * x) / 9),
          Math.floor((canvas.height * y) / 5),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        )
        result.push(...pixel.slice(0, 3))
      }
    return result
  }

  return {
    resize,
    setPalette(value) {
      palette = value
    },
    uploadFlow(source) {
      if (lost || source.width < 2 || source.height < 2) return false
      // Called synchronously inside AMLL's draw, before its default framebuffer
      // may be cleared by the compositor (preserveDrawingBuffer is false).
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      uploads++
      return true
    },
    render(state) {
      if (lost) return
      lastState = state
      draw(material, state)
    },
    diagnostics() {
      // Read in the same task as a draw; the browser clears default buffers
      // after presentation when preserveDrawingBuffer is false.
      draw(material, lastState)
      const samples = pixelSamples()
      return {
        uploads,
        width: canvas.width,
        height: canvas.height,
        glError: gl.getError(),
        pixelMin: Math.min(...samples),
        pixelMax: Math.max(...samples),
        pixelMean: samples.reduce((a, b) => a + b, 0) / samples.length,
      }
    },
    verifyMetalEndpoint() {
      reference ??= programFor(metalFragmentSource)
      const state = { ...lastState, phase: 1 }
      draw(material, state)
      const actual = pixelSamples()
      draw(reference, state)
      const expected = pixelSamples()
      draw(material, lastState)
      return Math.max(...actual.map((value, index) => Math.abs(value - expected[index])))
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', contextLost)
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(material.program)
      if (reference) gl.deleteProgram(reference.program)
    },
  }
}
